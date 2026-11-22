/* ══════════════════════════════════════════════════
   📈 시즌2 상승률 TOP 10 — 소식 탭 상단 고정 카드
   시즌 마감 기준의 스냅샷이라 값을 박아 둔다. 다음 시즌에 갱신하려면
   양 시즌 CI를 다시 뽑아 RISE_TOP10만 갈아끼우면 된다.
   행: [이름, 시즌1 CI, 시즌2 CI, 시즌1 랭킹, 시즌2 랭킹, 시즌1 경기, 시즌2 경기, 상승률(%)]
   기준: 승인 경기만 · 양 시즌 20경기 이상(해당 21명) 중 상위 10명
         시즌1 2026-04-02~06-30 / 시즌2 2026-07-01~09-27
   ⚠️ 가산점 상한이 시즌1 30점·시즌2 50점으로 달라, 30경기 이상 뛴 사람은
      규칙 변경만으로 최대 20점을 얻는다(각주에 밝혀 둔다). */
const RISE_TOP10 = [
  ['류현준',1076,1177,25, 1,24,71,9.4],
  ['김두범',1085,1138,20, 7,20,36,4.9],
  ['안치영',1075,1123,26,16,38,38,4.5],
  ['김동규',1047,1081,37,31,26,30,3.2],
  ['강민주',1100,1132,13,12,29,53,2.9],
  ['고영인',1070,1096,28,25,21,21,2.4],
  ['김선구',1127,1151, 6, 5,56,65,2.1],
  ['김종호',1092,1110,17,19,30,44,1.6],
  ['강창원',1057,1071,32,37,45,47,1.3],
  ['이영배',1125,1134, 8,11,36,77,0.8],
];
/* 1~3위만 메달색, 나머지는 차분하게 */
const RISE_CHIP = [
  ['rgba(255,213,79,.16)','#FFD54F'],
  ['rgba(176,190,197,.16)','#B0BEC5'],
  ['rgba(255,171,145,.16)','#FFAB91'],
];

function riseBlockHTML(){
  // 일반 성격의 내용이라 '전체'와 '일반' 탭에서만 보인다
  return ''; // 2026-11-15 내림: 시즌2 기준 오래된 글 (사용자 요청). 다시 쓰려면 이 줄 삭제
  if(commTab!=='all' && commTab!=='general') return '';
  return `<div class="rise-card">
    <div class="rise-head">
      <div class="rise-title"><svg class="ic" aria-hidden="true"><use href="#i-trend"/></svg>시즌2 상승률 TOP 10 <span class="rise-tag">20경기 이상</span></div>
      <div class="rise-sub">시즌1 대비 종합점수(CI)가 가장 많이 오른 순서 · 괄호는 그 시즌 랭킹</div>
    </div>
    <div class="rise-grid">
      <div class="rise-hrow">
        <span>#</span><span class="l">이름</span><span>시즌1</span><span>시즌2</span><span>증감</span><span>상승률</span>
      </div>
      ${riseRowsHTML()}
    </div>
  </div>`;
}

/* 별도 페이지(시즌 상승률 표)와 같은 6열 구조 — 값 아래 괄호로 순위를 붙인다 */
function riseRowsHTML(){
  return RISE_TOP10.map((r,i)=>{
    const [bg,fg] = RISE_CHIP[i] || ['rgba(255,255,255,.05)','#7B8A9C'];
    const d  = r[2]-r[1];
    const mv = r[3]-r[4];
    const mvTxt = mv>0?'▲'+mv : mv<0?'▼'+Math.abs(mv) : '–';
    const mvCol = mv>0?'var(--accent)' : mv<0?'var(--danger)' : 'var(--text-dim)';
    const dCol  = d>0?'var(--accent)'  : d<0?'var(--danger)'  : 'var(--text-dim)';
    return `<div class="rise-row">
      <span class="rise-rk" style="background:${bg};color:${fg};">${i+1}</span>
      <span class="rise-cell l"><b>${escHtml(r[0])}</b><i>${r[5]}→${r[6]}경기</i></span>
      <span class="rise-cell"><b class="dim">${r[1]}</b><i>(${r[3]}위)</i></span>
      <span class="rise-cell"><b>${r[2]}</b><i>(${r[4]}위)</i></span>
      <span class="rise-cell"><b style="color:${dCol}">${d>0?'+':''}${d}</b><i style="color:${mvCol}">(${mvTxt})</i></span>
      <span class="rise-pct">+${r[7]}%</span>
    </div>`;
  }).join('');
}

/* 소식탭 (2026-11-15 속도 개선): 지난번 목록을 먼저 그리고 뒤에서 새로 받아 바뀐 경우만 다시 그린다.
   권한 재확인·글·프로필 사진은 동시에 요청하고, 시상 전적은 홈이 받아 둔 전체 경기 캐시로 먼저 계산한다 */
window._commCache=window._commCache||{};
function _commButtons(){
  const w=document.getElementById('btn-comm-write');
  if(w) w.style.display=(ME.role==='admin'||ME.role==='writer')?'':'none';
  const a=document.getElementById('btn-comm-award');
  if(a) a.style.display=ME.role==='admin'?'':'none';
}
function _awardRecFill(dates,ms){
  window._awardRec=window._awardRec||{};
  dates.forEach(d=>window._awardRec[d]={});
  (ms||[]).forEach(m=>{
    const R=window._awardRec[m.match_date]; if(!R) return;
    const aWin=(+m.score_a||0)>(+m.score_b||0);
    [[m.a1_name,true],[m.a2_name,true],[m.b1_name,false],[m.b2_name,false]].forEach(([n,onA])=>{
      if(!n) return;
      const r=R[n]||(R[n]={w:0,l:0,d:0});
      (onA===aWin)?r.w++:r.l++;
      r.d+=onA?(+m.score_a||0)-(+m.score_b||0):(+m.score_b||0)-(+m.score_a||0);
    });
  });
}
function _commPaint(el,posts){
  if(!posts||!posts.length){
    el.innerHTML=riseBlockHTML()+`<div class="empty-state"><div class="empty-icon"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg></div><div>아직 게시글이 없어요<br><span style="font-size:.82rem;">첫 글을 남겨보세요!</span></div></div>`;
    return;
  }
  // 시상 글은 가장 최근 날짜 1개만 펼치고 나머지는 접는다
  const _aw=posts.filter(p=>p.category==='award');
  window._awardLatestId=_aw.length?_aw.reduce((m,p)=>((_awardParse(p).date||p.created_at)>(_awardParse(m).date||m.created_at)?p:m)).id:null;
  const _tm=posts.filter(p=>p.category==='team');
  window._teamLatestId=_tm.length?_tm.reduce((m,p)=>(p.created_at>m.created_at?p:m)).id:null;
  el.innerHTML=riseBlockHTML()+posts.map(p=>commPostHTML(p)).join('');
}
async function renderCommunityPage(){
  markCommSeen();
  _commButtons();
  const el=document.getElementById('community-list');
  if(!el) return;
  const tab=commTab;
  const cached=window._commCache[tab];
  if(cached) _commPaint(el,cached);
  else el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);

  let q=sb.from('community_posts').select('*').order('created_at',{ascending:false});
  if(tab!=='all') q=q.eq('category',tab);
  const [roleRes,postRes,avRes]=await Promise.all([
    sb.from('profiles').select('role').eq('id',ME.id).single(),          // 관리자가 권한을 바꿨을 수 있어 재확인
    q,
    window._awardAvatars?Promise.resolve(null):sb.from('profiles').select('name,avatar_url').eq('status','approved'),
  ]);
  if(roleRes?.data&&roleRes.data.role!==ME.role){ME.role=roleRes.data.role;_commButtons();}
  if(avRes){window._awardAvatars={};(avRes.data||[]).forEach(u=>{if(u.avatar_url) window._awardAvatars[u.name]=u.avatar_url;});}
  if(commTab!==tab) return;   // 그 사이 다른 탭으로 바뀜
  const{data:posts,error}=postRes;
  if(error){
    if(!cached) el.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg></div><div>불러오기 실패<br><span style="font-size:.78rem;color:var(--text-muted);">잠시 후 다시 시도해 주세요</span></div></div>`;
    return;
  }
  // 시상 날짜별 그날 전적: 홈이 받아 둔 전체 경기 캐시가 있으면 쿼리 없이 계산
  const dates=[...new Set((posts||[]).filter(p=>p.category==='award').map(p=>_awardParse(p).date).filter(Boolean))];
  const need=dates.filter(d=>!(window._awardRec||{})[d]);
  if(need.length){
    const all=window._allMatchesCache||[];
    if(all.length&&need.every(d=>all.some(m=>m.match_date===d))){
      _awardRecFill(need,all.filter(m=>m.status==='approved'&&need.includes(m.match_date)));
    }else{
      const{data:ms}=await sb.from('matches').select('match_date,a1_name,a2_name,b1_name,b2_name,score_a,score_b').in('match_date',need).eq('status','approved');
      _awardRecFill(need,ms);
    }
  }
  if(commTab!==tab) return;
  const same=cached&&JSON.stringify(cached)===JSON.stringify(posts||[])&&!avRes&&!need.length;
  window._commCache[tab]=posts||[];
  if(!same) _commPaint(el,posts||[]);   // 같으면 다시 그리지 않음 (펼친 카드 유지)
}

const _catLabel={'general':'일반','info':'정보','rules':'규칙','award':'시상','team':'팀전'};
const _catColor={'general':'var(--primary)','info':'var(--info)','rules':'var(--accent)','award':'var(--text-muted)'};

function commPostHTML(p){
  if(p.category==='award') return awardPostHTML(p);
  if(p.category==='team') return teamPostHTML(p);
  const isAdmin=ME.role==='admin';
  const isMyPost=p.author_id===ME?.id&&(ME?.role==='writer'||ME?.role==='admin');
  const canEdit=isAdmin||isMyPost;
  const dateStr=fmtDate(p.created_at);
  const label=_catLabel[p.category]||p.category;
  const isLight=document.body.classList.contains('light-mode');
  const rawColor=_catColor[p.category]||'var(--text-muted)';
  const color=(isLight&&p.category==='rules')?'#5C6BC0':rawColor;
  return `<div class="comm-post" id="post-${p.id}" onclick="togglePost('${p.id}')">
    <div class="comm-post-header">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
        <span style="font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;border:1px solid ${color};color:${color};background:${color}18;flex-shrink:0;">${label}</span>
        <span class="comm-post-title">${escHtml(p.title)}</span>
      </div>
      <div class="comm-post-meta">
        <span style="font-size:.7rem;color:var(--text-dim);">📅 ${dateStr}</span>
        ${canEdit?`<button onclick="event.stopPropagation();editPost('${p.id}')" style="background:none;border:none;color:var(--text-muted);font-size:.78rem;cursor:pointer;padding:0 4px;" aria-label="수정"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button>
        <button onclick="event.stopPropagation();deletePost('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:.78rem;cursor:pointer;padding:0 4px;" aria-label="삭제"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg></button>`:''}
      </div>
    </div>
    <div class="comm-post-body"><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);">✍ ${escHtml(p.author_name||'익명')}</div>${escHtml(p.body)}
    </div>
  </div>`;
}

function togglePost(id){
  const el=document.getElementById('post-'+id);
  if(el) el.classList.toggle('open');
}

function switchCommTab(tab){
  commTab=tab;
  document.querySelectorAll('#comm-tabs .sub-tab').forEach((el,i)=>el.classList.toggle('active',['all','general','info','rules','award'][i]===tab));
  renderCommunityPage();
}

let _postCat = 'general';
function selectPostCat(cat){
  _postCat=cat;
  ['general','info','rules'].forEach(c=>document.getElementById('pcat-'+c)?.classList.toggle('active',c===cat));
}

function openPostForm(editId=null){
  document.getElementById('post-edit-id').value=editId||'';
  document.getElementById('post-form-title').innerHTML=editId?'<svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>글 수정':'<svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>글쓰기';
  document.getElementById('post-title').value='';
  document.getElementById('post-body').value='';
  // 기본 카테고리: 현재 탭 (all이면 general)
  const defaultCat=(commTab==='all'||!commTab)?'general':commTab;
  selectPostCat(defaultCat);
  openModal('modal-post-form');
}

async function editPost(id){
  const{data:p}=await sb.from('community_posts').select('*').eq('id',id).single();
  if(!p) return;
  if(p.category==='award'){openAwardForm(p);return;}
  document.getElementById('post-edit-id').value=id;
  document.getElementById('post-form-title').innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>글 수정';
  document.getElementById('post-title').value=p.title;
  document.getElementById('post-body').value=p.body;
  selectPostCat(p.category||'general');
  openModal('modal-post-form');
}

async function submitPost(){
  const editId=document.getElementById('post-edit-id').value;
  const title=document.getElementById('post-title').value.trim();
  const body=document.getElementById('post-body').value.trim();
  if(!title){toast('제목을 입력하세요','error');return;}
  if(!body){toast('내용을 입력하세요','error');return;}
  if(editId){
    const{error}=await sb.from('community_posts').update({title,body,category:_postCat,updated_at:nowISO()}).eq('id',editId);
    if(error){toast('수정 실패: '+error.message,'error');return;}
    toast('수정 완료','success');
  } else {
    const{error}=await sb.from('community_posts').insert({category:_postCat,title,body,author_id:ME.id,author_name:ME.name});
    if(error){toast('등록 실패: '+error.message,'error');return;}
    toast('게시글 등록 완료','success');
  }
  closeModal('modal-post-form');
  renderCommunityPage();
}

function deletePost(id){
  showConfirm({icon:'🗑️',title:'게시글 삭제',msg:'삭제된 게시글은 복구할 수 없습니다.',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    await sb.from('community_posts').delete().eq('id',id);
    toast('삭제 완료','success');renderCommunityPage();
  }});
}

function escHtml(str){return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}


// ══════════════════════════════════════════════
//  자체대회 (bracket_tournaments)
//  단계: 참석자 취합 → 배분(추천/수정) → 확정 → 리그 → 본선
//  종목: individual(개인전) / duo(듀오전) / team(팀전)
// ══════════════════════════════════════════════

let _bdId=null, _bdData=null;
let _bfType='individual';
let _bfAttendees=[];
let _bfUserOpts='';
let _bfTeamCount=0;
let _bfStep=1; // 1:참석자 2:배분 3:리그/본선

// ── 유틸 ──
function _tl(t){
  if(!t) return '?';
  if(typeof t==='string') return t;
  if(t.name&&!t.p1_name) return t.name;
  if(t.p1_name&&t.p2_name) return `${t.p1_name} / ${t.p2_name}`;
  if(t.p1_name) return t.p1_name;
  return '?';
}
function _isMyTeam(t){
  if(!t||!ME) return false;
  return t.id===ME.id||t.p1_id===ME.id||t.p2_id===ME.id;
}
function _calcGroupCount(n){
  if(n<4) return 1;
  let best=1,bestScore=999;
  for(let g=1;g<=n;g++){
    const base=Math.floor(n/g),extra=n%g;
    const sizes=Array.from({length:g},(_,i)=>base+(i<extra?1:0));
    if(Math.min(...sizes)<4) continue;
    const penalty=sizes.reduce((s,x)=>s+(x<=5?0:x===6?1:3),0);
    if(penalty<bestScore){bestScore=penalty;best=g;}
  }
  return best;
}
function bdCalcStandings(groups, isIndividual){
  groups.forEach(g=>{
    const items=isIndividual?(g.players||[]):(g.teams||[]);
    const keyFn=isIndividual?(x=>x.id):(x=>x.p1_id);
    const st={};
    items.forEach(t=>{st[keyFn(t)]={team:t,wins:0,losses:0,diff:0,pf:0,pa:0,played:0};});
    (g.matches||[]).forEach(m=>{
      if(!m.done) return;
      const s1=parseInt(m.s1),s2=parseInt(m.s2);
      const k1=isIndividual?m.p1.id:m.t1.p1_id;
      const k2=isIndividual?m.p2.id:m.t2.p1_id;
      if(!st[k1]||!st[k2]) return;
      st[k1].played++;st[k2].played++;
      st[k1].pf+=s1;st[k1].pa+=s2;
      st[k2].pf+=s2;st[k2].pa+=s1;
      st[k1].diff=st[k1].pf-st[k1].pa;
      st[k2].diff=st[k2].pf-st[k2].pa;
      if(s1>s2){st[k1].wins++;st[k2].losses++;}
      else{st[k2].wins++;st[k1].losses++;}
    });
    g.standings=Object.values(st).sort((a,b)=>b.wins!==a.wins?b.wins-a.wins:b.diff-a.diff);
  });
}

// ── renderTournamentPage: renderBracketPage alias ──
function renderTournamentPage(){ renderBracketPage(); }

// ── 밸런스 상세 모달 ──
async function _openBalanceDetail(bt){
  const rawG=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups):bt.groups):{};
  const data=Array.isArray(rawG)?{}:rawG;
  const titleEl=document.getElementById('bd-title');
  const contentEl=document.getElementById('bd-content');
  const actionsEl=document.getElementById('bd-actions');
  if(titleEl) titleEl.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-scale"/></svg>'+escHtml(bt.name||'');
  if(!contentEl) return;
  // score 보완용 pool 미리 로드
  if(!window._balUserPool||window._balUserPool.length===0) await _balLoadAttendees();
  const isAdmin=ME?.role==='admin';
  contentEl.innerHTML=_renderBalanceSavedView(bt, data);
  if(actionsEl) actionsEl.innerHTML=
    `<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`+
    (isAdmin?`<button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="balDeleteFromDetail('${bt.id}')"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>삭제</button>`+
    `<button class="btn btn-primary" onclick="closeModal('modal-bracket-detail');balEditFromHistory('${bt.id}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>수정</button>`:'');
  openModal('modal-bracket-detail');
}
async function balEditFromHistory(btId){
  // DB에서 밸런스 데이터 로드 후 밸런스 탭 비교모드로 복원
  const{data:bt}=await sb.from('bracket_tournaments').select('*').eq('id',btId).single();
  if(!bt){toast('불러오기 실패','error');return;}
  const rawG=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups):bt.groups):{};
  const data=Array.isArray(rawG)?{}:rawG;
  const tType=bt.tournament_type||'individual';
  // 밸런스 탭으로 이동 후 복원
  navigateTo('balance');
  setTimeout(async()=>{
    balSwitchTab('compare');
    _balType=tType;
    // userPool 로드
    if(!window._balUserPool) await _balLoadAttendees();
    // _balResult 복원
    if(tType==='team'){
      const tA=(data.teams||[])[0]||{};
      const tB=(data.teams||[])[1]||{};
      const toP=arr=>(arr||[]).map(n=>{const u=(window._balUserPool||[]).find(x=>x.name===n)||{name:n,score:0,id:'saved:'+n};return u;});
      _balResult={teamA:toP(tA.members),teamB:toP(tB.members)};
    } else if(tType==='duo'){
      _balResult={teams:(data.groups||[]).map(g=>({
        name:g.name,
        pairs:(g.teams||[]).map(t=>({
          p1:{name:t.p1_name,score:t.p1_score||0,id:t.p1_id||'saved:'+t.p1_name},
          p2:t.p2_name?{name:t.p2_name,score:t.p2_score||0,id:t.p2_id||'saved:'+t.p2_name}:null
        }))
      }))};
    } else {
      _balResult={groups:(data.groups||[]).map(g=>({
        name:g.name,
        players:(g.players||[]).map(p=>{const u=(window._balUserPool||[]).find(x=>x.name===p.name)||{...p,id:p.id||'saved:'+p.name};return u;})
      }))};
    }
    // 참석자 목록 복원
    const allPlayers=tType==='team'
      ?[..._balResult.teamA,..._balResult.teamB]
      :tType==='duo'
        ?_balResult.teams.flatMap(t=>t.pairs.flatMap(p=>[p.p1,p.p2].filter(Boolean)))
        :_balResult.groups.flatMap(g=>g.players);
    _balAttendees=[...new Map(allPlayers.map(p=>[p.id,p])).values()];
    balSetType(tType);
    balGoStep(2);
    _balRenderStep2();
    toast('수정 모드로 불러왔습니다','success');
  },150);
}

/* ══════════════════════════════════════════════════
   일요일 시상 — 소식탭 'award' 게시글 (2026-11-15)
   body = JSON {v:2,date:'YYYY-MM-DD',awards:[{group,prize,name,cock}]}
     group = 경기력상/평화상/힘내요상 등 묶음, prize = 순위 표기(1등·21등…)
     v1(group 없음)도 그대로 읽힌다.
   콕은 기록만(실물은 현장 지급) — 인벤토리는 건드리지 않는다.
   등록·수정은 관리자만(버튼 노출 기준). DB 쓰기 권한은 기존 community_posts RLS.
   디자인: 일별 요약 화면과 같은 차분한 톤(강조색은 --primary 하나만).
══════════════════════════════════════════════════ */
const AWARD_DEFAULT=[
  {group:'경기력상',rows:['1등','2등','3등','4등','5등']},
  {group:'평화상',rows:['']},
  {group:'힘내요상',rows:['']},
];

function _awardParse(p){
  try{const o=JSON.parse(p.body||'{}');return {date:o.date||'',awards:Array.isArray(o.awards)?o.awards:[]};}
  catch(e){return {date:'',awards:[]};}
}
function _awardDateLabel(d){
  if(!d) return '';
  const dt=new Date(d+'T00:00:00');
  return `${dt.getMonth()+1}월 ${dt.getDate()}일(${'일월화수목금토'[dt.getDay()]})`;
}
/* 등장 순서를 지키며 group별로 묶는다 */
function _awardGroups(awards){
  const out=[];const idx={};
  awards.forEach(a=>{
    const g=a.group||'';
    if(!(g in idx)){idx[g]=out.length;out.push({group:g,items:[]});}
    out[idx[g]].items.push(a);
  });
  return out;
}

/* ── 시상 카드 (5안: 시상대 + 말풍선). 색은 --primary 하나만, 나머지는 중립 톤 + 이모지 ── */
/* 멘트엔 이름을 넣지 않는다 — 수상자는 말풍선 안 점선 아래에 따로 (11/21 C안) */
const AWARD_QUIPS={
  peace:[
    '구구… 오늘 딱 중간이었어요. 이기지도 지지도 않는 평화의 아이콘 🫶',
    '구구구~ 덕분에 코트에 평화가 찾아왔습니다 🕊️',
    '너무 이기지도 너무 지지도 않는 그 균형감… 존경합니다 🫡',
    '구구! 오늘 코트의 스위스. 어느 편도 들지 않는 중립국 🇨🇭',
    '이긴 사람도 진 사람도 기분 좋게 만든 오늘의 평화 유지군 🕊️',
    '승률 50%의 미학… 오늘 셔틀콕도 평온했대요 🍃',
    '구구… 비둘기 회의 결과, 오늘의 평화 대사가 만장일치로 정해졌습니다 🕊️🕊️',
    '순위표 정중앙에 깃발 꽂으셨습니다. 여기가 바로 명당 🚩',
    '싸우지 않고 이기는 법을 아시는 분. 아, 오늘은 반만 이기셨구나 😌',
    '오늘 경기 요약: 잔잔한 호수, 고요한 새벽, 그리고 무난한 득실 🌅',
    '구구~ 노벨 평화상 후보 명단에 이름 올려 두었습니다 🏅',
    '너무 잘하면 부담되고 너무 못하면 서운하니까, 딱 좋게 🤏',
    '오늘 코트에서 가장 마음이 편안했던 사람 1위 (추정) ☕',
    '상위권도 하위권도 보며 안심했습니다. 중간이 든든해야 클럽이 산다 🧱',
    '구구… 다음 주엔 평화를 깨고 단상으로 진격해 보는 건 어떨까요? 🕊️➡️👑',
    '라켓에서 올리브 가지 냄새가 납니다. 오늘도 평화 수호 완료 🌿',
    '이기면 미안하고 지면 아쉬운 그 마음, 제일 잘 아시죠 🤝',
    '오늘의 균형 감각 상, 아니 평화상! 저울처럼 정확하셨어요 ⚖️',
    '구구구구… (번역: 오늘 수고 많으셨어요, 비둘기 일동) 🕊️',
    '중간 순위는 위로도 아래로도 갈 수 있는 무한 가능성의 자리입니다 ✨',
  ],
  cheer:[
    '오늘은 콕이 안 따라줬을 뿐. 다음 주엔 단상 위에서 만나요 💪',
    '오늘 진 만큼 다음 주에 다 돌려받는 겁니다 🔥',
    '괜찮아요… 라켓 탓이에요. 화이팅! 💪',
    '오늘은 상대 팀에게 기부하는 날이었어요. 선행 쌓으셨습니다 😇',
    '꼴찌는 내려갈 곳이 없다는 뜻! 이제 올라갈 일만 남았어요 📈',
    '오늘 바람이 반대로 불었던 거 다 압니다. 체육관 안이지만요 🌬️',
    '새벽 운동 나온 것만으로 이미 승리자! 리스펙 🙇',
    '스매시가 오늘 잠시 휴가 중이었습니다. 다음 주 복귀 예정 🏖️',
    '주식이라면 지금이 저점 매수 타이밍! 주가 반등 기대합니다 📊',
    '오늘 셔틀콕이 자꾸 네트를 사랑했죠? 다음 주엔 헤어지게 해 드릴게요 💔',
    '져 본 사람이 이기는 법을 압니다. 오늘 교과서 한 권 쓰셨어요 📚',
    '덕분에 오늘 다른 분들 웃으면서 집에 갔습니다. 이것도 봉사예요 🫡',
    '오늘 경기는 연습 경기였던 걸로 합시다. 본게임은 다음 주부터! 🎬',
    '주인공은 원래 1화에서 집니다. 성장 서사 이제 시작 🎞️',
    '오늘 그립이 좀 미끄러웠죠? 그립 탓 맞아요. 새 그립 감고 오세요 🧤',
    '패배는 잠깐, 단톡방 캡처는 영원… 농담이고 화이팅입니다 😆',
    '오늘 쌓인 경험치가 너무 많아서 다음 주에 레벨업 확정 ⬆️',
    '오늘 득실차는… 숫자는 숫자일 뿐! 마음만은 +21 💯',
    '클리어는 높게, 기대는 더 높게! 다음 주 기대하겠습니다 🚀',
    '힘내요! 커피 한 잔 하고 다음 주 새벽에 리벤지 매치 갑시다 ☕🔥',
  ],
};
function _awardKind(group){
  if(/평화/.test(group)) return 'peace';
  if(/힘내|화이팅|파이팅/.test(group)) return 'cheer';
  return 'rank';
}
function _awardSeed(str){let h=0;for(const c of str||'') h=(h*31+c.charCodeAt(0))|0;return Math.abs(h);}
function _awardCock(a){return +a.cock?`<span class="aw-cock">콕 ${+a.cock}</span>`:'';}
function _awardRankNo(a,i){const m=String(a.prize||'').match(/\d+/);return m?m[0]:String(i+1);}

/* 프로필 사진(이름으로 찾음) — renderCommunityPage가 시상 글이 있을 때 한 번 채운다 */
function _awardAvatar(name,big){
  const u=(window._awardAvatars||{})[name];
  const cls='aw-av'+(big?' big':'');
  return u?`<img class="${cls}" src="${escHtml(u)}" alt="">`:`<div class="${cls}">${escHtml((name||'?')[0])}</div>`;
}
/* 경기력상 시상대 — 홈 MVP 단상과 같은 구조(왕관·프사 링·순위 배지·단상), 승률 대신 '몇 승 몇 패' + 단상 아래 득실 */
function _awardPodiumHTML(items,date){
  const top=items.slice(0,3), rest=items.slice(3);
  const isLight=document.body.classList.contains('light-mode');
  const recOf=n=>((window._awardRec||{})[date]||{})[n];
  const META=[ // 홈 renderMvpPodium과 같은 색 (2·1·3 순)
    {color:isLight?'#5B7A9A':'#A8B8C8',glow:'rgba(168,184,200,.2)',av:56,podH:70,nm:'.76rem',num:'1.15rem',lbl:'2nd'},
    {color:isLight?'#1565C0':'#42A5F5',glow:'rgba(66,165,245,.3)', av:70,podH:92,nm:'.84rem',num:'1.45rem',lbl:'1st'},
    {color:isLight?'#8B4E1A':'#C87941',glow:'rgba(200,121,65,.18)',av:52,podH:58,nm:'.72rem',num:'1.05rem',lbl:'3rd'},
  ];
  const crown=c=>`<svg width="22" height="16" viewBox="0 0 22 16" fill="none" style="display:block;"><path d="M1 14 L4 4 L8 9 L11 2 L14 9 L18 4 L21 14 Z" fill="${c}" opacity=".9"/><rect x="1" y="13" width="20" height="2.5" rx="1.2" fill="${c}"/><circle cx="11" cy="2" r="1.6" fill="${c}"/><circle cx="4.5" cy="4.5" r="1.2" fill="${c}" opacity=".7"/><circle cx="17.5" cy="4.5" r="1.2" fill="${c}" opacity=".7"/></svg>`;
  const col=(a,i,slot)=>{
    if(!a) return '<div style="flex:1"></div>';
    const m=META[slot], first=slot===1;
    const img=(window._awardAvatars||{})[a.name];
    const inner=img?`<img src="${escHtml(img)}" style="width:100%;height:100%;object-fit:cover;">`
      :`<span style="font-size:${first?'1.5rem':'1.15rem'};font-weight:900;color:${m.color};">${escHtml((a.name||'?')[0])}</span>`;
    const r=recOf(a.name);
    const wl=r?`${r.w}승 ${r.l}패`:'';
    const df=r?`득실 ${r.d>0?'+':''}${r.d}`:'';
    return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;">
      <div style="height:24px;display:flex;align-items:center;justify-content:center;">${first?crown(m.color):''}</div>
      <div style="position:relative;margin-bottom:7px;">
        <div style="width:${m.av}px;height:${m.av}px;border-radius:50%;border:2px solid ${m.color};box-shadow:0 0 ${first?18:10}px ${m.glow};background:radial-gradient(circle at 35% 35%,${m.color}33,var(--bg2));display:flex;align-items:center;justify-content:center;overflow:hidden;">${inner}</div>
        <div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:${m.color};border:2px solid var(--surface);display:flex;align-items:center;justify-content:center;"><span style="font-size:.48rem;font-weight:900;color:#fff;letter-spacing:-.3px;">${m.lbl}</span></div>
      </div>
      <div style="font-weight:800;font-size:${m.nm};color:var(--text);width:100%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 3px;margin-bottom:2px;">${escHtml(a.name)}</div>
      ${+a.cock?`<div style="font-size:.66rem;color:var(--text-muted);margin-bottom:2px;">콕 ${+a.cock}</div>`:''}
      <div style="height:5px;"></div>
      <div style="width:100%;height:${m.podH}px;background:linear-gradient(170deg,${m.color}28 0%,${m.color}14 70%,transparent 100%);border:1px solid ${m.color}55;border-bottom:none;border-radius:10px 10px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
        <span style="font-family:'Black Han Sans',sans-serif;font-size:${m.num};color:${m.color};line-height:1;margin-bottom:1px;">${escHtml(_awardRankNo(a,i))}</span>
        ${wl?`<span style="font-size:${first?'.7rem':'.64rem'};color:${m.color};font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;">${wl}</span>`:''}
        ${df?`<span style="font-size:.58rem;color:${m.color}cc;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1;">${df}</span>`:''}
      </div>
    </div>`;
  };
  return `<div style="display:flex;align-items:flex-end;gap:5px;padding:0 2px;">${col(top[1],1,0)}${col(top[0],0,1)}${col(top[2],2,2)}</div>
    ${rest.length?`<div class="aw-minis">${rest.map((a,i)=>`<span class="aw-mini"><b>${escHtml(_awardRankNo(a,i+3))}등</b>${escHtml(a.name)}${+a.cock?` · 콕 ${+a.cock}`:''}</span>`).join('')}</div>`:''}`;
}
function _awardTalkHTML(kind,items,seed){
  const names=items.map(a=>{
    const m=String(a.prize||'').match(/\d+/);
    return `<span>${m?`<i class="aw-rk">${m[0]}등</i>`:''}${escHtml(a.name)}${+a.cock?`<small> 콕 ${+a.cock}</small>`:''}</span>`;
  }).join('');
  const list=AWARD_QUIPS[kind];
  const face=kind==='peace'?'🕊️':'😤';
  return `<div class="aw-talk"><div class="aw-face">${face}</div><div class="aw-bubble">${list[(kind==="cheer"?(seed>>>4)+7:seed)%list.length]}<div class="aw-who">${names}</div></div></div>`;
}

/* 토스풍 본문 (11/21 2안): 큰 문장 → 1~3등 리스트 → 나머지 한 줄 → 평화·힘내요 둥근 칸 */
function _awardTossHTML(date,awards,seed){
  const rec=((window._awardRec||{})[date])||{};
  const cnt=Object.keys(rec).length;
  const dt=date?new Date(date+'T00:00:00'):null;
  const head=dt?`${dt.getMonth()+1}월 ${dt.getDate()}일 ${'일월화수목금토'[dt.getDay()]}요일 새벽${cnt?` · ${cnt}명`:''}`:'';
  const groups=_awardGroups(awards);
  const rankG=groups.filter(g=>_awardKind(g.group)==='rank');
  const main=rankG[0]?rankG[0].items:[];
  const firsts=main.filter((a,i)=>_awardRankNo(a,i)==='1');
  const hero=firsts.length?firsts:main.slice(0,1);
  const cock=a=>+a.cock?`<small class="aw-tk">콕 ${+a.cock}</small>`:'';
  let h=`<div class="aw-t-date">${escHtml(head)}</div>`;
  if(hero.length) h+=`<div class="aw-t-big">오늘의 1등은<br><span>${hero.map(a=>escHtml(a.name)).join(' · ')}</span> 님이에요 🎉</div>`;
  const top=main.slice(0,3), rest=main.slice(3);
  if(top.length) h+=`<div class="aw-t-list">${top.map((a,i)=>{
    const no=_awardRankNo(a,i), r=rec[a.name], f=no==='1';
    return `<div class="aw-t-row${f?' f':''}"><span class="aw-t-n">${escHtml(no)}</span>${_awardAvatar(a.name,f)}<span class="aw-t-nm">${escHtml(a.name)}${cock(a)}</span>${r?`<span class="aw-t-r"><b>${r.w}승 ${r.l}패</b><br>득실 ${r.d>0?'+':''}${r.d}</span>`:''}</div>`;
  }).join('')}</div>`;
  const restTxt=rest.map((a,i)=>`${escHtml(_awardRankNo(a,i+3))}등 ${escHtml(a.name)}${+a.cock?` (콕 ${+a.cock})`:''}`);
  rankG.slice(1).forEach(g=>g.items.forEach(a=>restTxt.push(`${escHtml(g.group)} ${escHtml(a.name)}`)));
  if(restTxt.length) h+=`<div class="aw-t-more">${restTxt.join(' · ')}</div>`;
  /* 평화상·힘내요상 (11/21 4안): 1~3등과 같은 줄 모양으로 이어서 — 소제목 → 멘트 한 줄 → 등수·프사·이름·전적 줄 */
  groups.filter(g=>_awardKind(g.group)!=='rank').forEach(g=>{
    const kind=_awardKind(g.group), list=AWARD_QUIPS[kind];
    const q=list[(kind==='cheer'?(seed>>>4)+7:seed)%list.length];
    h+=`<div class="aw-t-h"><span>${kind==='peace'?'🕊️':'😤'}</span>${escHtml(g.group)}</div><div class="aw-t-q">${q}</div>`;
    h+=g.items.map(a=>{
      const m=String(a.prize||'').match(/\d+/), r=rec[a.name];
      return `<div class="aw-t-row sm"><span class="aw-t-n">${m?`${m[0]}<small>등</small>`:''}</span>${_awardAvatar(a.name)}<span class="aw-t-nm">${escHtml(a.name)}${cock(a)}</span>${r?`<span class="aw-t-r"><b>${r.w}승 ${r.l}패</b><br>득실 ${r.d>0?'+':''}${r.d}</span>`:''}</div>`;
    }).join('');
  });
  return h;
}

/* ══════════════════════════════════════════════
   팀전 결과 — 소식탭 'team' 게시글 (2026-11-22, 시안 1안 토스풍)
   body = JSON {v:1,date,players,games,teams:[{name,wins,pts}] (0=승리팀),
                rounds:[[승리팀 승,상대 승],...], mvp:[{name,team,w,l,d}], best:{name,team,w,l,d}}
   집계는 등록 시점 스냅샷(경기 수정 시 글도 다시 써야 함). 등록은 관리자(SQL/추후 버튼).
══════════════════════════════════════════════ */
function _teamParse(p){try{const o=JSON.parse(p.body||'{}');return o&&Array.isArray(o.teams)&&o.teams.length===2?o:null;}catch(e){return null;}}
function _teamJosa(n){const c=(n||'').charCodeAt((n||'').length-1)-0xAC00;return c>=0&&c<11172&&c%28?'이':'가';}
function teamPostHTML(p){
  const o=_teamParse(p);
  if(!o) return '';
  const isAdmin=ME.role==='admin';
  const open=p.id===window._teamLatestId;
  const [W,L]=o.teams;
  const dt=o.date?new Date(o.date+'T00:00:00'):null;
  const head=dt?`${dt.getMonth()+1}월 ${dt.getDate()}일 ${'일월화수목금토'[dt.getDay()]}요일 새벽${o.players?` · ${+o.players}명`:''}${o.games?` · ${+o.games}경기`:''}`:'';
  const rec=r=>`<span class="aw-t-r"><b>${+r.w}승 ${+r.l}패</b><br>득실 ${r.d>0?'+':''}${+r.d}</span>`;
  const rounds=(o.rounds||[]).map((r,i)=>`<div class="tm-rd${r[0]>r[1]?' w':''}">${i+1}R<b>${+r[0]}:${+r[1]}</b></div>`).join('');
  const mvp=(o.mvp||[]).map((m,i)=>`<div class="aw-t-row${i===0?' f':''}"><span class="aw-t-n">${i+1}</span>${_awardAvatar(m.name,i===0)}<span class="aw-t-nm">${escHtml(m.name)}<small class="tm-tn">${escHtml(m.team)}</small></span>${rec(m)}</div>`).join('');
  const best=o.best?`<div class="aw-t-more tm-best">${escHtml(o.best.team)} 최고 · ${escHtml(o.best.name)} ${+o.best.w}승 ${+o.best.l}패 ${o.best.d>0?'+':''}${+o.best.d}</div>`:'';
  return `<div class="comm-post aw-card${open?' aw-open':''}" id="post-${p.id}">
    <div class="comm-post-header aw-toggle" onclick="this.parentElement.classList.toggle('aw-open')">
      <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
        <span class="aw-chip tm-chip">팀전</span>
        <span class="comm-post-title">${escHtml(p.title)}</span>
        <span class="aw-peek">${escHtml(W.name)} ${+W.wins}:${+L.wins}</span>
      </div>
      ${isAdmin?`<div class="comm-post-meta"><button onclick="event.stopPropagation();deletePost('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:.78rem;cursor:pointer;padding:0 4px;" aria-label="삭제"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg></button></div>`:''}
      <span class="aw-chev" aria-hidden="true">›</span>
    </div>
    <div class="aw-body">
      <div class="aw-t-date">${escHtml(head)}</div>
      <div class="aw-t-big">오늘 팀전은<br><span>${escHtml(W.name)}</span>${_teamJosa(W.name)} 이겼어요 🎉<br>${+W.wins} : ${+L.wins}</div>
      ${rounds?`<div class="tm-rds">${rounds}</div>`:''}
      ${mvp?`<div class="aw-t-h">오늘의 MVP</div><div class="aw-t-list">${mvp}</div>`:''}
      ${best}
      ${o.date&&typeof openDateSummaryPage==='function'?`<button class="aw-t-btn" onclick="event.stopPropagation();openDateSummaryPage('${escHtml(o.date)}')">전체 경기 보기</button>`:''}
    </div>
  </div>`;
}

function awardPostHTML(p){
  const {date,awards}=_awardParse(p);
  const isAdmin=ME.role==='admin';
  const seed=_awardSeed(date||p.id);
  const total=awards.reduce((s,a)=>s+(+a.cock||0),0);
  const secs=awards.length?_awardTossHTML(date,awards,seed):'';
  const open=p.id===window._awardLatestId;
  const first=awards[0];
  const peek=first?`${first.prize?escHtml(first.prize)+' ':''}${escHtml(first.name)}${awards.length>1?` 외 ${awards.length-1}명`:''}`:'';
  return `<div class="comm-post aw-card${open?' aw-open':''}" id="post-${p.id}">
    <div class="comm-post-header aw-toggle" onclick="this.parentElement.classList.toggle('aw-open')">
      <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
        <span class="aw-chip">시상</span>
        <span class="comm-post-title">${escHtml(p.title)}</span>
        <span class="aw-peek">${peek}</span>
      </div>
      ${isAdmin?`<div class="comm-post-meta">
        <button onclick="event.stopPropagation();editPost('${p.id}')" style="background:none;border:none;color:var(--text-muted);font-size:.78rem;cursor:pointer;padding:0 4px;" aria-label="수정"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button>
        <button onclick="event.stopPropagation();deletePost('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:.78rem;cursor:pointer;padding:0 4px;" aria-label="삭제"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg></button>
      </div>`:''}
      <span class="aw-chev" aria-hidden="true">›</span>
    </div>
    <div class="aw-body">
    ${secs||'<div style="font-size:.8rem;color:var(--text-muted);padding:8px 0;">수상자 없음</div>'}
    ${total?`<div class="aw-total">콕 총 ${total}개 · 현장 지급</div>`:''}
    ${date&&typeof openDateSummaryPage==='function'?`<button class="aw-t-btn" onclick="event.stopPropagation();openDateSummaryPage('${escHtml(date)}')">전체 경기 보기</button>`:''}
    </div>
  </div>`;
}

/* ── 입력 모달: 묶음(그룹)마다 [순위][이름][콕][✕] 줄 ── */
function _awardRowHTML(a={}){
  const cock=(a.cock!=null&&a.cock!=='')?(+a.cock):'';
  return `<div class="award-row" style="display:grid;grid-template-columns:62px 1fr 54px 24px;gap:6px;margin-bottom:6px;align-items:center;">
    <input class="form-input aw-prize" type="text" placeholder="순위" value="${escHtml(a.prize||'')}" style="padding:8px;text-align:center;">
    <input class="form-input aw-name" type="text" list="award-names" placeholder="이름" value="${escHtml(a.name||'')}" style="padding:8px;">
    <input class="form-input aw-cock" type="number" min="0" inputmode="numeric" placeholder="콕" value="${cock}" style="padding:8px;text-align:center;">
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);font-size:.95rem;cursor:pointer;" aria-label="줄 삭제">✕</button>
  </div>`;
}
function _awardGroupHTML(group,items){
  return `<div class="award-group" style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <input class="form-input aw-group" type="text" placeholder="상 이름" value="${escHtml(group||'')}" style="padding:6px 8px;font-weight:700;font-size:.85rem;flex:1;">
      <button class="btn btn-ghost btn-sm" onclick="this.closest('.award-group').querySelector('.award-group-rows').insertAdjacentHTML('beforeend',_awardRowHTML())">+ 줄</button>
      <button onclick="this.closest('.award-group').remove()" style="background:none;border:none;color:var(--text-muted);font-size:.95rem;cursor:pointer;" aria-label="상 삭제">✕</button>
    </div>
    <div class="award-group-rows">${items.map(_awardRowHTML).join('')}</div>
  </div>`;
}
function awardAddRow(){document.getElementById('award-rows').insertAdjacentHTML('beforeend',_awardGroupHTML('',[{}]));}

/* 가장 최근 일요일(오늘이 일요일이면 오늘) */
function _awardLastSunday(){
  const d=new Date(); d.setDate(d.getDate()-d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function openAwardForm(post=null){
  let date=_awardLastSunday(), groups;
  if(post){
    const d=_awardParse(post); date=d.date||date;
    groups=_awardGroups(d.awards).map(g=>({group:g.group,items:g.items}));
  } else {
    groups=AWARD_DEFAULT.map(g=>({group:g.group,items:g.rows.map(prize=>({prize}))}));
  }
  document.getElementById('award-edit-id').value=post?.id||'';
  document.getElementById('award-form-title').textContent=post?'시상 수정':'시상 등록';
  document.getElementById('award-date').value=date;
  document.getElementById('award-rows').innerHTML=groups.map(g=>_awardGroupHTML(g.group,g.items)).join('');
  openModal('modal-award-form');
  awardLoadDay();
}

/* 그날 참석자를 이름 자동완성에 넣는다 (일별 요약과 같은 순위: 승수→득실→패수, 셋 다 같으면 공동) */
async function awardLoadDay(){
  const d=document.getElementById('award-date').value;
  const info=document.getElementById('award-day-info');
  const dl=document.getElementById('award-names');
  dl.innerHTML=''; info.textContent='';
  if(!d) return;
  const{data:ms,error}=await sb.from('matches').select('a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b')
    .eq('match_date',d).eq('status','approved');
  if(error){info.textContent='참석자 불러오기 실패';return;}
  if(!ms||!ms.length){info.textContent='이 날짜에 승인된 경기가 없어요 (이름은 직접 입력 가능)';return;}
  const map={};
  ms.forEach(m=>{
    const aWin=(+m.score_a||0)>(+m.score_b||0);
    [[m.a1_id,m.a1_name,true],[m.a2_id,m.a2_name,true],[m.b1_id,m.b1_name,false],[m.b2_id,m.b2_name,false]].forEach(([id,name,onA])=>{
      if(!name) return;
      const k=id||('name:'+name);
      const r=map[k]||(map[k]={name,w:0,l:0,d:0});
      (onA===aWin)?r.w++:r.l++;
      r.d+=onA?(+m.score_a||0)-(+m.score_b||0):(+m.score_b||0)-(+m.score_a||0);
    });
  });
  const list=Object.values(map).sort((a,b)=>b.w-a.w||b.d-a.d||a.l-b.l);
  let rank=0;
  list.forEach((r,i)=>{
    const p=list[i-1];
    if(!p||p.w!==r.w||p.d!==r.d||p.l!==r.l) rank=i+1;
    const o=document.createElement('option');
    o.value=r.name; o.label=`${rank}위 · ${r.w}승 ${r.l}패 ${r.d>0?'+':''}${r.d}`;
    dl.appendChild(o);
  });
  info.textContent=`${_awardDateLabel(d)} · ${ms.length}경기 · 참석 ${list.length}명 — 이름 칸을 누르면 참석자가 순위순으로 나와요`;
}

async function submitAward(){
  if(ME.role!=='admin'){toast('관리자만 등록할 수 있어요','error');return;}
  const editId=document.getElementById('award-edit-id').value;
  const date=document.getElementById('award-date').value;
  if(!date){toast('날짜를 선택하세요','error');return;}
  const awards=[];
  document.querySelectorAll('#award-rows .award-group').forEach(g=>{
    const group=g.querySelector('.aw-group').value.trim();
    g.querySelectorAll('.award-row').forEach(r=>{
      const name=r.querySelector('.aw-name').value.trim();
      if(!name) return;   // 이름 없는 줄은 버린다
      awards.push({group,prize:r.querySelector('.aw-prize').value.trim(),name,
        cock:Math.max(0,parseInt(r.querySelector('.aw-cock').value,10)||0)});
    });
  });
  if(!awards.length){toast('수상자를 한 명 이상 입력하세요','error');return;}
  if(awards.some(a=>!a.group)){toast('상 이름이 빈 묶음이 있어요','error');return;}
  const title=`${_awardDateLabel(date)} 시상`;
  const body=JSON.stringify({v:2,date,awards});
  const q=editId
    ?sb.from('community_posts').update({title,body,category:'award',updated_at:nowISO()}).eq('id',editId)
    :sb.from('community_posts').insert({category:'award',title,body,author_id:ME.id,author_name:ME.name});
  const{error}=await q;
  if(error){toast((editId?'수정':'등록')+' 실패: '+error.message,'error');return;}
  toast(editId?'시상 수정 완료':'시상 등록 완료','success');
  closeModal('modal-award-form');
  renderCommunityPage();
}

/* ══════════════════════════════════════════════════
   소식 안 읽은 글 숫자 (하단 '소식' 아이콘 배지) — 2026-11-15
   기준 시각은 기기별 localStorage(ambm_comm_seen). DB 변경 없음.
   처음 쓰는 기기는 최근 7일 글만 '새 글'로 센다.
══════════════════════════════════════════════════ */
const COMM_SEEN_KEY='ambm_comm_seen';
function _commSeenGet(){try{return localStorage.getItem(COMM_SEEN_KEY);}catch(e){return null;}}
function _commBadgeSet(n){
  const btn=document.getElementById('nav-community');
  if(!btn) return;
  let b=btn.querySelector('.nav-badge');
  if(!n){b?.remove();return;}
  if(!b){b=document.createElement('span');b.className='nav-badge';btn.appendChild(b);}
  b.textContent=n>99?'99+':String(n);
}
function markCommSeen(){
  try{localStorage.setItem(COMM_SEEN_KEY,new Date().toISOString());}catch(e){}
  _commBadgeSet(0);
}
async function refreshCommBadge(){
  const onComm=()=>typeof currentPage!=='undefined'&&currentPage==='community';
  if(onComm()){_commBadgeSet(0);return;}
  const seen=_commSeenGet();
  const since=seen||new Date(Date.now()-7*864e5).toISOString();
  // 내가 쓴 글은 '새 글'로 세지 않는다 (2026-11-22)
  let q=sb.from('community_posts').select('id',{count:'exact',head:true}).gt('created_at',since);
  if(ME?.id) q=q.or(`author_id.is.null,author_id.neq.${ME.id}`);
  const{count,error}=await q;
  if(error) return;
  // ⚠️ 응답 기다리는 사이 소식탭을 열었으면(본 시각 갱신됨) 옛 기준 숫자를 다시 띄우지 않는다
  if(onComm()||_commSeenGet()!==seen){_commBadgeSet(0);return;}
  _commBadgeSet(count||0);
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&typeof ME!=='undefined'&&ME) refreshCommBadge();
});

/* 소식탭 미리 받기: 전체 탭 글 목록만 캐시에 넣어 둔다 (core.js initApp에서 호출) */
async function prefetchCommunity(){
  if(window._commCache.all) return;
  const{data}=await sb.from('community_posts').select('*').order('created_at',{ascending:false});
  if(data&&!window._commCache.all) window._commCache.all=data;
}
