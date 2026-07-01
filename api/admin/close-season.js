import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';

/* ── core.js calcCI와 동일 (서버 복제) ── */
const BASE_RATING = 1000, CONFIDENCE_DENOMINATOR = 15, PD_WEIGHT = 5,
      WR_WEIGHT = 200, GAMES_BONUS = 1, GAMES_BONUS_CAP = 30,
      CLOSE_WIN_BONUS = 1, CLOSE_WIN_THRESHOLD = 3;

function calcCI(wins, games, diff, closeWins = 0) {
  if (games === 0) return BASE_RATING;
  const wr = wins / games;
  const confidence = games / (games + CONFIDENCE_DENOMINATOR);
  const adjustedWR = wr * confidence;
  const avgDiff = diff / games;
  const wrScore = Math.round(adjustedWR * WR_WEIGHT);
  const diffScore = Math.round(avgDiff * PD_WEIGHT);
  const gamesBonus = Math.min(games, GAMES_BONUS_CAP) * GAMES_BONUS;
  const closeWinBonus = (closeWins || 0) * CLOSE_WIN_BONUS;
  return BASE_RATING + wrScore + diffScore + gamesBonus + closeWinBonus;
}
// 주가 = calcCI - 900 (최소 10) — stockmarket.js _smCalcStocks와 동일
const priceFromCI = (ci) => Math.max(10, Math.round(ci - 900));

async function chunkedInsert(sb, table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + size));
    if (error) return error;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.replace('Bearer ', '');

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // ── 관리자 인증 ──
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
  const { data: profile } = await sb.from('profiles').select('role,name').eq('id', user.id).single();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { newSeasonStart, dryRun } = req.body || {};
  if (!newSeasonStart || !/^\d{4}-\d{2}-\d{2}$/.test(newSeasonStart)) {
    return res.status(400).json({ error: 'newSeasonStart(YYYY-MM-DD) 형식이 필요합니다' });
  }

  try {
    // ── 1. 현재 설정 로드 (청산가 = 지금 화면에 보이는 가격 = 현재 season_start 기준) ──
    const [{ data: ssRow }, { data: csRow }] = await Promise.all([
      sb.from('app_settings').select('value').eq('key', 'season_start').maybeSingle(),
      sb.from('app_settings').select('value').eq('key', 'current_season').maybeSingle(),
    ]);
    const currentSeasonStart = ssRow?.value || '';
    const currentSeason = parseInt(csRow?.value || '1') || 1;

    // ── 2. 데이터 로드 ──
    const [matchesRes, portRes, walletRes, profilesRes] = await Promise.all([
      sb.from('matches')
        .select('a1_id,a2_id,b1_id,b2_id,score_a,score_b,match_date')
        .eq('status', 'approved'),
      sb.from('stock_portfolio').select('id,user_id,stock_user_id,shares,avg_price'),
      sb.from('stock_wallets').select('user_id,cash'),
      sb.from('profiles').select('id,name'),
    ]);
    const matches = (matchesRes.data || []).filter(m =>
      !currentSeasonStart || String(m.match_date || '') >= currentSeasonStart);
    const portfolio = portRes.data || [];
    const wallets = walletRes.data || [];
    const nameMap = {};
    (profilesRes.data || []).forEach(u => { nameMap[u.id] = u.name; });

    // ── 3. 보유된 종목(stock_user_id)들의 현재가 계산 ──
    const heldIds = [...new Set(portfolio.map(p => p.stock_user_id))];
    const priceMap = {};
    heldIds.forEach(uid => {
      let wins = 0, games = 0, diff = 0, closeWins = 0;
      matches.forEach(m => {
        const onA = m.a1_id === uid || m.a2_id === uid;
        const onB = m.b1_id === uid || m.b2_id === uid;
        if (!onA && !onB) return;
        games++;
        const win = onA ? (m.score_a > m.score_b) : (m.score_b > m.score_a);
        const d = onA ? (m.score_a - m.score_b) : (m.score_b - m.score_a);
        if (win) { wins++; if (Math.abs(m.score_a - m.score_b) <= CLOSE_WIN_THRESHOLD) closeWins++; }
        diff += d;
      });
      priceMap[uid] = priceFromCI(calcCI(wins, games, diff, closeWins));
    });

    // ── 4. 청산 계산 (환급액·매도기록) ──
    const walletMap = {};
    wallets.forEach(w => { walletMap[w.user_id] = w.cash; });
    const refundByUser = {};     // user_id -> 환급 합계
    const sellTrades = [];       // stock_trades insert 대상
    for (const p of portfolio) {
      const price = priceMap[p.stock_user_id] ?? 10;
      const total = price * p.shares;
      const pnl = (price - (p.avg_price || 0)) * p.shares;
      refundByUser[p.user_id] = (refundByUser[p.user_id] || 0) + total;
      sellTrades.push({
        user_id: p.user_id,
        action: 'sell',
        name: nameMap[p.stock_user_id] || '종목',
        qty: p.shares,
        price,
        total,
        cost: (p.avg_price || 0) * p.shares,
        pnl,
      });
    }
    const totalRefund = Object.values(refundByUser).reduce((s, v) => s + v, 0);

    const summary = {
      currentSeason,
      currentSeasonStart: currentSeasonStart || '(없음·전체기간)',
      newSeason: currentSeason + 1,
      newSeasonStart,
      portfolioRows: portfolio.length,
      holderCount: Object.keys(refundByUser).length,
      totalRefund,
      refunds: Object.entries(refundByUser)
        .map(([uid, amt]) => ({ user_id: uid, name: nameMap[uid] || uid, refund: amt }))
        .sort((a, b) => b.refund - a.refund),
    };

    // ── 5. dryRun: 계산만 반환, 쓰기 없음 ──
    if (dryRun) {
      return res.status(200).json({ dryRun: true, ...summary });
    }

    // ── 6. 실제 청산: 지갑 환급 (보유자별) ──
    for (const [uid, amt] of Object.entries(refundByUser)) {
      if (walletMap[uid] == null) {
        const { error } = await sb.from('stock_wallets').insert({ user_id: uid, cash: 2000 + amt });
        if (error) return res.status(500).json({ error: '지갑 생성 실패: ' + error.message, at: uid });
      } else {
        const { error } = await sb.from('stock_wallets')
          .update({ cash: walletMap[uid] + amt }).eq('user_id', uid);
        if (error) return res.status(500).json({ error: '지갑 환급 실패: ' + error.message, at: uid });
      }
    }

    // ── 7. 청산 매도 기록 삽입 (아카이브에 포함되도록 먼저) ──
    if (sellTrades.length) {
      const err = await chunkedInsert(sb, 'stock_trades', sellTrades);
      if (err) return res.status(500).json({ error: '매도기록 삽입 실패: ' + err.message });
    }

    // ── 8. stock_trades 아카이브 (삭제 전 반드시 복사 성공 확인) ──
    const { data: allTrades, error: readTradesErr } = await sb
      .from('stock_trades').select('*');
    if (readTradesErr) return res.status(500).json({ error: '거래내역 조회 실패: ' + readTradesErr.message });
    if (allTrades && allTrades.length) {
      const archiveRows = allTrades.map(t => {
        const { id, ...rest } = t;   // id 제외 (아카이브 테이블 자체 PK)
        return { ...rest, season: currentSeason };
      });
      const err = await chunkedInsert(sb, 'stock_trades_archive', archiveRows);
      if (err) return res.status(500).json({ error: '아카이브 실패(삭제 중단): ' + err.message });
    }

    // ── 9. 초기화: 거래내역·포트폴리오 전체 삭제 ──
    const { error: delTradesErr } = await sb.from('stock_trades').delete().not('user_id', 'is', null);
    if (delTradesErr) return res.status(500).json({ error: '거래내역 삭제 실패: ' + delTradesErr.message });
    const { error: delPortErr } = await sb.from('stock_portfolio').delete().not('user_id', 'is', null);
    if (delPortErr) return res.status(500).json({ error: '포트폴리오 삭제 실패: ' + delPortErr.message });

    // ── 10. 시즌 전환 ──
    const { error: e1 } = await sb.from('app_settings')
      .upsert({ key: 'season_start', value: newSeasonStart }, { onConflict: 'key' });
    const { error: e2 } = await sb.from('app_settings')
      .upsert({ key: 'current_season', value: String(currentSeason + 1) }, { onConflict: 'key' });
    if (e1 || e2) return res.status(500).json({ error: '시즌 설정 갱신 실패: ' + (e1 || e2).message });

    // 감사 로그
    try {
      await sb.from('logs').insert({
        user_id: user.id,
        action: 'season_close',
        note: JSON.stringify({
          season: currentSeason, newSeasonStart,
          holderCount: summary.holderCount, totalRefund,
          tradesArchived: (allTrades || []).length,
        }),
        created_at: new Date().toISOString(),
      });
    } catch (e) { /* 로그 실패는 무시 */ }

    return res.status(200).json({ success: true, ...summary, tradesArchived: (allTrades || []).length });
  } catch (e) {
    return res.status(500).json({ error: '처리 중 오류: ' + (e?.message || String(e)) });
  }
}
