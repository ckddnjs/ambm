function renderBalancePage(){
  if(ME?.role!=='admin'){toast('관리자만 사용 가능합니다','error');return;}
  setTimeout(()=>{
    balSwitchTab(_balCurrentTab||'compare');
  },50);
}
function balSwitchTab(tab){
  _balCurrentTab=tab;
  const isCompare=tab==='compare';
  // 탭 버튼 스타일
  const tc=document.getElementById('bal-tab-compare');
  const th=document.getElementById('bal-tab-history');
  if(tc){tc.style.background=isCompare?'var(--primary)':'transparent';tc.style.color=isCompare?'#fff':'var(--text-muted)';}
  if(th){th.style.background=!isCompare?'var(--primary)':'transparent';th.style.color=!isCompare?'#fff':'var(--text-muted)';}
  // 탭 콘텐츠
  const cc=document.getElementById('bal-tab-content-compare');
  const ch=document.getElementById('bal-tab-content-history');
  if(cc) cc.style.display=isCompare?'block':'none';
  if(ch) ch.style.display=!isCompare?'block':'none';
  // 초기화 버튼: 비교탭만
  const rb=document.getElementById('bal-reset-btn');
  if(rb) rb.style.display=isCompare?'':'none';
  if(isCompare){
    if(!window._balUserPool){
      _balAttendees=[];_balType='individual';_balResult=null;_balDuoPairs=[];
      balGoStep(1);balSetType('individual');
      const w=document.getElementById('bal-attendee-list');
      if(w) w.innerHTML='<div style="color:var(--text-muted);font-size:.8rem;">불러오는 중…</div>';
      _balLoadAttendees();
    }
  } else {
    _balRenderHistory();
  }
}
function balReset(){
  _balAttendees=[];_balType='individual';_balResult=null;_balDuoPairs=[];
  window._balUserPool=null;
  const w=document.getElementById('bal-attendee-list');
  if(w) w.innerHTML='<div style="color:var(--text-muted);font-size:.8rem;">불러오는 중…</div>';
  balGoStep(1);balSetType('individual');
  _balLoadAttendees();
}
function toggleBalanceForm(){ navigateTo('balance'); }
function balGoStep(n){
  document.getElementById('bal-step1').style.display=n===1?'block':'none';
  document.getElementById('bal-step2').style.display=n===2?'block':'none';
}
function balDeleteHistory(id){
  showConfirm({icon:'🗑',title:'밸런스 내역 삭제',msg:'이 내역을 삭제하시겠습니까?',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    const{error}=await sb.from('bracket_tournaments').delete().eq('id',id);
    if(error){toast('삭제 실패: '+error.message,'error');return;}
    toast('삭제되었습니다','success');
    _balRenderHistory();
  }});
}
async function _balRenderHistory(){
  const el=document.getElementById('bal-history-list');
  if(!el) return;
  el.innerHTML='<div style="color:var(--text-muted);font-size:.8rem;text-align:center;padding:20px 0;">불러오는 중…</div>';
  const{data,error}=await sb.from('bracket_tournaments')
    .select('id,name,match_date,tournament_type,created_at')
    .eq('status','balance')
    .order('created_at',{ascending:false});
  if(error||!data?.length){
    el.innerHTML='<div style="color:var(--text-muted);font-size:.82rem;text-align:center;padding:30px 0;">저장된 밸런스 내역이 없습니다</div>';
    return;
  }
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};
  let html='<div style="display:flex;flex-direction:column;gap:8px;">';
  data.forEach(bt=>{
    const tl=typeLabel[bt.tournament_type]||'';
    const dateStr=bt.match_date||bt.created_at?.slice(0,10)||'';
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;min-width:0;cursor:pointer;" onclick="openBracketDetail('${bt.id}')">
        <div style="font-size:.86rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(bt.name)}</div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">${tl} &nbsp;·&nbsp; ${dateStr}</div>
      </div>
      <div style="font-size:.75rem;color:var(--primary);font-weight:600;flex-shrink:0;cursor:pointer;" onclick="openBracketDetail('${bt.id}')">보기 ›</div>
      <button onclick="balDeleteHistory('${bt.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.82rem;padding:4px 6px;flex-shrink:0;" title="삭제">🗑</button>
    </div>`;
  });
  html+='</div>';
  el.innerHTML=html;
}

// ── 참석자 로딩 (CI 포함) ──
async function _balLoadAttendees(){
  try{
    // profiles: 정회원 로드 (exclude_stats 포함 — 통계제외 회원은 밸런스에서도 제외)
    const users=await _getApprovedUsers();
    const error=null; // 캐시 헬퍼 사용
    // matches 캐시에서 통계 계산
    const matches=window._allMatchesCache||[];
    const activeUsers=(users||[]).filter(u=>!u.exclude_stats);
    const memberNames=new Set((users||[]).map(u=>u.name)); // 이름 중복 방지용 (제외 회원 포함)
    const stats={};
    activeUsers.forEach(u=>{stats[u.id]={id:u.id,name:u.name,isGuest:false,games:0,wins:0,scored:0,conceded:0,closeWins:0};});
    // 비회원(id없음, 게스트모드 제외) 수집
    const guestModeNames=window._guestModeNamesCache||await _loadGuestModeNames();
    const guestStats={};
    matches.forEach(m=>{
      const aWin=m.score_a>m.score_b;
      const isClose=Math.abs(m.score_a-m.score_b)<=3;
      // 정회원 (id 기반)
      [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
       {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
      .filter(p=>p.id&&stats[p.id]).forEach(p=>{
        stats[p.id].games++;if(p.win){stats[p.id].wins++;if(isClose)stats[p.id].closeWins++;}
        stats[p.id].scored+=p.s;stats[p.id].conceded+=p.c;
      });
      // 비회원 (이름 기반, id없음, 게스트모드 제외, 회원이름 제외)
      [{n:m.a1_name,id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},
       {n:m.a2_name,id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
       {n:m.b1_name,id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},
       {n:m.b2_name,id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
      .filter(p=>p.n&&!p.id&&!memberNames.has(p.n)&&!guestModeNames.has(p.n))
      .forEach(p=>{
        if(!guestStats[p.n]) guestStats[p.n]={id:'guest:'+p.n,name:p.n,isGuest:true,games:0,wins:0,scored:0,conceded:0,closeWins:0};
        guestStats[p.n].games++;if(p.win){guestStats[p.n].wins++;if(isClose)guestStats[p.n].closeWins++;}
        guestStats[p.n].scored+=p.s;guestStats[p.n].conceded+=p.c;
      });
    });
    const allStats=[...Object.values(stats),...Object.values(guestStats)];
    window._balUserPool=allStats.map(u=>{
      const diff=u.scored-u.conceded;
      const ci=Math.round(calcCI(u.wins,u.games,diff,u.closeWins));
      return {...u,diff,score:ci,ci};
    }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    console.log('[bal] pool 완성: 정회원',Object.keys(stats).length,'명 + 비회원',Object.keys(guestStats).length,'명');
  }catch(e){
    console.error('[bal] load error',e);
    window._balUserPool=[];
    toast('참석자 로딩 실패: '+e.message,'error');
  }
  _balRenderAttendees();
}
function balAddManual(){
  const nameEl=document.getElementById('bal-manual-name');
  const rpEl=document.getElementById('bal-manual-rp');
  const name=(nameEl?.value||'').trim();
  const rp=parseInt(rpEl?.value||'0');
  if(!name){toast('이름을 입력하세요','error');return;}
  if(isNaN(rp)||rp<0){toast('RP를 입력하세요','error');return;}
  // 중복 체크
  const pool=window._balUserPool||[];
  if(pool.some(u=>u.name===name)){toast('이미 존재하는 이름입니다','error');return;}
  // rpDisp 역산: 입력값은 이미 /10된 값이므로 *10 저장
  const score=rp*10;
  const id='manual:'+name;
  const u={id,name,isGuest:true,isManual:true,games:0,wins:0,scored:0,conceded:0,diff:0,score,ci:score};
  pool.push(u);
  window._balUserPool=pool;
  // 즉시 선택 상태로 추가
  _balAttendees.push({...u});
  _balAttendees.sort((a,b)=>b.score-a.score);
  nameEl.value=''; rpEl.value='';
  _balRenderAttendees();
  if(_balType==='duo') _balRenderDuoPairUI();
}
function _balRenderAttendees(){
  const wrap=document.getElementById('bal-attendee-list');
  const cnt=document.getElementById('bal-attendee-count');
  if(!wrap){console.warn('[bal] bal-attendee-list not found in DOM');return;}
  const all=window._balUserPool||[];
  const chips=all.map(u=>{
    const sel=_balAttendees.some(a=>a.id===u.id);
    if(u.isManual){
      // 직접입력: 주황 계열, X버튼으로만 삭제, 클릭으로 선택/해제 없음
      return `<div style="display:inline-flex;align-items:center;gap:3px;padding:4px 8px 4px 11px;border-radius:20px;font-size:.78rem;font-family:inherit;font-weight:600;
        background:${sel?'#F59E0B':'rgba(245,158,11,.15)'};
        color:${sel?'#fff':'#92400E'};
        border:1.5px solid ${sel?'#F59E0B':'rgba(245,158,11,.5)'};
      ">${u.name}<span style="font-size:.63rem;opacity:.8;margin-left:3px;">${rpDisp(u.score)}</span
      ><button onclick="balRemoveManual('${u.id}')" style="margin-left:4px;background:none;border:none;cursor:pointer;color:${sel?'rgba(255,255,255,.8)':'#92400E'};font-size:.75rem;padding:0 1px;line-height:1;">✕</button></div>`;
    }
    return `<button onclick="balToggleAttendee('${u.id}')" style="
      padding:5px 11px;border-radius:20px;font-size:.78rem;cursor:pointer;
      font-family:inherit;font-weight:600;transition:all .12s;
      background:${sel?'var(--primary)':'var(--bg3)'};
      color:${sel?'#fff':'var(--text-muted)'};
      border:1.5px solid ${sel?'var(--primary)':'var(--border)'};
    ">${u.name}<span style="font-size:.63rem;opacity:.7;margin-left:3px;">${rpDisp(u.score)}</span></button>`;
  });
  wrap.innerHTML=chips.length?chips.join(''):'<div style="color:var(--text-muted);font-size:.8rem;">회원 없음</div>';
  if(cnt) cnt.textContent=`${_balAttendees.length}명 선택됨`;
}
function balRemoveManual(id){
  const pi=(window._balUserPool||[]).findIndex(u=>u.id===id);
  if(pi>=0) window._balUserPool.splice(pi,1);
  const ai=_balAttendees.findIndex(a=>a.id===id);
  if(ai>=0) _balAttendees.splice(ai,1);
  _balRenderAttendees();
  if(_balType==='duo') _balRenderDuoPairUI();
}
function balToggleAttendee(id){
  const raw=(window._balUserPool||[]).find(x=>x.id===id);
  if(!raw) return;
  const idx=_balAttendees.findIndex(a=>a.id===id);
  if(idx>=0){
    _balAttendees.splice(idx,1);
    // 직접입력 선수는 pool에서도 제거
    if(raw.isManual){
      const pi=(window._balUserPool||[]).findIndex(u=>u.id===id);
      if(pi>=0) window._balUserPool.splice(pi,1);
    }
  } else {
    _balAttendees.push({...raw});
  }
  _balAttendees.sort((a,b)=>b.score-a.score);
  _balRenderAttendees();
  if(_balType==='duo') _balRenderDuoPairUI();
}

function balSetType(t){
  _balType=t;
  _balDuoPairs=[];
  ['individual','duo','team'].forEach(k=>{
    const b=document.getElementById('bal-type-'+k);
    if(b) b.className='btn btn-sm '+(k===t?'btn-primary':'btn-ghost');
  });
  document.getElementById('bal-captain-section').style.display='none'; // 팀장 지정 미사용
  document.getElementById('bal-duo-section').style.display=t==='duo'?'block':'none';
  if(t==='duo') _balRenderDuoPairUI();
}
function _balUpdateCaptainSelects(){
  if(_balType!=='team') return;
  const opts='<option value="">선택</option>'+_balAttendees.map(a=>`<option value="${a.id}">${a.name} (${rpDisp(a.score)})</option>`).join('');
  ['bal-captain-a','bal-captain-b'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    const prev=el.value; el.innerHTML=opts; if(prev) el.value=prev;
  });
}

// ══════════════════════════════
//  듀오전 페어 구성 UI
// ══════════════════════════════
// _balDuoPairs = [{p1:{id,name,score,...}, p2:{...}|null}]
function _balRenderDuoPairUI(){
  const wrap=document.getElementById('bal-duo-pairs-wrap');
  if(!wrap) return;

  // 아직 페어에 없는 참석자
  const pairedIds=new Set(_balDuoPairs.flatMap(p=>[p.p1?.id,p.p2?.id].filter(Boolean)));
  const unpaired=_balAttendees.filter(a=>!pairedIds.has(a.id));

  let html='';

  // 미배정 선수 풀
  if(unpaired.length){
    html+=`<div style="margin-bottom:10px;">
      <div style="font-size:.76rem;font-weight:700;color:var(--text-muted);margin-bottom:5px;">미배정 선수 (클릭해서 페어 구성)</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">`;
    unpaired.forEach(p=>{
      html+=`<button onclick="balDuoAssign('${p.id}')" style="
        padding:4px 10px;border-radius:16px;font-size:.76rem;cursor:pointer;font-family:inherit;
        background:var(--bg3);color:var(--text-muted);border:1.5px solid var(--border);">
        ${p.name} <span style="font-size:.62rem;opacity:.7;">${rpDisp(p.score)}</span>
      </button>`;
    });
    html+=`</div></div>`;
  }

  // 페어 목록 (각각 2칸)
  if(_balDuoPairs.length){
    html+=`<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:6px;">`;
    _balDuoPairs.forEach((pair,pi)=>{
      const ci=Math.round(((pair.p1?.score||0)+(pair.p2?.score||0))/(pair.p2?2:1));
      html+=`<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:5px;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 8px;">
        <!-- 파트너1 슬롯 -->
        <div style="background:var(--surface);border-radius:6px;padding:4px 8px;min-height:30px;display:flex;align-items:center;justify-content:space-between;">
          ${pair.p1
            ?`<span style="font-size:.78rem;font-weight:600;">${pair.p1.name}</span>
               <span style="font-size:.62rem;color:var(--text-muted);">${rpDisp(pair.p1.score)}</span>`
            :`<span style="font-size:.72rem;color:var(--text-muted);">파트너1</span>`}
        </div>
        <!-- 파트너2 슬롯 -->
        <div style="background:var(--surface);border-radius:6px;padding:4px 8px;min-height:30px;display:flex;align-items:center;justify-content:space-between;">
          ${pair.p2
            ?`<span style="font-size:.78rem;font-weight:600;">${pair.p2.name}</span>
               <span style="font-size:.62rem;color:var(--text-muted);">${rpDisp(pair.p2.score)}</span>`
            :`<span style="font-size:.72rem;color:var(--text-muted);">파트너2</span>`}
        </div>
        <div style="display:flex;gap:3px;">
          <span style="font-size:.68rem;color:var(--text-muted);white-space:nowrap;">${ci}</span>
          <button onclick="balDuoRemovePair(${pi})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.8rem;padding:0 2px;">✕</button>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  // 자동 페어링 버튼
  html+=`<button onclick="balDuoAutoPair()" style="
    font-size:.74rem;padding:4px 12px;background:var(--bg2);border:1px solid var(--border);
    border-radius:8px;cursor:pointer;color:var(--text-muted);">🔄 자동 페어링</button>`;

  wrap.innerHTML=html;
}

let _balDuoSelectFirst=null; // 첫번째 클릭한 선수 id
function balDuoAssign(id){
  const p=_balAttendees.find(a=>a.id===id);
  if(!p) return;
  if(!_balDuoSelectFirst){
    _balDuoSelectFirst=p;
    _balRenderDuoPairUI(); // 하이라이트용 재렌더 (개선 여지)
    return;
  }
  // 페어 생성
  _balDuoPairs.push({p1:_balDuoSelectFirst,p2:p});
  _balDuoSelectFirst=null;
  _balRenderDuoPairUI();
}
function balDuoRemovePair(pi){
  _balDuoPairs.splice(pi,1);
  _balRenderDuoPairUI();
}
function balDuoAutoPair(){
  // 뱀배열: 1위↔꼴찌, 2위↔꼴찌-1 ...
  const sorted=[..._balAttendees].sort((a,b)=>b.score-a.score);
  _balDuoPairs=[];
  const n=sorted.length;
  for(let i=0;i<Math.floor(n/2);i++){
    _balDuoPairs.push({p1:sorted[i],p2:sorted[n-1-i]});
  }
  if(n%2===1) _balDuoPairs.push({p1:sorted[Math.floor(n/2)],p2:null});
  _balDuoSelectFirst=null;
  _balRenderDuoPairUI();
}

// ══════════════════════════════
//  자동 배분 로직
// ══════════════════════════════
// 개인전: 4~5명씩 조편성 (뱀배열)
function _balArrangeIndividual(){
  const sorted=[..._balAttendees].sort((a,b)=>b.score-a.score);
  const n=sorted.length;
  if(n<4){ toast('개인전은 최소 4명 필요합니다','error'); return null; }

  // 조 수 결정: 각 조 4~5명, 3명 조 불가
  let groupCount=Math.ceil(n/5);
  for(let g=Math.ceil(n/5);g<=Math.floor(n/4);g++){
    if(Math.floor(n/g)>=4){ groupCount=g; break; }
  }

  // ── 핵심 알고리즘: 조내 균일 + 조간 평균 균형 동시 최적화 ──
  // 1단계: 뱀배열로 초기 배분 (조간 평균 균형 확보)
  const initGroups=Array.from({length:groupCount},(_,gi)=>({
    name:`${String.fromCharCode(65+gi)}조`,
    players:[],
  }));
  sorted.forEach((p,i)=>{
    const row=Math.floor(i/groupCount);
    const col=i%groupCount;
    const gi=row%2===0?col:groupCount-1-col;
    initGroups[gi].players.push({...p});
  });

  // 평가 함수: 조내 표준편차 합 * 0.5 + 조간 평균 표준편차 * 0.5
  const evaluate=(gs)=>{
    const avgs=gs.map(g=>g.players.reduce((s,p)=>s+(p.score||0),0)/(g.players.length||1));
    const globalMean=avgs.reduce((s,v)=>s+v,0)/avgs.length;
    // 조간 평균 표준편차
    const interStd=Math.sqrt(avgs.reduce((s,v)=>s+(v-globalMean)**2,0)/avgs.length);
    // 조내 표준편차 평균
    const intraStd=gs.reduce((s,g)=>{
      const avg=g.players.reduce((a,p)=>a+(p.score||0),0)/(g.players.length||1);
      return s+Math.sqrt(g.players.reduce((a,p)=>a+(p.score-avg)**2,0)/(g.players.length||1));
    },0)/gs.length;
    // 두 목표를 동등 가중치로 합산 (낮을수록 좋음)
    return interStd*0.5 + intraStd*0.5;
  };

  // 2단계: 개선 탐색 — 무작위 2명 스왑 반복으로 점수 개선
  let best=initGroups.map(g=>({...g,players:[...g.players]}));
  let bestScore=evaluate(best);

  // 같은 조 내 원소 교환 (조내 균일) + 다른 조간 교환 (조간 균형) 탐색
  for(let iter=0;iter<800;iter++){
    // 무작위 두 조 선택
    const gi=Math.floor(Math.random()*groupCount);
    const gj=Math.floor(Math.random()*groupCount);
    if(gi===gj) continue;
    const pi=Math.floor(Math.random()*best[gi].players.length);
    const pj=Math.floor(Math.random()*best[gj].players.length);
    // 스왑 시도
    const candidate=best.map(g=>({...g,players:[...g.players]}));
    [candidate[gi].players[pi],candidate[gj].players[pj]]=[candidate[gj].players[pj],candidate[gi].players[pi]];
    const s=evaluate(candidate);
    if(s<bestScore){ best=candidate; bestScore=s; }
  }

  return {groups:best};
}

// 듀오전: 페어 단위 → 각 조 3~4팀
function _balArrangeDuo(){
  if(_balDuoPairs.length<3){toast('듀오전은 페어 3쌍 이상 필요합니다','error');return null;}
  const avgRP=pair=>Math.round(((pair.p1?.score||0)+(pair.p2?.score||0))/(pair.p2?2:1));
  const sorted=[..._balDuoPairs].sort((a,b)=>avgRP(b)-avgRP(a));
  const n=sorted.length;
  // 조 수 결정: 각 조 3~4팀
  let groupCount=1;
  for(let g=Math.ceil(n/4);g<=Math.floor(n/3);g++){
    const base=Math.floor(n/g);
    if(base>=3 && base<=4){ groupCount=g; break; }
  }
  if(groupCount<1) groupCount=Math.max(1,Math.round(n/3.5));

  const teams=Array.from({length:groupCount},(_,gi)=>({
    name:`${String.fromCharCode(65+gi)}조`,
    pairs:[],
  }));
  // 뱀배열
  sorted.forEach((pair,i)=>{
    const row=Math.floor(i/groupCount);
    const col=i%groupCount;
    const ti=row%2===0?col:groupCount-1-col;
    teams[ti].pairs.push(pair);
  });
  return {teams};
}

// 팀장전: CI 기반 균형 2분할 (팀장 지정 불필요)
function _balArrangeTeam(){
  const sorted=[..._balAttendees].sort((a,b)=>b.score-a.score);
  const teamA=[],teamB=[];
  // 뱀배열: 1위→A, 2위→B, 3위→B, 4위→A, 5위→A ...
  sorted.forEach((p,i)=>{
    const row=Math.floor(i/2);
    const col=i%2;
    (row%2===0?col===0:col===1)?teamA.push(p):teamB.push(p);
  });
  return {teamA,teamB};
}

// ── 분석 실행 ──
function balGenerate(){
  const minMap={individual:4,duo:6,team:2}; // 듀오전: 3쌍=6명
  if(_balAttendees.length<(minMap[_balType]||4)){
    const msg={individual:'개인전은 최소 4명 필요합니다',duo:'듀오전은 최소 6명(3쌍) 필요합니다',team:'팀장전은 최소 2명 필요합니다'};
    toast(msg[_balType]||'참석자를 더 선택해주세요','error');return;
  }
  // 듀오전: 짝수 인원만 가능
  if(_balType==='duo' && _balAttendees.length%2!==0){
    toast(`듀오전은 짝수 인원만 가능합니다 (현재 ${_balAttendees.length}명)`,'error');return;
  }
  let result=null;
  if(_balType==='individual') result=_balArrangeIndividual();
  else if(_balType==='duo')   result=_balArrangeDuo();
  else                        result=_balArrangeTeam();
  if(!result) return;
  _balResult=result;
  balGoStep(2);
  _balRenderStep2();
}

// ══════════════════════════════
//  STEP 2: 결과 렌더
// ══════════════════════════════
function _balRenderStep2(){
  _balRenderGauge();
  _balRenderEdit();
}

// ── CI 기반 밸런스 등급 ──
function _calcBalanceGrade(scores){
  if(scores.length<2) return {std:0,label:'—',color:'var(--text-muted)',pct:100};
  const mean=scores.reduce((s,v)=>s+v,0)/scores.length;
  const std=Math.sqrt(scores.reduce((s,v)=>s+(v-mean)**2,0)/scores.length);
  const s=Math.round(std*10)/10;
  const pct=Math.max(0,Math.round(100-s*2)); // CI 기준 50편차=0점
  const label=s<5?'⭐ 완벽':s<15?'✅ 균형':s<30?'🟡 양호':s<50?'⚠️ 불균형':'❌ 심한불균형';
  const color=s<5?'#00C896':s<15?'#4CAF50':s<30?'#FFB74D':s<50?'var(--warn)':'var(--danger)';
  return {std:s,label,color,pct};
}

// ── 게이지 ──
function _balRenderGauge(){
  const el=document.getElementById('bal-gauge');
  if(!el||!_balResult) return;
  const pal=['#4FC3F7','#AED581','#FFB74D','#F48FB1','#CE93D8','#80CBC4'];
  const teamPal=['#00C896','#FF7043'];

  let groups=[],scores=[],labels=[],memberLists=[];
  if(_balType==='individual'){
    (_balResult.groups||[]).forEach((g,gi)=>{
      const sc=Math.round(g.players.reduce((s,p)=>s+(p.score||0),0)/(g.players.length||1));
      groups.push(g); scores.push(sc); labels.push(g.name);
      memberLists.push(g.players.map(p=>p.name).join('·'));
    });
  } else if(_balType==='duo'){
    (_balResult.teams||[]).forEach((t,ti)=>{
      const avgPairCI=pair=>((pair.p1?.score||0)+(pair.p2?.score||0))/(pair.p2?2:1);
      const sc=Math.round(t.pairs.reduce((s,p)=>s+avgPairCI(p),0)/(t.pairs.length||1));
      scores.push(sc); labels.push(t.name);
      memberLists.push(t.pairs.map(p=>p.p2?`${p.p1.name}/${p.p2.name}`:p.p1.name).join(' · '));
    });
  } else {
    const{teamA,teamB}=_balResult;
    const sc=(arr)=>Math.round(arr.reduce((s,p)=>s+(p.score||0),0)/(arr.length||1));
    scores=[sc(teamA),sc(teamB)]; labels=['A팀','B팀'];
    memberLists=[teamA.map(p=>p.name+(p.captain?'⭐':'')).join('·'),teamB.map(p=>p.name+(p.captain?'⭐':'')).join('·')];
  }

  const grade=_calcBalanceGrade(scores);
  const maxSc=Math.max(...scores,1);

  let html=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <div>
      <div style="font-size:.73rem;color:var(--text-muted);">밸런스 등급</div>
      <div style="font-size:1rem;font-weight:800;color:${grade.color};">${grade.label}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:.73rem;color:var(--text-muted);">균형 점수</div>
      <div style="font-size:1.5rem;font-weight:900;color:${grade.color};line-height:1;">${grade.pct}</div>
    </div>
  </div>
  <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:14px;">
    <div style="height:100%;width:${grade.pct}%;background:${grade.color};border-radius:3px;transition:width .5s;"></div>
  </div>`;

  scores.forEach((sc,gi)=>{
    const color=_balType==='team'?teamPal[gi]:pal[gi%pal.length];
    const pct=Math.round(sc/maxSc*100);
    html+=`<div style="margin-bottom:9px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
        <div style="font-size:.88rem;font-weight:800;color:${color};min-width:34px;">${labels[gi]}</div>
        <div style="font-size:.78rem;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${memberLists[gi]}</div>
        <div style="font-size:.75rem;font-weight:700;color:${color};margin-left:4px;">${rpDisp(sc)}</div>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .4s;"></div>
      </div>
    </div>`;
  });

  el.innerHTML=html;
}

// ── 수정 영역 ──
function _balRenderEdit(){
  const el=document.getElementById('bal-edit');
  if(!el||!_balResult) return;
  const pal=['#4FC3F7','#AED581','#FFB74D','#F48FB1','#CE93D8','#80CBC4'];
  const teamPal=['#00C896','#FF7043'];
  let html='';

  if(_balType==='individual'){
    html+=`<div style="font-size:.76rem;color:var(--text-muted);margin-bottom:8px;">🔀 선수 클릭 → 다른 조로 이동. 이동 즉시 균형 재계산.</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:6px;">`;
    (_balResult.groups||[]).forEach((g,gi)=>{
      const color=pal[gi%pal.length];
      const avgCI=Math.round(g.players.reduce((s,p)=>s+(p.score||0),0)/(g.players.length||1));
      html+=`<div style="background:var(--bg2);border:1px solid ${color}40;border-radius:10px;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
          <div style="font-size:.9rem;font-weight:800;color:${color};">${g.name} <span style="font-weight:400;color:var(--text-muted);font-size:.76rem;">(${g.players.length}명)</span></div>
          <div style="font-size:.8rem;font-weight:700;color:${color};">${rpDisp(avgCI)}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">`;
      g.players.forEach((p,pi)=>{
        html+=`<div style="display:flex;align-items:center;gap:4px;background:var(--surface);border-radius:7px;padding:4px 8px;">
          <span style="font-size:.9rem;font-weight:700;">${p.name}</span>
          <span style="font-size:.72rem;color:var(--text-muted);">${rpDisp(p.score)}</span>
          <button onclick="balShowGroupMove(${gi},${pi},this)" style="font-size:.65rem;padding:1px 6px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--bg3);color:var(--text-muted);">🔀</button>
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`</div>`;

  } else if(_balType==='duo'){
    const teams=_balResult.teams||[];
    const gc=teams.length;
    html+=`<div style="font-size:.76rem;color:var(--text-muted);margin-bottom:8px;">🔀 페어 클릭 → 다른 조로 이동. 이동 즉시 균형 재계산.</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:6px;">`;
    teams.forEach((t,ti)=>{
      const color=pal[ti%pal.length];
      const avgRP=Math.round(t.pairs.reduce((s,p)=>s+((p.p1?.score||0)+(p.p2?.score||0))/(p.p2?2:1),0)/(t.pairs.length||1));
      html+=`<div style="background:var(--bg2);border:1px solid ${color}40;border-radius:10px;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
          <div style="font-size:.9rem;font-weight:800;color:${color};">${t.name} <span style="font-weight:400;color:var(--text-muted);font-size:.76rem;">(${t.pairs.length}팀)</span></div>
          <div style="font-size:.8rem;font-weight:700;color:${color};">${rpDisp(avgRP)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">`;
      t.pairs.forEach((pair,pi)=>{
        html+=`<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:4px;align-items:center;background:var(--surface);border-radius:7px;padding:5px 7px;">
          <div style="background:${color}18;border-radius:5px;padding:3px 6px;text-align:center;">
            <div style="font-size:.88rem;font-weight:700;">${pair.p1?.name||'—'}</div>
            <div style="font-size:.7rem;color:var(--text-muted);">${rpDisp(pair.p1?.score)}</div>
          </div>
          <div style="background:${color}18;border-radius:5px;padding:3px 6px;text-align:center;">
            <div style="font-size:.88rem;font-weight:700;">${pair.p2?.name||'미정'}</div>
            <div style="font-size:.7rem;color:var(--text-muted);">${rpDisp(pair.p2?.score)}</div>
          </div>
          <button onclick="balShowDuoMove(${ti},${pi},this)" style="font-size:.65rem;padding:2px 6px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--bg3);color:var(--text-muted);">🔀</button>
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`</div>`;

  } else { // team
    html+=`<div style="font-size:.76rem;color:var(--text-muted);margin-bottom:8px;">🔀 버튼으로 팀 이동 · 이동 즉시 균형 재계산.</div>`;
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
    ['A','B'].forEach((side,si)=>{
      const color=teamPal[si];
      const members=si===0?_balResult.teamA:_balResult.teamB;
      const avgCI=Math.round(members.reduce((s,p)=>s+(p.score||0),0)/(members.length||1));
      html+=`<div style="background:var(--bg2);border:1px solid ${color}40;border-radius:10px;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
          <div style="font-size:.9rem;font-weight:800;color:${color};">${side}팀 <span style="font-weight:400;font-size:.76rem;">(${members.length}명)</span></div>
          <div style="font-size:.8rem;font-weight:700;color:${color};">${rpDisp(avgCI)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">`;
      members.forEach((p,pi)=>{
        const arrow=side==='A'?'→B':'←A';
        html+=`<div style="display:flex;align-items:center;gap:5px;background:var(--surface);border-radius:7px;padding:5px 8px;">
          <div style="width:3px;align-self:stretch;background:${p.captain?color:'rgba(120,120,130,.3)'};border-radius:2px;"></div>
          <span style="flex:1;font-size:.9rem;${p.captain?'font-weight:800;color:'+color+';':'font-weight:600;'}">${p.captain?'⭐':''} ${p.name}</span>
          <span style="font-size:.72rem;color:var(--text-muted);">${rpDisp(p.score)}</span>
          ${!p.captain?`<button onclick="balMoveTeam('${side}',${pi})" style="font-size:.68rem;padding:2px 7px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:var(--bg3);color:var(--text-muted);">${arrow}</button>`:''}
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`</div>`;
  }

  el.innerHTML=html;
}

// ── 이동 동작 ──
function balMoveTeam(fromSide,idx){
  const from=fromSide==='A'?_balResult.teamA:_balResult.teamB;
  const to  =fromSide==='A'?_balResult.teamB:_balResult.teamA;
  const [p]=from.splice(idx,1); to.push(p);
  _balRenderStep2();
}
function balDuoMovePair(fromTi,pi){
  const teams=_balResult.teams;
  const toTi=fromTi===0?1:0;
  const [pair]=teams[fromTi].pairs.splice(pi,1);
  teams[toTi].pairs.push(pair);
  _balRenderStep2();
}

function balShowDuoMove(fromTi,pi,btn){
  const teams=_balResult?.teams;
  if(!teams) return;
  document.querySelectorAll('.bal-move-popup').forEach(e=>e.remove());
  const other=teams.map((t,i)=>i).filter(i=>i!==fromTi);
  if(other.length===1){balDuoMoveToGroup(fromTi,pi,other[0]);return;}
  const pop=document.createElement('div');
  pop.className='bal-move-popup';
  pop.style.cssText='position:absolute;z-index:999;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:4px;';
  other.forEach(ti=>{
    const b=document.createElement('button');
    b.textContent=teams[ti].name+'으로 이동';
    b.style.cssText='padding:6px 14px;border-radius:7px;border:none;background:var(--bg3);color:var(--text);cursor:pointer;font-family:inherit;font-size:.8rem;';
    b.onclick=()=>{pop.remove();balDuoMoveToGroup(fromTi,pi,ti);};
    pop.appendChild(b);
  });
  btn.parentNode.style.position='relative';
  btn.parentNode.appendChild(pop);
  setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),10);
}
function balDuoMoveToGroup(fromTi,pi,toTi){
  const teams=_balResult?.teams;
  if(!teams) return;
  const pair=teams[fromTi].pairs.splice(pi,1)[0];
  teams[toTi].pairs.push(pair);
  _balRenderStep2();
}
let _balGrpMoveCtx=null;
function balShowGroupMove(gi,pi,btn){
  document.querySelectorAll('.bal-gpopup').forEach(e=>e.remove());
  const pop=document.createElement('div');
  pop.className='bal-gpopup';
  pop.style.cssText='position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,.35);right:0;top:100%;';
  (_balResult.groups||[]).filter((_,i)=>i!==gi).forEach(g=>{
    const b=document.createElement('button');
    b.textContent=`${g.name}으로 이동`;
    b.style.cssText='display:block;width:100%;padding:5px 14px;background:none;border:none;color:var(--text);font-size:.78rem;cursor:pointer;text-align:left;border-radius:5px;font-family:inherit;white-space:nowrap;';
    b.onclick=(e)=>{e.stopPropagation();balMoveGroup(gi,pi,g.name);document.querySelectorAll('.bal-gpopup').forEach(e=>e.remove());};
    pop.appendChild(b);
  });
  btn.style.position='relative'; btn.appendChild(pop);
  setTimeout(()=>document.addEventListener('click',()=>document.querySelectorAll('.bal-gpopup').forEach(e=>e.remove()),{once:true}),0);
}
function balMoveGroup(fromGi,pi,toName){
  const toGi=(_balResult.groups||[]).findIndex(g=>g.name===toName);
  if(toGi<0) return;
  const [p]=_balResult.groups[fromGi].players.splice(pi,1);
  _balResult.groups[toGi].players.push(p);
  _balRenderStep2();
}

// ── 저장 ──
async function balSave(){
  if(!_balResult){toast('먼저 밸런스 분석을 실행하세요','error');return;}
  const today=new Date().toISOString().slice(0,10);
  const typeLabel={individual:'개인전',duo:'듀오전',team:'팀장전'};
  const defaultName=`${today} ${_balAttendees.length}명 ${typeLabel[_balType]||''}`;
  // 기존 모달 제거
  document.getElementById('modal-bal-save')?.remove();
  const el=document.createElement('div');
  el.id='modal-bal-save';
  el.className='modal-overlay center open';
  el.innerHTML=`<div class="modal center-modal" style="max-width:320px;">
    <div class="modal-title">💾 밸런스 저장</div>
    <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:10px;">저장할 제목을 입력하세요</div>
    <input id="bal-save-title" class="form-input" value="${escHtml(defaultName)}" style="margin-bottom:14px;font-size:.84rem;" placeholder="제목 입력">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-bal-save').remove()">취소</button>
      <button class="btn btn-primary" onclick="_balDoSave()">저장</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  setTimeout(()=>{const inp=document.getElementById('bal-save-title');if(inp){inp.focus();inp.select();}},100);
}
async function _balDoSave(){
  const today=new Date().toISOString().slice(0,10);
  const typeLabel={individual:'개인전',duo:'듀오전',team:'팀장전'};
  const defaultName=`${today} ${_balAttendees.length}명 ${typeLabel[_balType]||''}`;
  const name=document.getElementById('bal-save-title')?.value?.trim()||defaultName;
  document.getElementById('modal-bal-save')?.remove();
  let groupsData;
  if(_balType==='team'){
    groupsData={groups:[],knockout:[],rounds:[],
      teams:[
        {name:'A팀',captain:(_balResult.teamA.find(p=>p.captain)||{}).name||null,
         members:_balResult.teamA.map(p=>p.name),
         players:_balResult.teamA.map(p=>({name:p.name,score:p.score||0}))},
        {name:'B팀',captain:(_balResult.teamB.find(p=>p.captain)||{}).name||null,
         members:_balResult.teamB.map(p=>p.name),
         players:_balResult.teamB.map(p=>({name:p.name,score:p.score||0}))}
      ]};
  } else if(_balType==='duo'){
    groupsData={
      groups:(_balResult.teams||[]).map(t=>({
        name:t.name,
        teams:t.pairs.map(pair=>({p1_name:pair.p1?.name||'',p1_id:pair.p1?.id||null,p1_score:pair.p1?.score||0,p2_name:pair.p2?.name||'',p2_id:pair.p2?.id||null,p2_score:pair.p2?.score||0})),
        matches:[]
      })),
      knockout:[],rounds:[],teams:[]};
  } else {
    groupsData={groups:_balResult.groups,knockout:[],rounds:[],teams:[]};
  }
  const{error}=await sb.from('bracket_tournaments').insert({
    name,match_date:today,status:'balance',
    tournament_type:_balType,rounds:JSON.stringify([]),
    groups:JSON.stringify(groupsData),created_by:ME.id
  });
  if(error){toast('저장 실패: '+error.message,'error');return;}
  toast('✅ 저장 완료','success');
  balGoStep(1);
  balSwitchTab('history');
}


function toggleBulkImportForm(){
  if(ME?.role!=='admin'){toast('관리자만 사용 가능합니다','error');return;}
  const el=document.getElementById('bulk-import-inline');
  if(!el) return;
  if(el.style.display!=='none'){el.style.display='none';return;}
  el.style.display='block';
  // renderAdminTournamentImport 내용을 이 div에 렌더링
  _renderBulkImportUI(el);
}

function _renderBulkImportUI(container){
  container.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
    <div style="font-size:.88rem;font-weight:700;">📋 대회 경기 일괄 입력</div>
    <button onclick="document.getElementById('bulk-import-inline').style.display='none'" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:2px 6px;">✕</button>
  </div>
  <div style="font-size:.76rem;color:var(--text-muted);background:var(--bg2);border-radius:8px;padding:10px 12px;margin-bottom:10px;line-height:1.7;">
    엑셀에서 <b>탭 구분 텍스트</b>를 복사해서 붙여넣으세요.<br>
    <b>컬럼 순서:</b> 구분 · 날짜 · 선수A · 선수B · 점수1 · 점수2 · 선수C · 선수D · 단계 · 슬롯 · 라운드 · BYE<br>
    <b>구분:</b> 개인 / 듀오 / 팀전 &nbsp;|&nbsp; <b>단계:</b> 리그 / 8강 / 4강 / 결승 &nbsp;|&nbsp; <b>슬롯:</b> A조, E1~E4, F1~F2, T
  </div>
  <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
    <div style="font-size:.8rem;color:var(--text-muted);white-space:nowrap;">대회명</div>
    <input id="ti-name" class="form-input" placeholder="예) 새벽민턴 3월 오픈" style="flex:1;font-size:.82rem;padding:6px 10px;">
  </div>
  <textarea id="ti-raw" placeholder="여기에 엑셀 데이터를 붙여넣으세요..."
    style="width:100%;min-height:180px;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:.78rem;font-family:monospace;resize:vertical;"></textarea>
  <button onclick="tiParsePreview()" class="btn btn-primary" style="width:100%;margin-top:8px;margin-bottom:10px;">🔍 미리보기</button>
  <div id="ti-preview"></div>`;
}

function toggleBracketForm(){
  const el=document.getElementById('bracket-form-inline');
  if(!el) return;
  if(el.style.display!=='none'){el.style.display='none';return;}
  el.style.display='block';
  _bfAttendees=[];_bfType='individual';_bfStep=1;window._bfEditId=null;
  const today=new Date().toISOString().slice(0,10);
  const nameEl=document.getElementById('bf-auto-name');
  const dateEl=document.getElementById('bf-auto-date');
  if(nameEl) nameEl.value='';
  if(dateEl) dateEl.value=today;
  bfSetType('individual');
  _loadBfAttendees();
  bfGoStep(1);
}

async function _loadBfAttendees(){
  window._bfUsersMap={};
  window._bfAllUsers=[];
  // 정회원 로드
  const{data:users}=await sb.from('profiles').select('id,name').eq('status','approved').order('name');
  (users||[]).forEach(u=>{
    window._bfUsersMap[u.id]={id:u.id,name:u.name,score:1000,ci:1000};
    window._bfAllUsers.push({...u,isGuest:false});
  });
  // 비회원 로드 (게스트모드 제외)
  const guestModeNames=await _loadGuestModeNames();
  const memberNames=new Set((users||[]).map(u=>u.name));
  const{data:gMatches}=await sb.from('matches').select('a1_name,a2_name,b1_name,b2_name,a1_id,a2_id,b1_id,b2_id').eq('status','approved');
  const guestSet=new Set();
  (gMatches||[]).forEach(m=>{
    [{n:m.a1_name,id:m.a1_id},{n:m.a2_name,id:m.a2_id},{n:m.b1_name,id:m.b1_id},{n:m.b2_name,id:m.b2_id}]
    .forEach(p=>{if(p.n&&!p.id&&!memberNames.has(p.n)&&!guestModeNames.has(p.n)) guestSet.add(p.n);});
  });
  [...guestSet].sort().forEach(nm=>{
    window._bfAllUsers.push({id:'guest:'+nm,name:nm,isGuest:true,games:0,wins:0,losses:0});
  });
  _bfRenderAttendeeUI();
  // 밸런스 폼이 열려있으면 참석자 목록도 갱신
}

function _bfRenderAttendeeUI(){
  const wrap=document.getElementById('bf-attendee-list');
  if(!wrap) return;

  // 직접입력 줄
  let html=`<div style="display:flex;gap:6px;margin-bottom:8px;">
    <input id="bf-direct-input" class="form-input" placeholder="이름 직접 입력 후 Enter 또는 + 추가" style="flex:1;"
      onkeydown="if(event.key==='Enter')_bfAddGuest()">
    <button onclick="_bfAddGuest()" class="btn btn-ghost btn-sm" style="white-space:nowrap;">+ 추가</button>
  </div>`;

  // 등록된 선수 클릭 선택 (색상으로만 회원/비회원 구분: 파랑=회원, 주황=비회원)
  const allUsers=window._bfAllUsers||[];
  if(allUsers.length){
    html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">`;
    allUsers.forEach(u=>{
      const sel=_bfAttendees.some(a=>a.id===u.id);
      const isG=u.isGuest;
      html+=`<div data-uid="${u.id}" style="display:inline-flex;align-items:center;gap:3px;border-radius:20px;padding:4px 10px;cursor:pointer;font-size:.82rem;user-select:none;
        background:${sel?(isG?'rgba(255,152,0,.2)':'rgba(41,121,255,.2)'):'var(--bg3)'};
        border:1px solid ${sel?(isG?'rgba(255,152,0,.6)':'var(--primary)'):'var(--border)'};
        color:${sel?(isG?'#E65100':'var(--primary)'):'var(--text)'};">
        <span style="pointer-events:none;">${u.name}</span>
      </div>`;
    });
    html+=`</div>`;
  }

  // 현재 선택된 참석자 태그 (비회원 주황, 회원 파랑)
  if(_bfAttendees.length){
    html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;padding:6px 8px;background:var(--bg2);border-radius:8px;">`;
    _bfAttendees.forEach((a,i)=>{
      const isG=(window._bfAllUsers||[]).find(u=>u.id===a.id)?.isGuest;
      const bg=isG?'rgba(255,152,0,.15)':'rgba(41,121,255,.15)';
      const border=isG?'rgba(255,152,0,.6)':'var(--primary)';
      const col=isG?'#E65100':'var(--primary)';
      html+=`<div style="display:inline-flex;align-items:center;gap:3px;border-radius:20px;padding:3px 9px;background:${bg};border:1px solid ${border};color:${col};font-size:.8rem;">
        <span>${a.name}</span>
        <button onclick="_bfRemoveAttendee(${i})" style="background:none;border:none;color:${col};cursor:pointer;font-size:.85rem;padding:0 0 0 2px;line-height:1;">✕</button>
      </div>`;
    });
    html+=`</div>`;
  }

  wrap.innerHTML=html;
  // 클릭 이벤트
  wrap.onclick=function(e){
    const el=e.target.closest('[data-uid]');
    if(!el) return;
    _bfToggleDbUser(el.dataset.uid, el);
  };
  const cnt=document.getElementById('bf-attendee-count');
  if(cnt) cnt.textContent=`${_bfAttendees.length}명 선택됨`;
  if(_bfType==='team') _bfUpdateCaptainSelects();
}

function _bfToggleDbUser(id, el){
  const u=window._bfUsersMap?window._bfUsersMap[id]:null;
  const uAll=(window._bfAllUsers||[]).find(x=>x.id===id);
  const idx=_bfAttendees.findIndex(a=>a.id===id);
  if(idx>=0){
    _bfAttendees.splice(idx,1);
  } else {
    _bfAttendees.push({id,name:u?.name||uAll?.name||id,score:u?.score||0,isGuest:uAll?.isGuest||false});
  }
  _bfRenderAttendeeUI();
}

function _bfRemoveAttendee(i){
  _bfAttendees.splice(i,1);
  _bfRenderAttendeeUI();
}

function _bfAddGuest(){
  const input=document.getElementById('bf-direct-input');
  const name=input?input.value.trim():'';
  if(!name) return;
  if(_bfAttendees.some(a=>a.name===name)){toast('이미 추가된 이름입니다','error');return;}
  const gid='guest_'+Date.now();
  if(window._bfUsersMap) window._bfUsersMap[gid]={id:gid,name,score:0,wr:0};
  _bfAttendees.push({id:gid,name,score:0});
  if(input) input.value='';
  _bfRenderAttendeeUI();
}

function bfSetType(type){
  _bfType=type;
  ['individual','duo','team'].forEach(t=>{
    const btn=document.getElementById('bf-type-'+t);
    if(btn) btn.className='btn btn-sm '+(t===type?'btn-primary':'btn-ghost');
  });
  const desc={
    individual:'👤 개인전: 4~5명씩 조 편성 → 조별 풀리그 → 각 조 1·2위 본선 토너먼트',
    duo:'👥 듀오전: 고정 파트너 팀으로 조 편성 → 조별 풀리그 → 본선 토너먼트',
    team:'🚩 팀장전: 팀장 A/B가 각 팀원을 이끌고 1:1 매치 진행 → 승수(동률시 득실차)로 우승 결정'
  };
  const descEl=document.getElementById('bf-type-desc');
  if(descEl) descEl.textContent=desc[type]||'';
  // 팀장전은 참석자 선택 완료 후 보이도록 — 항상 숨김 처리 후 참석자 있을 때만 표시
  const captainSection=document.getElementById('bf-team-captain-section');
  if(captainSection){
    captainSection.style.display=(type==='team')?'block':'none';
    if(type==='team') _bfUpdateCaptainSelects();
  }
}

function bfToggleAttendee(id, el){
  _bfToggleDbUser(id, el);
}
function _bfUpdateCaptainSelects(){
  // 기존 선택값 보존
  const ca=document.getElementById('bf-captain-a');
  const cb=document.getElementById('bf-captain-b');
  const prevA=ca?.value||'';
  const prevB=cb?.value||'';
  const opts='<option value="">선택</option>'+_bfAttendees.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  if(ca){ ca.innerHTML=opts; if(prevA&&_bfAttendees.some(a=>a.id===prevA)) ca.value=prevA; }
  if(cb){ cb.innerHTML=opts; if(prevB&&_bfAttendees.some(a=>a.id===prevB)) cb.value=prevB; }
}


function _bfDuoBack(){
  if(_bfType!=='duo'){
    bfGoStep(1);
    return;
  }
  if(_bfStep===2){
    // 조편성 → 페어링으로 (참석자, 페어 유지)
    _bfStep=1.5;
    const s1=document.getElementById('bf-step1');
    const s2=document.getElementById('bf-step2');
    if(s1) s1.style.display='none';
    if(s2) s2.style.display='block';
    bfRenderDuoPairing(); // 기존 _bfDuoPairs 그대로 렌더
  } else {
    // 페어링 → 참석자로
    _bfStep=1;
    const s1=document.getElementById('bf-step1');
    const s2=document.getElementById('bf-step2');
    if(s1) s1.style.display='block';
    if(s2) s2.style.display='none';
  }
}

async function bfConfirmArrangement(){
  const arr=_bfArrangement;
  if(!arr){toast('배분 데이터가 없습니다','error');return;}
  const name=document.getElementById('bf-auto-name')?.value?.trim();
  const date=document.getElementById('bf-auto-date')?.value;
  if(!name){toast('대회명을 입력해주세요','error');return;}
  if(!date){toast('날짜를 선택해주세요','error');return;}

  let insertData={name,match_date:date,status:'league',tournament_type:_bfType,rounds:JSON.stringify([]),created_by:ME.id};

  if(_bfType==='team'){
    insertData.groups=JSON.stringify([{
      name:'팀전',
      teamA:arr.teamA,
      teamB:arr.teamB,
      matches:[],
      standings:{A:{wins:0,losses:0,diff:0},B:{wins:0,losses:0,diff:0}}
    }]);
  } else if(_bfType==='duo'){
    const badGroup=arr.groups.find(g=>g.teams.length<2);
    if(badGroup){toast(`${badGroup.name}이 2팀 미만입니다. 파트너 배정을 확인해주세요.`,'error');return;}
    insertData.groups=JSON.stringify(arr.groups);
  } else {
    const badGroup=arr.groups.find(g=>g.players.length<4);
    if(badGroup){toast(`${badGroup.name}이 4명 미만입니다. 조를 조정해주세요.`,'error');return;}
    insertData.groups=JSON.stringify(arr.groups);
  }

  let resultId;
  if(window._bfEditId){
    const{error}=await sb.from('bracket_tournaments').update(insertData).eq('id',window._bfEditId);
    if(error){toast('수정 실패: '+error.message,'error');return;}
    toast('✅ 대회 구성이 수정되었습니다!','success');
    resultId=window._bfEditId;
    window._bfEditId=null;
  } else {
    const{data,error}=await sb.from('bracket_tournaments').insert(insertData).select().single();
    if(error){toast('생성 실패: '+error.message,'error');return;}
    toast('✅ 대회 구성 확정!','success');
    resultId=data.id;
  }
  toggleBracketForm();
  renderBracketPage();
  setTimeout(()=>openBracketDetail(resultId),400);
}

function bfGoStep(step){
  const prevStep=_bfStep;
  _bfStep=step;
  const s1=document.getElementById('bf-step1');
  const s2=document.getElementById('bf-step2');
  if(!s1||!s2) return;
  s1.style.display=step===1?'block':'none';
  s2.style.display=step===2?'block':'none';
  // 스텝 인디케이터
  [1,2,3].forEach(i=>{
    const dot=document.getElementById('bf-dot-'+i);
    if(!dot) return;
    dot.classList.remove('active','done');
    if(i<step) dot.classList.add('done');
    else if(i===step) dot.classList.add('active');
  });
  [1,2].forEach(i=>{
    const line=document.getElementById('bf-line-'+i);
    if(line) line.classList.toggle('done', i<step);
  });
  // 듀오 페어링 단계(1.5)에서 넘어올 때는 bfRenderArrangement 호출 안 함 (bfNextStep에서 직접 호출)
  if(step===2 && prevStep!==1.5) bfRenderArrangement();
}

function bfNextStep(){
  if(_bfStep===1){
    const name=document.getElementById('bf-auto-name').value.trim();
    const date=document.getElementById('bf-auto-date').value;
    if(!name){toast('대회명 입력','error');return;}
    if(!date){toast('날짜 선택','error');return;}
    if(_bfAttendees.length<4){toast('참석자 4명 이상 선택','error');return;}
    if(_bfType==='duo'){
      // 듀오전은 파트너 페어링 단계(1.5)로 먼저 이동
      _bfStep=1.5;
      bfGoStep(2); // step2 패널 표시
      bfRenderDuoPairing(); // 페어링 UI 렌더
      return;
    }
    bfGoStep(2);
  } else if(_bfStep===1.5){
    // 듀오전: 페어링 완료 후 자동 조편성으로
    if(_bfDuoPairs.length<2){toast('팀을 2팀 이상 구성해주세요','error');return;}
    const pairedCount=_bfDuoPairs.reduce((s,p)=>s+(p.p2?2:1),0);
    if(pairedCount<_bfAttendees.length){
      toast(`미배정 선수 ${_bfAttendees.length-pairedCount}명이 있습니다. 모두 배정해주세요`,'error');return;
    }
    bfRenderArrangement();
    _bfStep=2;
  }
}

// ══════════════════
//  STEP 1.5: 듀오전 파트너 페어링
// ══════════════════
let _bfDuoPairs=[]; // [{p1:{id,name,score}, p2:{id,name,score}|null}]

function bfRenderDuoPairing(){
  _bfDuoPairs=[];
  _bfRenderDuoPairingUI();
}

function _bfRenderDuoPairingUI(){
  const wrap=document.getElementById('bf-arrange-wrap');
  if(!wrap) return;
  const allIds=new Set(_bfAttendees.map(a=>a.id));
  const paired=new Set(_bfDuoPairs.flatMap(p=>[p.p1.id, p.p2?.id].filter(Boolean)));
  const unpaired=_bfAttendees.filter(a=>!paired.has(a.id));

  // 각 팀 카드: 선수1/선수2 드롭다운으로 교체 가능
  const pairListHtml=_bfDuoPairs.map((p,i)=>{
    // 이 팀에서 선택 가능한 선수 = 미배정 + 현재 팀 선수
    const available=_bfAttendees.filter(a=>!paired.has(a.id)||a.id===p.p1.id||a.id===p.p2?.id);
    const optsP1=available.map(a=>`<option value="${a.id}"${a.id===p.p1.id?' selected':''}>${a.name}</option>`).join('');
    const optsP2=`<option value=""${!p.p2?' selected':''}>없음(단독)</option>`+available.map(a=>`<option value="${a.id}"${a.id===p.p2?.id?' selected':''}>${a.name}</option>`).join('');
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:.75rem;color:var(--text-muted);min-width:32px;font-weight:600;">팀${i+1}</span>
        <select onchange="bfChangePairMember(${i},'p1',this.value)" class="form-select" style="flex:1;font-size:.82rem;padding:4px 8px;">${optsP1}</select>
        <span style="font-size:.78rem;color:var(--text-muted);">/</span>
        <select onchange="bfChangePairMember(${i},'p2',this.value)" class="form-select" style="flex:1;font-size:.82rem;padding:4px 8px;">${optsP2}</select>
        <button onclick="bfRemovePair(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:0 4px;flex-shrink:0;">✕</button>
      </div>
    </div>`;
  }).join('');

  const opts=unpaired.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  wrap.innerHTML=`
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">
      👥 파트너를 2명씩 묶어주세요. 이미 만든 팀은 드롭다운으로 선수 교체 가능합니다.
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;" id="duo-pair-list">
      ${pairListHtml||'<div style="font-size:.8rem;color:var(--text-muted);padding:8px;">아직 페어가 없습니다.</div>'}
    </div>
    ${unpaired.length>0?`
    <div style="display:flex;gap:8px;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px;">
      <select id="duo-sel-p1" class="form-select" style="flex:1;">
        <option value="">선수1 *</option>${opts}
      </select>
      <select id="duo-sel-p2" class="form-select" style="flex:1;">
        <option value="">파트너 (없으면 단독)</option>${opts}
      </select>
      <button class="btn btn-primary btn-sm" onclick="bfAddPair()" style="white-space:nowrap;">+ 추가</button>
    </div>`:''}
    <div style="font-size:.75rem;color:var(--text-muted);margin-top:8px;">
      미배정: ${unpaired.length}명 남음 · 총 ${_bfDuoPairs.length}팀 구성됨
    </div>`;
}

function bfChangePairMember(pairIdx, slot, newId){
  const pair=_bfDuoPairs[pairIdx];
  if(!pair) return;
  // 중복 체크: 다른 팀에서 이미 쓰고 있으면 swap
  if(newId){
    for(let i=0;i<_bfDuoPairs.length;i++){
      if(i===pairIdx) continue;
      const op=_bfDuoPairs[i];
      if(op.p1.id===newId){ const old=slot==='p1'?pair.p1:pair.p2; op.p1=old||{id:'',name:''}; break; }
      if(op.p2?.id===newId){ const old=slot==='p1'?pair.p1:pair.p2; op.p2=old; break; }
    }
    if(slot==='p2'&&pair.p1.id===newId){toast('선수1과 같은 선수입니다','error');return;}
    if(slot==='p1'&&pair.p2?.id===newId){toast('파트너와 같은 선수입니다','error');return;}
  }
  const person=newId?_bfAttendees.find(a=>a.id===newId):null;
  if(slot==='p1'){
    if(!person){toast('선수를 찾을 수 없습니다','error');return;}
    pair.p1=person;
  } else {
    pair.p2=person||null;
  }
  _bfRenderDuoPairingUI();
}

function bfAddPair(){
  const id1=document.getElementById('duo-sel-p1')?.value;
  const id2=document.getElementById('duo-sel-p2')?.value;
  if(!id1){toast('선수1을 선택해주세요','error');return;}
  if(id1===id2){toast('같은 선수를 선택했습니다','error');return;}
  const p1=_bfAttendees.find(a=>a.id===id1);
  const p2=id2?_bfAttendees.find(a=>a.id===id2):null;
  if(!p1){toast('선수 정보 오류','error');return;}
  _bfDuoPairs.push({p1,p2});
  _bfRenderDuoPairingUI();
}

function bfRemovePair(i){
  _bfDuoPairs.splice(i,1);
  _bfRenderDuoPairingUI();
}

// ══════════════════
//  STEP 2: 배분 추천 & 수정
// ══════════════════
let _bfArrangement=null; // {groups:[{name,players/teams,matches,standings}]}

function bfRenderArrangement(){
  const wrap=document.getElementById('bf-arrange-wrap');
  if(!wrap) return;

  // 팀장전: step2 팀장 섹션 표시 및 셀렉트 동기화
  const step2Cap=document.getElementById('bf-step2-captain-section');
  if(step2Cap) step2Cap.style.display=(_bfType==='team')?'block':'none';
  if(_bfType==='team'){
    // step1 팀장값 → step2 셀렉트로 동기화 (또는 기존 배분의 팀장 유지)
    const capA1=document.getElementById('bf-captain-a')?.value||_bfArrangement?.teamA?.find(p=>p.captain)?.id||'';
    const capB1=document.getElementById('bf-captain-b')?.value||_bfArrangement?.teamB?.find(p=>p.captain)?.id||'';
    const opts='<option value="">선택</option>'+_bfAttendees.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
    const ca2=document.getElementById('bf-captain-a2');
    const cb2=document.getElementById('bf-captain-b2');
    if(ca2){ca2.innerHTML=opts; if(capA1) ca2.value=capA1;}
    if(cb2){cb2.innerHTML=opts; if(capB1) cb2.value=capB1;}
    // step2 셀렉트값을 step1으로도 반영
    if(ca2?.value&&document.getElementById('bf-captain-a')) document.getElementById('bf-captain-a').value=ca2.value;
    if(cb2?.value&&document.getElementById('bf-captain-b')) document.getElementById('bf-captain-b').value=cb2.value;
  }

  if(_bfType==='individual'){
    _bfArrangement=_bfAutoArrange();
  } else if(_bfType==='duo'){
    // 듀오 자동배분: _bfDuoPairs가 있으면 그걸 기반으로, 없으면 전체 참석자로 자동 페어링 후 배분
    if(!_bfDuoPairs||_bfDuoPairs.length<2){
      // 참석자 전체를 자동 페어링
      _bfDuoPairs=[];
      const sorted=[..._bfAttendees].sort((a,b)=>b.score-a.score);
      for(let i=0;i<sorted.length-1;i+=2){
        _bfDuoPairs.push({p1:sorted[i],p2:sorted[i+1]||null});
      }
      if(sorted.length%2===1) _bfDuoPairs.push({p1:sorted[sorted.length-1],p2:null});
    }
    _bfArrangement=_bfDuoArrange();
  } else {
    _bfArrangement=_bfTeamArrange();
  }
  _bfRenderArrangeUI(wrap);
}

function _bfAutoArrange(){
  // 실력순 뱀배열
  const sorted=[..._bfAttendees].sort((a,b)=>b.score-a.score);
  const n=sorted.length;
  const groupCount=_calcGroupCount(n);
  const groups=Array.from({length:groupCount},(_,gi)=>({
    name:`${String.fromCharCode(65+gi)}조`,
    players:[],matches:[],standings:[]
  }));
  sorted.forEach((p,i)=>{
    const row=Math.floor(i/groupCount);
    const col=i%groupCount;
    const gi=row%2===0?col:groupCount-1-col;
    groups[gi].players.push({...p});
  });
  groups.forEach(g=>{
    g.matches=[];
    for(let i=0;i<g.players.length;i++)
      for(let j=i+1;j<g.players.length;j++)
        g.matches.push({p1:g.players[i],p2:g.players[j],s1:'',s2:'',done:false});
  });
  return {groups};
}

function _bfDuoArrange(){
  // 듀오전: _bfDuoPairs를 실력순 뱀배열로 조편성
  const avgScore=p=>((p.p1.score||0)+(p.p2?p.p2.score||0:0))/(p.p2?2:1);
  const sorted=[..._bfDuoPairs].sort((a,b)=>avgScore(b)-avgScore(a));
  const n=sorted.length;
  const groupCount=_calcGroupCount(n);
  const groups=Array.from({length:groupCount},(_,gi)=>({
    name:`${String.fromCharCode(65+gi)}조`,
    teams:[],matches:[],standings:[]
  }));
  sorted.forEach((pair,i)=>{
    const row=Math.floor(i/groupCount);
    const col=i%groupCount;
    const gi=row%2===0?col:groupCount-1-col;
    groups[gi].teams.push({
      p1_id:pair.p1.id,p1_name:pair.p1.name,
      p2_id:pair.p2?.id||null,p2_name:pair.p2?.name||null
    });
  });
  groups.forEach(g=>{
    g.matches=[];
    for(let i=0;i<g.teams.length;i++)
      for(let j=i+1;j<g.teams.length;j++)
        g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});
  });
  return {groups};
}

function _bfRenderTeamArrangeUI(wrap){
  const {teamA,teamB}=_bfArrangement;
  const renderMember=(p,team,idx)=>{
    const isCap=p.captain;
    const arrow=team==='A'?'→':'←';
    const btnColor=team==='A'?'var(--danger)':'var(--info)';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;display:flex;align-items:center;gap:6px;">
      <span style="font-size:.82rem;${isCap?'color:var(--primary);font-weight:700;':''}flex:1;">${isCap?'⭐':''} ${p.name}</span>
      ${isCap
        ?`<span style="font-size:.72rem;color:var(--primary);padding:2px 6px;">팀장</span>`
        :`<button onclick="bfTeamMoveBtn('${team}',${idx})" style="font-size:.78rem;padding:3px 10px;border:none;border-radius:6px;cursor:pointer;background:${btnColor};color:#fff;font-weight:700;">${arrow}</button>`
      }
    </div>`;
  };
  let html=`<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">🤖 실력 균형을 고려해 배분했습니다. → / ← 버튼으로 선수를 이동할 수 있습니다.</div>`;
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">`;
  html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
    <div style="font-weight:700;font-size:.85rem;color:var(--info);margin-bottom:8px;">🔵 A팀 <span style="font-weight:400;font-size:.75rem;color:var(--text-muted);">(${teamA.length}명)</span></div>
    <div style="display:flex;flex-direction:column;gap:5px;">${teamA.map((p,i)=>renderMember(p,'A',i)).join('')}</div>
  </div>`;
  html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
    <div style="font-weight:700;font-size:.85rem;color:var(--danger);margin-bottom:8px;">🔴 B팀 <span style="font-weight:400;font-size:.75rem;color:var(--text-muted);">(${teamB.length}명)</span></div>
    <div style="display:flex;flex-direction:column;gap:5px;">${teamB.map((p,i)=>renderMember(p,'B',i)).join('')}</div>
  </div>`;
  html+=`</div>`;
  wrap.innerHTML=html;
}

function bfTeamMoveBtn(fromTeam,fromIdx){
  const teamA=_bfArrangement.teamA, teamB=_bfArrangement.teamB;
  const fromList=fromTeam==='A'?teamA:teamB;
  const toList=fromTeam==='A'?teamB:teamA;
  const [moved]=fromList.splice(fromIdx,1);
  toList.push(moved);
  _bfRenderTeamArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function _bfTeamArrange(){
  // 팀전: 팀장 A/B 지정 후 뱀배열로 인원 균형 분배
  // step2 셀렉트 우선, 없으면 step1, 없으면 기존 배분에서 유지
  let capAid=document.getElementById('bf-captain-a2')?.value
    || document.getElementById('bf-captain-a')?.value
    || _bfArrangement?.teamA?.find(p=>p.captain)?.id||'';
  let capBid=document.getElementById('bf-captain-b2')?.value
    || document.getElementById('bf-captain-b')?.value
    || _bfArrangement?.teamB?.find(p=>p.captain)?.id||'';
  const teamA=[],teamB=[];
  const others=[..._bfAttendees].filter(a=>a.id!==capAid&&a.id!==capBid).sort((a,b)=>b.score-a.score);
  const capA=_bfAttendees.find(a=>a.id===capAid);
  const capB=_bfAttendees.find(a=>a.id===capBid);
  if(capA) teamA.push({...capA,captain:true});
  if(capB) teamB.push({...capB,captain:true});
  // 뱀배열: 인원 수 균형 최우선
  others.forEach((p,i)=>{
    if(teamA.length<=teamB.length) teamA.push(p); else teamB.push(p);
  });
  // 팀장 없는 경우 fallback
  if(!capA&&!capB){
    teamA.length=0; teamB.length=0;
    others.forEach((p,i)=>{ if(i%2===0) teamA.push(p); else teamB.push(p); });
  }
  return {teamA, teamB, matches:[], standings:{A:{wins:0,losses:0,diff:0},B:{wins:0,losses:0,diff:0}}};
}

function _bfRenderArrangeUI(wrap){
  if(_bfType==='team'){
    _bfRenderTeamArrangeUI(wrap);
    return;
  }
  if(_bfType==='duo'){
    _bfRenderDuoArrangeUI(wrap);
    return;
  }
  // 개인전 조편성 - 이름 클릭 시 조 이동 팝업
  const {groups}=_bfArrangement;
  let html=`<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">
    🤖 실력 균형을 고려해 자동 배분했습니다. 🔀 버튼으로 다른 조로 이동할 수 있습니다.
  </div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:10px;" id="bf-groups-wrap">`;
  groups.forEach((g,gi)=>{
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
      <div style="font-weight:700;font-size:.85rem;color:var(--primary);margin-bottom:8px;">${g.name} (${g.players.length}명)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;" id="bf-group-players-${gi}">`;
    g.players.forEach((p,pi)=>{
      const otherGroups=groups.map((og,ogi)=>({og,ogi})).filter(({ogi})=>ogi!==gi);
      const menuItems=otherGroups.map(({og,ogi})=>`<div onclick="bfMovePlayerToGroup(${gi},${pi},${ogi});this.closest('.bf-move-popup').style.display='none'" style="padding:8px 14px;font-size:.8rem;cursor:pointer;color:var(--text);white-space:nowrap;" onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">${og.name}으로 이동</div>`).join('');
      html+=`<div style="position:relative;display:inline-flex;align-items:center;gap:3px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:.82rem;">
        <span style="cursor:default;">${p.name}</span>
        <button onclick="bfToggleMovePopup(this)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.9rem;padding:0 1px;line-height:1;flex-shrink:0;">🔀</button>
        <div class="bf-move-popup" style="display:none;position:absolute;z-index:300;left:0;top:110%;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);overflow:hidden;min-width:130px;">
          <div style="padding:6px 14px;font-size:.75rem;color:var(--text-muted);border-bottom:1px solid var(--border);">${p.name} 이동</div>
          ${menuItems}
        </div>
      </div>`;
    });
    html+=`</div></div>`;
  });
  html+=`</div>`;
  wrap.innerHTML=html;
  // 외부 클릭시 팝업 닫기
  setTimeout(()=>{
    document.addEventListener('click', function _bfClosePopup(e){
      if(!e.target.closest('.bf-move-popup')&&!e.target.matches('button[onclick*="bfToggleMovePopup"]')){
        document.querySelectorAll('.bf-move-popup').forEach(m=>m.style.display='none');
        document.removeEventListener('click',_bfClosePopup);
      }
    });
  },100);
}

function bfToggleMovePopup(btn){
  const popup=btn.nextElementSibling;
  const isOpen=popup.style.display!=='none';
  document.querySelectorAll('.bf-move-popup').forEach(m=>m.style.display='none');
  if(!isOpen) popup.style.display='block';
}

function bfMovePlayerToGroup(fromGi,pi,toGi){
  const player=_bfArrangement.groups[fromGi].players.splice(pi,1)[0];
  _bfArrangement.groups[toGi].players.push(player);
  // 경기 재계산
  _bfArrangement.groups.forEach(g=>{
    g.matches=[];
    for(let i=0;i<g.players.length;i++)
      for(let j=i+1;j<g.players.length;j++)
        g.matches.push({p1:g.players[i],p2:g.players[j],s1:'',s2:'',done:false});
  });
  _bfRenderArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function _bfRenderDuoArrangeUI(wrap){
  const {groups}=_bfArrangement;
  // 전체 참석자 목록 (선수 선택용)
  const allAttendees=_bfAttendees||[];
  // 전체 팀 목록 (교체 팝업용)
  const allTeams=[];
  groups.forEach((g,gi)=>g.teams.forEach((t,ti)=>allTeams.push({gi,ti,label:t.p2_name?`${t.p1_name}/${t.p2_name}`:t.p1_name,gname:g.name})));
  let html=`<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">
    🤖 팀 실력 균형을 고려해 자동 배분했습니다. 이름 클릭 시 다른 팀과 위치 교체할 수 있습니다.
  </div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:10px;">`;
  groups.forEach((g,gi)=>{
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
      <div style="font-weight:700;font-size:.85rem;color:var(--primary);margin-bottom:8px;">${g.name} <span style="font-weight:400;font-size:.75rem;color:var(--text-muted);">(${g.teams.length}팀)</span></div>
      <div style="display:flex;flex-direction:column;gap:5px;">`;
    g.teams.forEach((t,ti)=>{
      const teamLabel=t.p2_name?`${t.p1_name} / ${t.p2_name}`:t.p1_name;
      const otherTeams=allTeams.filter(x=>!(x.gi===gi&&x.ti===ti));
      const swapItems=otherTeams.map(x=>`<div onclick="bfDuoSwapTeams(${gi},${ti},${x.gi},${x.ti});this.closest('.bf-duo-swap-popup').style.display='none'" style="padding:8px 14px;font-size:.8rem;cursor:pointer;color:var(--text);white-space:nowrap;" onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">${x.label} <span style="color:var(--text-muted);font-size:.75rem;">(${x.gname})</span></div>`).join('');
      html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:.75rem;color:var(--text-muted);flex-shrink:0;">👥</span>
        <div style="position:relative;flex:1;min-width:0;">
          <button onclick="bfToggleDuoSwapPopup(this)" style="background:none;border:none;cursor:pointer;font-size:.83rem;color:var(--text);padding:2px 4px;border-radius:5px;width:100%;text-align:left;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="클릭해서 교체">
            ${teamLabel} <span style="font-size:.7rem;color:var(--text-muted);">↔</span>
          </button>
          <div class="bf-duo-swap-popup" style="display:none;position:absolute;z-index:300;left:0;top:110%;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);overflow:hidden;min-width:160px;max-height:200px;overflow-y:auto;">
            <div style="padding:6px 14px;font-size:.75rem;color:var(--text-muted);border-bottom:1px solid var(--border);">누구와 교체하시겠습니까?</div>
            ${swapItems||'<div style="padding:8px 14px;font-size:.8rem;color:var(--text-muted);">다른 팀이 없습니다</div>'}
          </div>
        </div>
      </div>`;
    });
    html+=`</div></div>`;
  });
  html+=`</div>`;
  wrap.innerHTML=html;
  setTimeout(()=>{
    document.addEventListener('click', function _bfDuoClosePopup(e){
      if(!e.target.closest('.bf-duo-swap-popup')&&!e.target.matches('button[onclick*="bfToggleDuoSwapPopup"]')){
        document.querySelectorAll('.bf-duo-swap-popup').forEach(m=>m.style.display='none');
        document.removeEventListener('click',_bfDuoClosePopup);
      }
    });
  },100);
}

function bfToggleDuoSwapPopup(btn){
  const popup=btn.nextElementSibling;
  const isOpen=popup.style.display!=='none';
  document.querySelectorAll('.bf-duo-swap-popup,.bf-move-popup').forEach(m=>m.style.display='none');
  if(!isOpen) popup.style.display='block';
}

function bfDuoSwapTeams(gi1,ti1,gi2,ti2){
  const g1=_bfArrangement.groups[gi1],g2=_bfArrangement.groups[gi2];
  [g1.teams[ti1],g2.teams[ti2]]=[g2.teams[ti2],g1.teams[ti1]];
  _bfArrangement.groups.forEach(g=>{g.matches=[];for(let i=0;i<g.teams.length;i++)for(let j=i+1;j<g.teams.length;j++)g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});});
  _bfRenderDuoArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function bfDuoChangePlayer(gi,ti,slot,newId){
  const groups=_bfArrangement.groups;
  const team=groups[gi].teams[ti];
  const person=newId?_bfAttendees.find(a=>a.id===newId):null;
  if(slot==='p1'&&newId&&newId===team.p2_id){toast('파트너와 같은 선수입니다','error');return;}
  if(slot==='p2'&&newId&&newId===team.p1_id){toast('선수1과 같은 선수입니다','error');return;}
  if(newId){
    for(let ggi=0;ggi<groups.length;ggi++){
      for(let tti=0;tti<groups[ggi].teams.length;tti++){
        if(ggi===gi&&tti===ti) continue;
        const ot=groups[ggi].teams[tti];
        if(ot.p1_id===newId){
          const oldId=slot==='p1'?team.p1_id:team.p2_id;
          const oldName=slot==='p1'?team.p1_name:team.p2_name;
          ot.p1_id=oldId||null; ot.p1_name=oldName||'';
          break;
        } else if(ot.p2_id===newId){
          const oldId=slot==='p1'?team.p1_id:team.p2_id;
          const oldName=slot==='p1'?team.p1_name:team.p2_name;
          ot.p2_id=oldId||null; ot.p2_name=oldName||'';
          break;
        }
      }
    }
  }
  if(slot==='p1'){team.p1_id=person?.id||null; team.p1_name=person?.name||'';}
  else{team.p2_id=person?.id||null; team.p2_name=person?.name||null;}
  groups.forEach(g=>{g.matches=[];for(let i=0;i<g.teams.length;i++)for(let j=i+1;j<g.teams.length;j++)g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});});
  _bfRenderDuoArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function bfDuoSwapWithOther(sel,gi,ti){
  const val=sel.value;if(!val) return;
  const [gi2,ti2]=val.split('_').map(Number);
  bfDuoSwapTeams(gi,ti,gi2,ti2);
}

function bfDuoRemoveTeam(gi,ti){
  _bfArrangement.groups[gi].teams.splice(ti,1);
  _bfArrangement.groups.forEach(g=>{g.matches=[];for(let i=0;i<g.teams.length;i++)for(let j=i+1;j<g.teams.length;j++)g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});});
  _bfRenderDuoArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function bfDuoMoveTeam(sel,fromGi,ti){
  const toGi=parseInt(sel.value);if(isNaN(toGi)) return;
  const team=_bfArrangement.groups[fromGi].teams.splice(ti,1)[0];
  _bfArrangement.groups[toGi].teams.push(team);
  _bfArrangement.groups.forEach(g=>{g.matches=[];for(let i=0;i<g.teams.length;i++)for(let j=i+1;j<g.teams.length;j++)g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});});
  _bfRenderDuoArrangeUI(document.getElementById('bf-arrange-wrap'));
}

