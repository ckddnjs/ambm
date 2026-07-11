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
    case 'trophy':   return A('<path d="M6 9a6 6 0 0 0 12 0V3H6z"/><path d="M6 5H3a1 1 0 0 0-1 1c0 2.5 1.5 4 4 4"/><path d="M18 5h3a1 1 0 0 1 1 1c0 2.5-1.5 4-4 4"/><line x1="12" y1="15" x2="12" y2="18"/><path d="M8 21h8"/><path d="M10 18h4v3h-4z"/>');
    case 'zap':      return A('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');
    case 'run':      return A('<circle cx="14" cy="4.5" r="2"/><path d="M5 20l3.5-6 3-2-1-5 4 3 3 1"/><path d="M10.5 12 14 15l1 6"/>');
    case 'medal':    return A('<circle cx="12" cy="15" r="5"/><path d="M8.5 10.5 6 3h4l2 5 2-5h4l-2.5 7.5"/>');
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
      if(!partners[mkey]) partners[mkey] = {id: mate.id || null, name: mate.name || '비회원', games:0, wins:0};
      partners[mkey].games++; if(won) partners[mkey].wins++;
    }

    // 상대 (상대 팀 두 명)
    const oppTeam = onA
      ? [{id:m.b1_id, name:m.b1_name}, {id:m.b2_id, name:m.b2_name}]
      : [{id:m.a1_id, name:m.a1_name}, {id:m.a2_id, name:m.a2_name}];
    oppTeam.forEach(o => {
      const okey = _anKey(o.id, o.name);
      if(!okey) return;
      if(!opps[okey]) opps[okey] = {id: o.id || null, name: o.name || '비회원', games:0, wins:0};
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
  const tid = window._anTargetId || me;
  const cur = (window._profilesCache || []).find(u => u.id === tid);
  const nm = cur ? cur.name + (cur.id === me ? ' (나)' : '') : '선택';
  const av = cur && cur.avatar_url
    ? `<img src="${cur.avatar_url}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
    : `<span style="width:30px;height:30px;border-radius:50%;background:var(--primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0;">${escHtml((cur?.name||'?').slice(0,1))}</span>`;
  return `<button onclick="openAnalysisPicker()" style="width:100%;display:flex;align-items:center;gap:9px;padding:8px 12px;border-radius:12px;border:1.5px solid var(--border);background:var(--bg2);cursor:pointer;font-family:inherit;">
    ${av}
    <span style="flex:1;text-align:left;font-size:.85rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(nm)}</span>
    <span style="color:var(--text-muted);font-size:.72rem;">바꾸기 ▾</span>
  </button>`;
}
/* 분석 대상 선택 시트 (조합 선택과 동일한 3열 그리드) */
function openAnalysisPicker(){
  const me = ME?.id, tid = window._anTargetId || me;
  const list = (window._profilesCache || []).filter(u => u && u.id && u.name && !u.exclude_stats)
    .slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const chip = u => `<div onclick="_anSelectPlayer('${u.id}');document.getElementById('an-picker')?.remove();" style="display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:9999px;border:1.5px solid ${u.id===tid?'var(--primary)':'var(--border)'};background:${u.id===tid?'rgba(77,159,255,.14)':'var(--bg2)'};cursor:pointer;min-width:0;">
      ${u.avatar_url
        ? `<img src="${u.avatar_url}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
        : `<span style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0;">${escHtml(u.name.slice(0,1))}</span>`}
      <span style="font-size:.85rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(u.name)}${u.id===me?' (나)':''}</span>
    </div>`;
  const ov = document.createElement('div');
  ov.id = 'an-picker';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400;display:flex;align-items:flex-end;justify-content:center;';
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
  ov.innerHTML = `<div class="sheet-in" style="background:var(--bg);border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:78vh;display:flex;flex-direction:column;padding:14px 14px calc(16px + env(safe-area-inset-bottom,0px));">
    <div style="width:44px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 12px;"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
      <b style="font-size:1rem;">📊 분석 대상 선택</b>
      <button onclick="document.getElementById('an-picker').remove()" style="margin-left:auto;background:var(--bg2);border:1px solid var(--border);border-radius:50%;width:30px;height:30px;color:var(--text-muted);font-size:.9rem;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div style="overflow-y:auto;padding-bottom:10px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px;">${list.map(chip).join('')}</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.querySelector('.sheet-in')?.classList.add('on')));
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

  const main = window._anMainTab || 'all';
  const mtab = (key,icon,label) => `<button onclick="_anSetMainTab('${key}')" style="flex:1;padding:11px 0;border:none;border-radius:11px;font-family:inherit;font-size:.9rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;${main===key?'background:var(--primary);color:#fff;':'background:var(--bg2);color:var(--text-muted);'}">${_anIcon(icon,15)}<span>${label}</span></button>`;

  wrap.innerHTML = `
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:4px;-webkit-overflow-scrolling:touch;">${pills}</div>
    <div style="display:flex;align-items:center;gap:5px;font-size:.74rem;color:var(--text-muted);margin-bottom:10px;padding-left:2px;">${_anIcon('calendar', 13, 'var(--text-muted)')}<span>${range}</span></div>
    <div style="display:flex;gap:6px;margin-bottom:12px;">${mtab('all','chart','전체')}${mtab('person','user','개인별')}</div>
    ${main === 'person' ? `<div class="card" style="padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;letter-spacing:.3px;">${_anIcon('user', 13, 'var(--text-muted)')}<span>분석 대상</span></div>
      ${_anPlayerSelectHtml()}
    </div>` : ''}
    <div id="analysis-body" class="an-anim"></div>`;

  _anRenderBody();
}
function _anSetMainTab(t){
  window._anMainTab = t;
  _anRenderShell();
  // 전환 애니 재생 (요소 재생성 시 자동, 혹시 재사용되면 클래스 리트리거)
  const b=document.getElementById('analysis-body');
  if(b){ b.classList.remove('an-anim'); void b.offsetWidth; b.classList.add('an-anim'); }
}

/* 대상 변경 */
function _anSelectPlayer(id){
  window._anTargetId = id;
  // 시즌 선택은 사용자가 골라둔 그대로 유지 (대상 변경 시 자동 전환 안 함)
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
  if((window._anMainTab || 'all') === 'all'){
    body.innerHTML = _anAllHTML(opt);
    return;
  }
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

  const seqAll = _anRecentSeries(_anPredicateFor(opt), tid, 100000);   // 시즌 전체 시퀀스
  body.innerHTML =
    _anPersonTiles(d, wr, avgDiff, seqAll) +
    _anFlowCard(series) +
    _anSpectrumCard('users', 'var(--accent)', '파트너 케미 스펙트럼', d.partnerList, '함께',
      '같은 팀 2경기 이상 전원 · 가운데 50% 기준 좌우로 뻗어요', '안 맞아요', '잘 맞아요') +
    _anSpectrumCard('target', 'var(--danger)', '상대 전적 스펙트럼', d.oppList, '상대',
      '상대로 2경기 이상 전원 · 오른쪽일수록 내가 잡는 상대', '천적', '먹잇감');

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

/* ── 서브탭: 파트너 / 상대 ── */
function _anSubTabsHtml(active){
  const tab = (key, label) => `<button onclick="_anSetSubTab('${key}')" style="flex:1;padding:10px 0;border:none;border-radius:10px;font-family:inherit;font-size:.88rem;font-weight:800;cursor:pointer;${active===key?'background:var(--primary);color:#fff;':'background:var(--bg2);color:var(--text-muted);'}">${label}</button>`;
  return `<div style="display:flex;gap:6px;margin-bottom:12px;">${tab('partner','🤝 파트너')}${tab('oppo','⚔️ 상대')}</div>`;
}
function _anSetSubTab(key){
  window._anSubTab = key;
  const el = document.getElementById('an-subbody');
  const b = window._anBody || {};
  // 탭 버튼 스타일만 다시 그림 + 본문 교체 (요약/모멘텀은 유지 → 캔버스 재드로 불필요)
  const tabsWrap = el?.previousElementSibling;
  if(tabsWrap) tabsWrap.outerHTML = _anSubTabsHtml(key);
  const el2 = document.getElementById('an-subbody');
  if(el2) el2.innerHTML = key === 'oppo' ? _anOppoPanel(b.d?.oppList||[]) : _anPartnerPanel(b.d?.partnerList||[]);
}

/* ── 통합 요약 카드: 성적 + 최근 흐름 스파크라인 한 장 ── */
function _anOverviewCard(d, wr, avgDiff, series){
  const winPct  = d.games > 0 ? (d.wins / d.games * 100) : 0;
  const diffStr = (avgDiff >= 0 ? '+' : '') + avgDiff.toFixed(1);
  const diffCol = avgDiff >= 0 ? 'var(--primary)' : 'var(--danger)';
  const n = series.length, sw = series.filter(x=>x.won).length, sl = n - sw, net = sw - sl;
  const netStr = (net>0?'+':'') + net, netCol = net>0?'var(--accent)':net<0?'var(--danger)':'var(--text-muted)';
  return `
  <div class="card">
    ${_anTitle('chart', 'var(--primary)', `${_anWho} 성적`)}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 12px;">
      ${_anTile('경기', d.games, 'var(--text)')}
      ${_anTile('승', d.wins, 'var(--primary)')}
      ${_anTile('패', d.losses, 'var(--danger)')}
      ${_anTile('승률', wr + '%', wr >= 50 ? 'var(--accent)' : 'var(--text-muted)')}
    </div>
    <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--bg2);margin-bottom:4px;">
      <div style="width:${winPct}%;background:var(--primary);"></div>
      <div style="width:${100 - winPct}%;background:var(--danger);opacity:.85;"></div>
    </div>
    <div style="font-size:.72rem;color:var(--text-muted);text-align:right;margin-bottom:14px;">평균 득실 <b style="color:${diffCol};">${diffStr}</b></div>
    ${n ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div style="display:flex;align-items:center;gap:7px;font-size:.82rem;font-weight:800;color:var(--text-muted);">${_anIcon('trending', 15, 'var(--accent)')}<span>최근 ${n}경기 흐름</span></div>
      <div style="font-size:.74rem;color:var(--text-muted);">${sw}승 ${sl}패 · <b style="color:${netCol};">${netStr}</b></div>
    </div>
    <canvas id="an-momentum-canvas" style="width:100%;display:block;"></canvas>` : ''}
  </div>`;
}

/* ── 파트너 패널 ── */
function _anPartnerPanel(partnerList){
  return _anBestPartnerCard(partnerList);
}

/* ── 상대 패널: 먹잇감·천적 요약칩 + 상대전적 분포 ── */
function _anOppoPanel(oppList){
  const ranked = oppList.filter(o => o.games >= _AN_MIN_GAMES);
  const prey = ranked.filter(o => _anWr(o) > 50).sort((a,b)=>_anWr(b)-_anWr(a)||b.games-a.games).slice(0,3);
  const nem  = ranked.filter(o => _anWr(o) < 50).sort((a,b)=>_anWr(a)-_anWr(b)||b.games-a.games).slice(0,3);
  const chip = (o, col) => `<div style="display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:10px;background:var(--bg2);">
      <span style="flex:1;min-width:0;font-size:.85rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.name}</span>
      <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${o.wins}승 ${o.games-o.wins}패</span>
      <span style="font-family:'Black Han Sans',sans-serif;font-size:1rem;color:${col};flex-shrink:0;min-width:38px;text-align:right;">${_anWr(o)}%</span>
    </div>`;
  const block = (title, arr, col, empty) => `
    <div style="font-size:.8rem;font-weight:800;color:${col};margin-bottom:7px;">${title}</div>
    ${arr.length ? `<div style="display:flex;flex-direction:column;gap:6px;">${arr.map(o=>chip(o,col)).join('')}</div>`
      : `<div style="font-size:.8rem;color:var(--text-muted);padding:4px 0 2px;">${empty}</div>`}`;
  return `
  <div class="card">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>${block('🍗 먹잇감 TOP3', prey, 'var(--primary)', '아직 없어요')}</div>
      <div>${block('🔥 천적 TOP3', nem, 'var(--danger)', '천적 없음, 최강자!')}</div>
    </div>
  </div>
  ${_anDivergingCard(oppList)}`;
}

/* ── 1. 시즌 요약 (구버전 — 미사용, 보존) ── */
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
    <div class="card-title" style="display:flex;align-items:center;gap:8px;"><span style="font-size:1.05rem;line-height:1;">🍗</span><span>먹잇감</span></div>
    <div style="font-size:.76rem;color:var(--text-muted);margin:-4px 0 8px;">유독 강한, 상대전적에서 앞서는 선수</div>
    ${top ? `<div style="background:linear-gradient(135deg,rgba(77,159,255,.14),rgba(77,159,255,.03));border:1px solid rgba(77,159,255,.3);border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:12px;">
      <div style="width:44px;height:44px;border-radius:12px;background:rgba(77,159,255,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.6rem;">🍗</div>
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
    .sort((a,b) => {
      const d = _anWr(b) - _anWr(a);
      if(d !== 0) return d;
      // 동률이면: 우세(50%↑)는 판수 많을수록 위(확실한 먹잇감), 열세는 판수 많을수록 아래(지독한 천적)
      return _anWr(a) >= 50 ? b.games - a.games : a.games - b.games;
    });
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
    <div style="font-size:.74rem;color:var(--text-muted);margin:-4px 0 10px;">전체 상대 · 중앙 50% 기준 우세(파랑)/열세(빨강)</div>
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

/* ═══ 📊 시즌 전체 (hsdTV 시즌통계 모티브: 어워드·라이벌·페어 랭킹) ═══ */
function _anAv(p,size){
  return p&&p.avatar
    ? `<img src="${p.avatar}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
    : `<span style="width:${size}px;height:${size}px;border-radius:50%;background:var(--primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(size*.4)}px;font-weight:800;flex-shrink:0;">${escHtml((p?.name||'?').slice(0,1))}</span>`;
}
const _anSecCard=(title,inner,note)=>`<div class="card">
  <div class="card-title" style="margin-bottom:${note?'2px':'8px'};">${title}</div>
  ${note?`<div style="font-size:.7rem;color:var(--text-muted);margin-bottom:8px;">${note}</div>`:''}
  ${inner}</div>`;
const _anEmptyRow=msg=>`<div style="text-align:center;color:var(--text-muted);font-size:.78rem;padding:12px 0;">${msg}</div>`;

/* 시즌 전체 집계: 회원 기준 (통계제외 제외, 게스트는 총경기에만 포함) */
function _anAllAggregate(pass){
  const users=window._profilesCache||[];
  const ex=new Set(users.filter(u=>u.exclude_stats).map(u=>u.id));
  const players=new Map(), pairs=new Map(), h2h=new Map();
  let total=0;
  const P=id=>{ if(!players.has(id)){const u=users.find(x=>x.id===id); players.set(id,{id,name:u?.name||'?',avatar:u?.avatar_url||'',games:[],partner:new Set()});} return players.get(id); };
  const ms=(window._allMatchesCache||[]).filter(m=>m.status==='approved'&&pass(m))
    .slice().sort((a,b)=>String(a.match_date).localeCompare(String(b.match_date))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  ms.forEach(m=>{
    total++;
    const aWin=m.score_a>m.score_b, diffA=m.score_a-m.score_b;
    const A=[m.a1_id,m.a2_id].filter(id=>id&&!ex.has(id));
    const B=[m.b1_id,m.b2_id].filter(id=>id&&!ex.has(id));
    A.forEach(id=>P(id).games.push({win:aWin,diff:diffA}));
    B.forEach(id=>P(id).games.push({win:!aWin,diff:-diffA}));
    const addPair=(T,won)=>{ if(T.length!==2) return;
      T.forEach((id,i)=>P(id).partner.add(T[1-i]));
      const k=T.slice().sort().join('|');
      const pr=pairs.get(k)||{ids:T.slice().sort(),names:[],g:0,w:0};
      pr.g++; if(won) pr.w++; pairs.set(k,pr); };
    addPair(A,aWin); addPair(B,!aWin);
    A.forEach(x=>B.forEach(y=>{
      const k=[x,y].sort().join('|');
      const r=h2h.get(k)||{ids:[x,y].sort(),g:0,w:{}};
      r.g++; const winner=aWin?x:y; r.w[winner]=(r.w[winner]||0)+1; h2h.set(k,r);
    }));
  });
  pairs.forEach(pr=>{pr.names=pr.ids.map(id=>players.get(id)?.name||'?');});
  return {players,pairs,h2h,total};
}

/* 🏅 시즌 어워드 배지 그리드 */
function _anAwardsHTML(players){
  const list=[...players.values()].filter(p=>p.games.length>0);
  if(!list.length) return _anEmptyRow('데이터가 없어요');
  const stat=p=>{
    const wins=p.games.filter(g=>g.win).length;
    let run=0,best=0,closeW=0,closeG=0,sum=0;
    p.games.forEach(g=>{ run=g.win?run+1:0; best=Math.max(best,run); if(Math.abs(g.diff)<=2){ closeG++; if(g.win) closeW++; } sum+=g.diff; });
    return {p,wins,g:p.games.length,best,closeW,closeG,avg:p.games.length?sum/p.games.length:0,mates:p.partner.size};
  };
  const S=list.map(stat);
  const top=(arr,fn)=>arr.reduce((a,x)=>fn(x)>fn(a)?x:a,arr[0]);
  const min10=S.filter(x=>x.g>=10);
  const defs=[
    {ic:'trophy', col:'#FFB300', t:'다승왕', grad:'linear-gradient(135deg,#ffd45e2e,#ff9f2e1c)', s:top(S,x=>x.wins), v:x=>`${x.wins}승`},
    {ic:'run',    col:'#4D9FFF', t:'개근왕', grad:'linear-gradient(135deg,#4D9FFF2e,#4D9FFF12)', s:top(S,x=>x.g), v:x=>`${x.g}경기`},
    {ic:'flame',  col:'#FF5252', t:'연승왕', grad:'linear-gradient(135deg,#ff52522e,#ff9f2e14)', s:top(S,x=>x.best), v:x=>`최장 ${x.best}연승`},
    {ic:'target', col:'#AB47BC', t:'접전왕', grad:'linear-gradient(135deg,#AB47BC2e,#AB47BC12)', s:top(S,x=>x.closeW), v:x=>`접전 ${x.closeG}번 중 ${x.closeW}승`, note:'2점차 이내'},
    {ic:'zap',    col:'#00C896', t:'압도왕', grad:'linear-gradient(135deg,#00C8962e,#00C89612)', s:min10.length?top(min10,x=>x.avg):null, v:x=>`평균 ${x.avg>=0?'+':''}${x.avg.toFixed(1)}점`, note:'10경기↑'},
    {ic:'users',  col:'#F06292', t:'마당발', grad:'linear-gradient(135deg,#F062922e,#F0629212)', s:top(S,x=>x.mates), v:x=>`파트너 ${x.mates}명`},
  ];
  const cards=defs.filter(d=>d.s).map(d=>`
    <div style="position:relative;overflow:hidden;border:1px solid var(--border);border-radius:14px;padding:11px 12px;background:${d.grad};">
      <span style="position:absolute;right:-8px;bottom:-12px;opacity:.16;transform:rotate(-8deg);">${_anIcon(d.ic,64,d.col)}</span>
      <div style="display:flex;align-items:center;gap:5px;font-size:.68rem;font-weight:800;color:var(--text-muted);margin-bottom:7px;">${_anIcon(d.ic,13,d.col)}<span>${d.t}${d.note?` <span style="font-weight:600;">(${d.note})</span>`:''}</span></div>
      <div style="display:flex;align-items:center;gap:7px;">
        ${_anAv(d.s.p,30)}
        <div style="min-width:0;">
          <div style="font-size:.84rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(d.s.p.name)}</div>
          <div style="font-size:.66rem;color:var(--text-muted);">${d.v(d.s)}</div>
        </div>
      </div>
    </div>`).join('');
  return `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${cards}</div>`;
}

/* ⚡ 라이벌 매치 — 팽팽한 맞대결 TOP3 */
function _anRivalsHTML(players,h2h){
  const rivals=[...h2h.values()]
    .filter(r=>r.g>=3&&players.has(r.ids[0])&&players.has(r.ids[1]))
    .map(r=>{ const w1=r.w[r.ids[0]]||0, w2=r.w[r.ids[1]]||0; return {...r,w1,w2,close:1-Math.abs(w1-w2)/r.g}; })
    .sort((a,b)=>b.close-a.close||b.g-a.g)
    .slice(0,3);
  if(!rivals.length) return _anEmptyRow('3회 이상 맞붙은 라이벌이 아직 없어요');
  return rivals.map((r,i)=>{
    const P1=players.get(r.ids[0]), P2=players.get(r.ids[1]);
    const heat=r.w1===r.w2?'🔥 완전 팽팽':'⚡ 초접전';
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:12px 10px;border:1.5px solid ${i===0?'#FFB300':'var(--border)'};border-radius:14px;margin-bottom:8px;background:linear-gradient(90deg,rgba(255,82,82,.07),var(--bg2) 35%,var(--bg2) 65%,rgba(77,159,255,.07));">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;">
        ${_anAv(P1,38)}
        <span style="max-width:100%;font-size:.76rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(P1.name)}</span>
      </div>
      <div style="flex-shrink:0;text-align:center;">
        <div style="font-size:1.15rem;font-weight:900;letter-spacing:2px;">${r.w1} <span style="font-size:.7rem;color:var(--danger);font-weight:900;">VS</span> ${r.w2}</div>
        <div style="font-size:.62rem;color:var(--text-muted);margin-top:2px;">${r.g}번 맞대결 · ${heat}</div>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;">
        ${_anAv(P2,38)}
        <span style="max-width:100%;font-size:.76rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(P2.name)}</span>
      </div>
    </div>`;
  }).join('');
}

/* 💚/💧 페어 카드 */
function _anPairCard(players,pr,rank,isBest){
  const P1=players.get(pr.ids[0]), P2=players.get(pr.ids[1]);
  const wr=pr.g?Math.round(pr.w/pr.g*100):0;
  const first=isBest&&rank===0;
  const medal=isBest?(['🥇','🥈','🥉'][rank]||`<span style="font-size:.72rem;font-weight:900;color:var(--text-muted);">${rank+1}위</span>`):(['💧','😅','🙈'][rank]||'💧');
  const pctColor=isBest?'var(--primary)':'var(--danger)';
  const barGrad=isBest?'linear-gradient(90deg,#2979FF,#4D9FFF)':'linear-gradient(90deg,#f87171,#dc2626)';
  const border=first?'1.5px solid #FFB300':'1px solid var(--border)';
  const bg=first?'linear-gradient(135deg,rgba(255,179,0,.1),var(--bg2) 55%)':'var(--bg2)';
  const ring='border:2px solid var(--bg2);border-radius:50%;';
  return `
  <div style="display:flex;align-items:center;gap:9px;padding:${first?'12px':'10px'} 11px;border:${border};border-radius:13px;margin-bottom:7px;background:${bg};">
    <span style="width:26px;flex-shrink:0;text-align:center;font-size:${first?'1.25rem':'1.05rem'};">${medal}</span>
    <span style="flex-shrink:0;display:inline-flex;">
      <span style="${ring}display:inline-flex;z-index:1;">${_anAv(P1||{name:pr.names?.[0]},first?32:28)}</span>
      <span style="${ring}display:inline-flex;margin-left:-9px;">${_anAv(P2||{name:pr.names?.[1]},first?32:28)}</span>
    </span>
    <div style="flex:1;min-width:0;">
      <div style="font-size:.8rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(pr.names?.[0]||'?')} <span style="color:var(--text-dim);">✚</span> ${escHtml(pr.names?.[1]||'?')}</div>
      <div style="font-size:.64rem;color:var(--text-muted);margin-top:1px;">${pr.g}전 ${pr.w}승 ${pr.g-pr.w}패</div>
    </div>
    <div style="flex-shrink:0;text-align:right;">
      <div style="font-size:${first?'1.05rem':'.92rem'};font-weight:900;color:${pctColor};line-height:1;">${wr}%</div>
      <div style="width:54px;height:6px;border-radius:3px;background:var(--bg3);overflow:hidden;margin-top:4px;">
        <div style="height:100%;width:${Math.max(wr,3)}%;background:${barGrad};"></div>
      </div>
    </div>
  </div>`;
}

function _anAllHTML(opt){
  const d=_anAllAggregate(_anPredicateFor(opt));
  if(!d.total){
    const isCurrent=opt&&opt.isCurrent;
    return `<div class="card"><div class="empty-state" style="padding:40px 0;">
      <div style="display:flex;justify-content:center;opacity:.45;margin-bottom:6px;">${_anIcon('chart',40,'var(--text-muted)')}</div>
      <div style="margin-top:8px;font-weight:700;">${isCurrent?'이번 시즌':'이 시즌'} 승인된 경기가 없어요</div>
    </div></div>`;
  }
  const tiles=`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;">
    <div class="stat-card" style="text-align:center;padding:14px 6px;">
      <div class="stat-label" style="margin-bottom:4px;">총 경기</div>
      <div style="font-family:'Black Han Sans',sans-serif;font-size:1.5rem;line-height:1;color:var(--text);">${d.total}</div>
    </div>
    <div class="stat-card" style="text-align:center;padding:14px 6px;">
      <div class="stat-label" style="margin-bottom:4px;">참여 인원</div>
      <div style="font-family:'Black Han Sans',sans-serif;font-size:1.5rem;line-height:1;color:var(--text);">${d.players.size}</div>
    </div>
  </div>`;
  const pr=[...d.pairs.values()].filter(x=>x.g>=3);
  const wrOf=x=>x.g?x.w/x.g:0;
  const best=[...pr].sort((a,b)=>wrOf(b)-wrOf(a)||b.g-a.g).slice(0,5);
  const worst=[...pr].sort((a,b)=>wrOf(a)-wrOf(b)||b.g-a.g).slice(0,3);
  return tiles
    + _anSecCard('🏆 시즌 MVP TOP 3', `<div style="padding-top:4px;">${_anMvpPodiumHTML(opt)}</div>`, 'CI 종합점수 기준 · 5경기 이상')
    + _anSecCard('🏅 시즌 어워드', _anAwardsHTML(d.players), '시즌 전 경기 기준')
    + _anSecCard('⚡ 라이벌 매치', _anRivalsHTML(d.players,d.h2h), '3회 이상 맞붙고 전적이 팽팽한 맞대결')
    + _anSecCard('💚 환상의 파트너 TOP 5',
        best.length?best.map((x,i)=>_anPairCard(d.players,x,i,true)).join(''):_anEmptyRow('3경기 이상 함께 뛴 조합이 아직 없어요'),
        '같은 팀으로 3경기 이상')
    + _anSecCard('💧 아쉬운 케미 TOP 3',
        worst.length?worst.map((x,i)=>_anPairCard(d.players,x,i,false)).join(''):_anEmptyRow('데이터 부족'),
        '같은 팀으로 3경기 이상 · 승률 낮은 순');
}

/* 🏆 시즌 MVP TOP3 — 전체랭킹 MVP 포디움 디자인(CI 기준) 이식, 시즌 범위 반영 */
function _anMvpPodiumHTML(opt){
  const users=window._profilesCache||[];
  const ex=new Set(users.filter(u=>u.exclude_stats).map(u=>u.id));
  const userMap={}; users.forEach(u=>{ if(u.id&&u.name) userMap[u.id]=u; });
  const pass=_anPredicateFor(opt);
  const st={};
  (window._allMatchesCache||[]).filter(m=>m.status==='approved'&&pass(m)).forEach(m=>{
    const aWin=m.score_a>m.score_b, close=Math.abs(m.score_a-m.score_b)<=3;
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(x=>x.id&&!ex.has(x.id)).forEach(x=>{
      const u=userMap[x.id];
      if(!st[x.id]) st[x.id]={id:x.id,name:u?u.name:x.id,avatar:u?.avatar_url||'',games:0,wins:0,scored:0,conceded:0,closeWins:0};
      const o=st[x.id]; o.games++; if(x.win){o.wins++; if(close) o.closeWins++;} o.scored+=x.s; o.conceded+=x.c;
    });
  });
  Object.values(st).forEach(u=>{u.diff=u.scored-u.conceded;u.ci=calcCI(u.wins,u.games,u.diff,u.closeWins);});
  const wr=u=>u.games?u.wins/u.games:0;
  const top3=Object.values(st).filter(u=>u.games>=5).sort((a,b)=>b.ci-a.ci||wr(b)-wr(a)||b.diff-a.diff||b.games-a.games).slice(0,3);
  if(!top3.length) return `<div style="text-align:center;padding:20px 0;color:var(--text-muted);font-size:.82rem;">5경기 이상 완료된 선수가 없어요</div>`;

  const order=[top3[1],top3[0],top3[2]];
  const podH=[68,94,54], avSize=[64,80,58];
  const isLight=document.body.classList.contains('light-mode');
  const META=[
    {rank:'2',color:isLight?'#5B7A9A':'#A8B8C8',glow:'rgba(168,184,200,.2)', textSize:'.75rem',numSize:'1.2rem'},
    {rank:'1',color:isLight?'#1565C0':'#42A5F5',glow:'rgba(66,165,245,.3)', textSize:'.82rem',numSize:'1.5rem'},
    {rank:'3',color:isLight?'#8B4E1A':'#C87941',glow:'rgba(200,121,65,.18)',textSize:'.7rem', numSize:'1.1rem'},
  ];
  const crown=color=>'<svg width="22" height="16" viewBox="0 0 22 16" fill="none" style="display:block;">'
    +'<path d="M1 14 L4 4 L8 9 L11 2 L14 9 L18 4 L21 14 Z" fill="'+color+'" opacity=".9"/>'
    +'<rect x="1" y="13" width="20" height="2.5" rx="1.2" fill="'+color+'"/>'
    +'<circle cx="11" cy="2" r="1.6" fill="'+color+'"/><circle cx="4.5" cy="4.5" r="1.2" fill="'+color+'" opacity=".7"/>'
    +'<circle cx="17.5" cy="4.5" r="1.2" fill="'+color+'" opacity=".7"/></svg>';
  const rankLabels=['2nd','1st','3rd'];
  const cols=order.map((u,i)=>{
    const m=META[i], isFirst=(i===1);
    if(!u) return '<div style="flex:1"></div>';
    const av=avSize[i], rpDisp=Math.round(u.ci), wrPct=u.games?Math.round(u.wins/u.games*100):0, ini=escHtml((u.name||'?')[0]);
    const avatarInner=u.avatar
      ? '<img src="'+u.avatar+'" style="width:100%;height:100%;object-fit:cover;">'
      : '<span style="font-size:'+(isFirst?'1.7rem':'1.3rem')+';font-weight:900;color:'+m.color+';">'+ini+'</span>';
    const badgeDot='<div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:'+m.color+';border:2px solid var(--bg2);display:flex;align-items:center;justify-content:center;z-index:2;"><span style="font-size:.48rem;font-weight:900;color:#fff;letter-spacing:-.3px;">'+rankLabels[i]+'</span></div>';
    return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;">'
      +'<div style="height:26px;display:flex;align-items:center;justify-content:center;">'+(isFirst?crown(m.color):'')+'</div>'
      +'<div style="position:relative;margin-bottom:7px;">'
      +'<div style="position:absolute;inset:-3px;border-radius:50%;background:'+m.color+';opacity:.12;filter:blur(4px);"></div>'
      +'<div style="width:'+av+'px;height:'+av+'px;border-radius:50%;border:2px solid '+m.color+';box-shadow:0 0 '+(isFirst?'20':'11')+'px '+m.glow+';background:radial-gradient(circle at 35% 35%,'+m.color+'33,var(--bg2));display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;z-index:1;">'
      +avatarInner+'</div>'+badgeDot+'</div>'
      +'<div style="font-weight:800;font-size:'+m.textSize+';color:var(--text);width:100%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 3px;margin-bottom:2px;letter-spacing:-.2px;">'+escHtml(u.name)+'</div>'
      +'<div style="font-family:\'Black Han Sans\',sans-serif;font-size:'+(isFirst?'.9rem':'.76rem')+';color:'+m.color+';margin-bottom:7px;letter-spacing:.3px;">'+rpDisp+'</div>'
      +'<div style="width:100%;height:'+podH[i]+'px;position:relative;overflow:hidden;background:linear-gradient(170deg,'+m.color+'28 0%,'+m.color+'14 70%,transparent 100%);border:1px solid '+m.color+'55;border-bottom:none;border-radius:10px 10px 0 0;">'
      +'<div style="position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">'
      +'<span style="font-family:\'Black Han Sans\',sans-serif;font-size:'+m.numSize+';color:'+m.color+';line-height:1;">'+m.rank+'</span>'
      +'<span style="font-size:.58rem;color:'+m.color+'99;font-weight:700;letter-spacing:.3px;">'+wrPct+'% 승률</span>'
      +'</div></div></div>';
  });
  return '<div style="display:flex;align-items:flex-end;gap:5px;padding:0 2px;">'+cols.join('')+'</div>';
}

/* ═══ 👤 개인별 (hsdTV 시즌통계 개인 모티브) ═══ */
function _anPersonTiles(d, wr, avgDiff, seqAll){
  const recent = seqAll.slice(-15);
  const rw = recent.filter(g=>g.won).length, rl = recent.length - rw;
  let streak = 0, bestWin = 0, run = 0;
  seqAll.forEach(g=>{ run = g.won ? run + 1 : 0; bestWin = Math.max(bestWin, run); });
  if(seqAll.length){
    const lastWin = seqAll[seqAll.length-1].won;
    for(let i=seqAll.length-1; i>=0 && seqAll[i].won===lastWin; i--) streak++;
    if(!lastWin) streak = -streak;
  }
  const stTxt = !streak ? '-' : streak > 0 ? '현재 '+streak+'연승' : '현재 '+(-streak)+'연패';
  const diffStr = (avgDiff>=0?'+':'')+avgDiff.toFixed(1);
  const tile = (label, val, col, sub, valSize) => `<div class="stat-card" style="text-align:center;padding:12px 4px;min-width:0;">
    <div class="stat-label" style="margin-bottom:4px;">${label}</div>
    <div style="font-family:'Black Han Sans',sans-serif;font-size:${valSize||'1.05rem'};line-height:1;color:${col};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px;">${val}</div>
    ${sub?`<div style="font-size:.6rem;color:var(--text-muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sub}</div>`:''}
  </div>`;
  // 관계 요약: 베스트 파트너 · 먹잇감 · 천적 (2경기 이상)
  const wrOf = x=>x.games?x.wins/x.games:0;
  const net = x=>x.wins*2-x.games;
  const ps = (d.partnerList||[]).filter(x=>x.games>=2).sort((a,b)=>wrOf(b)-wrOf(a)||net(b)-net(a));
  const os = (d.oppList||[]).filter(x=>x.games>=2);
  const bestP = ps[0]||null;
  const prey = os.filter(x=>wrOf(x)>0.5).sort((a,b)=>wrOf(b)-wrOf(a)||net(b)-net(a))[0]||null;
  const nem  = os.filter(x=>wrOf(x)<0.5).sort((a,b)=>wrOf(a)-wrOf(b)||net(a)-net(b))[0]||null;
  const relTile = (label, x, col) => x
    ? tile(label, escHtml(x.name), col, x.wins+'승'+(x.games-x.wins)+'패 · '+Math.round(wrOf(x)*100)+'%', '.95rem')
    : tile(label, '-', 'var(--text-dim)', '2경기 이상 필요');
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px;">
    ${tile('시즌 전적', d.wins+'승 '+d.losses+'패', 'var(--text)', d.games+'경기 · 평균 득실 '+diffStr)}
    ${tile('시즌 승률', wr+'%', wr>=50?'var(--primary)':'var(--text-muted)', '최근 '+recent.length+'경기 '+rw+'승 '+rl+'패')}
    ${tile('최장 연승', (bestWin||0)+'연승', bestWin?'var(--accent)':'var(--text-muted)', stTxt)}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px;">
    ${relTile('🤝 베스트 파트너', bestP, 'var(--accent)')}
    ${relTile('🍗 먹잇감', prey, 'var(--primary)')}
    ${relTile('🔥 천적', nem, 'var(--danger)')}
  </div>`;
}

function _anFlowCard(series){
  if(!series.length) return '';
  const n=series.length, sw=series.filter(x=>x.won).length, sl=n-sw, net=sw-sl;
  const netStr=(net>0?'+':'')+net, netCol=net>0?'var(--accent)':net<0?'var(--danger)':'var(--text-muted)';
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div style="display:flex;align-items:center;gap:7px;font-size:.9rem;font-weight:800;">${_anIcon('trending',16,'var(--accent)')}<span>최근 ${n}경기 흐름</span></div>
      <div style="font-size:.76rem;color:var(--text-muted);">${sw}승 ${sl}패 · <b style="color:${netCol};">${netStr}</b></div>
    </div>
    <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:6px;">이기면 상승 · 지면 하락</div>
    <canvas id="an-momentum-canvas" style="width:100%;display:block;"></canvas>
  </div>`;
}

/* 다이버징 스펙트럼 카드: 2경기 이상 전원, 가운데 프사+이름, 50% 기준 좌우 바 */
function _anSpectrumCard(icon, iconCol, title, list, subWord, note, leftLab, rightLab){
  const arr = (list||[]).filter(x=>x.games>=2);
  const wrOf = x=>x.games?x.wins/x.games:0;
  const net = x=>x.wins*2-x.games;
  arr.sort((a,b)=>wrOf(b)-wrOf(a)||net(b)-net(a));
  const users = window._profilesCache||[];
  const avOf = x=>{
    const u = x.id ? users.find(v=>v.id===x.id) : null;
    return u&&u.avatar_url
      ? `<img src="${u.avatar_url}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : `<span style="width:20px;height:20px;border-radius:50%;background:var(--primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:800;flex-shrink:0;">${escHtml((x.name||'?').slice(0,1))}</span>`;
  };
  const rows = arr.map(x=>{
    const wr = wrOf(x);
    const dev = wr - 0.5;
    const len = Math.max(Math.round(Math.abs(dev)/0.5*100), dev===0?0:4);
    const right = dev>0, mid = dev===0;
    const pct = `<span style="font-size:.68rem;font-weight:800;flex-shrink:0;color:${mid?'var(--text-muted)':right?'var(--primary)':'var(--danger)'};">${Math.round(wr*100)}%</span>`;
    return `<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:5px;">
        ${!right&&!mid?pct:''}
        <div class="an-bar-l" style="width:${!right&&!mid?len:0}%;height:8px;border-radius:4px 0 0 4px;background:var(--danger);"></div>
      </div>
      <div style="width:108px;flex-shrink:0;display:flex;align-items:center;gap:5px;padding:0 5px;border-left:1px solid var(--border);border-right:1px solid var(--border);">
        ${avOf(x)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:.72rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(x.name)}</div>
          <div style="font-size:.58rem;color:var(--text-muted);white-space:nowrap;">${subWord} ${x.games}판 ${x.wins}승${x.games-x.wins}패</div>
        </div>
      </div>
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:5px;">
        <div class="an-bar-r" style="width:${right?len:0}%;height:8px;border-radius:0 4px 4px 0;background:var(--primary);"></div>
        ${right||mid?pct:''}
      </div>
    </div>`;
  }).join('');
  const legend = `<div style="display:flex;justify-content:space-between;font-size:.64rem;font-weight:700;padding:2px 0 6px;">
    <span style="color:var(--danger);">← ${leftLab}</span>
    <span style="color:var(--text-muted);font-weight:600;">50%</span>
    <span style="color:var(--primary);">${rightLab} →</span>
  </div>`;
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:7px;font-size:.9rem;font-weight:800;margin-bottom:2px;">${_anIcon(icon,16,iconCol)}<span>${title}</span></div>
    <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:6px;">${note}</div>
    ${arr.length ? legend + rows : _anEmptyRow('2경기 이상 데이터가 아직 없어요')}
  </div>`;
}
