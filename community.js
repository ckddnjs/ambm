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

async function renderCommunityPage(){
  markCommSeen();
  // 최신 role DB에서 재확인 (관리자가 권한 변경했을 수 있음)
  const{data:fresh}=await sb.from('profiles').select('role').eq('id',ME.id).single();
  if(fresh&&fresh.role!==ME.role){
    ME.role=fresh.role;
  }
  const commWriteBtn=document.getElementById('btn-comm-write');
  if(commWriteBtn) commWriteBtn.style.display=(ME.role==='admin'||ME.role==='writer')?'':'none';
  const commAwardBtn=document.getElementById('btn-comm-award');
  if(commAwardBtn) commAwardBtn.style.display=ME.role==='admin'?'':'none';

  const el=document.getElementById('community-list');
  if(!el) return;
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);
  let q=sb.from('community_posts').select('*').order('created_at',{ascending:false});
  if(commTab!=='all') q=q.eq('category',commTab);
  const{data:posts,error}=await q;
  if(error){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><div>불러오기 실패<br><span style="font-size:.78rem;color:var(--text-muted);">community_posts 테이블이 필요합니다</span></div></div>`;
    return;
  }
  if(!posts||!posts.length){
    el.innerHTML=riseBlockHTML()+`<div class="empty-state"><div class="empty-icon">💬</div><div>아직 게시글이 없어요<br><span style="font-size:.82rem;">첫 글을 남겨보세요!</span></div></div>`;
    return;
  }
  if(!window._awardAvatars&&posts.some(p=>p.category==='award')){
    const{data:av}=await sb.from('profiles').select('name,avatar_url').eq('status','approved');
    window._awardAvatars={};(av||[]).forEach(u=>{if(u.avatar_url) window._awardAvatars[u.name]=u.avatar_url;});
  }
  // 시상 글은 가장 최근 날짜 1개만 펼치고 나머지는 접는다
  const _aw=posts.filter(p=>p.category==='award');
  window._awardLatestId=_aw.length?_aw.reduce((m,p)=>((_awardParse(p).date||p.created_at)>(_awardParse(m).date||m.created_at)?p:m)).id:null;
  el.innerHTML=riseBlockHTML()+posts.map(p=>commPostHTML(p)).join('');
}

const _catLabel={'general':'일반','info':'정보','rules':'규칙','award':'시상'};
const _catColor={'general':'var(--primary)','info':'var(--info)','rules':'var(--accent)','award':'var(--text-muted)'};

function commPostHTML(p){
  if(p.category==='award') return awardPostHTML(p);
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
        ${canEdit?`<button onclick="event.stopPropagation();editPost('${p.id}')" style="background:none;border:none;color:var(--text-muted);font-size:.78rem;cursor:pointer;padding:0 4px;">✏️</button>
        <button onclick="event.stopPropagation();deletePost('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:.78rem;cursor:pointer;padding:0 4px;">🗑</button>`:''}
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
    toast('✅ 수정 완료','success');
  } else {
    const{error}=await sb.from('community_posts').insert({category:_postCat,title,body,author_id:ME.id,author_name:ME.name});
    if(error){toast('등록 실패: '+error.message,'error');return;}
    toast('✅ 게시글 등록 완료','success');
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
const AWARD_QUIPS={
  peace:[
    n=>`구구… <b>${n}</b> 님, 오늘 딱 중간이었어요. 이기지도 지지도 않는 평화의 아이콘 🫶`,
    n=>`구구구~ <b>${n}</b> 님 덕분에 코트에 평화가 찾아왔습니다 🕊️`,
    n=>`<b>${n}</b> 님, 너무 이기지도 너무 지지도 않는 그 균형감… 존경합니다 🫡`,
  ],
  cheer:[
    n=>`<b>${n}</b> 님! 오늘은 콕이 안 따라줬을 뿐. 다음 주엔 단상 위에서 만나요 💪`,
    n=>`<b>${n}</b> 님, 오늘 진 만큼 다음 주에 다 돌려받는 겁니다 🔥`,
    n=>`괜찮아요 <b>${n}</b> 님… 라켓 탓이에요. 화이팅! 💪`,
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
function _awardPodiumHTML(items){
  const top=items.slice(0,3), rest=items.slice(3);
  const pod=(a,i,cls)=>a?`<div class="aw-pod ${cls}">
      <div class="aw-avwrap">${cls==='p1'?'<span class="aw-crown">👑</span>':''}${_awardAvatar(a.name,cls==='p1')}</div>
      <div class="aw-pnm">${escHtml(a.name)}</div>${_awardCock(a)}
      <div class="aw-blk"><b>${escHtml(_awardRankNo(a,i))}</b><small>등</small></div>
    </div>`:'<div class="aw-pod"></div>';
  return `<div class="aw-podium">${pod(top[1],1,'p2')}${pod(top[0],0,'p1')}${pod(top[2],2,'p3')}</div>
    ${rest.length?`<div class="aw-minis">${rest.map((a,i)=>`<span class="aw-mini"><b>${escHtml(_awardRankNo(a,i+3))}등</b>${escHtml(a.name)}${+a.cock?` · 콕 ${+a.cock}`:''}</span>`).join('')}</div>`:''}`;
}
function _awardTalkHTML(kind,items,seed){
  const names=items.map((a,i)=>{
    const m=String(a.prize||'').match(/\d+/);
    return `${m?`<i class="aw-rk">${m[0]}등</i>`:''}${escHtml(a.name)}${+a.cock?`(콕 ${+a.cock})`:''}`;
  }).join(' · ');
  const list=AWARD_QUIPS[kind];
  const face=kind==='peace'?'🕊️':'😤';
  return `<div class="aw-talk"><div class="aw-face">${face}</div><div class="aw-bubble">${list[seed%list.length](names)}</div></div>`;
}

function awardPostHTML(p){
  const {date,awards}=_awardParse(p);
  const isAdmin=ME.role==='admin';
  const seed=_awardSeed(date||p.id);
  const total=awards.reduce((s,a)=>s+(+a.cock||0),0);
  let rankUsed=false;
  const secs=_awardGroups(awards).map(g=>{
    const kind=_awardKind(g.group);
    let inner;
    if(kind==='rank'&&!rankUsed){rankUsed=true;inner=_awardPodiumHTML(g.items);}
    else if(kind==='rank') inner=`<div class="aw-minis">${g.items.map((a,i)=>`<span class="aw-mini"><b>${escHtml(_awardRankNo(a,i))}</b>${escHtml(a.name)}</span>`).join('')}</div>`;
    else inner=_awardTalkHTML(kind,g.items,seed);
    const icon=kind==='rank'?'🏆 ':'';
    return `<div class="aw-sec"><div class="aw-sec-h">${icon}${escHtml(g.group||'시상')}</div>${inner}</div>`;
  }).join('');
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
        <button onclick="event.stopPropagation();editPost('${p.id}')" style="background:none;border:none;color:var(--text-muted);font-size:.78rem;cursor:pointer;padding:0 4px;">✏️</button>
        <button onclick="event.stopPropagation();deletePost('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:.78rem;cursor:pointer;padding:0 4px;">🗑</button>
      </div>`:''}
      <span class="aw-chev" aria-hidden="true">›</span>
    </div>
    <div class="aw-body">
    ${secs||'<div style="font-size:.8rem;color:var(--text-muted);padding:8px 0;">수상자 없음</div>'}
    ${total?`<div class="aw-total">콕 총 ${total}개 · 현장 지급</div>`:''}
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
  if(typeof currentPage!=='undefined'&&currentPage==='community'){_commBadgeSet(0);return;}
  const since=_commSeenGet()||new Date(Date.now()-7*864e5).toISOString();
  const{count,error}=await sb.from('community_posts').select('id',{count:'exact',head:true}).gt('created_at',since);
  if(error) return;
  _commBadgeSet(count||0);
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&typeof ME!=='undefined'&&ME) refreshCommBadge();
});
