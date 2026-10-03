import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';

/* 청산가 = 서버 주가 RPC ambm_stock_price (stock_buy/sell과 동일 가격, 시즌별 가산점 상한 반영).
   null(5경기 미만 비상장)은 최저가 10으로 청산. */
const MIN_PRICE = 10;

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
    const [portRes, walletRes, profilesRes] = await Promise.all([
      sb.from('stock_portfolio').select('*'),
      sb.from('stock_wallets').select('*'),
      sb.from('profiles').select('id,name'),
    ]);
    if (portRes.error || walletRes.error) {
      return res.status(500).json({ error: '데이터 조회 실패: ' + (portRes.error || walletRes.error).message });
    }
    const portfolio = portRes.data || [];
    const wallets = walletRes.data || [];
    const nameMap = {};
    (profilesRes.data || []).forEach(u => { nameMap[u.id] = u.name; });

    // ── 3. 보유된 종목(stock_user_id)들의 현재가 계산 ──
    const heldIds = [...new Set(portfolio.map(p => p.stock_user_id))];
    const priceMap = {};
    const unlisted = [];
    for (const uid of heldIds) {
      const { data: price, error } = await sb.rpc('ambm_stock_price', { p_stock: uid });
      if (error) return res.status(500).json({ error: '주가 조회 실패: ' + error.message, at: uid });
      if (price == null) unlisted.push(nameMap[uid] || uid);
      priceMap[uid] = price ?? MIN_PRICE;
    }

    // ── 4. 청산 계산 (환급액·매도기록) ──
    const walletMap = {};
    wallets.forEach(w => { walletMap[w.user_id] = w.cash; });
    const refundByUser = {};     // user_id -> 환급 합계
    const sellTrades = [];       // stock_trades insert 대상
    for (const p of portfolio) {
      const price = priceMap[p.stock_user_id] ?? MIN_PRICE;
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
      unlisted,
      refunds: Object.entries(refundByUser)
        .map(([uid, amt]) => ({ user_id: uid, name: nameMap[uid] || uid, refund: amt }))
        .sort((a, b) => b.refund - a.refund),
    };

    // ── 5. dryRun: 계산만 반환, 쓰기 없음 ──
    if (dryRun) {
      return res.status(200).json({ dryRun: true, ...summary });
    }

    // ── 5-1. 재실행 방지: 이 시즌 스냅샷이 이미 있으면 이전 실행이 중간에 멈춘 것 → 수동 확인 필요 ──
    const { count: snapCount, error: snapCntErr } = await sb.from('season_close_snapshot')
      .select('id', { count: 'exact', head: true }).eq('season', currentSeason);
    if (snapCntErr) return res.status(500).json({ error: '스냅샷 확인 실패: ' + snapCntErr.message });
    if (snapCount > 0) {
      return res.status(409).json({ error: `시즌 ${currentSeason} 마감 스냅샷이 이미 있습니다. 이전 실행이 중간에 멈췄을 수 있으니 이중 환급 방지를 위해 중단합니다 — season_close_snapshot·wallet_ledger로 상태 확인 후 처리하세요.` });
    }

    // ── 5-2. 스냅샷: 환급·삭제 전 지갑·포트폴리오 원본 박제 (실패 시 아무것도 바꾸지 않고 중단) ──
    const { data: savings, error: savErr } = await sb.from('wallets').select('*');
    if (savErr) return res.status(500).json({ error: '예금지갑 조회 실패(중단): ' + savErr.message });
    const snapRows = [
      ...wallets.map(w => ({ season: currentSeason, kind: 'stock_wallets', user_id: w.user_id, data: w })),
      ...portfolio.map(p => ({ season: currentSeason, kind: 'stock_portfolio', user_id: p.user_id, data: { ...p, liquidation_price: priceMap[p.stock_user_id] ?? MIN_PRICE } })),
      ...(savings || []).map(w => ({ season: currentSeason, kind: 'wallets', user_id: w.user_id, data: w })),
    ];
    if (snapRows.length) {
      const err = await chunkedInsert(sb, 'season_close_snapshot', snapRows);
      if (err) return res.status(500).json({ error: '스냅샷 저장 실패(중단, 변경 없음): ' + err.message });
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

    // ── 10. 시즌 경계 기록 (지난 시즌 랭킹 조회용) ──
    // 마감되는 시즌 = [currentSeasonStart, newSeasonStart). start=''는 전체기간 시작.
    const { data: histRow } = await sb.from('app_settings').select('value').eq('key', 'season_history').maybeSingle();
    let history = [];
    try { history = JSON.parse(histRow?.value || '[]'); } catch (e) { history = []; }
    if (!Array.isArray(history)) history = [];
    if (!history.some(h => h.season === currentSeason)) {
      history.push({ season: currentSeason, start: currentSeasonStart || '', end: newSeasonStart });
    }
    history.sort((a, b) => a.season - b.season);
    const { error: e0 } = await sb.from('app_settings')
      .upsert({ key: 'season_history', value: JSON.stringify(history) }, { onConflict: 'key' });

    // ── 11. 시즌 전환 ──
    const { error: e1 } = await sb.from('app_settings')
      .upsert({ key: 'season_start', value: newSeasonStart }, { onConflict: 'key' });
    const { error: e2 } = await sb.from('app_settings')
      .upsert({ key: 'current_season', value: String(currentSeason + 1) }, { onConflict: 'key' });
    if (e0 || e1 || e2) return res.status(500).json({ error: '시즌 설정 갱신 실패: ' + (e0 || e1 || e2).message });

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
