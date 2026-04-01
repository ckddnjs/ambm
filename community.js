async function renderCommunityPage(){
  // 최신 role DB에서 재확인 (관리자가 권한 변경했을 수 있음)
  const{data:fresh}=await sb.from('profiles').select('role').eq('id',ME.id).single();
  if(fresh&&fresh.role!==ME.role){
    ME.role=fresh.role;
  }
  const commWriteBtn=document.getElementById('btn-comm-write');
  if(commWriteBtn) commWriteBtn.style.display=(ME.role==='admin'||ME.role==='writer')?'':'none';

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
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">💬</div><div>아직 게시글이 없어요<br><span style="font-size:.82rem;">첫 글을 남겨보세요!</span></div></div>`;
    return;
  }
  el.innerHTML=posts.map(p=>commPostHTML(p)).join('');
}

const _catLabel={'general':'일반','info':'정보','rules':'규칙'};
const _catColor={'general':'var(--primary)','info':'var(--info)','rules':'var(--accent)'};

function commPostHTML(p){
  const isAdmin=ME.role==='admin';
  const isMyPost=p.author_id===ME?.id&&(ME?.role==='writer'||ME?.role==='admin');
  const canEdit=isAdmin||isMyPost;
  const dateStr=fmtDate(p.created_at);
  const label=_catLabel[p.category]||p.category;
  // 라이트모드에서 rules(노란색) → 인디고로 오버라이드
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
        <span class="comm-post-author">✍ ${escHtml(p.author_name||'익명')}</span>
        <span style="font-size:.7rem;color:var(--text-dim);margin-left:6px;">📅 ${dateStr}</span>
        ${canEdit?`<button onclick="event.stopPropagation();editPost('${p.id}')" style="background:none;border:none;color:var(--text-muted);font-size:.78rem;cursor:pointer;padding:0 4px;">✏️</button>
        <button onclick="event.stopPropagation();deletePost('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:.78rem;cursor:pointer;padding:0 4px;">🗑</button>`:''}
      </div>
    </div>
    <div class="comm-post-body">${escHtml(p.body)}
    </div>
  </div>`;
}

function togglePost(id){
  const el=document.getElementById('post-'+id);
  if(el) el.classList.toggle('open');
}

function switchCommTab(tab){
  commTab=tab;
  document.querySelectorAll('#comm-tabs .sub-tab').forEach((el,i)=>el.classList.toggle('active',['all','general','info','rules'][i]===tab));
  renderCommunityPage();
}

let _postCat = 'general';
function selectPostCat(cat){
  _postCat=cat;
  ['general','info','rules'].forEach(c=>document.getElementById('pcat-'+c)?.classList.toggle('active',c===cat));
}

function openPostForm(editId=null){
  document.getElementById('post-edit-id').value=editId||'';
  document.getElementById('post-form-title').textContent=editId?'✏️ 글 수정':'✍️ 글쓰기';
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
  document.getElementById('post-edit-id').value=id;
  document.getElementById('post-form-title').textContent='✏️ 글 수정';
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

function escHtml(str){return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}


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
  if(titleEl) titleEl.textContent='⚖️ '+bt.name;
  if(!contentEl) return;
  // score 보완용 pool 미리 로드
  if(!window._balUserPool||window._balUserPool.length===0) await _balLoadAttendees();
  const isAdmin=ME?.role==='admin';
  contentEl.innerHTML=_renderBalanceSavedView(bt, data);
  if(actionsEl) actionsEl.innerHTML=
    `<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`+
    (isAdmin?`<button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="balDeleteFromDetail('${bt.id}')">🗑 삭제</button>`+
    `<button class="btn btn-primary" onclick="closeModal('modal-bracket-detail');balEditFromHistory('${bt.id}')">✏️ 수정</button>`:'');
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
