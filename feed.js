/* ── FEED ── */
let _feedPage=1;
function _populateFeedDateFilter(matches, currentVal){
  const sel=document.getElementById('feed-date-filter');
  if(!sel) return;
  // 이미 옵션이 있고 현재 값 있으면 유지 (재렌더 시 옵션 유지)
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

async function renderFeed(forceNameQ){
  _feedPage=1;
  const batchBtn=document.getElementById('btn-batch-register');
  if(batchBtn) batchBtn.style.display=ME?.role==='admin'?'':'none';
  _detachFeedScroll();
  window._feedAllMatches=null;
  const token=++_feedRenderToken;
  await _renderFeedInner(forceNameQ, token);
}

async function _renderFeedInner(forceNameQ, token){
  const el=document.getElementById('feed-list');
  if(!el) return;
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(4);

  const rawName=forceNameQ!==undefined?forceNameQ:(document.getElementById('feed-name-search')?.value||'');
  const nameQ=rawName.trim();
  const clearBtn=document.getElementById('feed-search-clear');
  if(clearBtn) clearBtn.style.display=nameQ?'block':'none';

  let q=sb.from('matches').select('*')
    .eq('status','approved')
    .order('match_date',{ascending:false})
    .order('created_at',{ascending:false})
    .limit(2000);

  let{data:matches,error:feedErr}=await q;

  // 다른 탭 갔다가 돌아왔으면 이 렌더는 취소
  if(token!==_feedRenderToken) return;

  if(feedErr){ console.error('[Feed]',feedErr); matches=[]; }
  matches=matches||[];

  matches.sort((a,b)=>{
    const dd=(b.match_date||'').localeCompare(a.match_date||'');
    if(dd!==0) return dd;
    return (b.created_at||'').localeCompare(a.created_at||'');
  });
  const _fullCountByDate={};
  matches.forEach(m=>{ const d=m.match_date||''; _fullCountByDate[d]=(_fullCountByDate[d]||0)+1; });
  window._feedFullCountByDate=_fullCountByDate;

  if(nameQ){
    matches=matches.filter(m=>[m.a1_name,m.a2_name,m.b1_name,m.b2_name]
      .some(n=>_matchSearch(n,nameQ)));
  }

  if(token!==_feedRenderToken) return; // 한 번 더 체크

  if(!matches.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><div>${nameQ?`'${rawName}' 검색 결과 없음`:'경기 내역 없음'}</div></div>`;
    return;
  }
  window._feedAllMatches=matches;
  _feedPage=1;
  _renderFeedSlice();
  _attachFeedScroll();
}

const PAGE=20;
function _renderFeedSlice(){
  const el=document.getElementById('feed-list');
  if(!el||!window._feedAllMatches) return;
  const slice=window._feedAllMatches.slice(0,_feedPage*PAGE);
  const hasMore=window._feedAllMatches.length>slice.length;
  el.innerHTML=renderMatchesWithDateHeaders(slice, window._feedFullCountByDate||{});
  if(hasMore){
    const sentinel=document.createElement('div');
    sentinel.id='feed-sentinel';
    sentinel.style.cssText='height:40px;margin-top:4px;';
    el.appendChild(sentinel);
  }
}

let _feedScrollHandler=null;
function _attachFeedScroll(){
  const appBody=document.querySelector('.app-body');
  if(!appBody) return;
  _feedScrollHandler=()=>{
    const sentinel=document.getElementById('feed-sentinel');
    if(!sentinel||!window._feedAllMatches) return;
    const bodyRect=appBody.getBoundingClientRect();
    const sentRect=sentinel.getBoundingClientRect();
    if(sentRect.top < bodyRect.bottom + 300){
      _feedPage++;
      _renderFeedSlice();
    }
  };
  appBody.addEventListener('scroll',_feedScrollHandler,{passive:true});
  // 초기 렌더 직후 sentinel이 이미 보이면 즉시 추가 로드
  setTimeout(_feedScrollHandler, 100);
}
function _detachFeedScroll(){
  if(!_feedScrollHandler) return;
  const appBody=document.querySelector('.app-body');
  if(appBody) appBody.removeEventListener('scroll',_feedScrollHandler);
  _feedScrollHandler=null;
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
    if(d!==lastDate){ html+=feedDateHeader(d,countByDate[d]); lastDate=d; }
    html+=matchCardHTML(m);
  });
  return html;
}

/* ── 날짜 구분선 헤더 생성 ── */
function feedDateHeader(dateStr,count){
  const d=new Date(dateStr+'T00:00:00');
  const days=['일','월','화','수','목','금','토'];
  const yy=String(d.getFullYear()).slice(2);
  const label=`${yy}.${d.getMonth()+1}.${d.getDate()}.(${days[d.getDay()]})`;
  const countBadge=count>1?` <span style="font-size:.68rem;color:var(--text-muted);font-weight:400;">${count}경기</span>`:'';
  return `<div style="display:flex;align-items:center;gap:6px;padding:10px 0 6px;margin-top:2px;"><div style="flex:1;height:1px;background:var(--border);"></div><span style="font-size:.75rem;font-weight:700;color:var(--text-muted);white-space:nowrap;padding:0 6px;">${label}${countBadge}</span><button onclick="event.stopPropagation();openDateSummaryPage('${dateStr}')" style="flex-shrink:0;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text-muted);font-family:inherit;font-size:.68rem;cursor:pointer;">더보기 ›</button><div style="flex:1;height:1px;background:var(--border);"></div></div>`;
}

/* ── 날짜별 요약 페이지 ── */
function openDateSummaryPage(dateStr){
  const pg=document.getElementById('page-date-summary');
  if(pg){pg.style.display='block';pg.scrollTop=0;}
  const d=new Date(dateStr+'T00:00:00');
  const days=['일','월','화','수','목','금','토'];
  document.getElementById('dsp-title').textContent=`${d.getMonth()+1}월 ${d.getDate()}일(${days[d.getDay()]}) 요약`;
  renderDateSummaryContent(dateStr);
}
function closeDateSummaryPage(){
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
      if(!playerMap[key]) playerMap[key]={id:key,realId:id||null,name,wins:0,losses:0};
      const onA=[m.a1_id,m.a2_id].includes(id)||((!id)&&[m.a1_name,m.a2_name].includes(name));
      const won=(m.score_a>m.score_b)?onA:!onA;
      won?playerMap[key].wins++:playerMap[key].losses++;
    });
  });
  const players=Object.values(playerMap);
  const sortByWR=arr=>[...arr].sort((a,b)=>{
    const wrA=a.wins/(a.wins+a.losses||1), wrB=b.wins/(b.wins+b.losses||1);
    return wrB-wrA||b.wins-a.wins;
  });
  const mvp=[...players].sort((a,b)=>b.wins-a.wins||(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)))[0];
  function playerRow(p){
    const total=p.wins+p.losses;
    const wr=total?Math.round(p.wins/total*100):0;
    const isMvp=p.id===mvp?.id;
    const u=users.find(x=>x.id===p.realId);
    const av=u?.avatar_url
      ?`<img src="${u.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
      :`<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;">${p.name[0]}</div>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:.5px solid var(--border);">
      ${av}
      <div style="flex:1;font-size:.87rem;font-weight:${isMvp?700:400};">${p.name}${isMvp?' 🏆':''}</div>
      <div style="font-size:.8rem;color:var(--text-muted);">${p.wins}승 ${p.losses}패</div>
      <div style="font-size:.85rem;font-weight:700;color:${wr>=50?'var(--primary)':'#FF7070'};min-width:38px;text-align:right;">${wr}%</div>
    </div>`;
  }
  el.innerHTML=
    (mvp?`<div style="margin-bottom:14px;padding:8px 12px;background:rgba(41,121,255,.08);border:1px solid rgba(41,121,255,.2);border-radius:10px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.2rem;">🏆</span>
      <div><div style="font-size:.68rem;color:var(--text-muted);">오늘의 MVP</div><div style="font-size:.92rem;font-weight:700;">${mvp.name} <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;">${mvp.wins}승 ${mvp.losses}패 · ${Math.round(mvp.wins/(mvp.wins+mvp.losses)*100)}%</span></div></div>
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
    ${m.note?`<div style="font-size:.74rem;color:var(--text-muted);padding:4px 10px 6px;text-align:center;border-top:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.04);">${m.note}</div>`:''}
    ${isAdmin&&m.status==='pending'?`<div class="btn-row" style="padding:6px 8px 8px;" onclick="event.stopPropagation()"><button class="btn btn-success btn-xs" onclick="approveMatch('${m.id}')">✅ 승인</button><button class="btn btn-danger btn-xs" onclick="confirmRejectMatch('${m.id}')">❌ 반려</button><button class="btn btn-warn btn-xs" onclick="openEditMatch('${m.id}')">✏️ 수정</button></div>`:''}
  </div>`;
}

async function openMatchDetail(id,isAdmin=false){
  const{data:m}=await sb.from('matches').select('*').eq('id',id).single();
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
      <span>📨 등록 ${createdAt}</span>
      ${m.approved_at?`<span>✅ 승인 ${approvedAt}</span>`:''}
    </div>`;
  let acts=`<button class="btn btn-ghost" onclick="closeModal('modal-match')">닫기</button>`;
  if(isAdmin||ME.role==='admin'){
    acts+=`<button class="btn btn-warn btn-sm" onclick="openEditMatch('${id}')">✏️ 수정</button>`;
    acts+=`<button class="btn btn-danger btn-sm" onclick="confirmDeleteMatch('${id}')">🗑 삭제</button>`;
    if(m.status==='pending') acts+=`<button class="btn btn-success btn-sm" onclick="approveMatch('${id}')">✅ 승인</button><button class="btn btn-danger btn-sm" onclick="confirmRejectMatch('${id}')">❌ 반려</button>`;
  } else if(canCancel){
    acts+=`<button class="btn btn-danger" onclick="confirmCancelMatch('${id}')">취소</button>`;
  }
  document.getElementById('modal-match-actions').innerHTML=acts;
  openModal('modal-match');
}

