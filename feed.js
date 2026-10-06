/* ── FEED ── */
let _feedPage=1;
let _feedOffset=0;          // DB fetch 오프셋
const _FEED_BATCH=50;       // 한 번에 DB에서 가져올 건수
const PAGE=20;              // 화면에 한 번에 렌더할 건수

function _populateFeedDateFilter(matches, currentVal){
  const sel=document.getElementById('feed-date-filter');
  if(!sel) return;
  const dates=[...new Set((matches||[]).map(m=>m.match_date).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const days=['일','월','화','수','목','금','토'];
  const fmt=d=>{const dt=new Date(d+'T00:00:00');return `${String(dt.getFullYear()).slice(2)}.${dt.getMonth()+1}.${dt.getDate()}(${days[dt.getDay()]})`;};
  sel.innerHTML='<option value="">전체 날짜</option>'+
    dates.map(d=>`<option value="${d}" ${d===currentVal?'selected':''}>${fmt(d)}</option>`).join('');
}

function toggleBatchPanel(){
  const panel=document.getElementById('batch-panel');
  const btn=document.getElementById('btn-batch-register');
  if(!panel) return;
  const open=panel.style.display!=='none';
  panel.style.display=open?'none':'block';
  if(btn) btn.style.color=open?'var(--text-muted)':'var(--primary)';
}

/* ── 경기내역 엑셀 다운로드 (관리자) ── */
function _ymd(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

async function toggleExportPanel(){
  const panel=document.getElementById('export-panel');
  const btn=document.getElementById('btn-feed-export');
  if(!panel) return;
  const open=panel.style.display!=='none';
  panel.style.display=open?'none':'block';
  if(btn) btn.style.color=open?'var(--text-muted)':'var(--primary)';
  if(!open && !document.getElementById('export-from').value) await setExportRange('season');
}

async function setExportRange(kind){
  const from=document.getElementById('export-from'), to=document.getElementById('export-to');
  const now=new Date();
  to.value=_ymd(now);
  if(kind==='month') from.value=_ymd(new Date(now.getFullYear(),now.getMonth(),1));
  else if(kind==='season'){
    if(typeof ensureSeasonStart==='function') await ensureSeasonStart();
    from.value=window._seasonStart||'';
  } else { from.value=''; to.value=''; }
}

function _loadXlsxLib(){
  if(window.XLSX) return Promise.resolve();
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=res; s.onerror=()=>rej(new Error('엑셀 라이브러리 로드 실패'));
    document.head.appendChild(s);
  });
}

async function exportMatchesXlsx(){
  if(ME?.role!=='admin') return;
  const from=document.getElementById('export-from').value, to=document.getElementById('export-to').value;
  if(from&&to&&from>to){ toast('시작일이 종료일보다 늦어요','error'); return; }
  const btn=document.getElementById('btn-export-run');
  btn.disabled=true; btn.textContent='불러오는 중...';
  try{
    await _loadXlsxLib();
    const rows=[];
    for(let off=0;;off+=1000){
      let q=sb.from('matches').select('match_date,a1_name,a2_name,score_a,score_b,b1_name,b2_name,note')
        .eq('status','approved')
        .order('match_date',{ascending:true}).order('created_at',{ascending:true}).order('id',{ascending:true})
        .range(off,off+999);
      if(from) q=q.gte('match_date',from);
      if(to) q=q.lte('match_date',to);
      const{data,error}=await q;
      if(error) throw error;
      rows.push(...data);
      if(data.length<1000) break;
    }
    if(!rows.length){ toast('해당 기간에 경기가 없어요'); return; }
    const res=(a,b)=>a>b?'승':a<b?'패':'무';
    const aoa=[['연번','경기일자','선수1','선수2','승패1','점수1','점수2','승패2','선수3','선수4','비고']];
    rows.forEach((m,i)=>aoa.push([i+1,m.match_date,m.a1_name||'',m.a2_name||'',res(m.score_a,m.score_b),m.score_a,m.score_b,res(m.score_b,m.score_a),m.b1_name||'',m.b2_name||'',(m.note||'').trim()]));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[6,12,10,10,6,6,6,6,10,10,24].map(w=>({wch:w}));
    ws['!autofilter']={ref:ws['!ref']};
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'경기내역');
    const tag=(from||rows[0].match_date).replace(/-/g,'')+'-'+(to||rows[rows.length-1].match_date).replace(/-/g,'');
    XLSX.writeFile(wb,`새벽민턴_경기내역_${tag}.xlsx`);
    toast(`${rows.length}경기 다운로드`,'success');
  }catch(e){
    console.error('[Export]',e); toast('다운로드 실패: '+(e.message||e),'error');
  }finally{
    btn.disabled=false; btn.textContent='엑셀 다운로드';
  }
}

/* ── 초성 추출 ── */
function _getChosung(str){
  const cho=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  return (str||'').split('').map(c=>{
    const code=c.charCodeAt(0)-0xAC00;
    if(code<0||code>11171) return c;
    return cho[Math.floor(code/588)];
  }).join('');
}
function _matchSearch(name,q){
  if(!name||!q) return false;
  const n=name.toLowerCase(), qq=q.toLowerCase();
  if(n.includes(qq)) return true;
  // 초성 검색
  const chosung=_getChosung(name);
  if(chosung.includes(qq)) return true;
  return false;
}

let _feedRenderToken=0; // 렌더 취소 토큰
let _feedHasMore=false; // DB에 아직 더 있는지
let _feedLoadingMore=false; // 추가 fetch 중 여부
let _feedNameQ=''; // 현재 검색어 (추가 fetch 시 재사용)

async function renderFeed(forceNameQ){
  _feedPage=1;
  _feedOffset=0;
  _feedHasMore=false;
  _feedLoadingMore=false;
  const batchBtn=document.getElementById('btn-batch-register');
  if(batchBtn) batchBtn.style.display=ME?.role==='admin'?'':'none';
  const exportBtn=document.getElementById('btn-feed-export');
  if(exportBtn) exportBtn.style.display=ME?.role==='admin'?'':'none';
  _detachFeedScroll();
  window._feedAllMatches=null;
  const token=++_feedRenderToken;
  await _renderFeedInner(forceNameQ, token);
}

async function _renderFeedInner(forceNameQ, token){
  const el=document.getElementById('feed-list');
  if(!el) return;

  const rawName=forceNameQ!==undefined?forceNameQ:(document.getElementById('feed-name-search')?.value||'');
  _feedNameQ=rawName.trim();
  const clearBtn=document.getElementById('feed-search-clear');
  if(clearBtn) clearBtn.style.display=_feedNameQ?'block':'none';

  // 기본 목록(검색·조합 없음)은 직전 결과를 먼저 그려 두고 뒤에서 새로 받아 교체 — 서버 왕복 지연 숨김
  const isDefault=!window._feedPairFilter && !_feedNameQ;
  if(isDefault && window._feedCache){
    window._feedAllMatches=window._feedCache;
    _renderFeedSlice();
  } else {
    el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(4);
  }
  // 날짜별 전체 카운트는 목록 조회와 동시에 요청 (캐시 있으면 생략)
  const countReady=window._feedFullCountByDate?null
    :sb.from('matches').select('match_date').eq('status','approved');

  const _MATCH_COLS='id,match_type,match_date,a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b,status,note,admin_note,submitter_id,submitter_name,approved_at,created_at';
  let q=sb.from('matches').select(_MATCH_COLS)
    .eq('status','approved')
    .order('match_date',{ascending:false})
    .order('created_at',{ascending:false});

  // 조합 검색 > 이름 검색 > 일반 배치 순으로 fetch 전략 결정
  const pf=window._feedPairFilter||null;
  if(pf){
    // 조합 검색: 첫 번째 사람이 낀 경기를 서버에서 추린 뒤 클라에서 페어 조건 적용
    q=q.or(`a1_id.eq.${pf.ids[0]},a2_id.eq.${pf.ids[0]},b1_id.eq.${pf.ids[0]},b2_id.eq.${pf.ids[0]}`).limit(2000);
    if(pf.range!=='all'){
      if(typeof ensureSeasonStart==='function') await ensureSeasonStart();
      if(window._seasonStart) q=q.gte('match_date',window._seasonStart);
    }
  }else if(_feedNameQ) q=q.limit(2000);
  else q=q.range(0, _FEED_BATCH-1);

  let{data:matches,error:feedErr}=await q;

  if(token!==_feedRenderToken) return;
  if(feedErr){ console.error('[Feed]',feedErr); matches=[]; }
  matches=matches||[];
  if(pf){
    const x=pf.ids[0], y=pf.ids[1];
    matches=matches.filter(m=>{
      const A=[m.a1_id,m.a2_id], B=[m.b1_id,m.b2_id];
      return pf.mode==='vs'
        ? ((A.includes(x)&&B.includes(y))||(B.includes(x)&&A.includes(y)))
        : ((A.includes(x)&&A.includes(y))||(B.includes(x)&&B.includes(y)));
    });
  }
  _renderPairBanner(pf,matches);

  // 날짜별 전체 카운트를 위해 전체 건수는 별도로 집계 (캐시 있으면 재사용)
  if(countReady){
    const{data:allDates}=await countReady;
    if(token!==_feedRenderToken) return;
    const cnt={};
    (allDates||[]).forEach(m=>{ const d=m.match_date||''; cnt[d]=(cnt[d]||0)+1; });
    window._feedFullCountByDate=cnt;
  }

  _feedHasMore=!_feedNameQ && !pf && matches.length===_FEED_BATCH;
  _feedOffset=matches.length;

  if(_feedNameQ){
    matches=matches.filter(m=>[m.a1_name,m.a2_name,m.b1_name,m.b2_name]
      .some(n=>_matchSearch(n,_feedNameQ)));
  }

  if(token!==_feedRenderToken) return;

  if(!matches.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><div>${pf?'이 조합의 경기가 없어요':(_feedNameQ?`'${rawName}' 검색 결과 없음`:'경기 내역 없음')}</div></div>`;
    return;
  }
  if(isDefault && !feedErr){
    // 먼저 그려 둔 캐시와 내용이 같으면 DOM을 다시 그리지 않는다 (깜빡임·스크롤 튐 방지)
    const same=window._feedCache && window._feedAllMatches===window._feedCache
      && JSON.stringify(window._feedCache)===JSON.stringify(matches);
    window._feedCache=matches;
    if(same){ window._feedAllMatches=matches; _attachFeedScroll(); return; }
  }
  window._feedAllMatches=matches;
  _feedPage=1;
  _renderFeedSlice();
  _attachFeedScroll();
}

// 화면 슬라이스 렌더 (이미 가져온 데이터 내에서 페이지 처리)
function _renderFeedSlice(){
  const el=document.getElementById('feed-list');
  if(!el||!window._feedAllMatches) return;
  const slice=window._feedAllMatches.slice(0,_feedPage*PAGE);
  const hasMoreLocal=window._feedAllMatches.length>slice.length;
  const hasMoreDB=_feedHasMore;
  el.innerHTML=renderMatchesWithDateHeaders(slice, window._feedFullCountByDate||{});
  if(hasMoreLocal||hasMoreDB){
    const sentinel=document.createElement('div');
    sentinel.id='feed-sentinel';
    sentinel.style.cssText='height:60px;';
    el.appendChild(sentinel);
    // IntersectionObserver로 sentinel이 보이는 순간 자동 로드
    _observeFeedSentinel(sentinel);
  }
}

function _feedLoadNext(){
  if(window._feedAllMatches&&window._feedAllMatches.length > _feedPage*PAGE){
    _feedPage++;
    _renderFeedSlice();
  } else if(_feedHasMore && !_feedLoadingMore){
    _feedFetchMore();
  }
}

// DB에서 추가 배치 fetch
async function _feedFetchMore(){
  if(_feedLoadingMore||!_feedHasMore) return;
  _feedLoadingMore=true;
  const token=_feedRenderToken;
  const _MATCH_COLS='id,match_type,match_date,a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b,status,note,admin_note,submitter_id,submitter_name,approved_at,created_at';
  const{data:more}=await sb.from('matches').select(_MATCH_COLS)
    .eq('status','approved')
    .order('match_date',{ascending:false})
    .order('created_at',{ascending:false})
    .range(_feedOffset, _feedOffset+_FEED_BATCH-1);
  if(token!==_feedRenderToken){_feedLoadingMore=false;return;}
  const batch=more||[];
  _feedHasMore=batch.length===_FEED_BATCH;
  _feedOffset+=batch.length;
  let filtered=batch;
  if(_feedNameQ){
    filtered=batch.filter(m=>[m.a1_name,m.a2_name,m.b1_name,m.b2_name]
      .some(n=>_matchSearch(n,_feedNameQ)));
  }
  window._feedAllMatches=[...(window._feedAllMatches||[]),...filtered];
  _feedLoadingMore=false;
  _renderFeedSlice();
}

let _feedObserver=null;
function _observeFeedSentinel(sentinel){
  // 기존 observer 해제
  if(_feedObserver){ _feedObserver.disconnect(); _feedObserver=null; }
  _feedObserver=new IntersectionObserver((entries)=>{
    if(entries[0].isIntersecting){
      _feedObserver.disconnect();
      _feedObserver=null;
      _feedLoadNext();
    }
  },{threshold:0.1});
  _feedObserver.observe(sentinel);
}
// 하위 호환용 — navigateTo에서 호출됨
function _attachFeedScroll(){ /* IntersectionObserver 방식으로 대체, 호출 무시 */ }
function _detachFeedScroll(){
  if(_feedObserver){ _feedObserver.disconnect(); _feedObserver=null; }
}

function loadMoreFeed(){ _feedPage++; _renderFeedSlice(); }
function feedMyMatches(){
  const el=document.getElementById('feed-name-search');
  if(el&&ME?.name){el.value=ME.name;renderFeed();}
}
function clearFeedSearch(){
  const el=document.getElementById('feed-name-search');
  if(el){el.value='';el.focus();}
  const clearBtn=document.getElementById('feed-search-clear');
  if(clearBtn) clearBtn.style.display='none';
  renderFeed();
}

/* ── 날짜별 그룹핑 렌더 ── */
function renderMatchesWithDateHeaders(matches, fullCountByDate){
  // 날짜별 경기 수: fullCountByDate가 있으면 전체 기준, 없으면 현재 slice 기준
  const countByDate=fullCountByDate||{};
  if(!fullCountByDate) matches.forEach(m=>{ const d=m.match_date||''; countByDate[d]=(countByDate[d]||0)+1; });
  let html='', lastDate='';
  matches.forEach(m=>{
    const d=m.match_date||'';
    if(d!==lastDate){ html+=feedDateHeader(d,countByDate[d])+_feedDayMvpHTML(d,matches); lastDate=d; }
    html+=matchCardHTML(m);
  });
  return html;
}

/* ── 날짜 머리: 날짜·경기 수 — MVP 카드가 바로 아래 붙는다. 더보기는 MVP 카드 끝 ›로 흡수(2026-10-05, 후생동TV와 같음),
   MVP 없는 날도 요약에 갈 수 있게 머리 자체를 눌러도 열린다 ── */
function feedDateHeader(dateStr,count){
  const d=new Date(dateStr+'T00:00:00');
  const days=['일','월','화','수','목','금','토'];
  const yy=String(d.getFullYear()).slice(2);
  const label=`${yy}.${d.getMonth()+1}.${d.getDate()}.(${days[d.getDay()]})`;
  return `<div class="feed-day-head" onclick="openDateSummaryPage('${dateStr}')"><b>${label}</b>${count>1?`<span>${count}경기</span>`:''}</div>`;
}

/* ── 그날의 MVP: 승수 1위, 같으면 득실차 1위, 그래도 같으면 공동 MVP (경기 수 문턱 없음)
   기준 = 그날 승인 경기 전체(검색·필터 무관): 대시보드가 받아 둔 전체 경기 캐시, 없으면 화면 목록.
   비회원(id 없음)은 이름으로 묶는다 */
function _feedDayMvp(dateStr,fallback){
  let games=(window._allMatchesCache||[]).filter(m=>m.match_date===dateStr&&m.status==='approved');
  if(!games.length) games=(fallback||[]).filter(m=>m.match_date===dateStr&&(m.status||'approved')==='approved');
  if(!games.length) return null;
  const st={};
  const add=(id,nm,win,diff)=>{ const k=id||(nm?'n:'+nm:''); if(!k) return; const r=st[k]||(st[k]={id,nm,w:0,l:0,d:0}); win?r.w++:r.l++; r.d+=diff; };
  games.forEach(m=>{
    const a=+m.score_a||0, b=+m.score_b||0; if(a===b) return;
    add(m.a1_id,m.a1_name,a>b,a-b); add(m.a2_id,m.a2_name,a>b,a-b); add(m.b1_id,m.b1_name,b>a,b-a); add(m.b2_id,m.b2_name,b>a,b-a);
  });
  const arr=Object.values(st); if(!arr.length) return null;
  arr.sort((x,y)=>y.w-x.w||y.d-x.d);
  const top=arr[0]; if(!top.w) return null;
  return arr.filter(r=>r.w===top.w&&r.d===top.d);
}
function _feedDayMvpHTML(dateStr,fallback){
  const mv=_feedDayMvp(dateStr,fallback); if(!mv) return '';
  const prof=window._profilesCache||[];
  const nameOf=r=>(r.id&&(prof.find(u=>u.id===r.id)||{}).name)||r.nm||'?';
  const av=(r,i)=>{ const url=r.id&&(prof.find(u=>u.id===r.id)||{}).avatar_url; const st=i?' style="margin-left:-9px"':'';
    return url?`<img class="fdm-av" src="${escHtml(url)}" alt="" loading="lazy"${st}>`:`<span class="fdm-av"${st}>${escHtml(nameOf(r).slice(0,1))}</span>`; };
  const r=mv[0];
  return `<div class="feed-day-mvp" onclick="openDateSummaryPage('${dateStr}')">
    <div class="fdm-avs">${mv.slice(0,4).map(av).join('')}</div>
    <div class="fdm-t"><small><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18h18M4 8l4 4 4-7 4 7 4-4-2 10H6Z"/></svg>${mv.length>1?'공동 MVP':'오늘의 MVP'}</small><b>${mv.map(x=>escHtml(nameOf(x))).join('·')}</b></div>
    <div class="fdm-r"><b>${r.w}승 ${r.l}패</b><small>득실 ${r.d>0?'+':''}${r.d}</small></div>
    <span class="fdm-chev" aria-hidden="true">›</span>
  </div>`;
}

/* ── 날짜별 요약 페이지 ── */
function openDateSummaryPage(dateStr){
  const pg=document.getElementById('page-date-summary');
  if(pg){pg.style.display='block';pg.scrollTop=0;}
  const d=new Date(dateStr+'T00:00:00');
  const days=['일','월','화','수','목','금','토'];
  document.getElementById('dsp-title').textContent=`${d.getMonth()+1}월 ${d.getDate()}일(${days[d.getDay()]}) 요약`;
  // history에 기록해서 뒤로가기로 닫힘
  window.history.pushState({page:'date-summary',dateStr,from:'feed'},'','#date-summary');
  renderDateSummaryContent(dateStr);
}
function closeDateSummaryPage(){
  // 열 때 history를 1칸 쌓았으니 되돌린다 → popstate(core.js)가 닫는다. 안 그러면 다음 뒤로가기가 헛돈다
  if(history.state&&history.state.page==='date-summary'){ history.back(); return; }
  const pg=document.getElementById('page-date-summary');
  if(pg) pg.style.display='none';
}
async function renderDateSummaryContent(dateStr){
  const el=document.getElementById('dsp-content');
  if(!el) return;
  el.innerHTML='<div style="text-align:center;padding:30px 0;"><div class="spinner"></div></div>';
  let allMatches=window._allMatchesCache||[];
  let users=window._profilesCache||[];
  if(!allMatches.length){
    const[mRes,uRes]=await Promise.all([
      sb.from('matches').select('*').eq('status','approved'),
      sb.from('profiles').select('id,name,avatar_url').eq('status','approved'),
    ]);
    allMatches=mRes.data||[]; users=uRes.data||[];
    window._allMatchesCache=allMatches; window._profilesCache=users;
  }
  const allM=allMatches.filter(m=>m.match_date===dateStr&&m.status==='approved');
  if(!allM.length){el.innerHTML='<div style="text-align:center;padding:40px 0;color:var(--text-muted);">해당 날짜의 경기 데이터가 없습니다</div>';return;}
  const playerMap={};
  allM.forEach(m=>{
    [[m.a1_id,m.a1_name],[m.a2_id,m.a2_name],[m.b1_id,m.b1_name],[m.b2_id,m.b2_name]].forEach(([id,name])=>{
      if(!name) return;
      const key=id||('name:'+name);
      if(!playerMap[key]) playerMap[key]={id:key,realId:id||null,name,wins:0,losses:0,diff:0};
      const onA=[m.a1_id,m.a2_id].includes(id)||((!id)&&[m.a1_name,m.a2_name].includes(name));
      const won=(m.score_a>m.score_b)?onA:!onA;
      won?playerMap[key].wins++:playerMap[key].losses++;
      playerMap[key].diff+=onA?(+m.score_a||0)-(+m.score_b||0):(+m.score_b||0)-(+m.score_a||0);
    });
  });
  const players=Object.values(playerMap);
  // 정렬 = MVP와 같은 기준: 승수 → 득실차 → 승률 (2026-10-05)
  const sortByWR=arr=>[...arr].sort((a,b)=>{
    const wrA=a.wins/(a.wins+a.losses||1), wrB=b.wins/(b.wins+b.losses||1);
    return b.wins-a.wins||b.diff-a.diff||wrB-wrA;
  });
  // MVP는 경기 내역 카드와 같은 기준(_feedDayMvp: 승수→득실차, 동률 공동). 비회원은 이름으로 맞춘다
  const mvps=_feedDayMvp(dateStr,allM)||[];
  const mvpKeys=new Set(mvps.map(r=>r.id||('name:'+r.nm)));
  const mvpName=r=>(r.id&&(users.find(u=>u.id===r.id)||{}).name)||r.nm||'?';
  function playerRow(p){
    const total=p.wins+p.losses;
    const wr=total?Math.round(p.wins/total*100):0;
    const isMvp=mvpKeys.has(p.id);
    const u=users.find(x=>x.id===p.realId);
    const av=u?.avatar_url
      ?`<img src="${u.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
      :`<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;">${p.name[0]}</div>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:.5px solid var(--border);">
      ${av}
      <div style="flex:1;font-size:.87rem;font-weight:${isMvp?700:400};">${p.name}${isMvp?' 🏆':''}</div>
      <div style="font-size:.8rem;color:var(--text-muted);">${p.wins}승 ${p.losses}패</div>
      <div style="font-size:.78rem;color:var(--text-muted);min-width:34px;text-align:right;font-variant-numeric:tabular-nums;">${p.diff>0?'+':''}${p.diff}</div>
      <div style="font-size:.85rem;font-weight:700;color:${wr>=50?'var(--primary)':'#FF7070'};min-width:38px;text-align:right;">${wr}%</div>
    </div>`;
  }
  el.innerHTML=
    (mvps.length?`<div style="margin-bottom:14px;padding:8px 12px;background:rgba(41,121,255,.08);border:1px solid rgba(41,121,255,.2);border-radius:10px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.2rem;">🏆</span>
      <div style="min-width:0"><div style="font-size:.68rem;color:var(--text-muted);">${mvps.length>1?'공동 MVP':'오늘의 MVP'}</div><div style="font-size:.92rem;font-weight:700;">${mvps.map(r=>escHtml(mvpName(r))).join('·')} <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;">${mvps[0].w}승 ${mvps[0].l}패 · 득실 ${mvps[0].d>0?'+':''}${mvps[0].d}</span></div></div>
    </div>`:'')+
    `<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px;">총 ${allM.length}경기 · 참석 ${players.length}명</div>`+
    sortByWR(players).map(playerRow).join('');
}

/* ── 경기 카드: hsdTV 스타일 (좌우 팀 + 가운데 점수) ── */
function matchCardHTML(m,isAdmin=false){
  const isMe=[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(ME?.id);
  const onATeam=isMe&&[m.a1_id,m.a2_id].includes(ME?.id);
  const onBTeam=isMe&&[m.b1_id,m.b2_id].includes(ME?.id);
  const aWin=m.score_a>m.score_b;
  const myWin=(onATeam&&aWin)||(onBTeam&&!aWin);
  const myEmoji=isMe?(myWin?'🟢':'🔴'):'';

  const aPlayers=[m.a1_name,m.a2_name].filter(Boolean);
  const bPlayers=[m.b1_name,m.b2_name].filter(Boolean);
  const aNamesHtml=aPlayers.map(n=>`<div class="mc-pname ${aWin?'win':'lose'}">${n}</div>`).join('');
  const bNamesHtml=bPlayers.map(n=>`<div class="mc-pname ${aWin?'lose':'win'}">${n}</div>`).join('');

  const emojiSlotL=`<span class="mc-me-slot">${onATeam?myEmoji:''}</span>`;
  const emojiSlotR=`<span class="mc-me-slot">${onBTeam?myEmoji:''}</span>`;

  // 상대전적 계산 (회원 id + 비회원 name 모두 포함)
  let h2hWinA=0,h2hWinB=0;
  try{
    const allM=window._allMatchesCache||[];
    // id가 있으면 id, 없으면 'n:이름' 으로 선수 식별
    const pKey=(id,name)=>id||(name?'n:'+name:null);
    const aKeys=[pKey(m.a1_id,m.a1_name),pKey(m.a2_id,m.a2_name)].filter(Boolean).sort();
    const bKeys=[pKey(m.b1_id,m.b1_name),pKey(m.b2_id,m.b2_name)].filter(Boolean).sort();
    allM.filter(x=>x.status==='approved').filter(x=>{
      if(x.match_date<m.match_date) return true;
      if(x.match_date===m.match_date) return (x.created_at||'')<=(m.created_at||'')||x.id===m.id;
      return false;
    }).forEach(x=>{
      const xA=[pKey(x.a1_id,x.a1_name),pKey(x.a2_id,x.a2_name)].filter(Boolean).sort();
      const xB=[pKey(x.b1_id,x.b1_name),pKey(x.b2_id,x.b2_name)].filter(Boolean).sort();
      const sameDir=xA.join()==aKeys.join()&&xB.join()==bKeys.join();
      const flipDir=xA.join()==bKeys.join()&&xB.join()==aKeys.join();
      if(sameDir){x.score_a>x.score_b?h2hWinA++:h2hWinB++;}
      else if(flipDir){x.score_a>x.score_b?h2hWinB++:h2hWinA++;}
    });
  }catch(e){}

  const clashBadge=(()=>{const t=h2hWinA+h2hWinB;return t>=3&&Math.abs(h2hWinA-h2hWinB)<=1?'⚔️ ':''})();
  const h2hLabel=(()=>{const t=h2hWinA+h2hWinB;return t>0?`${clashBadge}${h2hWinA}:${h2hWinB}`:'';})();

  const statusInfo=m.status==='pending'?'<span style="font-size:.62rem;color:var(--accent);font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(255,152,0,.12);border:1px solid rgba(255,152,0,.25);">대기</span>':'';

  return `<div class="match-card" id="mc-${m.id}" onclick="openMatchDetail('${m.id}',${isAdmin})">
    <div class="mc-body">
      <div class="mc-team-col">
        ${emojiSlotL}<div class="mc-wl-badge ${aWin?'win':'lose'}">${aWin?'승':'패'}</div>
        <div class="mc-pnames-v">${aNamesHtml}</div>
      </div>
      <div class="mc-score-center">
        ${h2hLabel?`<span class="mc-h2h-txt">${h2hLabel}</span>`:''}
        <div class="mc-score-row">
          <span class="mc-score-num ${aWin?'mc-score-win':'mc-score-lose'}">${m.score_a}</span>
          <span class="mc-sep">:</span>
          <span class="mc-score-num ${!aWin?'mc-score-win':'mc-score-lose'}">${m.score_b}</span>
        </div>
        ${statusInfo}
      </div>
      <div class="mc-team-col right">
        <div class="mc-pnames-v right">${bNamesHtml}</div>
        <div class="mc-wl-badge ${!aWin?'win':'lose'}">${!aWin?'승':'패'}</div>${emojiSlotR}
      </div>
    </div>
    ${(m.note||m.admin_note)?`<div style="font-size:.78rem;color:var(--text-muted);padding:5px 14px 8px;text-align:center;border-top:1px solid var(--border);line-height:1.5;word-break:break-word;">${[m.note,m.admin_note].filter(Boolean).join(' · ')}</div>`:''}
    ${isAdmin&&m.status==='pending'?`<div class="btn-row" style="padding:6px 8px 8px;" onclick="event.stopPropagation()"><button class="btn btn-success btn-xs" onclick="approveMatch('${m.id}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>승인</button><button class="btn btn-danger btn-xs" onclick="confirmRejectMatch('${m.id}')"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>반려</button><button class="btn btn-warn btn-xs" onclick="openEditMatch('${m.id}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>수정</button></div>`:''}
  </div>`;
}

async function openMatchDetail(id,isAdmin=false){
  const{data:m}=await sb.from('matches').select('id,match_type,match_date,a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b,status,note,admin_note,submitter_id,submitter_name,approved_at,created_at').eq('id',id).single();
  if(!m) return;
  const aWin=m.score_a>m.score_b;
  const canCancel=m.status==='pending'&&m.submitter_id===ME.id;
  const aPlayers=[m.a1_name,m.a2_name].filter(Boolean).join(' ');
  const bPlayers=[m.b1_name,m.b2_name].filter(Boolean).join(' ');
  const createdAt=m.created_at?fmtDate(m.created_at,true):'-';
  const approvedAt=m.approved_at?fmtDate(m.approved_at,true):'-';
  document.getElementById('modal-match-title').textContent=`🏸 경기 상세 — ${fmtMatchDate(m.match_date)}`;
  document.getElementById('modal-match-body').innerHTML=`
    <div class="detail-row"><span class="detail-key">종목</span><span class="detail-val">🏸 복식</span></div>
    <div class="detail-row"><span class="detail-key">상태</span><span class="detail-val">${statusBadge(m.status)}</span></div>
    <div class="detail-row"><span class="detail-key">경기일</span><span class="detail-val">${fmtMatchDate(m.match_date)}</span></div>
    <div class="detail-row"><span class="detail-key">등록자</span><span class="detail-val">${m.submitter_name||'-'}</span></div>
    ${m.note?`<div class="detail-row"><span class="detail-key">메모</span><span class="detail-val">${m.note}</span></div>`:''}
    ${m.admin_note?`<div class="detail-row"><span class="detail-key">관리자 메모</span><span class="detail-val" style="color:var(--primary);">${m.admin_note}</span></div>`:''}
    <hr class="section-divider">
    <!-- 점수 한 줄: 이름 · 점수 · 이름 -->
    <div style="background:var(--bg2);border-radius:12px;padding:12px 10px;text-align:center;">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:nowrap;">
        <div style="flex:1;text-align:right;min-width:0;">
          <div style="font-weight:700;font-size:.88rem;color:${aWin?'var(--success)':'var(--text-muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${aPlayers}</div>
          <div style="font-size:.72rem;margin-top:2px;">${aWin?'<span style="color:var(--success);font-weight:700;">🏆 승</span>':'<span style="color:var(--text-dim);">패</span>'}</div>
        </div>
        <div style="flex-shrink:0;background:var(--bg3);border-radius:8px;padding:4px 10px;white-space:nowrap;">
          <span style="font-family:Black Han Sans,sans-serif;font-size:1.3rem;color:${aWin?'var(--success)':'var(--text-muted)'};">${m.score_a}</span>
          <span style="font-size:1rem;color:var(--text-muted);margin:0 2px;">:</span>
          <span style="font-family:Black Han Sans,sans-serif;font-size:1.3rem;color:${!aWin?'var(--success)':'var(--text-muted)'};">${m.score_b}</span>
        </div>
        <div style="flex:1;text-align:left;min-width:0;">
          <div style="font-weight:700;font-size:.88rem;color:${!aWin?'var(--success)':'var(--text-muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${bPlayers}</div>
          <div style="font-size:.72rem;margin-top:2px;">${!aWin?'<span style="color:var(--success);font-weight:700;">🏆 승</span>':'<span style="color:var(--text-dim);">패</span>'}</div>
        </div>
      </div>
      <div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;">득실차 <span style="font-weight:700;color:${Math.abs(m.score_a-m.score_b)>5?'var(--text)':'var(--text)'};">±${Math.abs(m.score_a-m.score_b)}</span></div>
    </div>
    <hr class="section-divider">
    <div style="display:flex;gap:8px;font-size:.74rem;color:var(--text-muted);">
      <span><svg class="ic" aria-hidden="true"><use href="#i-send"/></svg>등록 ${createdAt}</span>
      ${m.approved_at?`<span><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>승인 ${approvedAt}</span>`:''}
    </div>`;
  let acts=`<button class="btn btn-ghost" onclick="closeModal('modal-match')">닫기</button>`;
  if(isAdmin||ME.role==='admin'){
    acts+=`<button class="btn btn-warn btn-sm" onclick="openEditMatch('${id}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>수정</button>`;
    acts+=`<button class="btn btn-danger btn-sm" onclick="confirmDeleteMatch('${id}')"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>삭제</button>`;
    if(m.status==='pending') acts+=`<button class="btn btn-success btn-sm" onclick="approveMatch('${id}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>승인</button><button class="btn btn-danger btn-sm" onclick="confirmRejectMatch('${id}')"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>반려</button>`;
  } else if(canCancel){
    acts+=`<button class="btn btn-danger" onclick="confirmCancelMatch('${id}')">취소</button>`;
  }
  document.getElementById('modal-match-actions').innerHTML=acts;
  openModal('modal-match');
}

/* ── 👥 조합 검색: 두 명 조합의 같은팀/맞대결 전적 + 경기 필터 (hsdTV 이식) ── */
function openPairFeed(id1,id2,n1,n2){
  window._feedPairFilter={ids:[id1,id2],names:[n1,n2],mode:'partner',range:'all'};
  navigateTo('feed');
}
function _setPairOpt(k,v){
  if(window._feedPairFilter){ window._feedPairFilter[k]=v; renderFeed(); }
}
function clearFeedPairFilter(){
  window._feedPairFilter=null;
  const banner=document.getElementById('feed-partner-banner');
  if(banner) banner.style.display='none';
  renderFeed();
}
async function openPairPicker(){
  let users=window._profilesCache||[];
  if(!users.length){
    const {data}=await sb.from('profiles').select('id,name,avatar_url,status,exclude_stats,gender').eq('status','approved');
    users=data||[]; window._profilesCache=users;
  }
  const list=[...users].filter(u=>u.name&&!u.exclude_stats).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const males=list.filter(u=>u.gender==='male');
  const females=list.filter(u=>u.gender==='female');
  const etc=list.filter(u=>u.gender!=='male'&&u.gender!=='female');
  window._ppSel=[];
  const chip=u=>`<div id="pp-u-${u.id}" onclick="_ppPick('${u.id}')" style="display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:9999px;border:1.5px solid var(--border);background:var(--bg2);cursor:pointer;transition:all .12s;min-width:0;">
      ${u.avatar_url
        ?`<img src="${u.avatar_url}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
        :`<span style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0;">${escHtml(u.name.slice(0,1))}</span>`}
      <span style="font-size:.85rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(u.name)}</span>
    </div>`;
  const group=(title,arr)=>arr.length?`
    <div style="font-size:.9rem;font-weight:800;margin:12px 0 8px;">${title} ${arr.length}명</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${arr.map(chip).join('')}</div>`:'';
  const ov=document.createElement('div');
  ov.id='pair-picker';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400;display:flex;align-items:flex-end;justify-content:center;';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  ov.innerHTML=`<div class="sheet-in" style="background:var(--bg);border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:78vh;display:flex;flex-direction:column;padding:14px 14px calc(16px + env(safe-area-inset-bottom,0px));">
    <div style="width:44px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 12px;"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
      <b style="font-size:1rem;"><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg>조합 선택</b>
      <span id="pp-hint" style="font-size:.72rem;color:var(--text-muted);">두 명을 골라주세요 (0/2)</span>
      <button onclick="document.getElementById('pair-picker').remove()" style="margin-left:auto;background:var(--bg2);border:1px solid var(--border);border-radius:50%;width:30px;height:30px;color:var(--text-muted);font-size:.9rem;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div style="overflow-y:auto;padding-bottom:10px;">
      ${group('🙋‍♂️ 남자',males)}
      ${group('🙋‍♀️ 여자',females)}
      ${group('👤 기타',etc)}
    </div>
  </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.querySelector('.sheet-in')?.classList.add('on')));
}
function _ppPick(id){
  const sel=window._ppSel||[];
  const i=sel.indexOf(id);
  if(i>=0) sel.splice(i,1); else if(sel.length<2) sel.push(id);
  window._ppSel=sel;
  document.querySelectorAll('[id^="pp-u-"]').forEach(d=>{
    const on=sel.includes(d.id.slice(5));
    d.style.borderColor=on?'var(--primary)':'var(--border)';
    d.style.background=on?'rgba(77,159,255,.14)':'var(--bg2)';
  });
  const hint=document.getElementById('pp-hint');
  if(hint) hint.textContent=`두 명을 골라주세요 (${sel.length}/2)`;
  if(sel.length===2){
    const users=window._profilesCache||[];
    const n=uid=>(users.find(u=>u.id===uid)||{}).name||'';
    window._feedPairFilter={ids:[sel[0],sel[1]],names:[n(sel[0]),n(sel[1])],mode:'partner',range:'season'};
    document.getElementById('pair-picker')?.remove();
    renderFeed();
  }
}
/* 조합 요약 배너 (전적·연승·모드/기간 토글) */
function _renderPairBanner(pf,matches){
  const b=document.getElementById('feed-partner-banner');
  if(!b) return;
  if(!pf){ b.style.display='none'; return; }
  const x=pf.ids[0];
  const ms=[...(matches||[])].filter(m=>m.status==='approved')
    .sort((a,c)=>String(a.match_date).localeCompare(String(c.match_date))||String(a.created_at||'').localeCompare(String(c.created_at||'')));
  let w=0,l=0,diff=0; const seq=[];
  ms.forEach(m=>{
    const inA=[m.a1_id,m.a2_id].includes(x);
    const win=inA?(m.score_a>m.score_b):(m.score_b>m.score_a);
    diff+=inA?(m.score_a-m.score_b):(m.score_b-m.score_a);
    win?w++:l++; seq.push(win);
  });
  let streak=0;
  for(let i=seq.length-1;i>=0;i--){ if(seq[i]) streak++; else break; }
  const tot=w+l, wr=tot?Math.round(w/tot*100):0;
  const g=streak>=10?'🚅':streak>=7?'🚄':streak>=5?'🚈':streak>=3?'🚂':'🔥';
  const seg=on=>`style="padding:3px 10px;border-radius:8px;font-size:.68rem;font-weight:800;cursor:pointer;border:1px solid ${on?'var(--primary)':'var(--border)'};background:${on?'var(--primary)':'transparent'};color:${on?'#fff':'var(--text-muted)'};font-family:inherit;"`;
  b.style.display='flex'; b.style.flexDirection='column'; b.style.alignItems='stretch';
  b.innerHTML=`
   <div style="display:flex;align-items:center;gap:8px;">
     <b style="font-size:.88rem;">${escHtml(pf.names[0])} ${pf.mode==='vs'?'⚔️':'🤝'} ${escHtml(pf.names[1])}</b>
     <span style="margin-left:auto;display:flex;gap:5px;">
       <button ${seg(pf.mode!=='vs')} onclick="_setPairOpt('mode','partner')">같은 팀</button>
       <button ${seg(pf.mode==='vs')} onclick="_setPairOpt('mode','vs')">맞대결</button>
     </span>
     <button onclick="clearFeedPairFilter()" style="background:none;border:none;color:var(--text-muted);font-size:1rem;cursor:pointer;padding:0 2px;">✕</button>
   </div>
   <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:.78rem;flex-wrap:wrap;">
     <span>${pf.mode==='vs'?escHtml(pf.names[0])+' 기준 ':''}<b>${tot}전 ${w}승 ${l}패</b> · 승률 <b>${wr}%</b> · 득실 ${diff>0?'+':''}${diff}${streak>=2?` · <b style="color:var(--primary);">${streak}연승 ${g}</b>`:''}</span>
     <span style="margin-left:auto;display:flex;gap:5px;">
       <button ${seg(pf.range!=='all')} onclick="_setPairOpt('range','season')">이번 시즌</button>
       <button ${seg(pf.range==='all')} onclick="_setPairOpt('range','all')">전체 기간</button>
     </span>
   </div>`;
}
