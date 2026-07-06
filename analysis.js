/* ── analysis.js — 시즌 경기 분석 (베스트 파트너 · 먹잇감 · 천적 + 시각화) ── */

const _AN_MIN_GAMES = 2; // 헤드라인(대표 선정) 최소 경기 수

/* 상대/파트너 통계용 키: 회원=id, 비회원=name: 접두 */
function _anKey(id, name){ return id || (name ? 'name:' + name : null); }

/* 승률(0~100) 계산 */
function _anWr(o){ return o.games > 0 ? Math.round(o.wins / o.games * 100) : 0; }

/* 분석 대상 화면표기(내/이름) — _anRenderBody에서 갱신 */
let _anWho = '내';

/* ── 인라인 SVG 아이콘 (feather 스타일, currentColor/stroke) ── */
function _anIcon(name, size, color){
  const s = size || 18, c = color || 'currentColor';
  const A = inner => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;">${inner}</svg>`;
  switch(name){
    case 'chart':    return A('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');
    case 'users':    return A('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
    case 'user':     return A('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
    case 'target':   return A('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="' + c + '" stroke="none"/>');
    case 'flame':    return A('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>');
    case 'trending': return A('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>');
    case 'calendar': return A('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>');
    default:         return '';
  }
}
/* 카드 제목 (아이콘 + 텍스트) */
function _anTitle(icon, color, text){
  return `<div class="card-title" style="display:flex;align-items:center;gap:8px;">${_anIcon(icon, 18, color)}<span>${text}</span></div>`;
}
/* 헤드라인 원형 아이콘 배지 */
function _anIconBadge(icon, color, bg){
  return `<div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${_anIcon(icon, 24, color)}</div>`;
}

/* 특정 대상(targetId)의 시즌 경기 통계 집계 — inRange: 시즌 필터 술어 */
function _anAggregate(inRange, targetId){
  const meId = targetId || ME?.id;
  const pass = inRange || inSeason;
  const all  = (window._allMatchesCache || []).filter(m =>
    m.status === 'approved' && pass(m) &&
    [m.a1_id, m.a2_id, m.b1_id, m.b2_id].includes(meId)
  );

  let games = 0, wins = 0, scored = 0, conceded = 0;
  const partners = {};   // key → {name, games, wins}
  const opps     = {};   // key → {name, games, wins}  (wins = 내가 이긴 판)

  all.forEach(m => {
    const onA  = [m.a1_id, m.a2_id].includes(meId);
    const aWin = m.score_a > m.score_b;
    const won  = onA ? aWin : !aWin;
    const my   = onA ? m.score_a : m.score_b;
    const opp  = onA ? m.score_b : m.score_a;

    games++; if(won) wins++;
    scored += my; conceded += opp;

    // 파트너 (내 팀의 다른 한 명)
    let mate;
    if(onA) mate = (m.a1_id === meId) ? {id:m.a2_id, name:m.a2_name} : {id:m.a1_id, name:m.a1_name};
    else    mate = (m.b1_id === meId) ? {id:m.b2_id, name:m.b2_name} : {id:m.b1_id, name:m.b1_name};
    const mkey = _anKey(mate.id, mate.name);
    if(mkey){
      if(!partners[mkey]) partners[mkey] = {name: mate.name || '비회원', games:0, wins:0};
      partners[mkey].games++; if(won) partners[mkey].wins++;
    }

    // 상대 (상대 팀 두 명)
    const oppTeam = onA
      ? [{id:m.b1_id, name:m.b1_name}, {id:m.b2_id, name:m.b2_name}]
      : [{id:m.a1_id, name:m.a1_name}, {id:m.a2_id, name:m.a2_name}];
    oppTeam.forEach(o => {
      const okey = _anKey(o.id, o.name);
      if(!okey) return;
      if(!opps[okey]) opps[okey] = {name: o.name || '비회원', games:0, wins:0};
      opps[okey].games++; if(won) opps[okey].wins++;
    });
  });

  return {
    games, wins, losses: games - wins, scored, conceded,
    partnerList: Object.values(partners),
    oppList:     Object.values(opps),
  };
}

/* 선택된 시즌 옵션의 경기 필터(술어) */
function _anPredicateFor(opt){
  if(!opt || opt.isCurrent) return inSeason;
  return m => {
    const md = String(m && m.match_date || '').slice(0, 10);
    return (!opt.start || md >= opt.start) && (!opt.end || md < opt.end);
  };
}

/* 시즌 선택 옵션 목록 구성: [현재 시즌, ...과거 시즌(최신순)] */
async function _anBuildSeasonOptions(){
  const curNum = window._currentSeason || 1;
  const opts = [{ isCurrent:true, season:curNum, start:(window._seasonStart||''), end:'' }];
  let hist = [];
  try{ hist = await _loadSeasonHistory(); }catch(e){ hist = []; }
  (hist || []).forEach(s => {
    if(s.season === curNum) return; // 현재 시즌 중복 방지
    opts.push({ isCurrent:false, season:s.season, start:s.start||'', end:s.end||'' });
  });
  return opts;
}

/* 옵션의 기간 라벨 (예: 2026-01-01 ~ 현재) */
function _anRangeLabel(opt){
  return _seasonRangeLabel({start:opt.start, end:opt.isCurrent ? '' : opt.end}, window._allMatchesCache || []);
}

/* 대상 target의 경기가 있는 가장 최근 시즌 인덱스 (없으면 0=현재) */
function _anDefaultSeasonIdx(targetId){
  const opts = window._anSeasonOpts || [];
  const i = opts.findIndex(o => _anAggregate(_anPredicateFor(o), targetId).games > 0);
  return i < 0 ? 0 : i;
}

/* 분석 대상 선택 드롭다운 */
function _anPlayerSelectHtml(){
  const me = ME?.id;
  const users = (window._profilesCache || [])
    .filter(u => u && u.id && u.name)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const tid = window._anTargetId || me;
  const opts = users.map(u =>
    `<option value="${u.id}" ${u.id === tid ? 'selected' : ''}>${u.name}${u.id === me ? ' (나)' : ''}</option>`
  ).join('');
  return `<select class="form-select" onchange="_anSelectPlayer(this.value)" style="font-size:.92rem;font-weight:700;">${opts}</select>`;
}

/* ── 렌더 진입점 ── */
async function renderAnalysisPage(){
  const wrap = document.getElementById('analysis-inline-content');
  if(!wrap) return;

  await ensureSeasonStart();
  wrap.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text-muted);"><div class="spinner" style="margin:0 auto 12px;"></div>불러오는 중…</div>`;

  if(!window._allMatchesCache || !window._allMatchesCache.length){
    const {data} = await sb.from('matches')
      .select('id,match_type,match_date,a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b,status,created_at')
      .eq('status','approved')
      .order('match_date',{ascending:false});
    window._allMatchesCache = data || [];
    if(typeof _allMatchesCache !== 'undefined') _allMatchesCache = window._allMatchesCache;
  }
  if(!window._profilesCache || !window._profilesCache.length){
    const {data:pc} = await sb.from('profiles').select('*').eq('status','approved');
    window._profilesCache = pc || [];
  }

  const opts = await _anBuildSeasonOptions();
  window._anSeasonOpts = opts;

  // 분석 대상 기본값: 나(ME). 이전 선택이 유효하면 유지
  const me = ME?.id;
  if(!window._anTargetId || !(window._profilesCache || []).some(u => u.id === window._anTargetId)){
    window._anTargetId = me;
  }
  // 시즌 기본값: 대상의 경기가 있는 최신 시즌
  if(typeof window._anSeasonIdx !== 'number' || !opts[window._anSeasonIdx]){
    window._anSeasonIdx = _anDefaultSeasonIdx(window._anTargetId);
  }

  _anRenderShell();
}

/* 대상 선택기 + 시즌 선택기 + 본문 컨테이너 렌더 */
function _anRenderShell(){
  const wrap = document.getElementById('analysis-inline-content');
  if(!wrap) return;
  const opts = window._anSeasonOpts || [];
  const sel  = window._anSeasonIdx || 0;

  const pills = opts.map((o, i) => {
    const active = i === sel;
    const label = o.isCurrent ? `시즌 ${o.season} · 현재` : `시즌 ${o.season}`;
    return `<button onclick="_anSelectSeason(${i})" style="flex-shrink:0;padding:7px 14px;border-radius:20px;border:1px solid ${active ? 'var(--primary)' : 'var(--border)'};background:${active ? 'var(--primary)' : 'var(--bg2)'};color:${active ? '#fff' : 'var(--text-muted)'};font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap;">${label}</button>`;
  }).join('');

  const selOpt = opts[sel];
  const range  = selOpt ? _anRangeLabel(selOpt) : '';

  wrap.innerHTML = `
    <div class="card" style="padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;letter-spacing:.3px;">${_anIcon('user', 13, 'var(--text-muted)')}<span>분석 대상</span></div>
      ${_anPlayerSelectHtml()}
    </div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:4px;-webkit-overflow-scrolling:touch;">${pills}</div>
    <div style="display:flex;align-items:center;gap:5px;font-size:.74rem;color:var(--text-muted);margin-bottom:12px;padding-left:2px;">${_anIcon('calendar', 13, 'var(--text-muted)')}<span>${range}</span></div>
    <div id="analysis-body"></div>`;

  _anRenderBody();
}

/* 대상 변경 */
function _anSelectPlayer(id){
  window._anTargetId = id;
  window._anSeasonIdx = _anDefaultSeasonIdx(id); // 대상의 경기 있는 최신 시즌으로
  _anRenderShell();
  document.querySelector('.app-body')?.scrollTo({top:0,behavior:'smooth'});
}

/* 시즌 변경 */
function _anSelectSeason(idx){
  window._anSeasonIdx = idx;
  _anRenderShell();
  document.querySelector('.app-body')?.scrollTo({top:0,behavior:'smooth'});
}

/* 본문(요약·파트너·먹잇감·천적·분포) 렌더 */
function _anRenderBody(){
  const body = document.getElementById('analysis-body');
  if(!body) return;
  const opt = (window._anSeasonOpts || [])[window._anSeasonIdx || 0];
  const tid = window._anTargetId || ME?.id;
  const isMe = tid === ME?.id;
  const tUser = (window._profilesCache || []).find(u => u.id === tid);
  const tName = tUser ? tUser.name : (isMe ? (ME?.name || '나') : '선수');
  _anWho = isMe ? '내' : tName;

  const d = _anAggregate(_anPredicateFor(opt), tid);

  if(d.games === 0){
    const isCurrent = opt && opt.isCurrent;
    const seasonTxt = isCurrent ? '이번 시즌' : `시즌 ${opt ? opt.season : ''}`;
    const subject = isMe ? seasonTxt : `${tName} 선수는 ${seasonTxt}`;
    body.innerHTML = `
      <div class="card">
        <div class="empty-state" style="padding:40px 0;">
          <div style="display:flex;justify-content:center;opacity:.45;margin-bottom:6px;">${_anIcon('chart', 40, 'var(--text-muted)')}</div>
          <div style="margin-top:8px;font-weight:700;">${subject} 경기 기록이 없어요</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-top:6px;">${isMe && isCurrent ? '경기를 등록하거나 지난 시즌을 선택해 보세요.' : '다른 시즌을 선택해 보세요.'}</div>
          ${isMe && isCurrent ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="navigateTo('register')">경기 등록하러 가기</button>` : ''}
        </div>
      </div>`;
    return;
  }

  const wr = _anWr({games:d.games, wins:d.wins});
  const avgDiff = d.games > 0 ? ((d.scored - d.conceded) / d.games) : 0;

  const series = _anRecentSeries(_anPredicateFor(opt), tid, 15);

  body.innerHTML =
    _anSummaryCard(d, wr, avgDiff) +
    _anMomentumCard(series) +
    _anBestPartnerCard(d.partnerList) +
    _anPreyCard(d.oppList) +
    _anNemesisCard(d.oppList) +
    _anDivergingCard(d.oppList);

  // 캔버스는 DOM 삽입 후 그린다
  requestAnimationFrame(() => _anDrawMomentum(series));
}

/* 대상의 시즌 내 최근 n경기 (오래된→최신 순, {won} 배열) */
function _anRecentSeries(inRange, targetId, n){
  const tid  = targetId || ME?.id;
  const pass = inRange || inSeason;
  const ms = (window._allMatchesCache || []).filter(m =>
    m.status === 'approved' && pass(m) &&
    [m.a1_id, m.a2_id, m.b1_id, m.b2_id].includes(tid)
  ).map(m => {
    const onA = [m.a1_id, m.a2_id].includes(tid);
    const won = (m.score_a > m.score_b) === onA;
    return { won, date:String(m.match_date||'').slice(0,10), created_at:m.created_at||'' };
  }).sort((a, b) => {
    if(a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
  return ms.slice(-(n || 15)); // 최근 n경기
}

/* ── 최근 15경기 모멘텀 카드 (승=상승 / 패=하락) ── */
function _anMomentumCard(series){
  const n = series.length;
  const w = series.filter(s => s.won).length;
  const l = n - w;
  const net = w - l;
  const netStr = (net > 0 ? '+' : '') + net;
  const col = net > 0 ? 'var(--accent)' : net < 0 ? 'var(--danger)' : 'var(--text-muted)';
  return `
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
      <div class="card-title" style="margin:0;display:flex;align-items:center;gap:8px;">${_anIcon('trending', 18, 'var(--accent)')}<span>최근 ${n}경기 흐름</span></div>
      <div style="font-family:'Black Han Sans',sans-serif;font-size:1.15rem;color:${col};line-height:1;">${netStr}</div>
    </div>
    <div style="font-size:.74rem;color:var(--text-muted);margin:3px 0 8px;">승리 = 상승 · 패배 = 하락 &nbsp;·&nbsp; ${w}승 ${l}패</div>
    <canvas id="an-momentum-canvas" style="width:100%;display:block;"></canvas>
  </div>`;
}

/* 캔버스에 누적 승패 곡선을 그린다 (구간별 색: 승=초록 상승, 패=빨강 하락) */
function _anDrawMomentum(series){
  const canvas = document.getElementById('an-momentum-canvas');
  if(!canvas || !series || !series.length) return;

  // 누적값 (선두 0 포함)
  const vals = [0];
  let v = 0;
  series.forEach(s => { v += s.won ? 1 : -1; vals.push(v); });

  let minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals);
  if(minV === maxV){ minV -= 1; maxV += 1; }
  const headroom = Math.max(1, Math.round((maxV - minV) * 0.18));
  minV -= headroom; maxV += headroom;
  const range = maxV - minV || 1;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.offsetWidth || 320;
  const H = 170;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px'; canvas.style.width = '100%';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const isLight = document.body.classList.contains('light-mode');
  const PAD = {t:14, r:14, b:16, l:16};
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;
  ctx.clearRect(0, 0, W, H);

  const up = '#00C896', down = '#FF5252';
  const X = i => PAD.l + cw * (i / (vals.length - 1 || 1));
  const Y = val => PAD.t + ch - ((val - minV) / range) * ch;
  const y0 = Y(0);
  const finalV = vals[vals.length - 1];

  // 기준선(0)
  ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(PAD.l, y0); ctx.lineTo(PAD.l + cw, y0); ctx.stroke();
  ctx.setLineDash([]);

  // 영역 채우기 (선 → 기준선)
  ctx.beginPath();
  ctx.moveTo(X(0), Y(vals[0]));
  for(let i = 1; i < vals.length; i++) ctx.lineTo(X(i), Y(vals[i]));
  ctx.lineTo(X(vals.length - 1), y0);
  ctx.lineTo(X(0), y0);
  ctx.closePath();
  ctx.fillStyle = finalV >= 0 ? 'rgba(0,200,150,0.12)' : 'rgba(255,82,82,0.10)';
  ctx.fill();

  // 구간별 선 (해당 경기 승패로 색)
  ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for(let i = 1; i < vals.length; i++){
    ctx.beginPath();
    ctx.moveTo(X(i - 1), Y(vals[i - 1]));
    ctx.lineTo(X(i), Y(vals[i]));
    ctx.strokeStyle = series[i - 1].won ? up : down;
    ctx.stroke();
  }

  // 포인트 도트
  for(let i = 1; i < vals.length; i++){
    const won = series[i - 1].won;
    ctx.beginPath();
    ctx.arc(X(i), Y(vals[i]), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = won ? up : down;
    ctx.fill();
    ctx.strokeStyle = isLight ? '#fff' : '#0C0D10';
    ctx.lineWidth = 1.5; ctx.stroke();
  }
}

/* ── 1. 시즌 요약 ── */
function _anSummaryCard(d, wr, avgDiff){
  const winPct  = d.games > 0 ? (d.wins / d.games * 100) : 0;
  const diffStr = (avgDiff >= 0 ? '+' : '') + avgDiff.toFixed(1);
  const diffCol = avgDiff >= 0 ? 'var(--primary)' : 'var(--danger)';
  return `
  <div class="card">
    ${_anTitle('chart', 'var(--primary)', `${_anWho} 성적`)}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">
      ${_anTile('경기', d.games, 'var(--text)')}
      ${_anTile('승', d.wins, 'var(--primary)')}
      ${_anTile('패', d.losses, 'var(--danger)')}
      ${_anTile('승률', wr + '%', wr >= 50 ? 'var(--accent)' : 'var(--text-muted)')}
    </div>
    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:5px;display:flex;justify-content:space-between;">
      <span>승 ${d.wins}</span><span>평균 득실 <b style="color:${diffCol};">${diffStr}</b></span><span>패 ${d.losses}</span>
    </div>
    <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--bg2);">
      <div style="width:${winPct}%;background:var(--primary);"></div>
      <div style="width:${100 - winPct}%;background:var(--danger);opacity:.85;"></div>
    </div>
  </div>`;
}
function _anTile(label, val, color){
  return `<div class="stat-card" style="text-align:center;padding:12px 6px;">
    <div class="stat-label" style="margin-bottom:4px;">${label}</div>
    <div style="font-family:'Black Han Sans',sans-serif;font-size:1.4rem;line-height:1;color:${color};">${val}</div>
  </div>`;
}

/* ── 공통: 승률 수평 바 행 ── */
function _anBarRow(rank, name, sub, wr, color){
  const isTop = rank === 1;
  return `
  <div style="padding:10px 0;border-bottom:1px solid var(--border);">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">
      <div style="width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.82rem;font-weight:800;flex-shrink:0;color:${isTop ? '#fff' : 'var(--text-muted)'};background:${isTop ? color : 'var(--bg2)'};">${rank}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
        <div style="font-size:.74rem;color:var(--text-muted);margin-top:1px;">${sub}</div>
      </div>
      <div style="font-family:'Black Han Sans',sans-serif;font-size:1.15rem;color:${color};flex-shrink:0;">${wr}%</div>
    </div>
    <div style="height:8px;border-radius:4px;background:var(--bg2);overflow:hidden;">
      <div style="height:100%;width:${Math.max(wr, 3)}%;background:${color};border-radius:4px;"></div>
    </div>
  </div>`;
}

/* ── 2. 베스트 파트너 (같은 팀 승률↑) ── */
function _anBestPartnerCard(partnerList){
  const list = partnerList.slice().sort((a,b) =>
    _anWr(b) - _anWr(a) || b.wins - a.wins || b.games - a.games
  );
  const ranked = list.filter(p => p.games >= _AN_MIN_GAMES);
  const use = (ranked.length ? ranked : list).slice(0, 5);
  const best = use[0];
  return `
  <div class="card">
    ${_anTitle('users', 'var(--accent)', '베스트 파트너')}
    <div style="font-size:.76rem;color:var(--text-muted);margin:-4px 0 8px;">함께 뛰었을 때 승률이 가장 높은 파트너</div>
    ${best ? `<div style="background:linear-gradient(135deg,rgba(0,212,170,.14),rgba(0,212,170,.03));border:1px solid rgba(0,212,170,.3);border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:12px;">
      ${_anIconBadge('users', 'var(--accent)', 'rgba(0,212,170,.15)')}
      <div style="flex:1;min-width:0;">
        <div style="font-size:.72rem;color:var(--accent);font-weight:700;">환상의 콤비</div>
        <div style="font-weight:800;font-size:1.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${best.name}</div>
        <div style="font-size:.76rem;color:var(--text-muted);">${best.games}경기 ${best.wins}승 ${best.games - best.wins}패</div>
      </div>
      <div style="text-align:center;">
        <div style="font-family:'Black Han Sans',sans-serif;font-size:1.7rem;color:var(--accent);line-height:1;">${_anWr(best)}%</div>
        <div style="font-size:.68rem;color:var(--text-dim);">승률</div>
      </div>
    </div>` : ''}
    ${use.map((p,i) => _anBarRow(i+1, p.name, `${p.games}경기 · ${p.wins}승 ${p.games - p.wins}패`, _anWr(p), 'var(--accent)')).join('')}
    ${_anThreshNote(partnerList, ranked, '함께 뛴')}
  </div>`;
}

/* ── 3. 먹잇감 (상대전적 우위) ── */
function _anPreyCard(oppList){
  const prey = oppList.filter(o => o.games >= _AN_MIN_GAMES && _anWr(o) > 50)
    .sort((a,b) => _anWr(b) - _anWr(a) || (b.wins - (b.games - b.wins)) - (a.wins - (a.games - a.wins)) || b.games - a.games)
    .slice(0, 5);
  const top = prey[0];
  return `
  <div class="card">
    ${_anTitle('target', 'var(--primary)', '먹잇감')}
    <div style="font-size:.76rem;color:var(--text-muted);margin:-4px 0 8px;">유독 강한, 상대전적에서 앞서는 선수</div>
    ${top ? `<div style="background:linear-gradient(135deg,rgba(77,159,255,.14),rgba(77,159,255,.03));border:1px solid rgba(77,159,255,.3);border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:12px;">
      ${_anIconBadge('target', 'var(--primary)', 'rgba(77,159,255,.15)')}
      <div style="flex:1;min-width:0;">
        <div style="font-size:.72rem;color:var(--primary);font-weight:700;">가장 만만한 상대</div>
        <div style="font-weight:800;font-size:1.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${top.name}</div>
        <div style="font-size:.76rem;color:var(--text-muted);">상대 ${top.games}회 · ${top.wins}승 ${top.games - top.wins}패</div>
      </div>
      <div style="text-align:center;">
        <div style="font-family:'Black Han Sans',sans-serif;font-size:1.7rem;color:var(--primary);line-height:1;">${_anWr(top)}%</div>
        <div style="font-size:.68rem;color:var(--text-dim);">${_anWho} 승률</div>
      </div>
    </div>` : `<div class="empty-state" style="padding:16px 0;font-size:.85rem;color:var(--text-muted);">아직 상대전적에서 앞서는 선수가 없어요</div>`}
    ${prey.map((o,i) => _anBarRow(i+1, o.name, `상대 ${o.games}회 · ${o.wins}승 ${o.games - o.wins}패`, _anWr(o), 'var(--primary)')).join('')}
  </div>`;
}

/* ── 4. 천적 (상대전적 열세) ── */
function _anNemesisCard(oppList){
  const nem = oppList.filter(o => o.games >= _AN_MIN_GAMES && _anWr(o) < 50)
    .sort((a,b) => _anWr(a) - _anWr(b) || ((a.games - a.wins) - a.wins) - ((b.games - b.wins) - b.wins) || b.games - a.games)
    .slice(0, 5);
  const top = nem[0];
  return `
  <div class="card">
    ${_anTitle('flame', 'var(--danger)', '천적')}
    <div style="font-size:.76rem;color:var(--text-muted);margin:-4px 0 8px;">유독 약한, 상대전적에서 뒤지는 선수</div>
    ${top ? `<div style="background:linear-gradient(135deg,rgba(255,107,107,.14),rgba(255,107,107,.03));border:1px solid rgba(255,107,107,.3);border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:12px;">
      ${_anIconBadge('flame', 'var(--danger)', 'rgba(255,107,107,.15)')}
      <div style="flex:1;min-width:0;">
        <div style="font-size:.72rem;color:var(--danger);font-weight:700;">넘기 힘든 벽</div>
        <div style="font-weight:800;font-size:1.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${top.name}</div>
        <div style="font-size:.76rem;color:var(--text-muted);">상대 ${top.games}회 · ${top.wins}승 ${top.games - top.wins}패</div>
      </div>
      <div style="text-align:center;">
        <div style="font-family:'Black Han Sans',sans-serif;font-size:1.7rem;color:var(--danger);line-height:1;">${_anWr(top)}%</div>
        <div style="font-size:.68rem;color:var(--text-dim);">${_anWho} 승률</div>
      </div>
    </div>` : `<div class="empty-state" style="padding:16px 0;font-size:.85rem;color:var(--text-muted);">천적이 없습니다 — 최강자!</div>`}
    ${nem.map((o,i) => _anBarRow(i+1, o.name, `상대 ${o.games}회 · ${o.wins}승 ${o.games - o.wins}패`, _anWr(o), 'var(--danger)')).join('')}
  </div>`;
}

/* ── 5. 상대전적 분포 (50% 기준 다이버징) ── */
function _anDivergingCard(oppList){
  const list = oppList.filter(o => o.games >= _AN_MIN_GAMES)
    .sort((a,b) => _anWr(b) - _anWr(a) || b.games - a.games);
  if(!list.length) return '';

  const rows = list.map(o => {
    const wr = _anWr(o);
    const win = wr >= 50;
    const col = win ? 'var(--primary)' : 'var(--danger)';
    // 트랙 전체(0~100%)에 승률을 매핑, 중앙 50%가 기준선
    const barStyle = win
      ? `left:50%;width:${wr - 50}%;`
      : `left:${wr}%;width:${50 - wr}%;`;
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
      <div style="width:64px;flex-shrink:0;font-size:.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;">${o.name}</div>
      <div style="flex:1;position:relative;height:16px;background:var(--bg2);border-radius:4px;">
        <div style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--text-dim);opacity:.6;"></div>
        <div style="position:absolute;top:0;bottom:0;${barStyle}background:${col};border-radius:3px;"></div>
      </div>
      <div style="width:34px;flex-shrink:0;font-size:.78rem;font-weight:700;color:${col};text-align:left;">${wr}%</div>
    </div>`;
  }).join('');

  return `
  <div class="card">
    ${_anTitle('chart', 'var(--text-muted)', '상대전적 분포')}
    <div style="font-size:.76rem;color:var(--text-muted);margin:-4px 0 10px;">중앙선(50%) 기준 — 오른쪽 파랑은 우세(먹잇감), 왼쪽 빨강은 열세(천적)</div>
    ${rows}
    <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--text-dim);margin-top:8px;padding:0 42px 0 72px;">
      <span>← 천적</span><span>50%</span><span>먹잇감 →</span>
    </div>
  </div>`;
}

/* ── 최소경기 기준 안내 ── */
function _anThreshNote(fullList, rankedList, verb){
  const excluded = fullList.length - rankedList.length;
  if(!rankedList.length && fullList.length){
    return `<div style="font-size:.72rem;color:var(--text-muted);margin-top:8px;text-align:center;">아직 ${_AN_MIN_GAMES}경기 이상 ${verb} 상대가 없어 전체 기준으로 표시했어요.</div>`;
  }
  return `<div style="font-size:.7rem;color:var(--text-dim);margin-top:8px;text-align:center;">${_AN_MIN_GAMES}경기 이상 함께한 파트너 기준</div>`;
}
