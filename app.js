/**
 * 새벽민턴 AM BADMINTON
 * app.js - 메인 애플리케이션 로직
 */

/* ── CONFIG ── */
const SUPABASE_URL  = 'https://wkclmrbdsinvliaaqjol.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2xtcmJkc2ludmxpYWFxam9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjA1MzcsImV4cCI6MjA4ODQzNjUzN30.442P3qAs4NahcXEqZ0tMAlco9bb6qnj2CsREIH21Ltc';
// SUPABASE_SERVICE 키는 제거됨 → /api/admin/* 서버리스 함수가 처리
const APP_URL = 'https://ambm.vercel.app';

const {createClient}=supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_ANON,{auth:{redirectTo:APP_URL,autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});

/* ── STATE ── */
let ME=null, currentPage='', rankTab='all', sortBy='ci', sortDir=1; // sortDir: 1=내림차순, -1=오름차순
let regMatchType='doubles', adminTab='pending', editMatchId='';

let _allMatchesCache=[];window._allMatchesCache=_allMatchesCache;
let commTab='all';
let _directInputA=false, _directInputB=false;

/* ── BOOT ── */
window.addEventListener('DOMContentLoaded',async()=>{
  let handled=false;
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='INITIAL_SESSION'){
      if(session?.user) await loadProfile(session.user);
      handled=true;
      initTheme();document.body.classList.add('ready');
      await fadeOutLoading();
      if(!ME) showLogin();
      else if(ME.status==='approved') showApp();
      else if(ME.status==='pending') showPendingScreen(ME.name);
      else{await sb.auth.signOut();showLogin();}
    } else if(event==='SIGNED_IN'){
      if(session?.user?.app_metadata?.provider==='email') return;
      if(session?.user) await loadProfile(session.user);
      document.body.classList.add('ready');
      await fadeOutLoading();
      if(!ME){showLogin();return;}
      if(ME.status==='approved'){showApp();toast(`어서오세요, ${ME.name}님! 🏸`,'success');}
      else if(ME.status==='pending'){showPendingScreen(ME.name);toast('승인 대기 중입니다','warning');}
      else{showLogin();toast('이용 불가 계정','error');await sb.auth.signOut();ME=null;}
    } else if(event==='SIGNED_OUT'){
      ME=null;document.body.classList.add('ready');showLogin();
    }
  });
  setTimeout(async()=>{
    if(!handled){
      const{data:{session}}=await sb.auth.getSession();
      if(session?.user) await loadProfile(session.user);
      document.body.classList.add('ready');
      await fadeOutLoading();
      ME?showApp():showLogin();
    }
  },3000);
  if(window.location.hash.includes('access_token')||window.location.search.includes('code=')){
    setTimeout(()=>window.history.replaceState({},'',window.location.pathname),500);
  }
});

async function fadeOutLoading(){
  return new Promise(r=>{const ls=document.getElementById('loading-screen');ls.classList.add('hidden');setTimeout(()=>{ls.style.display='none';r();},450);});
}

async function loadProfile(authUser){
  const{data,error}=await sb.from('profiles').select('*').eq('id',authUser.id).single();
  const pn=localStorage.getItem('kakao_pending_name');
  if(pn) localStorage.removeItem('kakao_pending_name');
  if(error?.code==='PGRST116'){
    // 신규 가입: localStorage의 이름·성별 사용
    const name=pn||authUser.user_metadata?.full_name||authUser.user_metadata?.name||authUser.user_metadata?.nickname||authUser.email?.split('@')[0]||'신규회원';
    const gender='';
    const{data:np,error:insErr}=await sb.from('profiles').upsert({
      id:authUser.id,email:authUser.email||'',name,role:'user',status:'pending',
      provider:authUser.app_metadata?.provider||'email',
      gender,wins:0,losses:0,games:0
    }).select().single();
    if(insErr) console.error('profile insert error',insErr);
    if(np) ME=np;
    addLog(`신규 가입: ${name}`);
    // 비회원으로 등록된 경기 내역을 이름 기반으로 연결
    _linkGuestMatchesToUser(authUser.id, name);
  } else if(data){
    ME=data;
  }
}


/* ── AUTH ── */

async function _linkGuestMatchesToUser(userId, name){
  if(!name||!userId) return;
  try{
    // a1_name, a2_name, b1_name, b2_name 이 일치하고 id가 null인 경기 찾아서 연결
    const cols=[
      {nameCol:'a1_name',idCol:'a1_id'},
      {nameCol:'a2_name',idCol:'a2_id'},
      {nameCol:'b1_name',idCol:'b1_id'},
      {nameCol:'b2_name',idCol:'b2_id'},
    ];
    for(const {nameCol,idCol} of cols){
      const{data:rows}=await sb.from('matches').select('id').eq(nameCol,name).is(idCol,null);
      if(rows&&rows.length){
        const ids=rows.map(r=>r.id);
        // 한 번에 업데이트
        await sb.from('matches').update({[idCol]:userId}).in('id',ids);
      }
    }
  }catch(e){console.warn('guest link error',e);}
}

async function kakaoLoginDirect(){
  const{error}=await sb.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:APP_URL,scopes:'profile_nickname,account_email',queryParams:{prompt:'select_account'},skipBrowserRedirect:false}});
  if(error) toast('카카오 로그인 오류: '+error.message,'error');
}
function kakaoSignup(){
  if(!document.getElementById('privacy-agree')?.checked){toast('개인정보 수집·이용 동의가 필요합니다','error');return;}
  let m=document.getElementById('modal-kakao-name');if(m)m.remove();
  m=document.createElement('div');m.id='modal-kakao-name';m.className='modal-overlay center open';
  m.innerHTML=`<div class="modal center-modal" style="max-width:360px;">
    <div class="modal-title">🏸 카카오로 가입</div>
    <div style="font-size:.86rem;color:var(--text-muted);margin-bottom:14px;line-height:1.6;">이름을 입력 후 카카오 로그인을 진행합니다.</div>
    <div class="form-group"><label class="form-label">이름 *</label><input class="form-input" type="text" id="kakao-name-input" placeholder="실명" oninput="this.value=this.value.replace(/[0-9]/g,'')"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-kakao-name').remove()">취소</button>
      <button class="btn btn-primary" onclick="proceedKakaoSignup()">다음 →</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  setTimeout(()=>document.getElementById('kakao-name-input')?.focus(),100);
}
async function proceedKakaoSignup(){
  const name=document.getElementById('kakao-name-input')?.value.trim();
  if(!name){toast('이름 입력 필요','error');return;}
  localStorage.setItem('kakao_pending_name',name);
  document.getElementById('modal-kakao-name')?.remove();
  const{error}=await sb.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:APP_URL,scopes:'profile_nickname,account_email',queryParams:{prompt:'select_account'}}});
  if(error){localStorage.removeItem('kakao_pending_name');toast('오류: '+error.message,'error');}
}
async function doEmailLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pw=document.getElementById('login-pw').value;
  if(!email||!pw){toast('이메일/비밀번호 입력','error');return;}
  const{data,error}=await sb.auth.signInWithPassword({email,password:pw});
  if(error){toast(error.message.includes('Invalid')?'이메일 또는 비밀번호 오류':error.message,'error');return;}
  await loadProfile(data.user);
  if(!ME){toast('프로필 로드 실패','error');return;}
  if(ME.status==='pending'){showPendingScreen(ME.name);return;}
  if(ME.status==='rejected'){toast('이용 불가 계정','error');await sb.auth.signOut();ME=null;return;}
  addLog(`로그인: ${ME.name}`,ME.id);
  showApp();toast(`어서오세요, ${ME.name}님! 🏸`,'success');
}
async function doEmailSignup(){
  if(!document.getElementById('privacy-agree')?.checked){toast('개인정보 수집·이용 동의가 필요합니다','error');return;}
  const name=document.getElementById('signup-name').value.trim();
  const email=document.getElementById('signup-email').value.trim();
  const pw=document.getElementById('signup-pw').value;
  if(!name){toast('이름 입력','error');return;}
  if(!email){toast('이메일 입력','error');return;}
  if(!pw||pw.length<4){toast('비밀번호 4자 이상 입력','error');return;}
  try {
    const res=await fetch('/api/admin/signup',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:pw,name})
    });
    const json=await res.json();
    if(!res.ok){toast('가입 실패: '+(json.error||res.status),'error');return;}
    toast('가입 신청 완료! 관리자 승인 후 로그인 가능합니다 ✅','success');
    ['signup-name','signup-email','signup-pw'].forEach(id=>document.getElementById(id).value='');
  } catch(e){toast('가입 실패: '+e.message,'error');}
}

/* ── DARK MODE ── */
function toggleDarkMode(){
  document.body.style.transition='background .3s,color .3s';
  const isLight=document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight?'light':'dark');
  _updateDmUI(isLight);
  setTimeout(()=>document.body.style.transition='',350);
}
function _updateDmUI(isLight){
  const icon=document.getElementById('dm-icon'); const label=document.getElementById('dm-label'); const btn=document.getElementById('btn-darkmode');
  if(icon) icon.textContent=isLight?'☀️':'🌙'; if(label) label.textContent=isLight?'밝음':'다크';
  if(btn){btn.style.background=isLight?'rgba(255,255,255,.6)':'rgba(0,0,0,.25)';btn.style.color=isLight?'#1a202c':'#fff';btn.style.borderColor=isLight?'rgba(0,0,0,.15)':'rgba(255,255,255,.15)';}
  const icon2=document.getElementById('dm-icon-app'); const label2=document.getElementById('dm-label-app');
  if(icon2) icon2.textContent=isLight?'☀️':'🌙'; if(label2) label2.textContent=isLight?'밝음':'다크';
}
function initTheme(){
  const saved=localStorage.getItem('theme');
  const isLight=saved==='light';
  if(isLight) document.body.classList.add('light-mode');
  _updateDmUI(isLight);
}
async function doLogout(){
  if(ME) addLog(`로그아웃: ${ME.name}`,ME.id);
  await sb.auth.signOut();ME=null;showLogin();
}

function showLogin(){document.getElementById('pending-screen')?.remove();document.getElementById('app').style.display='none';document.getElementById('login-page').style.display='block';}
function showApp(){document.getElementById('pending-screen')?.remove();document.getElementById('login-page').style.display='none';document.getElementById('app').style.display='flex';initApp();}
function showPendingScreen(name){
  // 승인될 때까지 10초마다 상태 체크
  if(window._pendingChecker) clearInterval(window._pendingChecker);
  window._pendingChecker=setInterval(async()=>{
    if(!ME) return;
    const{data:prof}=await sb.from('profiles').select('status,role').eq('id',ME.id).single();
    if(prof?.status==='approved'){
      clearInterval(window._pendingChecker);window._pendingChecker=null;
      ME={...ME,...prof};
      document.getElementById('pending-screen')?.remove();
      showApp();toast(`어서오세요, ${ME.name}님! 🏸`,'success');
    }
  },10000);
  document.getElementById('login-page').style.display='none';document.getElementById('app').style.display='none';
  document.getElementById('pending-screen')?.remove();
  const el=document.createElement('div');el.id='pending-screen';
  el.style.cssText='position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:300;padding:32px 24px;text-align:center;';
  el.innerHTML=`<div style="font-size:3.5rem;margin-bottom:16px;">⏳</div>
    <div style="font-family:Black Han Sans,sans-serif;font-size:1.5rem;color:var(--primary);margin-bottom:8px;">승인 대기 중</div>
    <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:24px;line-height:1.7;"><b style="color:var(--text);">${name}</b>님, 가입 신청이 완료되었습니다.<br>관리자 승인 후 서비스를 이용할 수 있어요.</div>
    <button onclick="doLogoutFromPending()" style="background:var(--bg2);border:1px solid var(--border);color:var(--text-muted);border-radius:10px;padding:10px 24px;font-family:inherit;cursor:pointer;">↩ 로그아웃</button>`;
  document.body.appendChild(el);
}
async function doLogoutFromPending(){await sb.auth.signOut();ME=null;document.getElementById('pending-screen')?.remove();showLogin();}
function switchTab(t){
  document.querySelectorAll('.login-tab').forEach((el,i)=>el.classList.toggle('active',(i===0&&t==='login')||(i===1&&t==='signup')));
  document.querySelectorAll('.login-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
}

/* ── INIT ── */
function initApp(){
  refreshHeader();buildNav();
  document.getElementById('reg-date').value=todayStr();
  // 커뮤니티 글쓰기 버튼: 관리자만
  const commWriteBtn=document.getElementById('btn-comm-write');
  if(commWriteBtn) commWriteBtn.style.display=(ME?.role==='admin'||ME?.role==='writer')?'':'none';
  goHome();
}
function refreshHeader(){if(!ME) return; document.getElementById('hdr-name').textContent=ME.name;}

const USER_NAVS=[
  {id:'dashboard',icon:'📊',label:'통계'},
  {id:'feed',icon:'📋',label:'경기내역'},
  {id:'compare',icon:'⚔️',label:'상대전적'},
  {id:'tournament',icon:'🏆',label:'대회'},
  {id:'community',icon:'📢',label:'공지'}
];
const ADMIN_NAVS=[
  {id:'dashboard',icon:'📊',label:'통계'},
  {id:'feed',icon:'📋',label:'경기내역'},
  {id:'compare',icon:'⚔️',label:'상대전적'},
  {id:'tournament',icon:'🏆',label:'대회'},
  {id:'community',icon:'📢',label:'공지'},
  {id:'admin',icon:'🛡️',label:'관리'}
];
function buildNav(){
  const navs=ME.role==='admin'?ADMIN_NAVS:USER_NAVS;
  document.getElementById('bottom-nav').innerHTML=navs.map(n=>`<button class="bottom-nav-item" id="nav-${n.id}" onclick="navigateTo('${n.id}')"><span class="nav-icon">${n.icon}</span><span>${n.label}</span></button>`).join('');
}
function goHome(){navigateTo('dashboard');}
function navigateTo(page){
  currentPage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.getElementById('nav-'+page)?.classList.add('active');
  document.querySelector('.app-body').scrollTop=0;
  switch(page){
    case 'dashboard':renderDashboard();break;
    case 'feed':renderFeed();break;
    case 'register':break; // 모달로 대체
    case 'admin':renderAdminPage();break;
    case 'tournament':renderTournamentPage();break;
    case 'bracket':navigateTo('tournament');break;
    case 'community':renderCommunityPage();break;
    case 'compare':renderComparePage();break;
  }
}

/* ── GRADE ── */
/* ── CI 상수 ── */
const BASE_RATING=1000, CONFIDENCE_DENOMINATOR=10, PD_WEIGHT=5,
      WR_WEIGHT=200, SYNERGY_WEIGHT=100, SYNERGY_CAP=50,
      H2H_WEIGHT=80, RECENT_WEIGHT=60, ELO_DIVISOR=400;

/** 개인 CI (Composite Index) 계산 */
function calcCI(wins, games, diff){
  if(games===0) return BASE_RATING;
  const wr = wins / games;
  // 경기수 신뢰도 (경기수가 적을수록 0에 가까움)
  const confidence = games / (games + CONFIDENCE_DENOMINATOR);
  // 신뢰도 보정 승률
  const adjustedWR = wr * confidence;
  // 경기당 평균 득실차
  const avgDiff = diff / games;
  const diffScore = avgDiff * PD_WEIGHT;
  return BASE_RATING + (adjustedWR * WR_WEIGHT) + diffScore;
}

/** 하위 호환: SABCD 등급 → 수치 기반 등급 표시 */
function ciToLabel(ci){
  if(ci>=1110) return 'S';
  if(ci>=1060) return 'A';
  if(ci>=1010) return 'B';
  if(ci>=960)  return 'C';
  return 'D';
}


/* ── DASHBOARD ── */
async function renderDashboard(){
  const{data:prof}=await sb.from('profiles').select('*').eq('id',ME.id).single();
  if(prof) ME=prof;
  const{data:allMatches}=await sb.from('matches').select('*').eq('status','approved').order('match_date',{ascending:false}).order('created_at',{ascending:false});
  _allMatchesCache=allMatches||[];window._allMatchesCache=_allMatchesCache;
  const myMatches=_allMatchesCache.filter(m=>[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(ME.id));
  const stats=computeStats(myMatches,ME.id);

  // 전체 유저 통계로 순위 계산 (exclude_stats 제외, 5경기 이상만 랭킹 산정)
  const{data:allUsers}=await sb.from('profiles').select('id,exclude_stats').eq('status','approved');
  const uStats={};
  (allUsers||[]).filter(u=>!u.exclude_stats).forEach(u=>uStats[u.id]={games:0,wins:0,diff:0,scored:0,conceded:0});
  _allMatchesCache.forEach(m=>{
    const aWin=m.score_a>m.score_b;
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id&&uStats[p.id]).forEach(p=>{
      uStats[p.id].games++;
      if(p.win)uStats[p.id].wins++;
      uStats[p.id].scored+=p.s;uStats[p.id].conceded+=p.c;
    });
  });
  // diff, ci 계산 (5경기 이상인 사람만 랭킹 대상)
  // exclude_stats 유저 ID를 전역 저장 (세부통계 getRank에서 재사용)
  window._rankExcludedIds=(allUsers||[]).filter(u=>u.exclude_stats).map(u=>u.id);
  Object.values(uStats).forEach(u=>{
    u.diff=u.scored-u.conceded;
    u.ci=calcCI(u.wins,u.games,u.diff);
  });
  const MIN_G=5;
  const rankedAll=Object.values(uStats).filter(u=>u.games>=MIN_G);
  const wrOf=u=>u.games>0?u.wins/u.games:0;
  const wrRanked=[...rankedAll].sort((a,b)=>wrOf(b)-wrOf(a)||b.wins-a.wins);
  const diffRanked=[...rankedAll].sort((a,b)=>b.diff-a.diff||wrOf(b)-wrOf(a));
  const gamesRanked=[...rankedAll].sort((a,b)=>b.games-a.games);
  const myWrRank=stats.total.games>=MIN_G?wrRanked.findIndex(u=>u===uStats[ME.id])+1:0;
  const myDiffRank=stats.total.games>=MIN_G?diffRanked.findIndex(u=>u===uStats[ME.id])+1:0;
  const myGamesRank=stats.total.games>=MIN_G?gamesRanked.findIndex(u=>u===uStats[ME.id])+1:0;
  const total=rankedAll.length;
  const ciRanked=[...rankedAll].sort((a,b)=>b.ci-a.ci);
  const myCIRank=stats.total.games>=MIN_G?ciRanked.findIndex(u=>u===uStats[ME.id])+1:0;

  const ci=calcCI(stats.total.wins,stats.total.games,stats.total.diff||0);
  const grade=ciToLabel(ci);

  const _greetings=['오늘도 스매시 한 방 날려봐요! 🏸','셔틀콕은 배신하지 않아요 💪','오늘 경기 준비됐나요? 🔥','네트 앞에서 빛나세요 ✨','백핸드 클리어, 완벽하게! 🎯','코트 위의 주인공 🏆','땀 흘린 만큼 빛납니다 💦','오늘도 풀스윙 가봅시다 🚀','배드민턴이 최고의 운동! 🥇','스매시로 하루를 시작해요 💥','오늘은 꼭 이겨봐요! 😤','가볍게 몸 풀고 시작해요 🤸'];
  document.getElementById('dash-hello').textContent=`${ME.name}님, ${_greetings[Math.floor(Math.random()*_greetings.length)]}`;
  // 최근 10경기 스트릭
  const recentMatches=[...myMatches].sort((a,b)=>{
    const dd=new Date(b.match_date)-new Date(a.match_date);
    return dd!==0?dd:new Date(b.created_at||0)-new Date(a.created_at||0);
  }).slice(0,10);
  const streakDots=recentMatches.map(m=>{
    const onA=[m.a1_id,m.a2_id].includes(ME.id);
    const won=(m.score_a>m.score_b)===onA;
    return won?'<span style="color:var(--primary);font-size:1rem;" title="승">●</span>':'<span style="color:var(--danger);font-size:1rem;" title="패">●</span>';
  }).join('');
  const streakHTML=recentMatches.length>0
    ?'<div style="border-top:1px solid var(--border);padding:10px 0 4px;"><div style="font-size:.72rem;color:var(--text-muted);margin-bottom:5px;text-align:center;">최근 '+recentMatches.length+'경기</div><div style="display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:wrap;">'+streakDots+'</div></div>'
    :'';
  const wr=stats.total.games>0?Math.round(stats.total.wins/stats.total.games*100):0;
  const diff=stats.total.diff||0;
  const rankBadge=(r,tot)=>{
    if(!r) return '<span style="font-size:.65rem;color:var(--text-dim);display:block;margin-top:1px;">5경기 미만</span>';
    const medal=r===1?'🥇':r===2?'🥈':r===3?'🥉':'';
    return `<span style="font-size:.65rem;color:var(--text-muted);display:block;margin-top:1px;">${medal}전체 ${r}위/${tot}명</span>`;
  };


  // 주력 종목 계산
  const mainTypeLabel='복식';

  // 베스트 파트너 계산 (전체 경기 기준)
  const _partnerMap={};
  myMatches.forEach(m=>{
    const onA=[m.a1_id,m.a2_id].includes(ME.id);
    const won=(m.score_a>m.score_b)===onA;
    let pid=null,pname=null;
    if(onA){if(m.a1_id===ME.id&&m.a2_id){pid=m.a2_id;pname=m.a2_name;}else if(m.a2_id===ME.id){pid=m.a1_id;pname=m.a1_name;}}
    else{if(m.b1_id===ME.id&&m.b2_id){pid=m.b2_id;pname=m.b2_name;}else if(m.b2_id===ME.id){pid=m.b1_id;pname=m.b1_name;}}
    if(!pid) return;
    if(!_partnerMap[pid]) _partnerMap[pid]={name:pname,games:0,wins:0};
    _partnerMap[pid].games++;if(won)_partnerMap[pid].wins++;
  });
  const _partnerList=Object.values(_partnerMap).filter(p=>p.games>0).sort((a,b)=>(b.games>0?b.wins/b.games:0)-(a.games>0?a.wins/a.games:0)||b.wins-a.wins||b.games-a.games);
  const bestPartner=_partnerList[0]||null;

  // CI 등급/게이지
  const ciVal=Math.round(ci);
  const ciMin=900, ciMax=1200;
  const ciPct=Math.min(100,Math.max(0,Math.round((ciVal-ciMin)/(ciMax-ciMin)*100)));
  // 등급 표시 제거

  // 연속 결과 계산
  const streak5=[...recentMatches].slice(0,5).reverse(); // 최근 5경기
  const diffColor=diff>0?'var(--primary)':diff<0?'var(--danger)':'var(--text-muted)';
  const diffStr=(diff>0?'+':'')+diff;
  const streak5HTML=streak5.map(m=>{
    const onA=[m.a1_id,m.a2_id].includes(ME.id);
    const won=(m.score_a>m.score_b)===onA;
    const wonStyle=won?'background:rgba(0,200,150,.2);color:#00C896;border:1.5px solid rgba(0,200,150,.5);':'background:rgba(255,82,82,.15);color:#FF5252;border:1.5px solid rgba(255,82,82,.4);';
    const wonLabel=won?'W':'L';
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:.65rem;font-weight:900;'+wonStyle+'">'+wonLabel+'</span>';
  }).join('');

  // 랭공 반영까지 진행도
  const toRank=Math.max(0,5-stats.total.games);
  const rankProgress=Math.min(100,Math.round(stats.total.games/5*100));

  // 승률 원형 게이지 SVG
  const r=28, circ=2*Math.PI*r;
  const wrFill=Math.round((wr/100)*circ*10)/10;
  const wrCircle='<svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="'+r+'" fill="none" stroke="var(--bg3)" stroke-width="7"/><circle cx="36" cy="36" r="'+r+'" fill="none" stroke="#00C896" stroke-width="7" stroke-dasharray="'+wrFill+' '+circ+'" stroke-linecap="round" transform="rotate(-90 36 36)"/></svg>';

  document.getElementById('my-overview-card').innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'+
      '<div style="font-size:1rem;font-weight:700;color:var(--text);">📊 나의 현황</div>'+
      '<button onclick="event.stopPropagation();showCIInfo()" style="background:var(--bg3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;font-size:.75rem;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit;">?</button>'+
    '</div>'+
    // CI 게이지 섹션
    '<div style="background:var(--bg3);border-radius:12px;padding:14px 16px;margin-bottom:12px;">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'+
        '<div>'+
          '<div style="font-size:.92rem;color:var(--text);font-weight:600;">종합점수</div>'+
          (myCIRank?'<div style="font-size:.86rem;color:var(--primary);font-weight:700;">전체 '+myCIRank+'위 / '+total+'명</div>':'<div style="font-size:.82rem;color:var(--text-muted);">5경기 미만</div>')+
        '</div>'+
        '<div style="display:flex;align-items:baseline;gap:6px;">'+
          '<span style="font-family:Black Han Sans,sans-serif;font-size:2.4rem;color:var(--primary);">'+ciVal+'</span>'+
        '</div>'+
      '</div>'+
      '<div style="height:8px;background:linear-gradient(to right,#4fc3f7,#00C896,#FFD700);border-radius:4px;position:relative;margin-bottom:4px;">'+
        '<div style="position:absolute;top:50%;left:'+ciPct+'%;transform:translate(-50%,-50%);width:14px;height:14px;background:white;border-radius:50%;border:2px solid var(--primary);box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>'+
      '</div>'+
    '</div>'+
    // 3칸 레이아웃: 승률 | 베스트파트너 | [득실차 / 최근전적]
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">'+
      // 1열: 승률
      '<div class="stat-card" style="padding:12px 6px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">'+
        '<div style="font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:4px;">승률</div>'+
        '<div style="position:relative;display:inline-flex;align-items:center;justify-content:center;">'+
          wrCircle+
          '<div style="position:absolute;text-align:center;">'+
            '<div style="font-family:Black Han Sans,sans-serif;font-size:1.05rem;color:#00C896;">'+wr+'%</div>'+
          '</div>'+
        '</div>'+
        '<div style="font-size:.76rem;color:var(--text-muted);font-weight:600;margin-top:4px;">'+stats.total.wins+'승 '+stats.total.losses+'패</div>'+
      '</div>'+
      // 2열: 베스트 파트너
      '<div class="stat-card" style="padding:10px 6px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">'+
        '<div style="font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:6px;">베스트 파트너</div>'+
        (bestPartner?
          '<div style="padding-bottom:7px;border-bottom:1px solid var(--border);width:100%;text-align:center;margin-bottom:7px;">'+
            '<div style="font-size:.95rem;font-weight:700;color:var(--primary);">'+bestPartner.name+'</div>'+
          '</div>'+
          '<div style="font-size:.76rem;color:var(--text-muted);font-weight:500;line-height:1.9;">'+
            bestPartner.wins+'승 '+(bestPartner.games-bestPartner.wins)+'패<br>'+
            Math.round(bestPartner.wins/bestPartner.games*100)+'%'+
          '</div>'
        :'<div style="font-size:.78rem;color:var(--text-muted);padding:4px 0;">기록 없음</div>')+
      '</div>'+
      // 3열: 득실차(위) + 최근전적(아래)
      '<div style="display:flex;flex-direction:column;gap:8px;">'+
        '<div class="stat-card" style="padding:10px 6px;text-align:center;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">'+
          '<div style="font-size:.78rem;font-weight:600;color:var(--text);margin-bottom:6px;">득실차</div>'+
          '<div style="display:flex;flex-direction:column;gap:0;width:100%;">'+
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px 5px;">'+
              '<span style="font-size:.7rem;font-weight:600;color:var(--text-muted);">평균</span>'+
              '<span style="font-size:1.1rem;font-weight:700;color:'+diffColor+';">'+(stats.total.games>0?(diff/stats.total.games>=0?'+':'')+(diff/stats.total.games).toFixed(1):'0.0')+'</span>'+
            '</div>'+
            '<div style="border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;padding:5px 6px 0;">'+
              '<span style="font-size:.7rem;font-weight:600;color:var(--text-muted);">누적</span>'+
              '<span style="font-size:1.1rem;font-weight:700;color:'+diffColor+';">'+diffStr+'</span>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="stat-card" style="padding:8px 6px;text-align:center;flex:1;cursor:pointer;" onclick="goToFeedByName(\''+ME.name+'\')">'+
          '<div style="font-size:.78rem;font-weight:600;color:var(--text);margin-bottom:4px;">최근 전적</div>'+
          '<div style="display:flex;gap:2px;justify-content:center;flex-wrap:nowrap;">'+streak5HTML+'</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
    // 5경기 미만일 때만 랭킹 공식 반영까지 진행바 표시
    (stats.total.games<5?
      '<div style="background:var(--bg3);border-radius:12px;padding:14px 16px;margin-bottom:12px;">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
          '<span style="font-size:.88rem;color:var(--text);font-weight:700;">🏅 랭킹 공식 반영까지</span>'+
          '<span style="font-size:.88rem;color:var(--primary);font-weight:700;">앞으로 '+toRank+'경기 더!</span>'+
        '</div>'+
        '<div style="height:10px;background:var(--bg2);border-radius:6px;overflow:hidden;">'+
          '<div style="height:100%;width:'+rankProgress+'%;background:linear-gradient(to right,var(--primary),#00E5A0);border-radius:6px;transition:width .6s;"></div>'+
        '</div>'+
        '<div style="display:flex;justify-content:space-between;font-size:.76rem;color:var(--text-muted);margin-top:6px;font-weight:500;"><span>0경기</span><span style="color:var(--primary);">'+stats.total.games+'/ 5경기</span></div>'+
      '</div>'
    :'')+

    // 더보기
    '<div style="border-top:1px solid var(--border);padding-top:10px;">'+
      '<div style="display:flex;justify-content:center;align-items:center;cursor:pointer;" onclick="toggleTypeStats()">'+
        '<span id="type-stats-toggle-icon" style="font-size:.82rem;color:var(--text-muted);border:1px solid var(--border);border-radius:20px;padding:4px 18px;">▼ 더보기</span>'+
      '</div>'+
      '<div id="my-type-stats" style="display:none;margin-top:12px;"></div>'+
    '</div>';
  renderMyTypeStats(stats, _allMatchesCache);
  _updateWrTabLabel();
  renderWrTrend(myMatches);
  await renderRankTable(_allMatchesCache);
  renderPartner(_allMatchesCache);
  setTimeout(()=>renderScatter(),100);
}

function computeStats(matches,userId){
  const cats=['doubles','total'];
  const s={};cats.forEach(c=>s[c]={games:0,wins:0,losses:0,scored:0,conceded:0});
  matches.forEach(m=>{
    const onA=[m.a1_id,m.a2_id].includes(userId);
    const aWin=m.score_a>m.score_b;
    const won=onA?aWin:!aWin;
    const myScore=onA?m.score_a:m.score_b;
    const opScore=onA?m.score_b:m.score_a;
    const cat=m.match_type;
    if(s[cat]){s[cat].games++;if(won)s[cat].wins++;else s[cat].losses++;s[cat].scored+=myScore;s[cat].conceded+=opScore;}
    s.total.games++;if(won)s.total.wins++;else s.total.losses++;
    s.total.scored+=myScore;s.total.conceded+=opScore;
  });
  ['doubles','total'].forEach(c=>{s[c].diff=s[c].scored-s[c].conceded;});
  return s;
}

function toggleTypeStats(){
  const el=document.getElementById('my-type-stats');
  const icon=document.getElementById('type-stats-toggle-icon');
  if(!el) return;
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  icon.textContent=open?'▲ 닫기':'▼ 더보기';
}

/* ─ 종목별 세부 통계 테이블 ─ */
function renderMyTypeStats(stats, allM){
  const sameType='doubles';
  const typeLabel={doubles:'복식'};
  const typeIcon={doubles:'🏸'};
  // CI 순위 계산용 - 전체 랭킹 데이터 재활용
  allM=allM||window._allMatchesCache||[];
  const uStats2={};
  allM.filter(m=>m.status==='approved').forEach(m=>{
    const aWin=m.score_a>m.score_b;
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id).forEach(p=>{
      if(!uStats2[p.id+'_'+m.match_type]) uStats2[p.id+'_'+m.match_type]={wins:0,games:0,scored:0,conceded:0};
      const s=uStats2[p.id+'_'+m.match_type];
      s.games++;if(p.win)s.wins++;s.scored+=p.s;s.conceded+=p.c;
    });
  });
  // exclude_stats 유저 ID 셋 (window._allMatchesCache 기반 랭킹과 동일 기준 적용)
  const _excludedIds=new Set((window._rankExcludedIds||[]));
  const getRank=(type)=>{
    const all={};
    allM.filter(m=>m.status==='approved'&&m.match_type===type).forEach(m=>{
      const aWin=m.score_a>m.score_b;
      [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
       {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
      .filter(p=>p.id&&!_excludedIds.has(p.id)).forEach(p=>{
        if(!all[p.id]) all[p.id]={id:p.id,wins:0,games:0,scored:0,conceded:0};
        const s=all[p.id]; s.games++;if(p.win)s.wins++;s.scored+=p.s;s.conceded+=p.c;
      });
    });
    // 5경기 이상만 랭킹 대상
    const list=Object.values(all).filter(u=>u.games>=5).map(u=>({...u,ci:calcCI(u.wins,u.games,u.scored-u.conceded)})).sort((a,b)=>b.ci-a.ci);
    const myIdx=list.findIndex(u=>u.id===ME?.id);
    return myIdx>=0?{rank:myIdx+1,total:list.length}:null;
  };

  const cats=['total'];
  const catLabel={total:'합계'};
  const catIcon={[sameType]:typeIcon[sameType],mixed:'🟡',total:'📊'};

  let rows='';
  cats.forEach(c=>{
    const d=stats[c]||{games:0,wins:0,losses:0,diff:0};
    const wr=d.games>0?Math.round(d.wins/d.games*100):0;
    const ci=Math.round(calcCI(d.wins,d.games,d.diff||0));
    const diffSign=d.diff>0?'+':'';
    const diffCol=d.diff>0?'var(--primary)':d.diff<0?'var(--danger)':'var(--text-muted)';
    const rankInfo=c==='total'?null:getRank(c);
    const rankTxt=rankInfo?rankInfo.rank+'위':'—';
    const isTotal=c==='total';
    rows+=`<tr style="${isTotal?'border-top:2px solid var(--border);font-weight:700;background:var(--bg3);':''}">
      <td style="padding:7px 6px;font-size:.78rem;">${catIcon[c]} ${catLabel[c]}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;">${d.games}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;">${d.wins}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;">${d.losses}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;font-weight:700;">${wr}%</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;color:${diffCol};font-weight:700;">${diffSign}${d.diff||0}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;color:var(--primary);font-weight:700;">${ci}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.72rem;color:var(--text-muted);">${rankTxt}</td>
    </tr>`;
  });

  const tableHTML=`
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="padding:5px 6px;text-align:left;font-size:.65rem;color:var(--text-muted);font-weight:600;">종목</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">경기</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">승</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">패</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">승률</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">득실</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">종합</th>
            <th style="padding:5px 4px;text-align:center;font-size:.65rem;color:var(--text-muted);font-weight:600;">순위</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('my-type-stats').innerHTML=
    tableHTML +
    '<div style="margin-top:16px;" id="radar-wrap"></div>';

  // 레이더 차트 렌더링
  renderRadarChart(stats, allM);
}

/* ─ 레이더 차트 ─ */
function renderRadarChart(stats, allMatches){
  const wrap=document.getElementById('radar-wrap');
  if(!wrap) return;
  const total=stats.total;
  if(!total||total.games<1){wrap.innerHTML='';return;}

  // ── 클럽 전체 통계 집계 ──
  const clubStats={};
  allMatches.filter(m=>m.status==='approved').forEach(m=>{
    const aWin=m.score_a>m.score_b;
    const margin=Math.abs(m.score_a-m.score_b);
    [{id:m.a1_id,win:aWin,scored:m.score_a,conceded:m.score_b},
     {id:m.a2_id,win:aWin,scored:m.score_a,conceded:m.score_b},
     {id:m.b1_id,win:!aWin,scored:m.score_b,conceded:m.score_a},
     {id:m.b2_id,win:!aWin,scored:m.score_b,conceded:m.score_a}]
    .filter(p=>p.id).forEach(p=>{
      if(!clubStats[p.id]) clubStats[p.id]={wins:0,games:0,scored:0,conceded:0,closeWins:0,closeGames:0,totalMargin:0};
      const s=clubStats[p.id];
      s.games++; if(p.win)s.wins++;
      s.scored+=p.scored; s.conceded+=p.conceded;
      // 안정성: 점수 마진 (이기면 +margin, 지면 -margin)
      s.totalMargin+=(p.win?margin:-margin);
      // 집중력: 접전(±3점 이내) 승률
      if(margin<=3){s.closeGames++;if(p.win)s.closeWins++;}
    });
  });

  const clubList=Object.values(clubStats).filter(u=>u.games>=5);
  if(!clubList.length){wrap.innerHTML='';return;}

  const me=clubStats[ME.id];
  if(!me||me.games<1){wrap.innerHTML='';return;}

  const maxGames=Math.max(...clubList.map(u=>u.games),1);

  // ── 5개 축 점수 (0~100) ──

  // 1. 승부력: 신뢰보정 승률
  const conf=me.games/(me.games+10);
  const adjWR=(me.wins/me.games)*conf;
  const maxConf=Math.max(...clubList.map(u=>(u.wins/u.games)*(u.games/(u.games+10))),0.001);
  const score_win=Math.round(Math.min(adjWR/maxConf,1)*100);

  // 2. 안정성: 경기당 평균 점수 마진 (클럽 내 정규화)
  const myMarginPG=me.totalMargin/me.games;
  const allMargins=clubList.map(u=>u.totalMargin/u.games);
  const minM=Math.min(...allMargins), maxM=Math.max(...allMargins);
  const rangeM=maxM-minM||1;
  const score_stable=Math.round(Math.max(0,Math.min((myMarginPG-minM)/rangeM,1))*100);

  // 3. 활동량: 총 경기수
  const score_act=Math.round(Math.min(me.games/maxGames,1)*100);

  // 4. 집중력: 접전(±3점) 승률
  const closeWR=me.closeGames>0?me.closeWins/me.closeGames:(me.wins/me.games);
  const maxCloseWR=Math.max(...clubList.map(u=>u.closeGames>0?u.closeWins/u.closeGames:u.wins/u.games),0.001);
  const score_focus=Math.round(Math.min(closeWR/maxCloseWR,1)*100);

  // 5. 최근 폼: 최근 10경기 승률 vs 전체 승률 (상승세/하락세)
  const myMatches=allMatches.filter(m=>m.status==='approved'&&[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(ME.id))
    .sort((a,b)=>(b.match_date||'').localeCompare(a.match_date||'')||(b.created_at||'').localeCompare(a.created_at||''));
  const recent10=myMatches.slice(0,10);
  const recentWins=recent10.filter(m=>{const onA=[m.a1_id,m.a2_id].includes(ME.id);return onA?(m.score_a>m.score_b):(m.score_b>m.score_a);}).length;
  const recentWR=recent10.length>0?recentWins/recent10.length:(me.wins/me.games);
  // 클럽 전체의 최근 10경기 최고 승률 기준 정규화
  const clubRecent=clubList.map(uid=>{
    const uid_str=Object.keys(clubStats).find(k=>clubStats[k]===uid);
    const rm=allMatches.filter(m=>m.status==='approved'&&[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(uid_str))
      .sort((a,b)=>(b.match_date||'').localeCompare(a.match_date||'')).slice(0,10);
    const rw=rm.filter(m=>{const onA=[m.a1_id,m.a2_id].includes(uid_str);return onA?(m.score_a>m.score_b):(m.score_b>m.score_a);}).length;
    return rm.length>0?rw/rm.length:uid.wins/uid.games;
  });
  const maxRecentWR=Math.max(...clubRecent,0.001);
  const score_form=Math.round(Math.min(recentWR/maxRecentWR,1)*100);

  const scores=[score_win,score_stable,score_act,score_focus,score_form];
  const labels=['승률','안정성','활동량','집중력','최근폼'];

  // 각 항목 설명 (팝업용)
  const descs=[
    {name:'승률',score:score_win,icon:'⚔️',desc:'신뢰도를 반영한 승률 지표입니다. 경기수가 적을수록 보정되어 낮게 측정되며, 충분한 경기수(30경기 이상)일수록 실제 승률에 근접합니다.\n\n계산: 승률 × (경기수 ÷ (경기수+10)) ÷ 클럽 최고값'},
    {name:'안정성',score:score_stable,icon:'📊',desc:'경기당 평균 점수 마진(득점-실점)입니다. 크게 이기고 적게 지는 선수일수록 높습니다. 단순 승률과 달리 얼마나 여유있게 이기는지를 반영합니다.\n\n계산: 경기당 평균 (득점-실점) → 클럽 내 정규화'},
    {name:'활동량',score:score_act,icon:'🏃',desc:'클럽 내 최다 경기 참여자 대비 경기 참여 비율입니다. 자주 참여할수록 높아지며, 통계 신뢰도와도 연결됩니다.\n\n계산: 내 총 경기수 ÷ 클럽 최다 경기수'},
    {name:'집중력',score:score_focus,icon:'🎯',desc:'접전 상황(점수차 3점 이하)에서의 승률입니다. 막상막하 상황에서 얼마나 강한지를 측정합니다. 승부욕, 멘탈, 클러치 능력을 반영합니다.\n\n계산: (3점차 이하 경기 승수) ÷ (3점차 이하 경기수)'},
    {name:'최근폼',score:score_form,icon:'📈',desc:'최근 10경기 승률 기준 현재 컨디션 지표입니다. 전체 기록과 관계없이 요즘 잘하고 있는지를 보여줍니다. 부진 중인 선수는 낮고, 상승세인 선수는 높게 나옵니다.\n\n계산: 최근 10경기 승률 ÷ 클럽 최고 최근폼'},
  ];

  const isDark=!document.body.classList.contains('light-mode');
  const size=220;
  const cx=size/2, cy=size/2+10;
  const R=82, axes=5;
  const angleOffset=-Math.PI/2;
  const pts=n=>Array.from({length:axes},(_,i)=>{
    const a=angleOffset+(2*Math.PI/axes)*i;
    return [cx+n*Math.cos(a), cy+n*Math.sin(a)];
  });

  const gridLevels=[20,40,60,80,100];
  const colorFill=isDark?'rgba(56,189,248,0.15)':'rgba(37,99,235,0.12)';
  const colorStroke=isDark?'rgba(56,189,248,0.85)':'rgba(37,99,235,0.85)';
  const colorGrid=isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)';
  const colorAxis=isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.12)';
  const colorLabel=isDark?'#94a3b8':'#475569';
  const colorDot=isDark?'#38bdf8':'#2563eb';

  let svgGrid='',svgAxes='',svgFill='',svgDots='',svgLabels='';

  gridLevels.forEach(lv=>{
    const gp=pts(R*lv/100);
    svgGrid+=`<polygon points="${gp.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${colorGrid}" stroke-width="1"/>`;
  });
  pts(R).forEach(([x,y])=>{
    svgAxes+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${colorAxis}" stroke-width="1"/>`;
  });
  const dp=scores.map((s,i)=>{const a=angleOffset+(2*Math.PI/axes)*i;return[cx+(R*s/100)*Math.cos(a),cy+(R*s/100)*Math.sin(a)];});
  svgFill=`<polygon points="${dp.map(p=>p.join(',')).join(' ')}" fill="${colorFill}" stroke="${colorStroke}" stroke-width="2"/>`;
  dp.forEach(([x,y])=>{
    svgDots+=`<circle cx="${x}" cy="${y}" r="4" fill="${colorDot}" stroke="${isDark?'#0f172a':'#fff'}" stroke-width="2"/>`;
  });
  pts(R+20).forEach(([x,y],i)=>{
    const anchor=x<cx-4?'end':x>cx+4?'start':'middle';
    svgLabels+=`<text x="${x}" y="${y-4}" text-anchor="${anchor}" font-size="10" fill="${colorLabel}" font-family="inherit" font-weight="600">${labels[i]}</text>`;
    svgLabels+=`<text x="${x}" y="${y+9}" text-anchor="${anchor}" font-size="10" fill="${colorDot}" font-family="inherit" font-weight="700">${scores[i]}</text>`;
  });

  // 하단 배지 (클릭 시 팝업)
  const badgeHTML=descs.map((d,i)=>`
    <button onclick="showRadarDesc(${i})" style="display:flex;align-items:center;gap:3px;font-size:.68rem;color:var(--text-muted);background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:3px 7px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">
      <span style="font-weight:600;">${d.name}</span>
      <b style="color:${colorDot};">${d.score}</b>
    </button>`).join('');

  wrap.innerHTML=`
    <div style="display:flex;justify-content:center;">
      <svg width="${size}" height="${size+10}" viewBox="0 0 ${size} ${size+10}" style="overflow:visible;">
        ${svgGrid}${svgAxes}${svgFill}${svgDots}${svgLabels}
      </svg>
    </div>
    <div style="display:flex;flex-wrap:nowrap;gap:4px;justify-content:center;margin-top:10px;overflow-x:auto;padding-bottom:2px;">
      ${badgeHTML}
    </div>
    <div style="font-size:.65rem;color:var(--text-dim);text-align:center;margin-top:8px;">항목 눌러서 설명 보기 · 클럽 내 최고 기준 정규화</div>
  `;

  // 설명 팝업 데이터 전역 저장
  window._radarDescs=descs;
}

function showRadarDesc(i){
  const d=window._radarDescs[i];
  if(!d) return;
  showConfirm({
    icon:d.icon,
    title:d.name,
    msg:d.desc,
    okLabel:'확인',
    okClass:'btn-primary',
    onOk:()=>{},
    extraClass:'ci-info-modal'
  });
}

/* ─ 승률 추이 선그래프 ─ */
let _trendTab='ci';
let _wrMatchesCache=[];

function _updateWrTabLabel(){
  // 레거시 호환 (더 이상 사용 안 함)
}
function switchTrendTab(tab){
  _trendTab=tab;
  ['winrate','diff','ci'].forEach(t=>{
    const el=document.getElementById('trend-tab-'+t);
    if(el) el.classList.toggle('active',t===tab);
  });
  renderWrTrend(_wrMatchesCache);
}

function renderWrTrend(myMatches){
  _wrMatchesCache=myMatches||[];
  const canvas=document.getElementById('wr-trend-canvas');
  const emptyEl=document.getElementById('wr-trend-empty');
  if(!canvas) return;

  // 날짜순 정렬
  const filtered=[...myMatches].sort((a,b)=>{
    const dd=new Date(a.match_date)-new Date(b.match_date);
    return dd!==0?dd:new Date(a.created_at||0)-new Date(b.created_at||0);
  });

  // 날짜별 그룹핑
  const dateMap=new Map();
  filtered.forEach(m=>{
    const dateKey=(m.match_date||'').slice(0,10);
    if(!dateKey) return;
    const onA=[m.a1_id,m.a2_id].includes(ME.id);
    const aWin=m.score_a>m.score_b;
    const won=onA?aWin:!aWin;
    const myScore=onA?m.score_a:m.score_b;
    const opScore=onA?m.score_b:m.score_a;
    if(!dateMap.has(dateKey)) dateMap.set(dateKey,{wins:0,total:0,scored:0,conceded:0});
    const d=dateMap.get(dateKey);
    d.total++; if(won) d.wins++;
    d.scored+=myScore; d.conceded+=opScore;
  });

  const sortedDates=[...dateMap.keys()].sort();
  if(sortedDates.length<1){
    canvas.style.display='none';
    if(emptyEl) emptyEl.style.display='block';
    return;
  }
  canvas.style.display='block';
  if(emptyEl) emptyEl.style.display='none';

  // 누적 포인트 계산
  const points=[];
  let cumWins=0,cumTotal=0,cumScored=0,cumConceded=0;
  sortedDates.forEach(dateKey=>{
    const {wins,total,scored,conceded}=dateMap.get(dateKey);
    cumWins+=wins; cumTotal+=total; cumScored+=scored; cumConceded+=conceded;
    const cumDiff=cumScored-cumConceded;
    const cumCI=calcCI(cumWins,cumTotal,cumDiff);
    const d=new Date(dateKey+'T00:00:00');
    const label=`${d.getMonth()+1}/${d.getDate()}`;
    points.push({
      wr:Math.round(cumWins/cumTotal*100),
      diff:cumDiff,
      ci:Math.round(cumCI),
      label,
      dayWins:wins, dayTotal:total
    });
  });

  // 탭별 값 추출
  const tab=_trendTab;
  const vals=points.map(p=>tab==='winrate'?p.wr:tab==='diff'?p.diff:p.ci);
  let minV=Math.min(...vals), maxV=Math.max(...vals);
  // 승률은 0~100 범위 고정
  if(tab==='winrate'){ minV=Math.min(minV,0); maxV=100; }
  const range=maxV-minV||1;

  // 캔버스 설정
  const dpr=window.devicePixelRatio||1;
  const W=canvas.parentElement.offsetWidth||320;
  const H=180;
  canvas.width=W*dpr; canvas.height=H*dpr; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  const isLight=document.body.classList.contains('light-mode');
  const PAD={t:16,r:16,b:36,l:48};
  const cw=W-PAD.l-PAD.r, ch=H-PAD.t-PAD.b;

  ctx.clearRect(0,0,W,H);

  const gridColor=isLight?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.07)';
  const textColor=isLight?'#57534E':'#A0AEBB';
  const lineColor=tab==='winrate'?'#00C896':tab==='diff'?'#4285F4':'#F9A825';
  const fillColor=tab==='winrate'?'rgba(0,200,150,0.10)':tab==='diff'?'rgba(66,133,244,0.10)':'rgba(249,168,37,0.10)';
  const dotWin=isLight?'#009970':'#00C896';
  const dotLoss=isLight?'#B01060':'#FF5252';

  // Y 그리드 5단계
  const gridCount=4;
  ctx.font=`10px 'Noto Sans KR',sans-serif`;
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let i=0;i<=gridCount;i++){
    const v=minV+Math.round((range/gridCount)*i);
    const y=PAD.t+ch-((v-minV)/range)*ch;
    ctx.strokeStyle=gridColor; ctx.lineWidth=0.8; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+cw,y); ctx.stroke();
    const label=tab==='winrate'?v+'%':tab==='diff'?(v>0?'+'+v:v)+'':v+'';
    ctx.fillStyle=textColor;
    ctx.fillText(label,PAD.l-6,y);
  }
  // 0선 (diff/ci일 때)
  if(tab!=='winrate'&&minV<0&&maxV>0){
    const y0=PAD.t+ch-((0-minV)/range)*ch;
    ctx.strokeStyle=isLight?'rgba(0,0,0,0.2)':'rgba(255,255,255,0.2)';
    ctx.lineWidth=1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(PAD.l,y0); ctx.lineTo(PAD.l+cw,y0); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.setLineDash([]);

  // X 라벨
  ctx.textAlign='center'; ctx.textBaseline='top';
  const step=Math.ceil(points.length/8);
  points.forEach((p,i)=>{
    if(i%step===0||i===points.length-1){
      const x=PAD.l+(i/(points.length-1||1))*cw;
      ctx.fillStyle=textColor;
      ctx.fillText(p.label,x,H-PAD.b+6);
    }
  });

  const xOf=i=>PAD.l+(i/(points.length-1||1))*cw;
  const yOf=v=>PAD.t+ch-((v-minV)/range)*ch;

  // 면적
  ctx.beginPath();
  points.forEach((p,i)=>{ const v=vals[i]; i===0?ctx.moveTo(xOf(i),yOf(v)):ctx.lineTo(xOf(i),yOf(v)); });
  ctx.lineTo(xOf(points.length-1),PAD.t+ch);
  ctx.lineTo(xOf(0),PAD.t+ch);
  ctx.closePath();
  ctx.fillStyle=fillColor; ctx.fill();

  // 선
  ctx.beginPath(); ctx.strokeStyle=lineColor; ctx.lineWidth=2.2; ctx.lineJoin='round';
  points.forEach((p,i)=>{ const v=vals[i]; i===0?ctx.moveTo(xOf(i),yOf(v)):ctx.lineTo(xOf(i),yOf(v)); });
  ctx.stroke();

  // 점
  const showAllDots=points.length<=30;
  points.forEach((p,i)=>{
    if(!showAllDots&&i!==points.length-1) return;
    const v=vals[i];
    ctx.beginPath();
    ctx.arc(xOf(i),yOf(v),showAllDots?3:5,0,Math.PI*2);
    ctx.fillStyle=(p.dayWins/p.dayTotal>=0.5)?dotWin:dotLoss;
    ctx.fill();
  });
}

async function renderRankTable(allMatches){
  const{data:users}=await sb.from('profiles').select('*').eq('status','approved');
  if(!users) return;
  const userStats={};
  users.filter(u=>!u.exclude_stats).forEach(u=>{userStats[u.id]={id:u.id,name:u.name,games:0,wins:0,losses:0,scored:0,conceded:0};});
  const filtered=rankTab==='all'?allMatches:allMatches.filter(m=>m.match_type===rankTab);
  filtered.forEach(m=>{
    const aWin=m.score_a>m.score_b;
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id).forEach(p=>{
      if(!userStats[p.id])return;
      userStats[p.id].games++;
      if(p.win)userStats[p.id].wins++;else userStats[p.id].losses++;
      userStats[p.id].scored+=p.s;userStats[p.id].conceded+=p.c;
    });
  });
  Object.values(userStats).forEach(u=>{u.diff=u.scored-u.conceded;u.ci=calcCI(u.wins,u.games,u.diff);});
  let sorted=Object.values(userStats).filter(u=>u.games>0);
  const wr=u=>u.games>0?u.wins/u.games:0;
  const multiSort=(keys)=>(a,b)=>{for(const k of keys){const d=k(b)-k(a);if(d!==0)return d;}return 0;};
  if(sortBy==='winrate') sorted.sort(multiSort([wr,u=>u.wins,u=>u.diff,u=>u.games]));
  else if(sortBy==='wins') sorted.sort(multiSort([u=>u.wins,wr,u=>u.diff,u=>u.games]));
  else if(sortBy==='diff') sorted.sort(multiSort([u=>u.diff,wr,u=>u.wins,u=>u.games]));
  else if(sortBy==='ci') sorted.sort(multiSort([u=>u.ci,wr,u=>u.wins,u=>u.diff]));
  else sorted.sort(multiSort([u=>u.games,wr,u=>u.wins,u=>u.diff]));
  if(sortDir===-1) sorted.reverse();
  const cls=['','top1','top2','top3'];
  const diffColor=d=>d>0?'color:var(--primary)':d<0?'color:var(--danger)':'color:var(--text-muted)';
  const MIN_GAMES=5; // 5경기 이상만 순위 부여
  const LIMIT=5;
  // 5경기 이상: 순위 부여 / 미만: 뒤에 흐리게 표시
  const ranked=sorted.filter(u=>u.games>=MIN_GAMES);
  const unranked=sorted.filter(u=>u.games<MIN_GAMES);
  const allDisplay=[...ranked,...unranked];
  const wrap=document.getElementById('rank-table-wrap');
  const isExpanded=wrap?.dataset.expanded==='true';
  const display=isExpanded?allDisplay:allDisplay.slice(0,LIMIT);
  let rankIdx=0;
  const rows=display.map((u)=>{
    const isRanked=u.games>=MIN_GAMES;
    if(isRanked) rankIdx++;
    const ri=rankIdx;
    const rankCell=isRanked
      ?`<span class="rank-no ${cls[ri]||''}">${ri===1?'🥇':ri===2?'🥈':ri===3?'🥉':ri}</span>`
      :`<span class="rank-no" style="color:var(--text-dim);font-size:.8rem;">-</span>`;
    const wr=u.games>0?Math.round(u.wins/u.games*100)+'%':'0%';
    const diff=`<span style="${diffColor(u.diff)}">${u.diff>0?'+':''}${u.diff}</span>`;
    const ciVal=`<span style="font-weight:700;">${Math.round(u.ci)}</span>`;
    return `<tr class="${u.id===ME.id?'me':''}" ${!isRanked?'style="opacity:0.55;"':''}>
    <td>${rankCell}</td>
    <td><span class="rank-name" onclick="goToFeedByName('${u.name.replace(/'/g,"\\'")}')">${u.name}</span></td>
    <td style="text-align:center;">${u.games}</td>
    <td style="text-align:center;font-weight:700;">${u.wins}</td>
    <td style="text-align:center;font-weight:700;">${u.losses}</td>
    <td style="text-align:center;" class="rank-wr">${wr}</td>
    <td style="text-align:center;font-weight:700;">${diff}</td>
    <td style="text-align:center;font-size:.85rem;">${ciVal}</td>
  </tr>`;}).join('');
  const moreRow=(!isExpanded&&allDisplay.length>LIMIT)
    ?`<tr><td colspan="8" style="text-align:center;padding:10px;"><button onclick="document.getElementById('rank-table-wrap').dataset.expanded='true';renderRankTable(window._allMatchesCache)" style="background:var(--bg2);border:1px solid var(--border);color:var(--primary);border-radius:8px;padding:6px 18px;font-family:inherit;font-size:.82rem;cursor:pointer;">더보기 (${allDisplay.length-LIMIT}명 더) ▼</button></td></tr>`
    :(isExpanded&&allDisplay.length>LIMIT
      ?`<tr><td colspan="8" style="text-align:center;padding:10px;"><button onclick="document.getElementById('rank-table-wrap').dataset.expanded='false';renderRankTable(window._allMatchesCache)" style="background:var(--bg2);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:6px 18px;font-family:inherit;font-size:.82rem;cursor:pointer;">접기 ▲</button></td></tr>`
      :'');
  const _arr=(col)=>sortBy===col?(sortDir===1?'▾':'▴'):'▾';
  wrap.innerHTML=`<table class="rank-table">
    <thead><tr>
      <th>#</th><th>이름</th>
      <th onclick="setSort('games')" style="text-align:center;">경기${_arr('games')}</th>
      <th onclick="setSort('wins')" style="text-align:center;">승${_arr('wins')}</th>
      <th style="text-align:center;">패</th>
      <th onclick="setSort('winrate')" style="text-align:center;">승률${_arr('winrate')}</th>
      <th onclick="setSort('diff')" style="text-align:center;">득실${_arr('diff')}</th>
      <th onclick="setSort('ci')" style="text-align:center;cursor:pointer;">종합${_arr('ci')}</th>
    </tr></thead>
    <tbody>${rows||'<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">데이터 없음</td></tr>'}${moreRow}</tbody>
  </table>`;
  renderPartner(_allMatchesCache);
}

function toggleFeedType(type){
  const sel=document.getElementById('feed-type-filter');
  if(!sel) return;
  const cur=sel.value;
  sel.value=(cur===type)?'':type; // 같은 거 다시 누르면 전체로
  // 범례 버튼 활성 스타일 갱신

  _feedPage=1;
  renderFeed();
}

function goToFeedByName(name){
  navigateTo('feed');
  setTimeout(()=>{
    const el=document.getElementById('feed-name-search');
    if(el){el.value=name;}
    renderFeed(name);
  },150);
}

function switchRankTab(tab){
  rankTab=tab;
  document.querySelectorAll('#rank-tabs .sub-tab').forEach((el,i)=>el.classList.toggle('active',['all'][i]===tab));
  renderRankTable(_allMatchesCache);
}
function setSort(s){
  if(sortBy===s) sortDir*=-1; // 같은 항목 재클릭 → 방향 토글
  else { sortBy=s; sortDir=1; } // 새 항목 → 내림차순 초기화
  document.querySelectorAll('.sort-pill').forEach((el,i)=>el.classList.toggle('active',['ci','winrate','wins','diff','games'][i]===s));
  renderRankTable(_allMatchesCache);
}

/* ── BEST PARTNER ── */
let partnerTab='all';
function switchPartnerTab(tab){
  partnerTab=tab;
  const tabs=['all'];
  document.querySelectorAll('#partner-tabs .sub-tab').forEach((el,i)=>el.classList.toggle('active',tabs[i]===tab));
  renderPartner(_allMatchesCache);
}
function updatePartnerTabLabel(){
  const el=document.getElementById('partner-tab-same');
  if(el) el.textContent=sameLabel;
}
function renderPartner(allMatches){
  updatePartnerTabLabel();
  const el=document.getElementById('partner-list');
  if(!el) return;
  const sameType='doubles';
  const filtered=allMatches.filter(m=>{
    if(m.status!=='approved') return false;
    if(partnerTab==='same') return m.match_type===sameType;
    return true;
  });
  const partners={};
  filtered.forEach(m=>{
    const onA=[m.a1_id,m.a2_id].includes(ME.id);
    const onB=[m.b1_id,m.b2_id].includes(ME.id);
    if(!onA&&!onB) return;
    const aWin=m.score_a>m.score_b;
    const won=onA?aWin:!aWin;
    let partnerId=null, partnerName=null;
    if(onA){if(m.a1_id===ME.id&&m.a2_id){partnerId=m.a2_id;partnerName=m.a2_name;}else if(m.a2_id===ME.id&&m.a1_id){partnerId=m.a1_id;partnerName=m.a1_name;}}
    else{if(m.b1_id===ME.id&&m.b2_id){partnerId=m.b2_id;partnerName=m.b2_name;}else if(m.b2_id===ME.id&&m.b1_id){partnerId=m.b1_id;partnerName=m.b1_name;}}
    if(!partnerId) return;
    if(!partners[partnerId]) partners[partnerId]={id:partnerId,name:partnerName,games:0,wins:0};
    partners[partnerId].games++;if(won) partners[partnerId].wins++;
  });
  const list=Object.values(partners).filter(p=>p.games>0);
  if(!list.length){el.innerHTML=`<div class="empty-state" style="padding:20px 0;"><div class="empty-icon" style="font-size:2rem;">🤝</div><div>파트너 기록 없음</div></div>`;return;}
  list.sort((a,b)=>(b.games>0?b.wins/b.games:0)-(a.games>0?a.wins/a.games:0)||b.wins-a.wins||b.games-a.games);
  el.innerHTML=list.map((p,i)=>{
    const wr=p.games>0?Math.round(p.wins/p.games*100):0;
    const isBest=i===0;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="width:28px;text-align:center;font-size:${isBest?'1.3rem':'.9rem'};font-weight:700;color:${isBest?'var(--accent)':'var(--text-muted)'};">${isBest?'🥇':i+1}</div>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-weight:700;font-size:.95rem;">${p.name}</span>
          ${isBest?'<span style="font-size:.72rem;background:rgba(var(--accent-rgb,255,214,0),.15);color:var(--accent);border:1px solid rgba(var(--accent-rgb,255,214,0),.3);border-radius:8px;padding:1px 7px;font-weight:700;">베스트 파트너 🏆</span>':''}
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">${p.games}경기 · ${p.wins}승 · 승률 ${wr}%</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:Black Han Sans,sans-serif;font-size:1.1rem;color:${wr>=50?'var(--primary)':'var(--text-muted)'};">${wr}%</div>
        <div style="font-size:.72rem;color:var(--text-dim);">승률</div>
      </div>
    </div>`;
  }).join('');
}

/* ── SCATTER PLOT ── */
function renderScatter(){
  const canvas=document.getElementById('scatter-canvas');
  if(!canvas) return;
  const allMatches=_allMatchesCache.filter(m=>m.status==='approved');

  // 회원별 통계 집계
  const statsMap={};
  allMatches.forEach(m=>{
    const players=[
      {id:m.a1_id,name:m.a1_name,onA:true},
      {id:m.a2_id,name:m.a2_name,onA:true},
      {id:m.b1_id,name:m.b1_name,onA:false},
      {id:m.b2_id,name:m.b2_name,onA:false}
    ].filter(p=>p.id);
    const aWin=m.score_a>m.score_b;
    players.forEach(p=>{
      if(!statsMap[p.id]) statsMap[p.id]={id:p.id,name:p.name,games:0,wins:0,scored:0,conceded:0};
      const s=statsMap[p.id];
      const won=p.onA?aWin:!aWin;
      s.games++;
      if(won) s.wins++;
      s.scored+=p.onA?m.score_a:m.score_b;
      s.conceded+=p.onA?m.score_b:m.score_a;
    });
  });

  const players=Object.values(statsMap).filter(p=>p.games>=1);
  if(!players.length){canvas.style.display='none';return;}
  canvas.style.display='block';

  // 하이라이트 셀렉트 옵션 갱신
  const sel=document.getElementById('scatter-highlight');
  const prevVal=sel?.value||'';
  if(sel){
    const opts=players.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    sel.innerHTML=`<option value="">— 선수 하이라이트 —</option>`+opts.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    sel.value=prevVal;
  }
  const hlId=sel?.value||'';

  // 캔버스 크기 설정
  const dpr=window.devicePixelRatio||1;
  const W=canvas.parentElement.offsetWidth||320;
  const H=Math.round(W*0.65);
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  // 여백
  const pad={l:44,r:20,t:20,b:36};
  const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

  // 축 범위
  const wrs=players.map(p=>Math.round(p.wins/p.games*100));
  const diffs=players.map(p=>p.games>0?(p.scored-p.conceded)/p.games:0); // 평균 득실차
  const minX=0, maxX=100;
  const rawMinY=Math.min(...diffs), rawMaxY=Math.max(...diffs);
  const dataRange=rawMaxY-rawMinY;
  // 평균 득실차 기준: 여백 15%, 최소 0.3
  const padY=Math.max(dataRange*0.15, 0.3);
  const minY=rawMinY-padY, maxY=rawMaxY+padY;

  const toX=v=>pad.l+(v-minX)/(maxX-minX)*cw;
  const toY=v=>pad.t+(maxY-v)/(maxY-minY)*ch;

  // 배경
  const isDark=!document.body.classList.contains('light-mode');
  ctx.fillStyle=isDark?'#161b22':'#f6f8fa';
  ctx.fillRect(0,0,W,H);

  // 그리드
  ctx.strokeStyle=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)';
  ctx.lineWidth=1;
  [0,25,50,75,100].forEach(v=>{
    const x=toX(v);
    ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+ch);ctx.stroke();
    ctx.fillStyle=isDark?'#8b949e':'#6e7781';
    ctx.font=`10px sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillText(v+'%',x,pad.t+ch+4);
  });

  // Y축 그리드
  const yRange=maxY-minY;
  const yStep=yRange<=2?0.5:yRange<=5?1:yRange<=10?2:yRange<=20?5:yRange<=50?10:20;
  const yStart=Math.ceil(minY/yStep)*yStep;
  for(let v=yStart;v<=maxY+yStep*0.01;v=Math.round((v+yStep)*100)/100){
    const y=toY(v);
    ctx.strokeStyle=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)';
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();
    ctx.fillStyle=isDark?'#8b949e':'#6e7781';
    ctx.font='10px sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    const label=Number.isInteger(v)?v:v.toFixed(1);
    ctx.fillText(label,pad.l-4,y);
  }

  // 0선 강조
  if(minY<0&&maxY>0){
    const y0=toY(0);
    ctx.strokeStyle=isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.2)';
    ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(pad.l,y0);ctx.lineTo(pad.l+cw,y0);ctx.stroke();
    ctx.lineWidth=1;
  }

  // 점 그리기
  players.forEach(p=>{
    const wr=Math.round(p.wins/p.games*100);
    const diff=p.games>0?(p.scored-p.conceded)/p.games:0; // 평균 득실차
    const x=toX(wr), y=toY(diff);
    const isHL=p.id===hlId;
    const isMe=p.id===ME?.id;
    const r=isHL||isMe?9:6;

    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=isHL?'#00c896':isMe?'#2979ff':'rgba(0,200,150,0.45)';
    ctx.fill();

    if(isHL){
      ctx.strokeStyle='#FFD600';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.stroke();
      ctx.lineWidth=1;
    } else if(isMe){
      ctx.strokeStyle='#2979ff';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.stroke();
      ctx.lineWidth=1;
    }

    // 이름 레이블 (하이라이트/본인만)
    if(isHL||isMe){
      ctx.font=`bold 11px sans-serif`;
      ctx.fillStyle=isDark?'#e6edf3':'#24292f';
      ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(p.name,x,y-r-3);
    }
  });

  // 축 레이블
  ctx.fillStyle=isDark?'#8b949e':'#6e7781';
  ctx.font='11px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='top';
  ctx.fillText('승률 (%)',pad.l+cw/2,H-12);

  // 툴팁: 클릭 이벤트
  canvas._scatterPlayers=players.map(p=>({
    ...p,
    x:toX(Math.round(p.wins/p.games*100)),
    y:toY(p.games>0?(p.scored-p.conceded)/p.games:0),
    r:p.id===hlId||p.id===ME?.id?9:6
  }));
  canvas.onclick=function(e){
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.width/rect.width/dpr;
    const scaleY=canvas.height/rect.height/dpr;
    const mx=(e.clientX-rect.left)*scaleX;
    const my=(e.clientY-rect.top)*scaleY;
    let hit=null;
    for(const p of canvas._scatterPlayers){
      const dx=mx-p.x, dy=my-p.y;
      if(Math.sqrt(dx*dx+dy*dy)<=p.r+4){hit=p;break;}
    }
    // 기존 툴팁 제거
    document.getElementById('scatter-tooltip')?.remove();
    if(!hit) return;
    const wr=Math.round(hit.wins/hit.games*100);
    const diff=hit.games>0?(hit.scored-hit.conceded)/hit.games:0;
    const diffStr=(diff>=0?'+':'')+diff.toFixed(1);
    const tip=document.createElement('div');
    tip.id='scatter-tooltip';
    tip.style.cssText='position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 12px;font-size:.78rem;line-height:1.7;pointer-events:none;z-index:99;box-shadow:0 4px 16px rgba(0,0,0,.3);min-width:100px;';
    tip.innerHTML='<div style="font-weight:700;font-size:.85rem;color:var(--primary);margin-bottom:2px;">'+hit.name+'</div>'+
      '<div style="color:var(--text-muted);">'+hit.games+'경기</div>'+
      '<div style="color:var(--text);">승률 <b>'+wr+'%</b></div>'+
      '<div style="color:'+(diff>=0?'var(--primary)':'var(--danger)')+';">득실 <b>'+diffStr+'</b></div>';
    // 위치: 캔버스 기준 상대 좌표
    const canvasRect=canvas.getBoundingClientRect();
    const wrap=canvas.parentElement;
    const wrapRect=wrap.getBoundingClientRect();
    const tipW=120; // 툴팁 예상 너비
    let left=e.clientX-wrapRect.left+10;
    let top=e.clientY-wrapRect.top-60;
    // 오른쪽 잘림 방지: 화면 오른쪽 끝 넘으면 왼쪽으로
    if(e.clientX+tipW+10>window.innerWidth) left=e.clientX-wrapRect.left-tipW-10;
    if(left<0) left=4;
    if(top<0) top=e.clientY-wrapRect.top+10;
    tip.style.left=left+'px';
    tip.style.top=top+'px';
    wrap.style.position='relative';
    wrap.appendChild(tip);
    // 3초 후 자동 제거
    setTimeout(()=>tip.remove(),3000);
  };
}

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

async function renderFeed(forceNameQ){
  _feedPage=1;
  // 일괄등록 버튼: 관리자만 표시
  const batchBtn=document.getElementById('btn-batch-register');
  if(batchBtn) batchBtn.style.display=ME?.role==='admin'?'':'none';
  await _renderFeedInner(forceNameQ);
}

async function _renderFeedInner(forceNameQ){
  const el=document.getElementById('feed-list');
  if(_feedPage===1) el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(4);
  const dateF=document.getElementById('feed-date-filter')?.value||'';
  const statF=document.getElementById('feed-status-filter')?.value;
  const rawName=forceNameQ!==undefined?forceNameQ:(document.getElementById('feed-name-search')?.value||'');
  const nameQ=rawName.trim().toLowerCase();
  const clearBtn=document.getElementById('feed-search-clear');
  if(clearBtn) clearBtn.style.display=nameQ?'block':'none';
  const sortF=document.getElementById('feed-sort-filter')?.value||'desc';
  let q=sb.from('matches').select('*').limit(500);
  if(statF!=='') q=q.eq('status',statF||'approved');
  if(dateF) q=q.eq('match_date',dateF);
  let{data:matches}=await q;
  // 날짜 필터 옵션 채우기 (최초 로드 또는 날짜 미선택 시)
  _populateFeedDateFilter(matches,dateF);

  (matches||[]).sort((a,b)=>{
    const dd=(b.match_date||'').localeCompare(a.match_date||'');
    if(dd!==0) return sortF==='asc'?-dd:dd;
    const ct=(b.created_at||'').localeCompare(a.created_at||'');
    return sortF==='asc'?-ct:ct;
  });
  if(nameQ){
    matches=(matches||[]).filter(m=>[m.a1_name,m.a2_name,m.b1_name,m.b2_name]
      .some(n=>(n||'').toLowerCase().includes(nameQ)));
  }
  if(!matches||!matches.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><div>${nameQ?`'${rawName}' 검색 결과 없음`:'경기 내역 없음'}</div></div>`;
    return;
  }
  const PAGE=10;
  const slice=matches.slice(0,_feedPage*PAGE);
  const hasMore=matches.length>slice.length;
  el.innerHTML=renderMatchesWithDateHeaders(slice) +
    (hasMore?`<button onclick="loadMoreFeed()" style="width:100%;padding:12px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--primary);font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;">더보기 (${matches.length-slice.length}개 더) ▼</button>`:'');
  // 전체 캐시 저장 (더보기 시 재사용)
  window._feedAllMatches=matches;
}

function loadMoreFeed(){
  _feedPage++;
  const el=document.getElementById('feed-list');
  if(!window._feedAllMatches) return;
  const PAGE=10;
  const slice=window._feedAllMatches.slice(0,_feedPage*PAGE);
  const hasMore=window._feedAllMatches.length>slice.length;
  el.innerHTML=renderMatchesWithDateHeaders(slice) +
    (hasMore?`<button onclick="loadMoreFeed()" style="width:100%;padding:12px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--primary);font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;">더보기 (${window._feedAllMatches.length-slice.length}개 더) ▼</button>`:'');
}
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
function renderMatchesWithDateHeaders(matches){
  // 날짜별 경기 수 미리 집계
  const countByDate={};
  matches.forEach(m=>{ const d=m.match_date||''; countByDate[d]=(countByDate[d]||0)+1; });
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
  return `<div class="feed-date-header"><span>${label}${countBadge}</span></div>`;
}

/* ── 경기 카드: 선수이름 가로, 승패는 점수 바로 옆 고정 ── */
function matchCardHTML(m,isAdmin=false){
  const isMe=[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(ME?.id);
  const aWin=m.score_a>m.score_b;
  // 이름: 가로 나열 (2인이면 / 구분)
  const aNames=[m.a1_name,m.a2_name].filter(Boolean).join(' ');
  const bNames=[m.b1_name,m.b2_name].filter(Boolean).join(' ');

  return `<div class="match-card ${isMe?'my-match':''}" onclick="openMatchDetail('${m.id}',${isAdmin})">
    <div class="match-score-row">
      <!-- A팀 이름 -->
      <div class="mc-team">
        <span class="mc-names">${aNames}</span>
      </div>
      <!-- 점수 -->
      <div class="mc-score-block">
        <span class="mc-score-num ${aWin?'mc-score-win':'mc-score-lose'}">${m.score_a}</span>
        <span class="mc-sep">:</span>
        <span class="mc-score-num ${!aWin?'mc-score-win':'mc-score-lose'}">${m.score_b}</span>
      </div>
      <!-- B팀 이름 -->
      <div class="mc-team right">
        <span class="mc-names">${bNames}</span>
      </div>
    </div>
    ${m.note?`<div style="font-size:.76rem;color:var(--text-muted);margin-top:4px;">📝 ${m.note}</div>`:''}
    ${isAdmin&&m.status==='pending'?`<div class="btn-row mt-2" onclick="event.stopPropagation()"><button class="btn btn-success btn-xs" onclick="approveMatch('${m.id}')">✅ 승인</button><button class="btn btn-danger btn-xs" onclick="confirmRejectMatch('${m.id}')">❌ 반려</button><button class="btn btn-warn btn-xs" onclick="openEditMatch('${m.id}')">✏️ 수정</button></div>`:''}
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

/* ── REGISTER ── */
async function openRegisterModal(){
  openModal('modal-register');
  await renderRegisterPage();
}

async function renderRegisterPage(){
  const{data:users}=await sb.from('profiles').select('id,name').eq('status','approved').order('name');
  _usersCache=users||[];
  updateRegisterSelects();
}
let _usersCache=[];

function updateRegisterLabels(){
  const t=regMatchType;
  document.getElementById('lbl-a1').innerHTML='선수 1 <span style="color:var(--danger);">*</span>';
  document.getElementById('lbl-a2').innerHTML='선수 2';
  document.getElementById('lbl-b1').innerHTML='선수 1 <span style="color:var(--danger);">*</span>';
  document.getElementById('lbl-b2').innerHTML='선수 2';
}

function getSelectedIds(excludeId){
  return ['reg-a1','reg-a2','reg-b1','reg-b2']
    .filter(id=>id!==excludeId)
    .map(id=>document.getElementById(id)?.value)
    .filter(v=>v&&v!=='');
}

function updateRegisterSelects(){
  const t=regMatchType;
  updateRegisterLabels();
  const allPool=_usersCache;
  let poolA1=allPool, poolA2=allPool, poolB1=allPool, poolB2=allPool;


  const buildOpts=(pool, selectId, includeNone)=>{
    const selected=getSelectedIds(selectId);
    let opts=`<option value="">선택하세요</option>`;
    if(includeNone) opts=`<option value="">없음</option>`;
    const curVal=document.getElementById(selectId)?.value||'';
    pool.forEach(u=>{
      if(selected.includes(u.id)) return;
      opts+=`<option value="${u.id}" ${u.id===curVal?'selected':''}>${u.name}</option>`;
    });
    // 비회원 직접입력 옵션
    opts+=`<option value="__guest__" ${'__guest__'===curVal?'selected':''}>✏️ 비회원 직접입력</option>`;
    return opts;
  };

  document.getElementById('reg-a1').innerHTML=buildOpts(poolA1,'reg-a1',false);
  document.getElementById('reg-a2').innerHTML=buildOpts(poolA2,'reg-a2',true);
  document.getElementById('reg-b1').innerHTML=buildOpts(poolB1,'reg-b1',false);
  document.getElementById('reg-b2').innerHTML=buildOpts(poolB2,'reg-b2',true);

  // guest input 표시 여부 동기화
  ['reg-a1','reg-a2','reg-b1','reg-b2'].forEach(id=>{
    const guestInput=document.getElementById(id+'-guest');
    if(guestInput) guestInput.style.display=document.getElementById(id)?.value==='__guest__'?'':'none';
  });
}

function onSelectChange(){
  updateRegisterSelects();
}

function onGuestInput(inputId){
  // 입력 중 아무것도 안 함 (submitMatch에서 읽음)
}

function setMatchType(t){
  regMatchType=t;

  updateRegisterSelects();
}

async function submitMatch(){
  const matchDate=document.getElementById('reg-date').value;
  const sa=parseInt(document.getElementById('reg-sa').value)||0;
  const sbv=parseInt(document.getElementById('reg-sb').value)||0;

  const selToIdName=id=>{
    const el=document.getElementById(id);
    const val=el?.value||'';
    if(val==='__guest__'){
      const guestName=document.getElementById(id+'-guest')?.value.trim()||'';
      return{id:null, name:guestName||null};
    }
    const opt=el?.options[el?.selectedIndex];
    return{id:opt?.value||null,name:opt?.text?.replace(' (나)','').trim()||null};
  };
  const a1=selToIdName('reg-a1'), a2=selToIdName('reg-a2');
  const b1=selToIdName('reg-b1'), b2=selToIdName('reg-b2');
  const a1id=a1.id||null, a1name=a1.name||null;
  const a2id=a2.id||null, a2name=a2.name||null;
  const b1id=b1.id||null, b1name=b1.name||null;
  const b2id=b2.id||null, b2name=b2.name||null;

  if(!matchDate){toast('경기 일자 선택','error');return;}
  if(!a1id&&!a1.name){toast('A팀 선수1 선택 또는 비회원 이름 입력','error');return;}
  if(!b1id&&!b1.name){toast('B팀 선수1 선택 또는 비회원 이름 입력','error');return;}
  if(!a1id&&!a1.name?.trim()){toast('A팀 비회원 이름을 입력하세요','error');return;}
  if(!b1id&&!b1.name?.trim()){toast('B팀 비회원 이름을 입력하세요','error');return;}
  if(sa===0&&sbv===0){toast('점수 입력','error');return;}
  if(sa===sbv){toast('동점은 등록 불가','error');return;}
  const ids=[a1id,a2id,b1id,b2id].filter(Boolean);
  if(new Set(ids).size!==ids.length){toast('중복 선수 확인','error');return;}

  const{error}=await sb.from('matches').insert({
    match_type:regMatchType,match_date:matchDate,
    a1_id:a1id,a1_name:a1name,
    a2_id:a2id||null,a2_name:a2name||null,
    b1_id:b1id,b1_name:b1name,
    b2_id:b2id||null,b2_name:b2name||null,
    score_a:sa,score_b:sbv,status:'pending',
    submitter_id:ME.id,submitter_name:ME.name,
    note:document.getElementById('reg-note').value||null,
    created_at:nowISO()
  });
  if(error){toast('등록 실패: '+error.message,'error');return;}
  addLog(`경기 등록 요청: ${a1name} vs ${b1name}`,ME.id);
  toast('✅ 등록 요청 완료! 관리자 승인 대기 중','success');
  // 폼 초기화
  regMatchType='doubles';
  ['reg-sa','reg-sb','reg-note','reg-match-date','reg-a1','reg-a2','reg-b1','reg-b2'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  ['guest-a1','guest-a2','guest-b1','guest-b2'].forEach(id=>{
    const el=document.getElementById(id); if(el){el.value='';el.style.display='none';}
  });
  closeModal('modal-register');
  navigateTo('feed');
}

/* ── ADMIN ── */
function renderAdminPage(){switchAdminTab(adminTab);}
function switchAdminTab(tab){
  adminTab=tab;
  document.querySelectorAll('#page-admin .sub-tab').forEach((el,i)=>el.classList.toggle('active',['pending','members','logs'][i]===tab));
  switch(tab){case 'pending':renderAdminPending();break;case 'members':renderAdminMembers();break;case 'logs':renderAdminLogs();break;}
}
async function renderAdminPending(){
  const el=document.getElementById('admin-content');
  // 가입 대기 회원
  const{data:pendingUsers}=await sb.from('profiles').select('*').eq('status','pending').order('created_at',{ascending:false});
  // 경기 승인 대기
  const{data:matches}=await sb.from('matches').select('*').eq('status','pending').order('created_at',{ascending:false});

  let html='';

  // 가입 대기 회원 섹션
  if(pendingUsers&&pendingUsers.length){
    html+=`<div style="margin-bottom:16px;">
      <div style="font-size:.82rem;font-weight:700;color:var(--accent);margin-bottom:8px;">👤 가입 승인 대기 (${pendingUsers.length}명)</div>`;
    pendingUsers.forEach(u=>{
      html+=`<div class="card" style="margin-bottom:6px;padding:10px 12px;border-left:3px solid var(--accent);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div>
            <div style="font-weight:700;font-size:.9rem;">${u.name}</div>
            <div style="font-size:.75rem;color:var(--text-muted);">${u.email||'이메일없음'} · ${u.provider||'kakao'}</div>
          </div>
          <button class="btn btn-success btn-sm" onclick="approveUser('${u.id}')">✅ 승인</button>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  // 경기 승인 대기 섹션
  if(matches&&matches.length){
    html+=`<div style="font-size:.82rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">🏸 경기 승인 대기 (${matches.length}건)</div>`;
    html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="chk-all-pending" onchange="toggleAllPending(this.checked)" style="width:16px;height:16px;cursor:pointer;">
        <span style="font-size:.82rem;color:var(--text-muted);">전체 선택</span>
      </div>
      <button onclick="bulkApprovePending()" class="btn btn-success btn-sm" id="btn-bulk-approve" style="display:none;">✅ 선택 일괄승인</button>
    </div>
    <div id="pending-cards">`;
    html+=matches.map(m=>`
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;">
        <input type="checkbox" class="pending-chk" data-id="${m.id}" onchange="onPendingChkChange()" style="width:16px;height:16px;margin-top:14px;cursor:pointer;flex-shrink:0;">
        <div style="flex:1;">${matchCardHTML(m,true)}</div>
      </div>`).join('');
    html+=`</div>`;
  }

  if(!html) html=`<div class="empty-state"><div class="empty-icon">✅</div><div>모든 승인 완료</div></div>`;
  el.innerHTML=html;
}
function toggleAllPending(checked){
  document.querySelectorAll('.pending-chk').forEach(c=>c.checked=checked);
  onPendingChkChange();
}
function onPendingChkChange(){
  const any=document.querySelectorAll('.pending-chk:checked').length>0;
  const btn=document.getElementById('btn-bulk-approve');
  if(btn) btn.style.display=any?'':'none';
}
async function bulkApprovePending(){
  const ids=[...document.querySelectorAll('.pending-chk:checked')].map(c=>c.dataset.id);
  if(!ids.length) return;
  if(!confirm(`${ids.length}건을 일괄 승인할까요?`)) return;
  const now=nowISO();
  await Promise.all(ids.map(id=>sb.from('matches').update({status:'approved',approved_at:now,approved_by:ME.id}).eq('id',id)));
  ids.forEach(id=>addLog(`경기 일괄승인: ${id}`,ME.id));
  toast(`✅ ${ids.length}건 승인 완료`,'success');
  renderAdminPending();
  if(currentPage==='feed') renderFeed();
}
async function renderAdminAll(){
  const el=document.getElementById('admin-content');
  el.innerHTML=`<div class="filter-row"><input class="form-input" type="search" id="adm-search" placeholder="검색..." oninput="filterAdminAll()" style="flex:2;"><select class="form-select" id="adm-type-f" onchange="filterAdminAll()"><option value="">전체 종목</option><option value="doubles">복식</option></select><select class="form-select" id="adm-stat-f" onchange="filterAdminAll()"><option value="">전체 상태</option><option value="pending">대기</option><option value="approved">승인</option><option value="rejected">반려</option></select></div><div id="adm-all-list"></div>`;
  const{data:matches}=await sb.from('matches').select('*').order('created_at',{ascending:false});
  el._allMatches=matches||[];filterAdminAll();
}
function filterAdminAll(){
  const el=document.getElementById('admin-content');let list=el._allMatches||[];
  const sq=(document.getElementById('adm-search')?.value||'').toLowerCase();
  const tf=document.getElementById('adm-type-f')?.value||'';
  const sf=document.getElementById('adm-stat-f')?.value||'';
  if(sq) list=list.filter(m=>[m.a1_name,m.a2_name,m.b1_name,m.b2_name,m.submitter_name].some(n=>(n||'').toLowerCase().includes(sq)));
  if(tf) list=list.filter(m=>m.match_type===tf);
  if(sf) list=list.filter(m=>m.status===sf);
  const wrap=document.getElementById('adm-all-list');
  if(wrap) wrap.innerHTML=list.map(m=>matchCardHTML(m,true)).join('')||`<div class="empty-state"><div class="empty-icon">🔍</div><div>결과 없음</div></div>`;
}
async function renderAdminMembers(){
  const{data:users}=await sb.from('profiles').select('*').order('created_at',{ascending:false});
  const el=document.getElementById('admin-content');
  const gLabel=g=>g==='male'?'<span style="color:#2979FF;font-weight:700;">男</span>':g==='female'?'<span style="color:#E91E8C;font-weight:700;">女</span>':'<span style="color:var(--text-muted);">?</span>';
  el.innerHTML=`<div class="flex-between mb-2"><span class="text-muted">총 ${(users||[]).length}명</span><button class="btn btn-primary btn-sm" onclick="openCreateUserModal()">➕ 계정 생성</button></div>`+
    (users||[]).map(u=>`<div class="card" style="margin-bottom:8px;padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:.92rem;">${u.name}${u.role==='writer'?'<span class="admin-tag" style="background:rgba(92,107,192,.12);border-color:rgba(92,107,192,.3);color:#5C6BC0;">작성자</span>':u.role==='admin'?'<span class="admin-tag">ADMIN</span>':''} ${u.exclude_stats?'<span class="admin-tag" style="background:rgba(255,152,0,.12);border-color:rgba(255,152,0,.3);color:#E65100;">통계제외</span>':''} <span style="font-size:.72rem;color:${u.status==='approved'?'var(--primary)':u.status==='pending'?'var(--accent)':'var(--danger)'}">${u.status==='approved'?'승인':u.status==='pending'?'대기':'정지'}</span></div>
          <div style="font-size:.74rem;color:var(--text-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.email||''}</div>
        </div>
        <div style="display:flex;flex-direction:row;gap:4px;flex-shrink:0;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-ghost btn-xs" onclick="openEditUser('${u.id}','${escHtml(u.name)}','${u.gender||''}','${u.status}','${u.role}',${!!u.exclude_stats})">✏️ 수정</button>
          ${u.status==='pending'?`<button class="btn btn-success btn-xs" onclick="approveUser('${u.id}')">✅ 승인</button>`:''}
        </div>
      </div>
    </div>`).join('');
}
async function renderAdminBatch(){
  // 이름→ID 매핑을 위해 유저 데이터 로드
  if(!window._bfUsersMap||!Object.keys(window._bfUsersMap).length){
    const{data:users}=await sb.from('profiles').select('id,name').eq('status','approved');
    window._bfUsersMap={};
    (users||[]).forEach(u=>{window._bfUsersMap[u.id]={id:u.id,name:u.name,score:0};});
  }
  const el=document.getElementById('admin-content');
  el.innerHTML=`
    <div style="margin-bottom:12px;">
      <div style="font-size:.85rem;font-weight:700;margin-bottom:6px;">📋 경기 일괄 등록</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px;line-height:1.6;background:var(--bg2);padding:10px;border-radius:8px;">
        <b>형식:</b> <code>날짜 A선수1 A선수2 A점수:B점수 B선수1 B선수2</code><br>
        (한 줄에 경기 1개, 날짜 생략 시 오늘 날짜 사용)<br>
        예시:<br>
        <code>26-03-08 김민수 강민지 25:23 김민철 감민처</code><br>
        <code>김민수 강민지 24:23 김민철 감민처</code>
      </div>
      <textarea id="batch-input" placeholder="여기에 경기 데이터를 붙여넣으세요..."
        style="width:100%;min-height:160px;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:.82rem;font-family:monospace;resize:vertical;"></textarea>
    </div>
    <button onclick="batchParsePreview()" class="btn btn-primary" style="width:100%;margin-bottom:10px;">🔍 파싱 미리보기</button>
    <div id="batch-preview"></div>`;
}

function batchParsePreview(){
  const raw=document.getElementById('batch-input')?.value||'';
  const lines=raw.split('\n').map(l=>l.trim()).filter(l=>l);
  const today=new Date().toISOString().slice(0,10);
  const results=[];
  const errors=[];
  lines.forEach((line,li)=>{
    try{
      const parsed=_batchParseLine(line,today);
      if(parsed) results.push(parsed);
      else errors.push({line:li+1,text:line,reason:'파싱 실패'});
    }catch(e){
      errors.push({line:li+1,text:line,reason:e.message});
    }
  });
  const wrap=document.getElementById('batch-preview');
  if(!wrap) return;
  if(!results.length&&!errors.length){wrap.innerHTML='<div style="color:var(--text-muted);font-size:.82rem;">내용을 입력하세요</div>';return;}
  let html='';
  if(results.length){
    html+=`<div style="font-size:.82rem;font-weight:700;margin-bottom:8px;color:var(--primary);">✅ 파싱 성공 ${results.length}건</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">`;
    results.forEach((r,i)=>{
      html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:.8rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-muted);">${r.match_date}</span>
          <span style="font-weight:700;color:var(--primary);">${r.score_a} : ${r.score_b}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span style="color:${r.score_a>r.score_b?'var(--text)':'var(--text-muted)'};">${[r.a1_name,r.a2_name].filter(Boolean).join(' / ')}</span>
          <span style="color:${r.score_b>r.score_a?'var(--text)':'var(--text-muted)'};">${[r.b1_name,r.b2_name].filter(Boolean).join(' / ')}</span>
        </div>
      </div>`;
    });
    html+=`</div>`;
    html+=`<button onclick="batchSubmit()" class="btn btn-primary" style="width:100%;margin-bottom:12px;">📨 ${results.length}건 일괄 등록</button>`;
    // 결과 임시 저장
    window._batchParsed=results;
  }
  if(errors.length){
    html+=`<div style="font-size:.82rem;font-weight:700;margin-bottom:6px;color:var(--danger);">⚠️ 파싱 실패 ${errors.length}건</div>`;
    errors.forEach(e=>{
      html+=`<div style="font-size:.78rem;color:var(--danger);padding:4px 8px;background:rgba(255,82,82,.08);border-radius:6px;margin-bottom:4px;">${e.line}번줄: ${e.text} → ${e.reason}</div>`;
    });
  }
  wrap.innerHTML=html;
}

function _batchParseLine(line, today){
  // 토큰 분리
  const tokens=line.trim().split(/\s+/);
  if(tokens.length<4) throw new Error('토큰 부족 (최소 4개)');
  
  let idx=0;
  let match_date=today;
  
  // 날짜 감지: YY-MM-DD 또는 YYYY-MM-DD
  if(/^\d{2,4}-\d{1,2}-\d{1,2}$/.test(tokens[0])){
    const parts=tokens[0].split('-');
    const yy=parts[0].length===2?'20'+parts[0]:parts[0];
    const mm=parts[1].padStart(2,'0');
    const dd=parts[2].padStart(2,'0');
    match_date=`${yy}-${mm}-${dd}`;
    idx=1;
  }
  
  const remaining=tokens.slice(idx);
  // 점수 찾기: X:Y 형식
  const scoreIdx=remaining.findIndex(t=>/^\d+:\d+$/.test(t));
  if(scoreIdx<0) throw new Error('점수(X:Y) 없음');
  if(scoreIdx<1) throw new Error('A팀 선수 없음');
  
  const aNames=remaining.slice(0,scoreIdx);
  const scoreStr=remaining[scoreIdx];
  const bNames=remaining.slice(scoreIdx+1);
  
  if(bNames.length<1) throw new Error('B팀 선수 없음');
  
  const [sa,sb]=scoreStr.split(':').map(Number);
  if(isNaN(sa)||isNaN(sb)) throw new Error('점수 숫자 오류');
  if(sa===sb) throw new Error('동점 불가');
  
  // 이름 → ID 매핑 (있으면 매핑, 없으면 null)
  const nameToId=(nm)=>{
    const found=Object.values(window._bfUsersMap||{}).find(u=>u.name===nm);
    return found?found.id:null;
  };
  
  return {
    match_date,
    match_type:'doubles',
    a1_name:aNames[0]||null, a1_id:nameToId(aNames[0]),
    a2_name:aNames[1]||null, a2_id:nameToId(aNames[1]),
    b1_name:bNames[0]||null, b1_id:nameToId(bNames[0]),
    b2_name:bNames[1]||null, b2_id:nameToId(bNames[1]),
    score_a:sa, score_b:sb,
    status:'approved',
    source:'batch'
  };
}

async function batchSubmit(){
  const records=window._batchParsed||[];
  if(!records.length){toast('등록할 데이터 없음','error');return;}
  const btn=document.querySelector('#batch-preview .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='등록 중...';}
  const now=new Date().toISOString();
  const inserts=records.map(r=>{
    const{source,...rest}=r; // source 컬럼 없으므로 제거
    return {...rest, approved_by:ME.id, approved_at:now, created_at:now};
  });
  const{error}=await sb.from('matches').insert(inserts);
  if(error){
    toast('등록 실패: '+error.message,'error');
    if(btn){btn.disabled=false;btn.textContent=`📨 ${records.length}건 일괄 등록`;}
    return;
  }
  // 선수 프로필 업데이트는 기존 승인 로직이 처리하므로 생략
  addLog(`일괄 등록 ${records.length}건`,ME.id);
  toast(`✅ ${records.length}건 등록 완료`,'success');
  window._batchParsed=[];
  document.getElementById('batch-input').value='';
  document.getElementById('batch-preview').innerHTML='';
  renderAdminBatch();
}

async function renderAdminLogs(){
  const{data:logs}=await sb.from('logs').select('*').order('created_at',{ascending:false}).limit(100);
  const el=document.getElementById('admin-content');
  el.innerHTML=`<div class="flex-between mb-2"><span class="text-muted">최근 로그</span><button class="btn btn-ghost btn-xs" onclick="clearLogs()">🗑 초기화</button></div>
    <div class="card">${(logs||[]).map(l=>`<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:.78rem;"><span style="color:var(--text-muted);white-space:nowrap;min-width:90px;">${fmtDate(l.created_at,true)}</span><span style="flex:1;">${l.message}</span></div>`).join('')||'<div class="text-muted" style="text-align:center;padding:16px;">로그 없음</div>'}</div>`;
}

async function approveMatch(id){
  await sb.from('matches').update({status:'approved',approved_at:nowISO(),approved_by:ME.id}).eq('id',id);
  addLog(`경기 승인: ${id}`,ME.id);toast('✅ 승인 완료','success');
  closeModal('modal-match');
  if(adminTab==='pending') renderAdminPending();
  if(currentPage==='feed') renderFeed();
}
async function rejectMatch(id){
  await sb.from('matches').update({status:'rejected',updated_at:nowISO()}).eq('id',id);
  addLog(`경기 반려: ${id}`,ME.id);toast('반려 처리','warning');
  closeModal('modal-match');
  if(adminTab==='pending') renderAdminPending();
}
async function cancelMatch(id){
  await sb.from('matches').update({status:'cancelled',updated_at:nowISO()}).eq('id',id);
  addLog(`경기 취소: ${id}`,ME.id);toast('취소 완료','success');
  closeModal('modal-match');renderFeed();
}
function confirmRejectMatch(id){showConfirm({icon:'❌',title:'경기를 반려하시겠습니까?',msg:'이 작업은 취소할 수 없습니다.',okLabel:'반려',okClass:'btn-danger',onOk:()=>rejectMatch(id)});}
function confirmDeleteMatch(id){showConfirm({icon:'🗑',title:'경기를 삭제하시겠습니까?',msg:'경기 기록이 완전히 삭제됩니다. 되돌릴 수 없습니다.',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
  const{error}=await sb.from('matches').delete().eq('id',id);
  if(error){toast('삭제 실패: '+error.message,'error');return;}
  addLog(`경기 삭제: ${id}`,ME.id);
  toast('경기가 삭제되었습니다','success');
  closeModal('modal-match');
  renderFeed();
  if(adminTab==='pending') renderAdminPending();
}});}
function confirmCancelMatch(id){showConfirm({icon:'🚫',title:'등록 요청을 취소하시겠습니까?',msg:'취소 후에는 되돌릴 수 없습니다.',okLabel:'취소',okClass:'btn-danger',onOk:()=>cancelMatch(id)});}
async function openEditMatch(id){
  editMatchId=id;
  const{data:m}=await sb.from('matches').select('*').eq('id',id).single();
  if(!m) return;
  const{data:users}=await sb.from('profiles').select('id,name').eq('status','approved');
  const mkSel=(fid,selId)=>`<select class="form-select" id="${fid}">${(users||[]).map(u=>`<option value="${u.id}" ${u.id===selId?'selected':''}>${u.name}</option>`).join('')}</select>`;
  const mkSelOpt=(fid,selId)=>`<select class="form-select" id="${fid}"><option value="">없음</option>${(users||[]).map(u=>`<option value="${u.id}" ${u.id===selId?'selected':''}>${u.name}</option>`).join('')}</select>`;
  document.getElementById('modal-edit-body').innerHTML=`
    <div class="form-group"><label class="form-label">종목</label><select class="form-select" id="em-type"><option value="doubles">복식</option></select></div>
    <div class="form-group"><label class="form-label">경기 일자</label><input class="form-input" type="date" id="em-date" value="${m.match_date}"></div>
    <hr class="section-divider">
    <div style="font-size:.86rem;font-weight:700;color:var(--primary);margin-bottom:8px;">A팀</div>
    <div class="form-row-2"><div class="form-group"><label class="form-label">A팀 선수1</label>${mkSel('em-a1',m.a1_id)}</div><div class="form-group"><label class="form-label">A팀 선수2</label>${mkSelOpt('em-a2',m.a2_id)}</div></div>
    <div class="form-group"><label class="form-label">A팀 점수</label><input class="form-input" type="number" id="em-sa" value="${m.score_a}" max="25" inputmode="numeric"></div>
    <hr class="section-divider">
    <div style="font-size:.86rem;font-weight:700;color:var(--danger);margin-bottom:8px;">B팀</div>
    <div class="form-row-2"><div class="form-group"><label class="form-label">B팀 선수1</label>${mkSel('em-b1',m.b1_id)}</div><div class="form-group"><label class="form-label">B팀 선수2</label>${mkSelOpt('em-b2',m.b2_id)}</div></div>
    <div class="form-group"><label class="form-label">B팀 점수</label><input class="form-input" type="number" id="em-sb" value="${m.score_b}" max="25" inputmode="numeric"></div>
    <div class="form-group"><label class="form-label">관리자 메모</label><input class="form-input" type="text" id="em-note" value="${m.admin_note||''}"></div>`;
  document.getElementById('modal-edit-actions').innerHTML=`<button class="btn btn-ghost" onclick="closeModal('modal-edit-match')">취소</button><button class="btn btn-warn btn-sm" onclick="saveEditMatch(false)">수정</button><button class="btn btn-success btn-sm" onclick="saveEditMatch(true)">수정+승인</button>`;
  closeModal('modal-match');openModal('modal-edit-match');
}
async function saveEditMatch(andApprove){
  const stn=id=>{const el=document.getElementById(id);const opt=el?.options[el?.selectedIndex];return{id:opt?.value||null,name:opt?.text||null};};
  const a1=stn('em-a1'),a2=stn('em-a2'),b1=stn('em-b1'),b2=stn('em-b2');
  const upd={match_type:document.getElementById('em-type').value,match_date:document.getElementById('em-date').value,a1_id:a1.id,a1_name:a1.id?a1.name:null,a2_id:a2.id||null,a2_name:a2.id?a2.name:null,b1_id:b1.id,b1_name:b1.id?b1.name:null,b2_id:b2.id||null,b2_name:b2.id?b2.name:null,score_a:parseInt(document.getElementById('em-sa').value)||0,score_b:parseInt(document.getElementById('em-sb').value)||0,admin_note:document.getElementById('em-note').value||null,updated_at:nowISO()};
  if(andApprove){upd.status='approved';upd.approved_at=nowISO();upd.approved_by=ME.id;}
  await sb.from('matches').update(upd).eq('id',editMatchId);
  addLog(`경기 수정${andApprove?'+승인':''}:${editMatchId}`,ME.id);
  toast(andApprove?'✅ 수정+승인 완료':'✏️ 수정 완료','success');
  closeModal('modal-edit-match');
  if(adminTab==='pending') renderAdminPending();
}
async function approveUser(uid){await sb.from('profiles').update({status:'approved'}).eq('id',uid);addLog(`회원 승인: ${uid}`,ME.id);toast('승인 완료','success');renderAdminMembers();}

let _editUserGender='';
function openEditUser(id,name,gender,status,role,excludeStats){
  document.getElementById('eu-id').value=id;
  document.getElementById('eu-name').value=name;
  document.getElementById('eu-status').value=status;
  document.getElementById('eu-role').value=role;
  document.getElementById('eu-exclude-stats').checked=!!excludeStats;
  // 자기 자신은 강퇴 불가
  const rejectBtn=document.getElementById('eu-reject-btn');
  if(rejectBtn) rejectBtn.style.display=id===ME.id?'none':'';
  _editUserGender=gender;
  ['male','female'].forEach(g=>{document.getElementById('eu-'+g)?.classList.toggle('selected',g===gender);});
  openModal('modal-edit-user');
}
function confirmRejectUserFromModal(){
  const uid=document.getElementById('eu-id').value;
  const name=document.getElementById('eu-name').value||'이 회원';
  closeModal('modal-edit-user');
  confirmRejectUser(uid,name);
}
function selectEditGender(g){
  _editUserGender=g;
  ['male','female'].forEach(k=>document.getElementById('eu-'+k)?.classList.toggle('selected',k===g));
}
async function saveEditUser(){
  const id=document.getElementById('eu-id').value;
  const name=document.getElementById('eu-name').value.trim();
  const status=document.getElementById('eu-status').value;
  const role=document.getElementById('eu-role').value;
  const excludeStats=document.getElementById('eu-exclude-stats').checked;
  if(!name){toast('이름을 입력하세요','error');return;}

  // 강퇴 시 연관 데이터 먼저 정리
  if(status==='rejected'){
    await sb.from('tournament_likes').delete().eq('user_id',id);
    await sb.from('community_posts').delete().eq('author_id',id);
    await sb.from('logs').delete().eq('user_id',id);
  }

  // 기존 이름 가져오기 (이름 변경 여부 확인)
  const{data:prev}=await sb.from('profiles').select('name').eq('id',id).single();
  const nameChanged=prev&&prev.name!==name;

  const{error}=await sb.from('profiles').update({name,status,role,exclude_stats:excludeStats}).eq('id',id);
  if(error){toast('저장 실패: '+error.message,'error');return;}

  // 이름 변경 시 관련 테이블 일괄 업데이트
  if(nameChanged){
    await Promise.all([
      sb.from('matches').update({a1_name:name}).eq('a1_id',id),
      sb.from('matches').update({a2_name:name}).eq('a2_id',id),
      sb.from('matches').update({b1_name:name}).eq('b1_id',id),
      sb.from('matches').update({b2_name:name}).eq('b2_id',id),
      sb.from('matches').update({submitter_name:name}).eq('submitter_id',id),
      sb.from('community_posts').update({author_name:name}).eq('author_id',id),
      sb.from('tournament_likes').update({user_name:name}).eq('user_id',id),
    ]);
  }

  addLog(`회원 정보 수정: ${name}`,ME.id);
  toast('✅ 저장 완료','success');
  closeModal('modal-edit-user');
  renderAdminMembers();
}
function confirmRejectUser(uid,name){showConfirm({icon:'🚫',title:`${name}을 완전 강퇴하시겠습니까?`,msg:'계정과 모든 내역이 삭제됩니다. 되돌릴 수 없습니다.',okLabel:'강퇴',okClass:'btn-danger',onOk:()=>rejectUser(uid)});}
async function rejectUser(uid){
  // 연관 데이터 먼저 삭제 (FK 제약 방지)
  await sb.from('tournament_likes').delete().eq('user_id',uid);
  await sb.from('community_posts').delete().eq('author_id',uid);
  await sb.from('logs').delete().eq('user_id',uid);

  const{error}=await sb.from('profiles').delete().eq('id',uid);
  if(error){toast('강퇴 실패: '+error.message,'error');console.error('rejectUser error',error);return;}
  try{
    const session=await sb.auth.getSession();
    const token=session.data.session?.access_token;
    await fetch('/api/admin/delete-user',{
      method:'DELETE',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({uid})
    });
  }catch(e){console.warn('auth delete failed',e);}
  toast('강퇴 완료','warning');renderAdminMembers();
}
async function toggleAdmin(uid,role,name){
  const newRole=role==='admin'?'user':'admin';
  showConfirm({icon:newRole==='admin'?'🛡️':'👤',title:`${name} 권한 변경`,msg:`${newRole==='admin'?'관리자로 변경':'일반 회원으로 변경'}하시겠습니까?`,okLabel:'변경',okClass:'btn-info',onOk:async()=>{await sb.from('profiles').update({role:newRole}).eq('id',uid);toast('권한 변경 완료','success');if(uid===ME.id){ME.role=newRole;const btn=document.getElementById('btn-comm-write');if(btn)btn.style.display=(newRole==='admin'||newRole==='writer')?'':'none';}renderAdminMembers();}});
}
async function toggleWriter(uid,role,name){
  if(role==='admin'){toast('관리자는 작성자로 변경할 수 없습니다','error');return;}
  const newRole=role==='writer'?'user':'writer';
  showConfirm({icon:'✍️',title:`${name} 작성자 권한 변경`,msg:`${newRole==='writer'?'공지사항 작성자로 지정':'작성자 권한 해제'}하시겠습니까?`,okLabel:'변경',okClass:'btn-info',onOk:async()=>{
    const{error}=await sb.from('profiles').update({role:newRole}).eq('id',uid);
    if(error){toast('권한 변경 실패: '+error.message,'error');console.error('toggleWriter error',error);return;}
    // DB 재확인
    const{data:check}=await sb.from('profiles').select('role').eq('id',uid).single();
    if(check?.role!==newRole){toast('변경이 저장되지 않았습니다 (RLS 정책 확인 필요)','error');return;}
    toast('권한 변경 완료','success');
    if(uid===ME.id){
      ME.role=newRole;
      const btn=document.getElementById('btn-comm-write');
      if(btn)btn.style.display=(newRole==='admin'||newRole==='writer')?'':'none';
    }
    renderAdminMembers();
  }});
}
async function toggleExcludeStats(uid, currentExclude, name){
  const willExclude=!currentExclude;
  showConfirm({
    icon: willExclude?'📊':'✅',
    title: willExclude?`${name} 통계 제외`:`${name} 통계 복원`,
    msg: willExclude
      ?'이 회원은 순위·통계에서 제외됩니다. 경기 기록은 유지됩니다.'
      :'이 회원을 순위·통계에 다시 포함합니다.',
    okLabel: willExclude?'제외':'복원',
    okClass: willExclude?'btn-warn':'btn-success',
    onOk: async()=>{
      const{error}=await sb.from('profiles').update({exclude_stats:willExclude}).eq('id',uid);
      if(error){toast('변경 실패: '+error.message,'error');return;}
      toast(willExclude?'통계에서 제외했습니다':'통계에 복원했습니다','success');
      renderAdminMembers();
    }
  });
}
function openCreateUserModal(){
  ['nu-name','nu-email'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('nu-pw').value='4321';document.getElementById('nu-role').value='user';
  openModal('modal-create-user');
}
async function createUser(){
  const name=document.getElementById('nu-name').value.trim();
  const email=document.getElementById('nu-email').value.trim();
  const pw=document.getElementById('nu-pw').value;
  const role=document.getElementById('nu-role').value;
  if(!name||!email){toast('이름/이메일 입력','error');return;}
  if(!pw||pw.length<4){toast('비밀번호는 4자 이상','error');return;}
  try {
    const session=await sb.auth.getSession();
    const token=session.data.session?.access_token;
    if(!token){toast('로그인 세션 없음','error');return;}
    const res=await fetch('/api/admin/create-user',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({email,password:pw,name,role})
    });
    const json=await res.json();
    if(!res.ok){
      console.error('[createUser] API error:',json);
      toast('생성 실패: '+(json.error||res.status),'error');
      return;
    }
    addLog(`계정 생성: ${email}`,ME.id);
    toast(`✅ ${name} 계정 생성 완료`,'success');
    closeModal('modal-create-user');
    renderAdminMembers();
  } catch(e){
    console.error('[createUser] catch:',e);
    toast('생성 실패: '+e.message,'error');
  }
}
async function clearLogs(){
  showConfirm({icon:'🗑️',title:'로그 초기화',msg:'모든 로그가 삭제됩니다.',okLabel:'초기화',okClass:'btn-danger',onOk:async()=>{await sb.from('logs').delete().not('id','is',null);addLog('로그 초기화',ME.id);renderAdminLogs();}});
}

/* ── HELPERS ── */
function showConfirm({icon='⚠️',title,msg,okLabel='확인',okClass='btn-danger',onOk,extraClass=''}){
  document.getElementById('confirm-icon').textContent=icon;
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-msg').textContent=msg;
  const inner=document.querySelector('#modal-confirm .modal');
  if(inner) inner.className='modal confirm-modal'+(extraClass?' '+extraClass:'');
  const btn=document.getElementById('confirm-ok-btn');
  btn.textContent=okLabel;btn.className='btn '+okClass;
  btn.onclick=()=>{closeModal('modal-confirm');onOk();};
  openModal('modal-confirm');
}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m&&m.id!=='modal-create-user')m.classList.remove('open');}));
function toast(msg,type=''){
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');t.className='toast '+(type||'');t.textContent=msg;
  c.appendChild(t);setTimeout(()=>{t.style.transition='.3s';t.style.opacity='0';setTimeout(()=>t.remove(),300);},3000);
}
function statusBadge(s){const m={pending:['대기','badge-pending'],approved:['승인','badge-approved'],rejected:['반려','badge-rejected'],cancelled:['취소','badge-cancelled']};const[l,c]=m[s]||[s,''];return`<span class="badge ${c}">${l}</span>`;}
function nowISO(){return new Date().toISOString();}
function todayStr(){return new Date().toISOString().split('T')[0];}
function fmtDate(iso,withTime=false){if(!iso)return'-';const d=new Date(iso);const days=['일','월','화','수','목','금','토'];const yy=String(d.getFullYear()).slice(2);const date=`${yy}.${d.getMonth()+1}.${d.getDate()}.(${days[d.getDay()]})`;if(!withTime)return date;return date+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function fmtMatchDate(dateStr){if(!dateStr)return'-';const d=new Date(dateStr+'T00:00:00');const days=['일','월','화','수','목','금','토'];const yy=String(d.getFullYear()).slice(2);return `${yy}.${d.getMonth()+1}.${d.getDate()}.(${days[d.getDay()]})`;}
// 대회 날짜 표시: 연도 2자리, 시작~종료 같은 연-월이면 일자만 표시
function fmtTourneyDate(start,end){
  if(!start) return '-';
  const p=d=>{const[y,m,day]=d.split('-');return{yy:y.slice(2),m:parseInt(m),d:parseInt(day)};};
  const s=p(start);
  if(!end||end===start) return `${s.yy}년 ${s.m}월 ${s.d}일`;
  const e=p(end);
  if(s.yy===e.yy&&s.m===e.m) return `${s.yy}년 ${s.m}월 ${s.d}~${e.d}일`;
  if(s.yy===e.yy) return `${s.yy}년 ${s.m}월 ${s.d}일 ~ ${e.m}월 ${e.d}일`;
  return `${s.yy}년 ${s.m}월 ${s.d}일 ~ ${e.yy}년 ${e.m}월 ${e.d}일`;
}
async function addLog(message,userId){await sb.from('logs').insert({message,user_id:userId||null});}


/* ══════════════════════════════════════
   COMMUNITY
══════════════════════════════════════ */
/*
  Supabase SQL (한번만 실행):
  CREATE TABLE IF NOT EXISTS community_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category text NOT NULL DEFAULT 'general',
    title text NOT NULL,
    body text NOT NULL,
    author_id uuid REFERENCES profiles(id),
    author_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow_all" ON community_posts FOR ALL USING (true) WITH CHECK (true);
*/

/* ══════════════════════════════════════════════
   상대전적 (Compare) 페이지
   ══════════════════════════════════════════════ */

/**
 * 2:2 복식 경기 승률 예측
 * @param {Object} a  - 선수A 통계 {wins, games, diff, recentWins, recentGames}
 * @param {Object} b  - 선수B 통계
 * @param {Object} c  - 선수C 통계
 * @param {Object} d  - 선수D 통계
 * @param {Object} synAB - A,B 파트너 전적 {wins, games}  (없으면 null)
 * @param {Object} synCD - C,D 파트너 전적 {wins, games}  (없으면 null)
 * @param {Object} h2h   - Team1이 Team2 상대 전적 {wins, games} (없으면 null)
 * @returns {{ team1WinProbability, team2WinProbability, team1Rating, team2Rating }}
 */
function predictMatch(a, b, c, d, synAB, synCD, h2h){
  // ── 1. 개인 CI ──────────────────────────────
  const ciA = calcCI(a.wins, a.games, a.diff||0);
  const ciB = calcCI(b.wins, b.games, b.diff||0);
  const ciC = calcCI(c.wins, c.games, c.diff||0);
  const ciD = calcCI(d.wins, d.games, d.diff||0);

  // ── 2. 팀 평균 종합점수 (평균) ────────────────
  const team1Base = (ciA + ciB) / 2;
  const team2Base = (ciC + ciD) / 2;

  // ── 3. 파트너 시너지 ────────────────────────
  const calcSynergy = (syn, wrA, wrB) => {
    if(!syn || syn.games === 0) return 0;
    const partnerWR = syn.wins / syn.games;
    const avgIndivWR = (wrA + wrB) / 2;
    let score = (partnerWR - avgIndivWR) * SYNERGY_WEIGHT;
    // 경기수 3 미만 → 50% 반영
    if(syn.games < 3) score *= 0.5;
    // ±SYNERGY_CAP 범위 제한
    return Math.max(-SYNERGY_CAP, Math.min(SYNERGY_CAP, score));
  };
  const wrA = a.games > 0 ? a.wins / a.games : 0.5;
  const wrB = b.games > 0 ? b.wins / b.games : 0.5;
  const wrC = c.games > 0 ? c.wins / c.games : 0.5;
  const wrD = d.games > 0 ? d.wins / d.games : 0.5;
  const syn1 = calcSynergy(synAB, wrA, wrB);
  const syn2 = calcSynergy(synCD, wrC, wrD);

  // ── 4. 상대 상성(H2H) ───────────────────────
  // h2h: Team1이 Team2를 상대한 전적
  let h2hScore = 0;
  if(h2h && h2h.games > 0){
    const h2hWR = h2h.wins / h2h.games;
    h2hScore = (h2hWR - 0.5) * H2H_WEIGHT;
    if(h2h.games < 3) h2hScore *= 0.5;
  }

  // ── 5. 최근 폼 ──────────────────────────────
  const recentWR = p => p.recentGames > 0 ? p.recentWins / p.recentGames : 0.5;
  const team1RecentWR = (recentWR(a) + recentWR(b)) / 2;
  const team2RecentWR = (recentWR(c) + recentWR(d)) / 2;
  const recent1 = (team1RecentWR - 0.5) * RECENT_WEIGHT;
  const recent2 = (team2RecentWR - 0.5) * RECENT_WEIGHT;

  // ── 6. 최종 팀 레이팅 ───────────────────────
  const team1Rating = team1Base + syn1 + h2hScore  + recent1;
  const team2Rating = team2Base + syn2 - h2hScore  + recent2;

  // ── 7. Elo 확률 계산 ────────────────────────
  const p = 1 / (1 + Math.pow(10, (team2Rating - team1Rating) / ELO_DIVISOR));
  return {
    team1WinProbability: Math.round(p * 100 * 10) / 10,
    team2WinProbability: Math.round((1 - p) * 100 * 10) / 10,
    team1Rating: Math.round(team1Rating),
    team2Rating: Math.round(team2Rating),
  };
}

async function renderComparePage(){
  const el=document.getElementById('page-compare');
  if(!el) return;
  // 유저 목록 로드
  const{data:users}=await sb.from('profiles').select('id,name').eq('status','approved').order('name');
  const allUsers=users||[];
  // _allMatchesCache가 없으면 직접 로드
  if(!_allMatchesCache||_allMatchesCache.length===0){
    const{data:matches}=await sb.from('matches').select('*').eq('status','approved').order('match_date',{ascending:false});
    _allMatchesCache=matches||[]; window._allMatchesCache=_allMatchesCache;
  }
  const allMatches=_allMatchesCache||[];

  // 유저별 통계 사전 계산
  const statsMap={};
  allUsers.forEach(u=>{
    statsMap[u.id]={id:u.id,name:u.name,gender:u.gender,games:0,wins:0,scored:0,conceded:0,diff:0,recentGames:0,recentWins:0};
  });
  // 최근 5경기용 날짜별 정렬 (이미 approved & date order)
  const recentMap={}; // uid → 최근 5경기 배열
  allMatches.forEach(m=>{
    const aWin=m.score_a>m.score_b;
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id&&statsMap[p.id]).forEach(p=>{
      statsMap[p.id].games++;
      if(p.win) statsMap[p.id].wins++;
      statsMap[p.id].scored+=p.s; statsMap[p.id].conceded+=p.c;
      if(!recentMap[p.id]) recentMap[p.id]=[];
      recentMap[p.id].push(p.win);
    });
  });
  Object.values(statsMap).forEach(u=>{
    u.diff=u.scored-u.conceded;
    const recent=(recentMap[u.id]||[]).slice(-5);
    u.recentGames=recent.length;
    u.recentWins=recent.filter(Boolean).length;
    u.ci=calcCI(u.wins,u.games,u.diff);
  });

  // 선수 옵션 HTML
  const opts=allUsers.map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  const emptyOpt=`<option value="">선택</option>`;

  el.innerHTML=`
  <div class="flex-between mb-2">
    <div><div class="page-title">⚔️ 상대전적</div><div class="page-sub">상대 전적 조회 &amp; 승부 예측<br><span style="font-size:.72rem;color:var(--text-muted);">맞대결 히스토리와 점수 기반 승률을 분석합니다.</span></div></div>
  </div>
  <div class="card">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:start;">
      <!-- Team 1 -->
      <div>
        <div style="font-size:.78rem;font-weight:700;color:#1565C0;margin-bottom:6px;text-align:center;">🔵 블루팀</div>
        <select class="form-select" id="cp-a1" onchange="onCompareChange()" style="margin-bottom:6px;">${emptyOpt+opts}</select>
        <select class="form-select" id="cp-a2" onchange="onCompareChange()">${emptyOpt+opts}</select>
      </div>
      <!-- VS -->
      <div style="text-align:center;font-weight:900;font-size:1.1rem;color:var(--text-muted);padding-top:28px;">VS</div>
      <!-- Team 2 -->
      <div>
        <div style="font-size:.78rem;font-weight:700;color:var(--danger);margin-bottom:6px;text-align:center;">🔴 레드팀</div>
        <select class="form-select" id="cp-c1" onchange="onCompareChange()" style="margin-bottom:6px;">${emptyOpt+opts}</select>
        <select class="form-select" id="cp-c2" onchange="onCompareChange()">${emptyOpt+opts}</select>
      </div>
    </div>
    <button onclick="runCompare()" class="btn btn-primary" style="width:100%;margin-top:10px;font-size:.92rem;padding:10px;">🔍 조회</button>
  </div>
  <div id="compare-result"></div>`;

  // statsMap을 전역에 저장해서 runCompare에서 사용
  window._compareStatsMap=statsMap;
  window._compareAllMatches=allMatches;
}

function onCompareChange(){
  // 선택된 선수를 다른 select에서 비활성화
  const selIds=['cp-a1','cp-a2','cp-c1','cp-c2'];
  const vals={};
  selIds.forEach(id=>{ vals[id]=document.getElementById(id)?.value||''; });
  selIds.forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    const myVal=vals[id];
    Array.from(el.options).forEach(opt=>{
      if(!opt.value) return; // "선택" 빈 옵션은 건드리지 않음
      const usedElsewhere=selIds.filter(oid=>oid!==id).some(oid=>vals[oid]===opt.value);
      opt.disabled=usedElsewhere;
      opt.style.color=usedElsewhere?'var(--text-dim)':'';
    });
  });
  // 선수 선택 변경 시 결과 초기화 (조회버튼 클릭 전까지 비워둠)
  document.getElementById('compare-result').innerHTML='';
}

function runCompare(){
  const ids={a1:document.getElementById('cp-a1')?.value, a2:document.getElementById('cp-a2')?.value,
              c1:document.getElementById('cp-c1')?.value, c2:document.getElementById('cp-c2')?.value};
  const el=document.getElementById('compare-result');
  if(!el) return;
  if(!ids.a1||!ids.c1){el.innerHTML='';return;}
  const sm=window._compareStatsMap||{};
  const am=window._compareAllMatches||[];
  // H2H: a1+a2 vs c1+c2 과거 직접 맞대결 기록
  const h2hMatches=am.filter(m=>{
    const aSet=new Set([ids.a1,ids.a2].filter(Boolean));
    const cSet=new Set([ids.c1,ids.c2].filter(Boolean));
    const mA=new Set([m.a1_id,m.a2_id].filter(Boolean));
    const mB=new Set([m.b1_id,m.b2_id].filter(Boolean));
    const fwMatch=[...aSet].every(id=>mA.has(id))&&[...cSet].every(id=>mB.has(id));
    const rvMatch=[...cSet].every(id=>mA.has(id))&&[...aSet].every(id=>mB.has(id));
    return fwMatch||rvMatch;
  });
  let h2hBlueW=0,h2hRedW=0;
  h2hMatches.forEach(m=>{
    const aSet=new Set([ids.a1,ids.a2].filter(Boolean));
    const mA=new Set([m.a1_id,m.a2_id].filter(Boolean));
    const blueOnA=[...aSet].every(id=>mA.has(id));
    const aWin=m.score_a>m.score_b;
    if(blueOnA){ if(aWin)h2hBlueW++; else h2hRedW++; }
    else { if(!aWin)h2hBlueW++; else h2hRedW++; }
  });
  const a=sm[ids.a1]||{wins:0,games:0,diff:0,recentWins:0,recentGames:0};
  const b=ids.a2?sm[ids.a2]||{wins:0,games:0,diff:0,recentWins:0,recentGames:0}:{wins:0,games:0,diff:0,recentWins:0,recentGames:0};
  const c=sm[ids.c1]||{wins:0,games:0,diff:0,recentWins:0,recentGames:0};
  const d=ids.c2?sm[ids.c2]||{wins:0,games:0,diff:0,recentWins:0,recentGames:0}:{wins:0,games:0,diff:0,recentWins:0,recentGames:0};

  // 파트너 시너지 계산 (A팀: a+b, B팀: c+d)
  const calcPairStats=(id1,id2)=>{
    if(!id1||!id2) return null;
    let wins=0,games=0;
    am.forEach(m=>{
      const t1=[m.a1_id,m.a2_id], t2=[m.b1_id,m.b2_id];
      const aWin=m.score_a>m.score_b;
      const inA=t1.includes(id1)&&t1.includes(id2);
      const inB=t2.includes(id1)&&t2.includes(id2);
      if(inA){games++;if(aWin)wins++;}
      else if(inB){games++;if(!aWin)wins++;}
    });
    return games>0?{wins,games}:null;
  };

  // H2H: Team1(a,b) vs Team2(c,d)
  const calcH2H=(id1,id2,id3,id4)=>{
    let wins=0,games=0;
    am.forEach(m=>{
      const t1=[m.a1_id,m.a2_id].filter(Boolean), t2=[m.b1_id,m.b2_id].filter(Boolean);
      const aWin=m.score_a>m.score_b;
      const ids12=[id1,id2].filter(Boolean), ids34=[id3,id4].filter(Boolean);
      const t1has12=ids12.every(i=>t1.includes(i)), t2has34=ids34.every(i=>t2.includes(i));
      const t1has34=ids34.every(i=>t1.includes(i)), t2has12=ids12.every(i=>t2.includes(i));
      if(t1has12&&t2has34){games++;if(aWin)wins++;}
      else if(t1has34&&t2has12){games++;if(!aWin)wins++;}
    });
    return games>0?{wins,games}:null;
  };

  const synAB=calcPairStats(ids.a1,ids.a2);
  const synCD=calcPairStats(ids.c1,ids.c2);
  const h2h=calcH2H(ids.a1,ids.a2,ids.c1,ids.c2);

  const result=predictMatch(a,b,c,d,synAB,synCD,h2h);
  const p1=result.team1WinProbability, p2=result.team2WinProbability;
  const barW1=Math.round(p1), barW2=100-barW1;

  const aName=a.name||'A1', bName=b.name||'A2', cName=c.name||'B1', dName=d.name||'B2';
  const ciA=Math.round(calcCI(a.wins,a.games,a.diff||0));
  const ciB=Math.round(calcCI(b.wins,b.games,b.diff||0));
  const ciC=Math.round(calcCI(c.wins,c.games,c.diff||0));
  const ciD=Math.round(calcCI(d.wins,d.games,d.diff||0));

  // ── 계산 내역 재계산 (표시용) ──
  const team1Base=Math.round((ciA+(ids.a2?ciB:BASE_RATING))/2);
  const team2Base=Math.round((ciC+(ids.c2?ciD:BASE_RATING))/2);

  const calcSynergyVal=(syn,wrX,wrY)=>{
    if(!syn||syn.games===0) return 0;
    const pWR=syn.wins/syn.games;
    const avg=(wrX+wrY)/2;
    let sc=(pWR-avg)*SYNERGY_WEIGHT;
    if(syn.games<3) sc*=0.5;
    return Math.max(-SYNERGY_CAP,Math.min(SYNERGY_CAP,sc));
  };
  const wrA=a.games>0?a.wins/a.games:0.5, wrB=b.games>0?b.wins/b.games:0.5;
  const wrC=c.games>0?c.wins/c.games:0.5, wrD=d.games>0?d.wins/d.games:0.5;
  const syn1Val=Math.round(calcSynergyVal(synAB,wrA,wrB));
  const syn2Val=Math.round(calcSynergyVal(synCD,wrC,wrD));

  let h2hVal=0;
  if(h2h&&h2h.games>0){ h2hVal=(h2h.wins/h2h.games-0.5)*H2H_WEIGHT; if(h2h.games<3) h2hVal*=0.5; }
  h2hVal=Math.round(h2hVal);

  const recentWR=p=>p.recentGames>0?p.recentWins/p.recentGames:0.5;
  const r1=Math.round(((recentWR(a)+recentWR(b))/2-0.5)*RECENT_WEIGHT);
  const r2=Math.round(((recentWR(c)+recentWR(d))/2-0.5)*RECENT_WEIGHT);

  const fmtDelta=(v,flip=false)=>{const n=flip?-v:v; return n>0?`<span style="color:var(--primary)">+${n}</span>`:`<span style="color:${n<0?'var(--danger)':'var(--text-muted)'}">${n}</span>`;};

  el.innerHTML=`
  <div class="card" style="margin-top:0;">
    <!-- 승률 바 -->
    <div style="display:flex;height:40px;border-radius:10px;overflow:hidden;margin-bottom:12px;">
      <div style="width:${barW1}%;background:#1565C0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;color:#fff;transition:width .5s;">${p1}%</div>
      <div style="width:${barW2}%;background:#C62828;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;color:#fff;transition:width .5s;">${p2}%</div>
    </div>
    <!-- 팀 최종 점수 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:rgba(21,101,192,.1);border:1px solid rgba(21,101,192,.25);border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:2px;">🔵 블루팀 최종 점수</div>
        <div style="font-size:1.6rem;font-weight:700;color:#1565C0;">${result.team1Rating}</div>
        <div style="font-size:.7rem;color:var(--text-muted);">${[aName,ids.a2?bName:''].filter(Boolean).join(' + ')}</div>
      </div>
      <div style="background:rgba(198,40,40,.1);border:1px solid rgba(198,40,40,.25);border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:2px;">🔴 레드팀 최종 점수</div>
        <div style="font-size:1.6rem;font-weight:700;color:#C62828;">${result.team2Rating}</div>
        <div style="font-size:.7rem;color:var(--text-muted);">${[cName,ids.c2?dName:''].filter(Boolean).join(' + ')}</div>
      </div>
    </div>
    <!-- 개인 CI -->
    ${h2hMatches.length>0?`<div style="background:var(--bg3);border-radius:10px;padding:10px 14px;margin-bottom:10px;text-align:center;">
          <div style="font-size:.75rem;color:var(--text-muted);font-weight:700;margin-bottom:6px;">⚔️ 직접 맞대결 기록</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
            <div style="text-align:center;"><div style="font-size:1.4rem;font-weight:900;font-family:Black Han Sans,sans-serif;color:#1565C0;">${h2hBlueW}</div><div style="font-size:.7rem;color:var(--text-muted);">블루팀 승</div></div>
            <div style="font-size:.8rem;color:var(--text-muted);">${h2hMatches.length}경기</div>
            <div style="text-align:center;"><div style="font-size:1.4rem;font-weight:900;font-family:Black Han Sans,sans-serif;color:#C62828;">${h2hRedW}</div><div style="font-size:.7rem;color:var(--text-muted);">레드팀 승</div></div>
          </div>
        </div>`:''}
    <div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;">📊 개인 종합점수</div>
    <div style="display:grid;grid-template-columns:repeat(${ids.a2||ids.c2?4:2},1fr);gap:6px;margin-bottom:14px;">
      ${[{n:aName,ci:ciA,st:a,col:'#1565C0'},{n:ids.a2?bName:null,ci:ciB,st:b,col:'#1565C0'},{n:cName,ci:ciC,st:c,col:'#C62828'},{n:ids.c2?dName:null,ci:ciD,st:d,col:'#C62828'}].map(p=>p.n?`
      <div style="background:var(--bg2);border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.n}</div>
        <div style="font-size:1.1rem;font-weight:700;color:${p.col};">${p.ci}</div>
        <div style="font-size:.65rem;color:var(--text-dim);">${p.st.games}경기</div>
      </div>`:'').join('')}
    </div>
    <!-- 계산 내역 -->
    <div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;">🔢 산출 내역</div>
    <table style="width:100%;font-size:.78rem;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border);">
          <th style="padding:5px 4px;text-align:left;color:var(--text-muted);font-weight:600;">항목</th>
          <th style="padding:5px 4px;text-align:center;color:#1565C0;font-weight:700;">🔵 블루팀</th>
          <th style="padding:5px 4px;text-align:center;color:#C62828;font-weight:700;">🔴 레드팀</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 4px;color:var(--text-muted);">팀 평균 종합점수</td>
          <td style="padding:6px 4px;text-align:center;font-weight:600;">${team1Base}</td>
          <td style="padding:6px 4px;text-align:center;font-weight:600;">${team2Base}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 4px;color:var(--text-muted);">파트너 시너지${synAB?` (${synAB.games}경기)`:''}</td>
          <td style="padding:6px 4px;text-align:center;">${fmtDelta(syn1Val)}</td>
          <td style="padding:6px 4px;text-align:center;">${fmtDelta(syn2Val)}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 4px;color:var(--text-muted);">상대 상성(H2H)${h2h?` (${h2h.games}경기)`:''}</td>
          <td style="padding:6px 4px;text-align:center;">${fmtDelta(h2hVal)}</td>
          <td style="padding:6px 4px;text-align:center;">${fmtDelta(h2hVal,true)}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 4px;color:var(--text-muted);">최근 폼 (최근 5경기)</td>
          <td style="padding:6px 4px;text-align:center;">${fmtDelta(r1)}</td>
          <td style="padding:6px 4px;text-align:center;">${fmtDelta(r2)}</td>
        </tr>
        <tr style="background:var(--bg2);">
          <td style="padding:6px 4px;font-weight:700;">최종 점수</td>
          <td style="padding:6px 4px;text-align:center;font-weight:700;color:#1565C0;">${result.team1Rating}</td>
          <td style="padding:6px 4px;text-align:center;font-weight:700;color:#C62828;">${result.team2Rating}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

function showCIInfo(){
  const msg=`
종합점수는 단순 승률이 아닌 경기 수·득실·신뢰도를 함께 반영한 종합 지표입니다.

━━━━━━━━━━━━━━━━━━
📐 계산 공식
━━━━━━━━━━━━━━━━━━

종합점수 =
  1000
  + 신뢰보정승률 × 200
  + 평균득실차 × 5

━━━━━━━━━━━━━━━━━━
🔍 각 항목 설명
━━━━━━━━━━━━━━━━━━

① 기본점수 1000
  · 모든 선수의 시작점

② 신뢰보정승률
  · 경기수가 적을수록 승률을 낮게 반영
  · 보정계수 = 경기수 ÷ (경기수 + 10)
  · 보정승률 = 승률 × 보정계수

  예) 1경기 1승 → 승률 100%이지만
      보정계수 = 1÷11 ≈ 0.09
      → 보정승률 ≈ 9%만 반영
  예) 10경기 7승 → 승률 70%,
      보정계수 = 10÷20 = 0.5
      → 보정승률 = 35% 반영
  예) 50경기 → 보정계수 ≈ 0.83
      (경기가 많을수록 1에 수렴)

③ 평균 득실차 × 5
  · 경기당 평균 (득점 - 실점)
  · 이길 때 크게 이길수록 가산
  · 질 때 크게 질수록 감산

━━━━━━━━━━━━━━━━━━
📊 점수 예시
━━━━━━━━━━━━━━━━━━

  5경기 4승 1패, 평균득실 +3
  → 보정계수 = 5÷15 ≈ 0.33
  → 보정승률 = 80% × 0.33 = 26.7%
  → 종합점수 = 1000 + 26.7×200 + 3×5
              ≈ 1000 + 53 + 15 = 1068

  ✅ 5경기 이상부터 랭킹에 반영됩니다`;

  showConfirm({icon:'📊',title:'종합점수 산정 방식',
    msg,
    okLabel:'확인',okClass:'btn-primary',onOk:()=>{},extraClass:'ci-info-modal'});
}

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

// ── 목록 렌더 ──
async function renderBracketPage(){
  const addBtn=document.getElementById('btn-add-bracket');
  if(addBtn) addBtn.style.display=ME?.role==='admin'?'block':'none';
  const el=document.getElementById('bracket-list');
  if(!el) return;
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);
  const{data:list}=await sb.from('bracket_tournaments').select('*').order('created_at',{ascending:false});
  if(!list||!list.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🎯</div><div>등록된 대회가 없어요</div></div>`;
    return;
  }
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};
  el.innerHTML=list.map(bt=>{
    const isDone=bt.status==='done';
    const isLeague=bt.status==='league'||bt.status==='active';
    const isPlan=bt.status==='plan';
    const isAdmin=ME?.role==='admin';
    const tLabel=typeLabel[bt.tournament_type]||'대회';
    return `<div class="card" style="margin-bottom:12px;cursor:pointer;" onclick="openBracketDetail('${bt.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:.95rem;margin-bottom:3px;">${bt.name}</div>
          <div style="font-size:.78rem;color:var(--text-muted);">📅 ${fmtMatchDate(bt.match_date)} · ${tLabel}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:.75rem;padding:3px 10px;border-radius:12px;font-weight:700;
            background:${isDone?'rgba(41,121,255,.12)':isLeague?'rgba(41,121,255,.15)':isPlan?'rgba(255,152,0,.12)':'rgba(255,152,0,.12)'};
            color:${isDone?'var(--primary)':isLeague?'var(--info)':'var(--warn)'};">
            ${isDone?'완료':isLeague?'진행중':isPlan?'배분중':'준비중'}
          </span>
          ${isAdmin?`<button onclick="event.stopPropagation();deleteBracket('${bt.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.8rem;padding:2px 6px;">✕</button>`:''}
        </div>
      </div>
      ${isDone&&bt.winner_name?`<div style="font-size:.8rem;color:var(--primary);margin-top:6px;">🏆 ${bt.winner_name}</div>`:''}
    </div>`;
  }).join('');
}

async function deleteBracket(id){
  showConfirm({icon:'🗑️',title:'대회 삭제',msg:'삭제하면 복구할 수 없습니다.',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    await sb.from('bracket_tournaments').delete().eq('id',id);
    toast('삭제 완료','warning');renderBracketPage();
  }});
}

// ══════════════════
//  STEP 1: 폼 토글 & 참석자 선택
// ══════════════════
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
  const{data:users}=await sb.from('profiles').select('id,name,wins,losses,games').eq('status','approved').order('name');
  (users||[]).forEach(u=>{
    const wr=u.games>0?Math.round((u.wins||0)/u.games*100):0;
    window._bfUsersMap[u.id]={id:u.id,name:u.name,score:wr,wr};
    window._bfAllUsers.push(u);
  });
  _bfRenderAttendeeUI();
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

  // 등록된 선수 클릭 선택
  const users=window._bfAllUsers||[];
  if(users.length){
    html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">`;
    users.forEach(u=>{
      const wr=u.games>0?Math.round((u.wins||0)/u.games*100):0;
      const sel=_bfAttendees.some(a=>a.id===u.id);
      html+=`<div data-uid="${u.id}" style="display:inline-flex;align-items:center;gap:3px;border-radius:20px;padding:4px 10px;cursor:pointer;font-size:.82rem;user-select:none;
        background:${sel?'rgba(41,121,255,.2)':'var(--bg3)'};
        border:1px solid ${sel?'var(--primary)':'var(--border)'};
        color:${sel?'var(--primary)':'var(--text)'};">
        <span style="pointer-events:none;">${sel?'✅ ':''}${u.name}</span>
        <span style="font-size:.7rem;color:${sel?'var(--primary)':'var(--text-dim)'};pointer-events:none;">${wr}%</span>
      </div>`;
    });
    html+=`</div>`;
  }

  // 현재 선택된 참석자 태그
  if(_bfAttendees.length){
    html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;padding:6px 8px;background:var(--bg2);border-radius:8px;">`;
    _bfAttendees.forEach((a,i)=>{
      html+=`<div style="display:inline-flex;align-items:center;gap:3px;border-radius:20px;padding:3px 9px;background:rgba(41,121,255,.15);border:1px solid var(--primary);color:var(--primary);font-size:.8rem;">
        <span>${a.name}</span>
        <button onclick="_bfRemoveAttendee(${i})" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:.85rem;padding:0 0 0 2px;line-height:1;">✕</button>
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
  const idx=_bfAttendees.findIndex(a=>a.id===id);
  if(idx>=0){
    _bfAttendees.splice(idx,1);
  } else {
    _bfAttendees.push({id,name:u?.name||id,score:u?.score||0});
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

function _bfTeamArrange(){
  // 팀전: 팀장 A/B 지정 후 뱀배열로 인원 균형 분배
  const capAid=document.getElementById('bf-captain-a')?.value;
  const capBid=document.getElementById('bf-captain-b')?.value;
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
  // 개인전 조편성
  const {groups}=_bfArrangement;
  const isAdmin=ME?.role==='admin';
  let html=`<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">
    🤖 실력 균형을 고려해 자동 배분했습니다. ${isAdmin?'이름을 드래그하거나 조를 수정할 수 있습니다.':''}
  </div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:10px;" id="bf-groups-wrap">`;
  groups.forEach((g,gi)=>{
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
      <div style="font-weight:700;font-size:.85rem;color:var(--primary);margin-bottom:8px;">${g.name} (${g.players.length}명)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;" id="bf-group-players-${gi}">`;
    g.players.forEach((p,pi)=>{
      html+=`<div style="display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 10px;font-size:.82rem;">
        <span>${p.name}</span>
        ${isAdmin?`<button onclick="bfRemoveFromGroup(${gi},${pi})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.8rem;padding:0 2px;">✕</button>`:''}
      </div>`;
    });
    html+=`</div>`;
    if(isAdmin){
      html+=`<select onchange="bfMoveToGroup(this,${gi})" style="margin-top:8px;width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:.78rem;color:var(--text-muted);">
        <option value="">+ 다른 조에서 이동</option>`;
      groups.forEach((og,ogi)=>{
        if(ogi===gi) return;
        og.players.forEach((p,pi)=>{
          html+=`<option value="${ogi}_${pi}">${p.name} (${og.name}에서)</option>`;
        });
      });
      html+=`</select>`;
    }
    html+=`</div>`;
  });
  html+=`</div>`;
  wrap.innerHTML=html;
}

function _bfRenderDuoArrangeUI(wrap){
  const {groups}=_bfArrangement;
  const isAdmin=ME?.role==='admin';
  let html=`<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">
    🤖 팀 실력 균형을 고려해 자동 배분했습니다.${isAdmin?' 팀을 다른 조로 이동하거나 순서를 바꿀 수 있습니다.':''}
  </div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:10px;">`;
  groups.forEach((g,gi)=>{
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
      <div style="font-weight:700;font-size:.85rem;color:var(--primary);margin-bottom:8px;">${g.name} (${g.teams.length}팀)</div>
      <div style="display:flex;flex-direction:column;gap:5px;">`;
    g.teams.forEach((t,ti)=>{
      const label=t.p2_name?`${t.p1_name} / ${t.p2_name}`:t.p1_name;
      html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:.85rem;font-weight:600;display:flex;align-items:center;gap:6px;">
        <span style="flex:1;">👥 ${label}</span>
        ${isAdmin?`<div style="display:flex;gap:3px;align-items:center;">
          ${ti>0?`<button onclick="bfDuoSwapTeam(${gi},${ti},${ti-1})" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:.7rem;cursor:pointer;padding:1px 5px;color:var(--text-muted);">▲</button>`:'<span style="width:22px;"></span>'}
          ${ti<g.teams.length-1?`<button onclick="bfDuoSwapTeam(${gi},${ti},${ti+1})" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:.7rem;cursor:pointer;padding:1px 5px;color:var(--text-muted);">▼</button>`:'<span style="width:22px;"></span>'}
          ${groups.length>1?`<select onchange="bfDuoMoveTeam(this,${gi},${ti})" style="font-size:.72rem;background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:2px 5px;color:var(--text-muted);cursor:pointer;">
            <option value="">이동</option>
            ${groups.map((og,ogi)=>ogi!==gi?`<option value="${ogi}">${og.name}으로</option>`:'').join('')}
          </select>`:''}
        </div>`:''}
      </div>`;
    });
    html+=`</div></div>`;
  });
  html+=`</div>`;
  wrap.innerHTML=html;
}

function bfDuoSwapTeam(gi,ti,ti2){
  const teams=_bfArrangement.groups[gi].teams;
  [teams[ti],teams[ti2]]=[teams[ti2],teams[ti]];
  _bfRenderDuoArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function bfDuoMoveTeam(sel,fromGi,ti){
  const toGi=parseInt(sel.value);
  if(isNaN(toGi)) return;
  const team=_bfArrangement.groups[fromGi].teams.splice(ti,1)[0];
  _bfArrangement.groups[toGi].teams.push(team);
  // 매치 재생성
  _bfArrangement.groups.forEach(g=>{
    g.matches=[];
    for(let i=0;i<g.teams.length;i++)
      for(let j=i+1;j<g.teams.length;j++)
        g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});
  });
  _bfRenderDuoArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function _bfRenderTeamArrangeUI(wrap){
  const {teamA,teamB}=_bfArrangement;
  const isAdmin=ME?.role==='admin';
  const renderTeam=(team,label,colorInfo,colorDanger,teamKey)=>{
    const otherKey=teamKey==='A'?'B':'A';
    const otherTeam=teamKey==='A'?teamB:teamA;
    let h=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;flex:1;">
      <div style="font-weight:700;font-size:.88rem;color:${colorInfo};margin-bottom:8px;">${label} (${team.length}명)</div>
      <div style="display:flex;flex-direction:column;gap:5px;">`;
    team.forEach((p,pi)=>{
      const cap=p.captain?`<span style="font-size:.7rem;background:${colorDanger};color:#fff;padding:1px 6px;border-radius:8px;margin-left:4px;">팀장</span>`:'';
      const moveBtn=isAdmin&&!p.captain?`<button onclick="bfTeamMove('${teamKey}',${pi})" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:5px;font-size:.7rem;color:var(--text-muted);cursor:pointer;padding:1px 6px;">${otherKey==='A'?'블루':'레드'}팀으로</button>`:'';
      h+=`<div style="background:var(--surface);border-radius:6px;padding:5px 10px;font-size:.82rem;display:flex;align-items:center;gap:4px;">${p.name}${cap}${moveBtn}</div>`;
    });
    h+=`</div></div>`;
    return h;
  };
  let html=`<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:10px;">
    🤖 인원 균형을 고려해 블루팀/레드팀으로 자동 배분했습니다.${isAdmin?' 팀원 오른쪽 버튼으로 직접 이동할 수 있습니다.':''}
  </div>`;
  html+=`<div style="display:flex;gap:10px;">
    ${renderTeam(teamA,'🔵 블루팀','var(--info)','var(--info)','A')}
    ${renderTeam(teamB,'🔴 레드팀','var(--danger)','var(--danger)','B')}
  </div>`;
  const diff=Math.abs(teamA.length-teamB.length);
  if(diff>1) html+=`<div style="font-size:.75rem;color:var(--yellow,#f59e0b);margin-top:8px;padding:6px 10px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px;">⚠️ 인원 차이 ${diff}명 — 팀원을 조정해주세요.</div>`;
  html+=`<div style="font-size:.78rem;color:var(--text-muted);margin-top:10px;padding:8px 10px;background:var(--bg2);border-radius:8px;">
    💡 팀전 매치는 대회 확정 후 관리자가 직접 추가할 수 있습니다.
  </div>`;
  wrap.innerHTML=html;
}

function bfTeamMove(fromTeam, pi){
  const arr=fromTeam==='A'?_bfArrangement.teamA:_bfArrangement.teamB;
  const dest=fromTeam==='A'?_bfArrangement.teamB:_bfArrangement.teamA;
  const p=arr.splice(pi,1)[0];
  dest.push(p);
  _bfRenderTeamArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function bfRemoveFromGroup(gi,pi){
  const g=_bfArrangement.groups[gi];
  const player=g.players.splice(pi,1)[0];
  // 가장 인원 적은 조로 이동
  const minGroup=_bfArrangement.groups.reduce((a,b)=>a.players.length<=b.players.length?a:b);
  minGroup.players.push(player);
  _rebuildGroupMatches();
  _bfRenderArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function bfMoveToGroup(sel,toGi){
  const val=sel.value;
  if(!val) return;
  const [fromGi,fromPi]=val.split('_').map(Number);
  const player=_bfArrangement.groups[fromGi].players.splice(fromPi,1)[0];
  _bfArrangement.groups[toGi].players.push(player);
  _rebuildGroupMatches();
  _bfRenderArrangeUI(document.getElementById('bf-arrange-wrap'));
}

function _rebuildGroupMatches(){
  _bfArrangement.groups.forEach(g=>{
    g.matches=[];
    for(let i=0;i<g.players.length;i++)
      for(let j=i+1;j<g.players.length;j++)
        g.matches.push({p1:g.players[i],p2:g.players[j],s1:'',s2:'',done:false});
  });
}

// ══════════════════
//  STEP 2 → DB 저장 (확정)
// ══════════════════

async function bfConfirmArrangement(){
  const name=document.getElementById('bf-auto-name').value.trim();
  const date=document.getElementById('bf-auto-date').value;

  let insertData={name,match_date:date,status:'league',tournament_type:_bfType,rounds:JSON.stringify([]),created_by:ME.id};

  if(_bfType==='team'){
    insertData.groups=JSON.stringify([{
      name:'팀전',
      teamA:_bfArrangement.teamA,
      teamB:_bfArrangement.teamB,
      matches:[],
      standings:{A:{wins:0,losses:0,diff:0},B:{wins:0,losses:0,diff:0}}
    }]);
  } else if(_bfType==='duo'){
    // 듀오전: teams[] 구조로 저장, 조당 2팀 이상 검사
    const badGroup=_bfArrangement.groups.find(g=>g.teams.length<2);
    if(badGroup){toast(`${badGroup.name}이 2팀 미만입니다. 파트너 배정을 확인해주세요.`,'error');return;}
    insertData.groups=JSON.stringify(_bfArrangement.groups);
  } else {
    // 개인전: players[] 구조, 조당 4명 이상 검사
    const badGroup=_bfArrangement.groups.find(g=>g.players.length<4);
    if(badGroup){toast(`${badGroup.name}이 4명 미만입니다. 조를 조정해주세요.`,'error');return;}
    insertData.groups=JSON.stringify(_bfArrangement.groups);
  }

  let resultId;
  if(window._bfEditId){
    // 수정 모드: 기존 대회 업데이트
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

// 팀전용 addTeam (듀오전 직접입력)
function bfAddTeam(){
  _bfTeamCount++;
  const wrap=document.getElementById('bf-teams-wrap');
  if(!wrap) return;
  const id=_bfTeamCount;
  const div=document.createElement('div');
  div.id=`bf-team-${id}`;
  div.style.cssText='display:flex;gap:6px;align-items:center;background:var(--bg2);border-radius:10px;padding:8px;';
  div.innerHTML=`
    <span style="font-size:.8rem;color:var(--text-muted);white-space:nowrap;">팀${id}</span>
    <select class="form-select bf-p1" style="flex:1;">
      <option value="">선수1 *</option>${_bfUserOpts}
    </select>
    <select class="form-select bf-p2" style="flex:1;">
      <option value="">선수2</option>${_bfUserOpts}
    </select>
    <button onclick="document.getElementById('bf-team-${id}').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;padding:0 4px;">✕</button>`;
  wrap.appendChild(div);
}

// ══════════════════
//  상세 보기
// ══════════════════
async function openBracketDetail(id){
  _bdId=id;
  const{data}=await sb.from('bracket_tournaments').select('*').eq('id',id).single();
  if(!data) return;
  _bdData=data;
  document.getElementById('bd-title').textContent='🎯 '+data.name;
  _renderBracketDetail(data);
  openModal('modal-bracket-detail');
}

async function bdEditSetup(){
  if(!_bdData) return;
  const d=_bdData;
  // 모달 닫기
  closeModal('modal-bracket-detail');
  // 폼 열기
  const el=document.getElementById('bracket-form-inline');
  if(el) el.style.display='block';
  // 기본값 복원
  _bfType=d.tournament_type||'individual';
  _bfAttendees=[];
  _bfDuoPairs=[];
  _bfStep=1;
  const nameEl=document.getElementById('bf-auto-name');
  const dateEl=document.getElementById('bf-auto-date');
  if(nameEl) nameEl.value=d.name||'';
  if(dateEl) dateEl.value=d.match_date||'';
  bfSetType(_bfType);
  // 참석자 복원 (groups에서 추출)
  const groups=JSON.parse(d.groups||'[]');
  const seen=new Set();
  if(_bfType==='team'){
    const g=groups[0]||{};
    [...(g.teamA||[]),...(g.teamB||[])].forEach(p=>{
      if(!seen.has(p.id)){seen.add(p.id);_bfAttendees.push({id:p.id,name:p.name,score:p.score||0});}
    });
  } else if(_bfType==='duo'){
    groups.forEach(g=>(g.teams||[]).forEach(t=>{
      if(!seen.has(t.p1_id)){seen.add(t.p1_id);_bfAttendees.push({id:t.p1_id,name:t.p1_name,score:0});}
      if(t.p2_id&&!seen.has(t.p2_id)){seen.add(t.p2_id);_bfAttendees.push({id:t.p2_id,name:t.p2_name,score:0});}
    }));
    // 듀오 페어 복원
    groups.forEach(g=>(g.teams||[]).forEach(t=>{
      _bfDuoPairs.push({p1:{id:t.p1_id,name:t.p1_name,score:0},p2:t.p2_id?{id:t.p2_id,name:t.p2_name,score:0}:null});
    }));
  } else {
    groups.forEach(g=>(g.players||[]).forEach(p=>{
      if(!seen.has(p.id)){seen.add(p.id);_bfAttendees.push({id:p.id,name:p.name,score:p.score||0});}
    }));
  }
  window._bfUsersMap={};
  _bfAttendees.forEach(a=>{window._bfUsersMap[a.id]={id:a.id,name:a.name,score:a.score||0};});
  _bfRenderAttendeeUI();
  bfGoStep(1);
  // 수정 모드: 확정 시 기존 데이터 덮어쓰기
  window._bfEditId=d.id;
  toast('대회 구성 수정 모드입니다. 수정 후 구성 확정을 누르세요.','info');
}

function _renderBracketDetail(data){
  const isAdmin=ME?.role==='admin';
  const status=data.status||'league';
  const isIndividual=data.tournament_type==='individual';
  const isDuo=data.tournament_type==='duo';
  const isTeamType=data.tournament_type==='team';
  const groups=JSON.parse(data.groups||'[]');
  const rounds=JSON.parse(data.rounds||'[]');
  const isLeague=status==='league'||status==='active';
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};

  let html=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
    <div style="font-size:.78rem;color:var(--text-muted);flex:1;">${typeLabel[data.tournament_type]||''} · ${fmtMatchDate(data.match_date)}</div>
    ${isAdmin?`<button onclick="bdEditSetup()" style="font-size:.72rem;padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--text-muted);">✏️ 구성 수정</button>`:''}
  </div>`;

  // 탭 (팀장전은 탭 없음)
  if(!isTeamType){
    html+=`<div style="display:flex;gap:0;background:var(--bg3);border-radius:10px;padding:3px;margin-bottom:14px;">
      <button id="bd-tab-league" onclick="bdSwitchTab('league')"
        style="flex:1;border:none;cursor:pointer;padding:8px;border-radius:8px;font-size:.83rem;font-weight:600;background:var(--primary);color:#fff;">📊 조별 리그</button>
      <button id="bd-tab-bracket" onclick="bdSwitchTab('bracket')"
        style="flex:1;border:none;cursor:pointer;padding:8px;border-radius:8px;font-size:.83rem;font-weight:600;background:transparent;color:var(--text-muted);">🏆 본선 대진</button>
    </div>`;
  }

  // 조별 리그 뷰
  html+=`<div id="bd-league-view">`;

  if(isTeamType){
    // 팀전 렌더
    html+=_renderTeamLeague(groups, isAdmin, isLeague);
  } else {
    // 개인전/듀오전 렌더
    groups.forEach((g,gi)=>{
      const members=g.players||[];
      const isMine=members.some(m=>_isMyTeam(m));
      const hl=isMine?'border-color:var(--primary);box-shadow:0 0 0 2px rgba(41,121,255,.15);':'';
      html+=`<div style="margin-bottom:16px;background:var(--surface);border:1px solid var(--border);${hl}border-radius:12px;padding:12px;">`;
      html+=`<div style="font-size:.88rem;font-weight:700;color:var(--primary);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        ${g.name}${isMine?`<span style="font-size:.7rem;background:rgba(41,121,255,.12);color:var(--primary);padding:2px 7px;border-radius:8px;">내 조</span>`:''}
        <span style="font-size:.72rem;color:var(--text-muted);margin-left:auto;">${members.length}명 · 1·2등 본선진출</span>
      </div>`;
      // 참가자 배지
      html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">`;
      members.forEach(m=>{
        const isMe=_isMyTeam(m);
        html+=`<span style="font-size:.78rem;padding:3px 10px;border-radius:14px;background:${isMe?'rgba(41,121,255,.15)':'var(--bg2)'};border:1px solid ${isMe?'var(--primary)':'var(--border)'};color:${isMe?'var(--primary)':'var(--text)'};">${_tl(m)}${isMe?' ◀':''}</span>`;
      });
      html+=`</div>`;
      // 순위표
      if(g.standings&&g.standings.length){
        html+=`<div style="overflow-x:auto;margin-bottom:10px;" id="bd-standings-${gi}">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem;text-align:center;">
            <thead><tr style="background:var(--bg3);">
              <th style="padding:6px 4px;">순위</th>
              <th style="padding:6px;text-align:left;">이름</th>
              <th>경기</th><th>승</th><th>득실</th>
            </tr></thead><tbody>`;
        g.standings.forEach((s,ri)=>{
          const isMe=_isMyTeam(s.team);
          const hl=isMe?'background:rgba(41,121,255,.07);font-weight:700;':'';
          const diff=s.diff>0?`+${s.diff}`:s.diff;
          html+=`<tr style="${hl}">
            <td style="padding:6px 4px;font-weight:700;color:${ri===0?'var(--primary)':ri===1?'var(--accent)':'var(--text-muted)'};">${ri+1}</td>
            <td style="padding:6px;text-align:left;">${_tl(s.team)}${isMe?` <span style="font-size:.65rem;color:var(--primary);">◀나</span>`:''}${ri<2?` <span style="font-size:.65rem;color:var(--text-muted);">본선↑</span>`:''}</td>
            <td>${s.played}</td><td>${s.wins}</td><td>${diff}</td>
          </tr>`;
        });
        html+=`</tbody></table></div>`;
      }
      // 경기 목록
      const doneCount=(g.matches||[]).filter(m=>m.done).length;
      html+=`<button onclick="bdToggleMatches(${gi})" id="bd-toggle-${gi}"
        style="width:100%;padding:6px;background:transparent;border:1px solid var(--border);border-radius:8px;font-size:.78rem;color:var(--text-muted);cursor:pointer;margin-bottom:6px;">
        📋 경기 내역 (완료 ${doneCount}/${(g.matches||[]).length})
      </button>
      <div id="bd-matches-${gi}" style="display:none;">
        <div class="league-matches-grid">`;
      (g.matches||[]).forEach((m,mi)=>{
        // 개인전: p1/p2, 듀오전: t1/t2 구조
        let lbl1,lbl2;
        if(isDuo){
          lbl1=m.t1?(m.t1.p2_name?`${m.t1.p1_name} / ${m.t1.p2_name}`:m.t1.p1_name||'?'):'?';
          lbl2=m.t2?(m.t2.p2_name?`${m.t2.p1_name} / ${m.t2.p2_name}`:m.t2.p1_name||'?'):'?';
        } else {
          lbl1=m.p1?.name||'?'; lbl2=m.p2?.name||'?';
        }
        html+=_renderMatchCell(gi,mi,m,lbl1,lbl2,isAdmin,isLeague);
      });
      html+=`</div></div></div>`;
    });

    if(isAdmin&&isLeague){
      const allDone=groups.length>0&&groups.every(g=>(g.matches||[]).every(m=>m.done));
      html+=`<div id="bd-knockout-btn-wrap">${allDone
        ?`<button onclick="bdStartKnockout()" style="width:100%;padding:12px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;margin-top:4px;">🏆 본선 대진표 생성 →</button>`
        :`<div style="text-align:center;font-size:.82rem;color:var(--text-muted);padding:8px;margin-top:4px;">모든 조별 경기 완료 후 본선 진출 가능</div>`
      }</div>`;
    }
  }

  html+=`</div>`; // /bd-league-view

  // 본선 뷰
  html+=`<div id="bd-bracket-view" style="display:none;">`;
  // 조별 순위 요약 (개인전/듀오전)
  if(!isTeamType){
    const groupsP=JSON.parse(data.groups||'[]');
    const hasStandings=groupsP.some(g=>g.standings&&g.standings.length>0);
    const hasAnyGroup=groupsP.some(g=>(g.teams||g.players||[]).length>0);
    if(hasStandings||hasAnyGroup){
      const label=hasStandings?'📊 조별 현황':'📋 조별 참가 현황';
      html+=`<div style="margin-bottom:14px;">
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.04em;">${label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
      groupsP.forEach(g=>{
        if(!g.standings||!g.standings.length){
          // 경기 전: 참가자만 표시
          const members=isDuo?(g.teams||[]):(g.players||[]);
          if(!members.length) return;
          html+=`<div style="flex:1;min-width:130px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 10px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--primary);margin-bottom:6px;">${g.name}</div>`;
          members.forEach((m,mi)=>{
            html+=`<div style="font-size:.78rem;padding:2px 0;color:var(--text-muted);">${mi+1}. ${_tl(m)}</div>`;
          });
          html+=`</div>`;
          return;
        }
        html+=`<div style="flex:1;min-width:130px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:8px 10px;">
          <div style="font-size:.72rem;font-weight:700;color:var(--primary);margin-bottom:6px;">${g.name}</div>`;
        g.standings.forEach((s,si)=>{
          const medal=['🥇','🥈','🥉'][si]||`${si+1}`;
          const adv=si<2;
          html+=`<div style="display:flex;align-items:center;gap:4px;padding:2px 0;font-size:.78rem;">
            <span style="font-size:.82rem;">${medal}</span>
            <span style="flex:1;font-weight:${adv?700:400};color:${adv?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(s.team)}</span>
            <span style="font-size:.65rem;color:var(--text-dim);">${s.wins}승</span>
            ${adv?`<span style="font-size:.58rem;color:var(--primary);background:rgba(41,121,255,.12);padding:1px 4px;border-radius:6px;">↑</span>`:''}
          </div>`;
        });
        html+=`</div>`;
      });
      html+=`</div></div>`;
    }
  }
  if(rounds.length>0){
    html+=_renderBracketVisual(rounds);
    if(isAdmin&&status==='knockout') html+=_renderBracketInput(rounds);
  } else if(!isTeamType){
    // 리그 진행 중 or 시작 전: 예상 대진 미리보기
    const previewHtml=_renderPreviewBracket(groups, isDuo, isLeague);
    if(previewHtml){
      html+=previewHtml;
    } else {
      html+=`<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:.88rem;">참가자 배분 후 예상 대진이 표시됩니다.</div>`;
    }
  }
  if(data.winner_name){
    html+=`<div style="text-align:center;padding:16px;background:rgba(41,121,255,.08);border-radius:12px;border:1px solid rgba(41,121,255,.25);margin-top:12px;">
      <div style="font-size:1.4rem;">🏆</div>
      <div style="font-weight:700;font-size:1rem;margin-top:4px;">${data.winner_name}</div>
      ${data.runner_up?`<div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;">🥈 ${data.runner_up}</div>`:''}
      ${data.third_place?`<div style="font-size:.82rem;color:var(--text-muted);">🥉 ${data.third_place}</div>`:''}
    </div>`;
  }
  html+=`</div>`; // /bd-bracket-view

  let actionBtns=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
  if(isAdmin&&status==='knockout'){
    const last=rounds[rounds.length-1]||[];
    if(last.length>0&&last.every(m=>m.done)){
      actionBtns+=last.length===1
        ?`<button class="btn btn-primary" onclick="bdFinish()">🏆 순위 확정</button>`
        :`<button class="btn btn-primary" onclick="bdNextRound()">다음 라운드 ➡️</button>`;
    }
  }
  document.getElementById('bd-content').innerHTML=html;
  document.getElementById('bd-actions').innerHTML=actionBtns;
}

function _renderTeamLeague(groups, isAdmin, isLeague){
  const g=groups[0];
  if(!g) return '';
  const {teamA=[],teamB=[],matches=[],standings={},playerStats={}}=g;
  const stA=standings.A||{wins:0,losses:0,diff:0};
  const stB=standings.B||{wins:0,losses:0,diff:0};
  const fmtDiff=d=>d>0?`+${d}`:d===0?'+0':String(d);
  const pSt=playerStats||{};

  // 선수 카드 렌더 (득실 포함)
  const renderPlayer=(p,clr)=>{
    const ps=pSt[p.id]||{games:0,wins:0,losses:0,diff:0};
    const diff=fmtDiff(ps.diff);
    const hasData=ps.games>0;
    return `<div style="display:flex;align-items:center;padding:3px 0;gap:4px;">
      <span style="font-size:.8rem;color:var(--text);flex:1;">${p.captain?'★ ':''} ${p.name}</span>
      ${hasData?`<span style="font-size:.68rem;color:var(--text-muted);background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:1px 6px;white-space:nowrap;">${ps.games}전 ${ps.wins}승 ${ps.losses}패 <span style="color:${ps.diff>0?clr:ps.diff<0?'var(--danger)':'var(--text-muted)'};">${diff}</span></span>`:''}
    </div>`;
  };

  // 팀 현황 카드
  let html=`<div style="display:flex;gap:8px;margin-bottom:12px;">
    <div style="flex:1;background:rgba(41,121,255,.08);border:1px solid rgba(41,121,255,.2);border-radius:10px;padding:10px;">
      <div style="font-weight:700;color:var(--info);margin-bottom:6px;font-size:.88rem;">🔵 블루팀 <span style="font-size:.78rem;font-weight:400;">${stA.wins}승 ${stA.losses}패 / ${fmtDiff(stA.diff)}</span></div>`;
  teamA.forEach(p=>{html+=renderPlayer(p,'var(--info)');});
  html+=`</div>
    <div style="flex:1;background:rgba(255,82,82,.08);border:1px solid rgba(255,82,82,.2);border-radius:10px;padding:10px;">
      <div style="font-weight:700;color:var(--danger);margin-bottom:6px;font-size:.88rem;">🔴 레드팀 <span style="font-size:.78rem;font-weight:400;">${stB.wins}승 ${stB.losses}패 / ${fmtDiff(stB.diff)}</span></div>`;
  teamB.forEach(p=>{html+=renderPlayer(p,'var(--danger)');});
  html+=`</div></div>`;

  // 라운드별 경기
  // 라운드 그룹화: matches에 round 필드 없으면 추가 순서대로
  const byRound={};
  matches.forEach((m,mi)=>{
    const r=m.round||1;
    if(!byRound[r]) byRound[r]=[];
    byRound[r].push({...m,_mi:mi});
  });
  const roundNums=Object.keys(byRound).map(Number).sort((a,b)=>a-b);

  if(roundNums.length===0){
    html+=`<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.85rem;">경기가 아직 없습니다</div>`;
  } else {
    roundNums.forEach(rn=>{
      const rmatch=byRound[rn];
      // 라운드 누적 점수
      let rBlue=0,rRed=0,rBWin=0,rRWin=0;
      rmatch.forEach(m=>{
        if(!m.done) return;
        const s1=parseInt(m.s1)||0,s2=parseInt(m.s2)||0;
        rBlue+=s1; rRed+=s2;
        if(s1>s2) rBWin++; else rRWin++;
      });
      const allRDone=rmatch.every(m=>m.done);
      const rLabel=allRDone
        ?`블루 ${rBlue} : ${rRed} 레드`
        :`블루 ${rBlue} : ${rRed} 레드 (${rmatch.filter(m=>m.done).length}/${rmatch.length})`;
      const rColor=allRDone?(rBlue>rRed?'var(--info)':rRed>rBlue?'var(--danger)':'var(--text-muted)'):'var(--text-muted)';
      html+=`<div style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="flex:1;height:1px;background:var(--border);"></div>
          <span style="font-size:.75rem;font-weight:700;color:${rColor};padding:2px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;">${rn}라운드 · ${rLabel}</span>
          <div style="flex:1;height:1px;background:var(--border);"></div>
        </div>
        <div class="league-matches-grid">`;
      rmatch.forEach(m=>{
        const mi=m._mi;
        const lbl1=_tlTeam(m.t1), lbl2=_tlTeam(m.t2);
        html+=_renderTeamMatchCell(0,mi,m,lbl1,lbl2,isAdmin);
      });
      html+=`</div></div>`;
    });
  }

  // 우세 & 최종 결과
  const allDone=matches.length>0&&matches.every(m=>m.done);
  if(matches.length>0){
    const winner=stA.wins>stB.wins?'🔵 블루팀':stB.wins>stA.wins?'🔴 레드팀':stA.diff>stB.diff?'🔵 블루팀 (득실차)':'🔴 레드팀 (득실차)';
    const scoreColor=allDone?'var(--primary)':'var(--text-muted)';
    html+=`<div style="text-align:center;padding:10px;background:var(--bg2);border-radius:10px;font-size:.85rem;color:${scoreColor};margin-bottom:8px;">
      ${allDone?'🏆 최종 우승:':'⚡ 현재 우세:'} <b>${winner}</b> (블루 ${stA.wins}승 / 레드 ${stB.wins}승)
    </div>`;
  }

  if(isAdmin){
    const isDone=_bdData?.status==='done';
    if(isDone){
      // 최종 확정 이후: 재개 버튼
      html+=`<div style="margin-top:8px;padding:10px;background:rgba(255,165,0,.06);border:1px solid rgba(255,165,0,.25);border-radius:10px;text-align:center;">
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px;">🏆 최종 확정된 대회입니다. 추가 라운드가 필요하면 진행 중으로 변경하세요.</div>
        <button onclick="bdReopenTeam()" style="padding:8px 24px;background:var(--warn,#f59e0b);color:#fff;border:none;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;">🔄 진행 중으로 변경</button>
      </div>`;
    } else if(isLeague){
      html+=`<div id="bd-team-add-wrap"></div>`;
      html+=`<button onclick="bdAddTeamMatch()" style="width:100%;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:.85rem;color:var(--text);cursor:pointer;margin-top:4px;">+ 복식 매치 추가</button>`;
      const allDone=matches.length>0&&matches.every(m=>m.done);
      html+=`<button onclick="bdFinalizeTeam()" style="width:100%;margin-top:8px;padding:12px;background:${allDone?'var(--primary)':'var(--bg3)'};color:${allDone?'#fff':'var(--text-muted)'};border:${allDone?'none':'1px solid var(--border)'};border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;">
        ${allDone?'🏆 최종 확정':'⏳ 모든 경기 완료 후 최종 확정 가능'}
      </button>`;
    }
  }
  return html;
}

async function bdFinalizeTeam(){
  const groups=JSON.parse(_bdData.groups||'[]');
  const g=groups[0];
  if(!g) return;
  const allDone=g.matches.length>0&&g.matches.every(m=>m.done);
  if(!allDone){toast('모든 경기를 완료해야 확정할 수 있습니다','error');return;}
  _bdCalcTeamStandings(g);
  const st=g.standings||{A:{wins:0},B:{wins:0}};
  const winner=st.A.wins>st.B.wins?'🔵 블루팀':st.B.wins>st.A.wins?'🔴 레드팀':'무승부';
  if(!confirm(`최종 확정하시겠습니까?

우승: ${winner}
블루팀 ${st.A.wins}승 / 레드팀 ${st.B.wins}승

확정 후에는 경기 수정이 불가합니다.`)) return;
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(groups),status:'done'}).eq('id',_bdId);
  _bdData.groups=JSON.stringify(groups);
  _bdData.status='done';
  _renderBracketDetail(_bdData);
  const fmtD=d=>d>0?`+${d}`:String(d||0);
  const blueInfo=`${st.A.wins}승 ${st.A.losses}패 / ${fmtD(st.A.diff)}`;
  const redInfo=`${st.B.wins}승 ${st.B.losses}패 / ${fmtD(st.B.diff)}`;
  const winnerFull=st.A.wins>st.B.wins?`🔵 블루팀 (${blueInfo})`:st.B.wins>st.A.wins?`🔴 레드팀 (${redInfo})`:`무승부`;
  toast(`🏆 ${winnerFull} 우승! 대회가 최종 확정되었습니다.`,'success');
}

async function bdReopenTeam(){
  if(!confirm('최종 확정을 취소하고 진행 중으로 변경하시겠습니까?\n추가 라운드를 입력할 수 있습니다.')) return;
  await sb.from('bracket_tournaments').update({status:'league'}).eq('id',_bdId);
  _bdData.status='league';
  _renderBracketDetail(_bdData);
  toast('🔄 진행 중으로 변경되었습니다. 매치를 추가할 수 있습니다.','success');
}

// 팀 라벨 (2명 표시)
function _tlTeam(t){
  if(!t) return '?';
  if(t.p1_name&&t.p2_name) return `${t.p1_name} / ${t.p2_name}`;
  if(t.p1_name) return t.p1_name;
  if(t.name) return t.name;
  return '?';
}

// 팀장전 전용 매치셀 (복식 2v2)
function _renderTeamMatchCell(gi,mi,m,lbl1,lbl2,isAdmin){
  const done=m.done;
  const aWin=done&&parseInt(m.s1)>parseInt(m.s2);
  const bWin=done&&!aWin;
  if(done){
    return `<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:7px 10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:.8rem;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:${aWin?700:400};padding:2px 4px;border-radius:4px;background:${aWin?'rgba(41,121,255,.12)':'transparent'};color:${aWin?'var(--info)':'var(--text-muted)'};">🔵 ${lbl1}${aWin?' 🏆':''}</div>
        <div style="font-weight:${bWin?700:400};padding:2px 4px;border-radius:4px;background:${bWin?'rgba(255,82,82,.12)':'transparent'};color:${bWin?'var(--danger)':'var(--text-muted)'};">🔴 ${lbl2}${bWin?' 🏆':''}</div>
      </div>
      <div style="text-align:center;flex-shrink:0;min-width:38px;">
        <div style="font-weight:700;color:${aWin?'var(--info)':'var(--text-muted)'};">${m.s1}</div>
        <div style="font-weight:700;color:${bWin?'var(--danger)':'var(--text-muted)'};">${m.s2}</div>
      </div>
      ${isAdmin?`<button onclick="bdEditLeague(${gi},${mi})" style="font-size:.65rem;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text-muted);">수정</button>`:''}
    </div>`;
  } else if(isAdmin){
    return `<div id="bl-cell-${gi}-${mi}" style="background:var(--surface2);border-radius:8px;padding:8px;border:1px solid var(--border);">
      <div style="font-size:.74rem;margin-bottom:6px;display:flex;justify-content:space-between;color:var(--text-muted);">
        <span style="color:var(--info);">🔵 ${lbl1}</span>
        <span style="color:var(--danger);">🔴 ${lbl2}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 14px 1fr auto;gap:4px;align-items:center;">
        <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-1"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
        <div style="text-align:center;color:var(--text-muted);font-size:.78rem;">:</div>
        <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-2"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
        <button ontouchend="event.preventDefault();bdConfirmLeague(${gi},${mi});" onclick="bdConfirmLeague(${gi},${mi});"
          style="padding:5px 8px;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;">✓</button>
      </div>
    </div>`;
  } else {
    return `<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:7px 10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);opacity:.6;font-size:.8rem;">
      <div style="flex:1;"><div style="color:var(--info);">🔵 ${lbl1}</div><div style="color:var(--danger);">🔴 ${lbl2}</div></div>
      <div style="font-size:.7rem;color:var(--text-dim);">대기중</div>
    </div>`;
  }
}

async function bdAddTeamMatch(){
  const groups=JSON.parse(_bdData.groups||'[]');
  const g=groups[0];if(!g) return;
  const {teamA=[],teamB=[],matches=[]}=g;
  // 현재 라운드 번호
  const curRound=matches.length>0?Math.max(...matches.map(m=>m.round||1)):1;
  const wrap=document.getElementById('bd-team-add-wrap');
  if(!wrap) return;
  const aOpts=teamA.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const bOpts=teamB.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  wrap.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-top:8px;">
    <div style="font-size:.85rem;font-weight:700;margin-bottom:10px;color:var(--text);">복식 매치 추가</div>
    <div style="margin-bottom:8px;">
      <div style="font-size:.75rem;color:var(--info);margin-bottom:4px;">🔵 블루팀 (2명)</div>
      <div style="display:flex;gap:6px;">
        <select id="bd-tm-a1" class="form-select" style="flex:1;"><option value="">선수1</option>${aOpts}</select>
        <select id="bd-tm-a2" class="form-select" style="flex:1;"><option value="">선수2</option>${aOpts}</select>
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:.75rem;color:var(--danger);margin-bottom:4px;">🔴 레드팀 (2명)</div>
      <div style="display:flex;gap:6px;">
        <select id="bd-tm-b1" class="form-select" style="flex:1;"><option value="">선수1</option>${bOpts}</select>
        <select id="bd-tm-b2" class="form-select" style="flex:1;"><option value="">선수2</option>${bOpts}</select>
      </div>
    </div>
    <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:.78rem;color:var(--text-muted);">라운드</span>
      <select id="bd-tm-round" class="form-select" style="max-width:100px;">
        ${Array.from({length:5},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===curRound?'selected':''}>${n}라운드</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="document.getElementById('bd-team-add-wrap').innerHTML=''" class="btn btn-ghost btn-sm" style="flex:1;">취소</button>
      <button onclick="bdConfirmAddTeamMatch()" class="btn btn-primary btn-sm" style="flex:1;">추가</button>
    </div>
  </div>`;
}

async function bdConfirmAddTeamMatch(){
  const a1Id=document.getElementById('bd-tm-a1')?.value;
  const a2Id=document.getElementById('bd-tm-a2')?.value;
  const b1Id=document.getElementById('bd-tm-b1')?.value;
  const b2Id=document.getElementById('bd-tm-b2')?.value;
  const rnd=parseInt(document.getElementById('bd-tm-round')?.value||'1');
  if(!a1Id||!b1Id){toast('A팀 선수1, B팀 선수1은 필수','error');return;}
  const groups=JSON.parse(_bdData.groups||'[]');
  const g=groups[0];
  const find=(arr,id)=>arr.find(p=>p.id===id);
  const a1=find(g.teamA,a1Id), a2=a2Id?find(g.teamA,a2Id):null;
  const b1=find(g.teamB,b1Id), b2=b2Id?find(g.teamB,b2Id):null;
  if(!a1||!b1){toast('선수 정보 오류','error');return;}
  if(!g.matches) g.matches=[];
  g.matches.push({
    t1:{p1_id:a1.id,p1_name:a1.name,p2_id:a2?.id||null,p2_name:a2?.name||null,team:'A'},
    t2:{p1_id:b1.id,p1_name:b1.name,p2_id:b2?.id||null,p2_name:b2?.name||null,team:'B'},
    s1:'',s2:'',done:false,round:rnd
  });
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(groups)}).eq('id',_bdId);
  _bdData.groups=JSON.stringify(groups);
  _renderBracketDetail(_bdData);
  toast('매치 추가됨','success');
}

function _renderMatchCell(gi,mi,m,lbl1,lbl2,isAdmin,isLeague){
  if(m.done){
    const aWin=parseInt(m.s1)>parseInt(m.s2);
    return `<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:.78rem;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:${aWin?700:400};color:${aWin?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lbl1}</div>
        <div style="font-weight:${!aWin?700:400};color:${!aWin?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lbl2}</div>
      </div>
      <div style="text-align:center;flex-shrink:0;min-width:38px;">
        <div style="font-weight:700;color:${aWin?'var(--primary)':'var(--text-muted)'};">${m.s1}</div>
        <div style="font-weight:700;color:${!aWin?'var(--primary)':'var(--text-muted)'};">${m.s2}</div>
      </div>
      ${isAdmin&&isLeague?`<button onclick="bdEditLeague(${gi},${mi})" style="font-size:.65rem;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text-muted);flex-shrink:0;">수정</button>`:''}
    </div>`;
  } else if(isAdmin&&isLeague){
    return `<div id="bl-cell-${gi}-${mi}" style="background:var(--surface2);border-radius:8px;padding:8px;border:1px solid var(--border);">
      <div style="font-size:.74rem;margin-bottom:4px;display:flex;justify-content:space-between;color:var(--text-muted);">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%;">${lbl1}</span>
        <span>vs</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%;text-align:right;">${lbl2}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 14px 1fr auto;gap:4px;align-items:center;">
        <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-1"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
        <div style="text-align:center;color:var(--text-muted);font-size:.78rem;">:</div>
        <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-2"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
        <button ontouchend="event.preventDefault();bdConfirmLeague(${gi},${mi});" onclick="bdConfirmLeague(${gi},${mi});"
          style="padding:5px 8px;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;">✓</button>
      </div>
    </div>`;
  } else {
    return `<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);opacity:.6;font-size:.78rem;">
      <div style="flex:1;">
        <div style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lbl1}</div>
        <div style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lbl2}</div>
      </div>
      <span style="font-size:.68rem;color:var(--text-dim);">대기</span>
    </div>`;
  }
}

function bdToggleMatches(gi){
  const el=document.getElementById(`bd-matches-${gi}`);
  const btn=document.getElementById(`bd-toggle-${gi}`);
  if(!el) return;
  const open=el.style.display!=='none';
  el.style.display=open?'none':'block';
  if(btn){
    const g=(JSON.parse(_bdData.groups||'[]'))[gi];
    const matches=g?.matches||[];
    const done=matches.filter(m=>m.done).length;
    btn.textContent=open?`📋 경기 내역 (완료 ${done}/${matches.length})`:`📋 경기 내역 닫기 (완료 ${done}/${matches.length})`;
  }
}

function bdSwitchTab(tab){
  document.getElementById('bd-league-view').style.display=tab==='league'?'block':'none';
  document.getElementById('bd-bracket-view').style.display=tab==='bracket'?'block':'none';
  const lBtn=document.getElementById('bd-tab-league');
  const bBtn=document.getElementById('bd-tab-bracket');
  if(lBtn){lBtn.style.background=tab==='league'?'var(--primary)':'transparent';lBtn.style.color=tab==='league'?'#fff':'var(--text-muted)';}
  if(bBtn){bBtn.style.background=tab==='bracket'?'var(--primary)':'transparent';bBtn.style.color=tab==='bracket'?'#fff':'var(--text-muted)';}
}

function _renderBracketVisual(rounds){
  if(!rounds||!rounds.length) return '';
  const isAdmin=ME?.role==='admin';
  const status=_bdData?.status||'';
  const roundLabels=['결승','4강','8강','16강','32강'];
  const total=rounds.length;
  const getLbl=ri=>{
    const fromEnd=total-1-ri;
    return roundLabels[fromEnd]||`${Math.pow(2,fromEnd+1)}강`;
  };

  const CARD_H=70; // px (두 행: 35px each)
  const CARD_W=180;

  // 각 라운드 아이템 슬롯 높이 계산
  // 마지막 라운드(결승): CARD_H + 상하패딩
  const SLOT_BASE=CARD_H+16; // 카드+여백
  const slotH=[];
  for(let ri=total-1;ri>=0;ri--){
    slotH[ri]= ri===total-1 ? SLOT_BASE : slotH[ri+1]*2;
  }

  // 카드 HTML
  const card=(m,ri,mi)=>{
    const n1=_tl(m.t1), n2=_tl(m.t2);
    const done=m.done;
    const aWin=done&&+m.s1>+m.s2;
    const edit=isAdmin&&status==='knockout'&&done
      ?`<button onclick="event.stopPropagation();bdEditMatch(${ri},${mi})" style="position:absolute;top:2px;right:2px;background:none;border:none;font-size:.58rem;color:var(--text-dim);cursor:pointer;padding:2px;">✏</button>`
      :'';
    const row=(nm,sc,win)=>`<div style="display:flex;align-items:center;height:35px;border-bottom:1px solid var(--border);box-sizing:border-box;">
      <div style="flex:1;padding:0 8px;font-size:.78rem;font-weight:${win?700:400};color:${win?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nm||'TBD'}</div>
      ${done
        ?`<div style="min-width:30px;padding:0 5px;text-align:center;font-weight:700;font-size:.82rem;background:${win?'var(--primary)':'transparent'};color:${win?'#fff':'var(--text-muted)'};">${sc}</div>`
        :`<div style="min-width:30px;text-align:center;font-size:.7rem;color:var(--text-dim);">-</div>`}
    </div>`;
    return `<div id="bs-cell-${ri}-${mi}" style="position:relative;width:${CARD_W}px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
      ${edit}${row(n1,m.s1,aWin)}${row(n2,m.s2,!aWin&&done)}
    </div>`;
  };

  let html=`<div style="overflow-x:auto;padding:4px 0 12px;"><div style="display:flex;align-items:flex-start;">`;

  rounds.forEach((round,ri)=>{
    const sh=slotH[ri];
    html+=`<div>
      <div style="font-size:.7rem;font-weight:700;color:var(--primary);text-align:center;margin-bottom:6px;width:${CARD_W}px;">${getLbl(ri)}</div>`;

    round.forEach((m,mi)=>{
      const topPad=(sh-CARD_H)/2;
      html+=`<div style="height:${sh}px;display:flex;align-items:center;box-sizing:border-box;">
        <div style="padding:0 6px;width:100%;">${card(m,ri,mi)}</div>
      </div>`;
    });
    html+=`</div>`;

    // 연결선 컬럼
    if(ri<total-1){
      const sh_this=slotH[ri];
      const sh_next=slotH[ri+1];
      html+=`<div style="display:flex;flex-direction:column;">`;
      for(let pi=0;pi<round.length;pi+=2){
        const pairH=sh_this*2;
        const midOffset=sh_this/2; // 상단 카드 중앙 위치
        // SVG로 정확한 연결선 그리기
        const svgW=24, svgH=pairH;
        const y1=midOffset; // 상단 카드 중앙
        const y2=pairH-midOffset; // 하단 카드 중앙
        const mx=svgW; // 수직선 x
        const cy=(y1+y2)/2; // 수직선 중점 → 다음 카드
        const bc='var(--border)';
        html+=`<svg width="${svgW}" height="${svgH}" style="display:block;flex-shrink:0;overflow:visible;">
          <line x1="0" y1="${y1}" x2="${svgW/2}" y2="${y1}" stroke="var(--border)" stroke-width="1"/>
          <line x1="0" y1="${y2}" x2="${svgW/2}" y2="${y2}" stroke="var(--border)" stroke-width="1"/>
          <line x1="${svgW/2}" y1="${y1}" x2="${svgW/2}" y2="${y2}" stroke="var(--border)" stroke-width="1"/>
          <line x1="${svgW/2}" y1="${cy}" x2="${svgW}" y2="${cy}" stroke="var(--border)" stroke-width="1"/>
        </svg>`;
      }
      html+=`</div>`;
    }
  });

  html+=`</div></div>`;
  return html;
}

function _renderBracketInput(rounds){
  if(!rounds||!rounds.length) return '';
  const curRound=rounds[rounds.length-1];
  let html=`<div style="margin-top:4px;">`;
  html+=`<div style="font-size:.82rem;font-weight:700;color:var(--primary);margin-bottom:10px;">📝 점수 입력</div>`;
  curRound.forEach((m,mi)=>{
    if(m.done) return;
    const ri=rounds.length-1;
    const lbl1=_tl(m.t1), lbl2=_tl(m.t2);
    html+=`<div id="bs-cell-${ri}-${mi}" style="background:var(--surface2);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid var(--border);">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:8px;">${lbl1} vs ${lbl2}</div>
      <div style="display:grid;grid-template-columns:1fr 22px 1fr;gap:6px;align-items:center;margin-bottom:8px;">
        <input type="number" inputmode="numeric" min="0" max="30" placeholder="점수" id="bs-${ri}-${mi}-1"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px;font-size:1rem;text-align:center;font-weight:600;">
        <div style="text-align:center;color:var(--text-muted);font-weight:600;">:</div>
        <input type="number" inputmode="numeric" min="0" max="30" placeholder="점수" id="bs-${ri}-${mi}-2"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px;font-size:1rem;text-align:center;font-weight:600;">
      </div>
      <button ontouchend="event.preventDefault();bdConfirmMatch(${ri},${mi});" onclick="bdConfirmMatch(${ri},${mi});"
        style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;">✅ 결과 등록</button>
    </div>`;
  });
  html+=`</div>`;
  return html;
}


// 점수 입력 & 경기내역 자동 기록
async function bdConfirmLeague(gi,mi){
  const s1v=document.getElementById(`bl-${gi}-${mi}-1`)?.value;
  const s2v=document.getElementById(`bl-${gi}-${mi}-2`)?.value;
  if(!s1v||!s2v){toast('점수 입력','error');return;}
  const n1=parseInt(s1v),n2=parseInt(s2v);
  if(isNaN(n1)||isNaN(n2)||n1===n2){toast(n1===n2?'동점 불가':'숫자 입력','error');return;}
  const groups=JSON.parse(_bdData.groups);
  const isTeam=_bdData.tournament_type==='team';
  const isIndividual=(_bdData.tournament_type==='individual'||_bdData.tournament_type==='duo');
  const m=groups[gi].matches[mi];
  m.s1=n1;m.s2=n2;m.done=true;

  if(isTeam){
    // 팀장전: standings.A/B 직접 재계산
    _bdCalcTeamStandings(groups[0]);
  } else {
    bdCalcStandings(groups,isIndividual);
  }

  await sb.from('bracket_tournaments').update({groups:JSON.stringify(groups)}).eq('id',_bdId);
  _bdData.groups=JSON.stringify(groups);

  // ── 경기내역 자동 기록 ──
  await _bdSaveMatchRecord(m,n1,n2,_bdData.match_date);

  if(isTeam){
    // 팀장전은 전체 다시 렌더 (standings 카드 업데이트 포함)
    _renderBracketDetail(_bdData);
  } else {
    // 셀 교체
    const lbl1=isIndividual?m.p1?.name:_tl(m.t1);
    const lbl2=isIndividual?m.p2?.name:_tl(m.t2);
    const cellEl=document.getElementById(`bl-cell-${gi}-${mi}`);
    if(cellEl) cellEl.outerHTML=_renderMatchCell(gi,mi,m,lbl1,lbl2,true,true);
    bdUpdateStandingsDOM(gi,groups[gi],isIndividual);

    // 토글 버튼 카운터
    const g=groups[gi];
    const done=g.matches.filter(mx=>mx.done).length;
    const btn=document.getElementById(`bd-toggle-${gi}`);
    if(btn) btn.textContent=btn.textContent.includes('닫기')
      ?`📋 경기 내역 닫기 (완료 ${done}/${g.matches.length})`
      :`📋 경기 내역 (완료 ${done}/${g.matches.length})`;

    // 본선 버튼
    const allDone=groups.every(grp=>grp.matches.every(mx=>mx.done));
    const kWrap=document.getElementById('bd-knockout-btn-wrap');
    if(kWrap&&allDone) kWrap.innerHTML=`<button onclick="bdStartKnockout()" style="width:100%;padding:12px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;margin-top:4px;">🏆 본선 대진표 생성 →</button>`;
  }
  toast('✅ 저장','success');
}

function _bdCalcTeamStandings(g){
  if(!g) return;
  const st={A:{wins:0,losses:0,diff:0,scored:0,conceded:0},B:{wins:0,losses:0,diff:0,scored:0,conceded:0}};
  // 선수별 stats 초기화
  const playerStats={};
  const initP=(id,name)=>{if(id&&!playerStats[id]) playerStats[id]={name,games:0,wins:0,losses:0,scored:0,conceded:0,diff:0};};
  (g.teamA||[]).forEach(p=>initP(p.id,p.name));
  (g.teamB||[]).forEach(p=>initP(p.id,p.name));

  (g.matches||[]).forEach(m=>{
    if(!m.done) return;
    const s1=parseInt(m.s1),s2=parseInt(m.s2);
    const winner=s1>s2?'A':'B';
    const loser=winner==='A'?'B':'A';
    st[winner].wins++; st[loser].losses++;
    st.A.scored+=s1; st.A.conceded+=s2;
    st.B.scored+=s2; st.B.conceded+=s1;
    st.A.diff=st.A.scored-st.A.conceded;
    st.B.diff=st.B.scored-st.B.conceded;
    // 선수별 집계 (t1=A팀, t2=B팀)
    const aWin=s1>s2;
    [m.t1?.p1_id,m.t1?.p2_id].filter(Boolean).forEach(id=>{
      if(!playerStats[id]) return;
      playerStats[id].games++;
      if(aWin) playerStats[id].wins++; else playerStats[id].losses++;
      playerStats[id].scored+=s1; playerStats[id].conceded+=s2;
      playerStats[id].diff=playerStats[id].scored-playerStats[id].conceded;
    });
    [m.t2?.p1_id,m.t2?.p2_id].filter(Boolean).forEach(id=>{
      if(!playerStats[id]) return;
      playerStats[id].games++;
      if(!aWin) playerStats[id].wins++; else playerStats[id].losses++;
      playerStats[id].scored+=s2; playerStats[id].conceded+=s1;
      playerStats[id].diff=playerStats[id].scored-playerStats[id].conceded;
    });
  });
  g.standings=st;
  g.playerStats=playerStats;
}

async function _bdSaveMatchRecord(m, s1, s2, matchDate){
  try{
    // 개인전/듀오전: p1,p2 / 팀전: t1,t2
    const a1id=m.p1?.id||m.t1?.p1_id||null;
    const a1name=m.p1?.name||m.t1?.p1_name||null;
    const a2id=m.t1?.p2_id||null;
    const a2name=m.t1?.p2_name||null;
    const b1id=m.p2?.id||m.t2?.p1_id||null;
    const b1name=m.p2?.name||m.t2?.p1_name||null;
    const b2id=m.t2?.p2_id||null;
    const b2name=m.t2?.p2_name||null;
    if(!a1id||!b1id) return;
    await sb.from('matches').insert({
      match_date:matchDate||new Date().toISOString().slice(0,10),
      match_type:'doubles',
      a1_id:a1id,a1_name:a1name,
      a2_id:a2id,a2_name:a2name,
      b1_id:b1id,b1_name:b1name,
      b2_id:b2id,b2_name:b2name,
      score_a:s1,score_b:s2,
      status:'approved',
      approved_by:ME.id,
      approved_at:nowISO(),
      tournament_id:_bdId
    });
  }catch(e){console.warn('경기기록 저장 실패',e);}
}

async function bdEditLeague(gi,mi){
  const groups=JSON.parse(_bdData.groups);
  const isIndividual=(_bdData.tournament_type==='individual'||_bdData.tournament_type==='duo');
  groups[gi].matches[mi].done=false;groups[gi].matches[mi].s1='';groups[gi].matches[mi].s2='';
  bdCalcStandings(groups,isIndividual);
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(groups)}).eq('id',_bdId);
  _bdData.groups=JSON.stringify(groups);
  const m=groups[gi].matches[mi];
  const lbl1=isIndividual?m.p1?.name:_tl(m.t1);
  const lbl2=isIndividual?m.p2?.name:_tl(m.t2);
  const cellEl=document.getElementById(`bl-cell-${gi}-${mi}`);
  if(cellEl) cellEl.outerHTML=_renderMatchCell(gi,mi,m,lbl1,lbl2,true,true);
  bdUpdateStandingsDOM(gi,groups[gi],isIndividual);
}

function bdUpdateStandingsDOM(gi,group,isIndividual){
  const standWrap=document.getElementById(`bd-standings-${gi}`);
  if(!standWrap||!group.standings||!group.standings.length) return;
  let rows='';
  group.standings.forEach((s,ri)=>{
    const isMe=_isMyTeam(s.team);
    const hl=isMe?'background:rgba(41,121,255,.07);font-weight:700;':'';
    const diff=s.diff>0?`+${s.diff}`:s.diff;
    rows+=`<tr style="${hl}">
      <td style="padding:6px 4px;font-weight:700;color:${ri===0?'var(--primary)':ri===1?'var(--accent)':'var(--text-muted)'};">${ri+1}</td>
      <td style="padding:6px;text-align:left;">${_tl(s.team)}${isMe?` <span style="font-size:.65rem;color:var(--primary);">◀나</span>`:''}${ri<2?` <span style="font-size:.65rem;color:var(--text-muted);">본선↑</span>`:''}</td>
      <td>${s.played}</td><td>${s.wins}</td><td>${diff}</td>
    </tr>`;
  });
  const tbody=standWrap.querySelector('tbody');
  if(tbody) tbody.innerHTML=rows;
}


// ═════════════════════════════
//  예상 대진 (리그 진행 중)
// ═════════════════════════════
function _getPreviewAdvancers(groups, isDuo){
  // 각 조에서 1위/2위 추출 (standings 기반, 없으면 참가자 그대로)
  const advancers=[];
  groups.forEach(g=>{
    const st=g.standings||[];
    if(isDuo){
      const teams=g.teams||[];
      if(st.length>=2){
        advancers.push(st[0].team, st[1].team);
      } else if(st.length===1){
        advancers.push(st[0].team);
        if(teams.length>=2) advancers.push(teams.find(t=>_tl(t)!==_tl(st[0].team))||teams[1]);
      } else {
        // 경기 없음: 팀 순서대로
        if(teams[0]) advancers.push(teams[0]);
        if(teams[1]) advancers.push(teams[1]);
      }
    } else {
      const players=g.players||[];
      if(st.length>=2){
        advancers.push(st[0].team, st[1].team);
      } else if(st.length===1){
        advancers.push(st[0].team);
        const p2=players.find(p=>p.id!==st[0].team.id);
        if(p2) advancers.push(p2);
      } else {
        if(players[0]) advancers.push(players[0]);
        if(players[1]) advancers.push(players[1]);
      }
    }
  });
  return advancers;
}

function _renderPreviewBracket(groups, isDuo, isLeague){
  const advancers=_getPreviewAdvancers(groups, isDuo);
  if(advancers.length<2) return '';
  // 4강/결승 구조 계산
  const n=advancers.length;
  const totalSlots=Math.pow(2,Math.ceil(Math.log2(Math.max(n,2))));

  // 슬롯 채우기 (부전승 포함)
  const slots=[...advancers];
  while(slots.length<totalSlots) slots.push(null);

  // 라운드 이름
  const roundNames={2:'결승',4:'4강',8:'8강',16:'16강'};

  // 대진 매치 생성
  function makeMatches(arr){
    const ms=[];
    for(let i=0;i<arr.length;i+=2) ms.push([arr[i],arr[i+1]||null]);
    return ms;
  }

  // 현재 순위 레이블 (A조1위 등)
  function rankLabel(team, groups, isDuo){
    if(!team) return '부전승';
    for(let gi=0;gi<groups.length;gi++){
      const g=groups[gi];
      const st=g.standings||[];
      for(let ri=0;ri<st.length;ri++){
        if(_tl(st[ri].team)===_tl(team)){
          return `<span style="font-size:.65rem;color:var(--text-muted);display:block;margin-bottom:1px;">${g.name} ${ri+1}위</span>`;
        }
      }
      // standings 없으면 팀 순서
      const arr=isDuo?(g.teams||[]):(g.players||[]);
      const idx=arr.findIndex(t=>_tl(t)===_tl(team));
      if(idx>=0) return `<span style="font-size:.65rem;color:var(--text-muted);display:block;margin-bottom:1px;">${g.name} ${idx+1}위(예상)</span>`;
    }
    return '';
  }

  // SVG 대진표 (가로 흐름)
  // 단순 HTML 트리 방식으로 구현
  const matches=makeMatches(slots);
  const isSF=matches.length>=2; // 4강 이상

  let html=`<div style="margin-top:16px;background:var(--surface);border:1px solid ${isLeague?'rgba(255,165,0,.3)':'var(--border)'};border-radius:12px;padding:14px;overflow-x:auto;">`;
  html+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
    <span style="font-size:.8rem;font-weight:700;color:${isLeague?'var(--warn)':'var(--primary)'};">${isLeague?'📊 현재 순위 기준 예상 대진 (리그 진행 중)':'🏆 본선 대진'}</span>
  </div>`;

  // 가로 대진표
  const colCount=isSF?3:2; // 4강-결승-우승 or 결승-우승
  html+=`<div style="display:flex;gap:0;align-items:center;min-width:${colCount*160+80}px;">`;

  // 라운드별 컬럼
  if(isSF){
    // 4강 컬럼
    html+=`<div style="display:flex;flex-direction:column;gap:16px;width:160px;flex-shrink:0;">`;
    html+=`<div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">${roundNames[matches.length*2]||matches.length*2+'강'}</div>`;
    matches.forEach((m,mi)=>{
      const [a,b]=m;
      html+=`<div style="display:flex;flex-direction:column;gap:4px;">`;
      [a,b].forEach((t,ti)=>{
        const isNull=!t;
        html+=`<div style="background:${isNull?'transparent':ti===0?'rgba(41,121,255,.1)':'rgba(255,82,82,.08)'};border:1px ${isNull?'dashed solid':'solid'} ${isNull?'var(--border)':ti===0?'rgba(41,121,255,.3)':'rgba(255,82,82,.25)'};border-radius:8px;padding:7px 10px;min-height:44px;">
          ${isNull?'<span style="color:var(--text-dim);font-size:.75rem;">부전승</span>':`${rankLabel(t,groups,isDuo)}<span style="font-size:.82rem;font-weight:600;color:var(--text);">${_tl(t)}</span>`}
        </div>`;
      });
      html+=`</div>`;
    });
    html+=`</div>`;

    // 연결선 + 결승 컬럼
    html+=`<div style="display:flex;flex-direction:column;align-items:center;width:40px;flex-shrink:0;padding-top:28px;">`;
    matches.forEach((_,mi)=>{
      html+=`<div style="width:100%;height:${matches.length>2?'80px':'60px'};border-right:2px dashed var(--border);border-top:${mi===0?'2px dashed var(--border)':'none'};border-bottom:${mi===matches.length-1?'2px dashed var(--border)':'none'};margin-bottom:${mi<matches.length-1?'16px':'0'};"></div>`;
    });
    html+=`</div>`;

    // 결승 컬럼
    html+=`<div style="display:flex;flex-direction:column;justify-content:center;width:160px;flex-shrink:0;gap:4px;">`;
    html+=`<div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">결승</div>`;
    html+=`<div style="background:rgba(41,121,255,.06);border:1px dashed rgba(41,121,255,.3);border-radius:8px;padding:7px 10px;min-height:44px;display:flex;align-items:center;justify-content:center;"><span style="font-size:.8rem;color:var(--text-muted);">진출팀</span></div>`;
    html+=`<div style="background:rgba(255,82,82,.06);border:1px dashed rgba(255,82,82,.3);border-radius:8px;padding:7px 10px;min-height:44px;display:flex;align-items:center;justify-content:center;"><span style="font-size:.8rem;color:var(--text-muted);">진출팀</span></div>`;
    html+=`</div>`;
  } else {
    // 2팀 → 바로 결승
    html+=`<div style="display:flex;flex-direction:column;gap:4px;width:160px;flex-shrink:0;">`;
    html+=`<div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">결승</div>`;
    matches[0].forEach((t,ti)=>{
      html+=`<div style="background:${ti===0?'rgba(41,121,255,.1)':'rgba(255,82,82,.08)'};border:1px solid ${ti===0?'rgba(41,121,255,.3)':'rgba(255,82,82,.25)'};border-radius:8px;padding:7px 10px;min-height:44px;">
        ${rankLabel(t,groups,isDuo)}<span style="font-size:.82rem;font-weight:600;color:var(--text);">${t?_tl(t):'?'}</span>
      </div>`;
    });
    html+=`</div>`;
  }

  // 연결선 → 우승
  html+=`<div style="width:40px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
    <div style="width:100%;border-top:2px dashed var(--border);"></div>
  </div>`;

  // 우승 컬럼
  html+=`<div style="display:flex;flex-direction:column;justify-content:center;width:120px;flex-shrink:0;">`;
  html+=`<div style="text-align:center;font-size:.72rem;font-weight:700;color:var(--warn);margin-bottom:8px;">🏆 우승</div>`;
  html+=`<div style="background:rgba(255,165,0,.08);border:2px dashed rgba(255,165,0,.4);border-radius:10px;padding:12px;text-align:center;min-height:54px;display:flex;align-items:center;justify-content:center;">
    <span style="font-size:.85rem;color:var(--warn);font-weight:700;">최종 우승</span>
  </div>`;
  html+=`</div>`;

  html+=`</div>`; // flex row
  html+=`</div>`; // container
  return html;
}
async function bdStartKnockout(){
  const groups=JSON.parse(_bdData.groups);
  const isIndividual=(_bdData.tournament_type==='individual'||_bdData.tournament_type==='duo');
  const G=groups.length;
  let pool=[];
  if(G===1){
    pool=groups[0].standings.map(s=>s.team);
  } else {
    const left=[],right=[];
    for(let i=0;i<G;i++){
      const g1=groups[i].standings[0]?.team,g2=groups[i].standings[1]?.team;
      if(i%2===0){if(g1)left.push(g1);if(g2)right.push(g2);}
      else{if(g1)right.push(g1);if(g2)left.push(g2);}
    }
    pool=[...left,...right];
  }
  const firstRound=_buildRound(pool);
  await sb.from('bracket_tournaments').update({rounds:JSON.stringify([firstRound]),status:'knockout'}).eq('id',_bdId);
  _bdData.rounds=JSON.stringify([firstRound]);_bdData.status='knockout';
  _renderBracketDetail(_bdData);
  setTimeout(()=>bdSwitchTab('bracket'),150);
}

function _buildRound(teams){
  const target=Math.pow(2,Math.ceil(Math.log2(Math.max(teams.length,2))));
  const arr=[...teams];
  while(arr.length<target) arr.push({p1_id:'BYE',p1_name:'부전승',p2_id:null,p2_name:null,id:'BYE',name:'부전승'});
  const matches=[];
  for(let i=0;i<arr.length;i+=2){
    const t1=arr[i],t2=arr[i+1];
    const isBye=(t1.p1_id==='BYE'||t1.id==='BYE')||(t2.p1_id==='BYE'||t2.id==='BYE');
    const winner=isBye?((t1.p1_id==='BYE'||t1.id==='BYE')?t2:t1):null;
    matches.push({t1,t2,s1:isBye?((t2.p1_id==='BYE'||t2.id==='BYE')?25:0):'',s2:isBye?((t1.p1_id==='BYE'||t1.id==='BYE')?25:0):'',done:isBye,winner,loser:null,id:`m_${i/2}`});
  }
  return matches;
}

async function bdConfirmMatch(rIdx,mIdx){
  const s1v=document.getElementById(`bs-${rIdx}-${mIdx}-1`)?.value;
  const s2v=document.getElementById(`bs-${rIdx}-${mIdx}-2`)?.value;
  if(!s1v||!s2v){toast('점수 입력','error');return;}
  const n1=parseInt(s1v),n2=parseInt(s2v);
  if(isNaN(n1)||isNaN(n2)||n1===n2){toast(n1===n2?'동점 불가':'숫자 입력','error');return;}
  const rounds=JSON.parse(_bdData.rounds);
  const m=rounds[rIdx][mIdx];
  m.s1=n1;m.s2=n2;m.done=true;m.winner=n1>n2?m.t1:m.t2;m.loser=n1>n2?m.t2:m.t1;
  await sb.from('bracket_tournaments').update({rounds:JSON.stringify(rounds)}).eq('id',_bdId);
  _bdData.rounds=JSON.stringify(rounds);
  const cellEl=document.getElementById(`bs-cell-${rIdx}-${mIdx}`);
  if(cellEl){
    cellEl.outerHTML=`<div id="bs-cell-${rIdx}-${mIdx}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface2);border-radius:9px;margin-bottom:8px;border:1px solid var(--border);">
      <span style="flex:1;font-size:.84rem;">${_tl(m.t1)}</span>
      <span style="font-weight:700;color:var(--primary);">${n1} : ${n2}</span>
      <span style="flex:1;font-size:.84rem;text-align:right;">${_tl(m.t2)}</span>
      <button onclick="bdEditMatch(${rIdx},${mIdx})" style="font-size:.72rem;padding:3px 9px;background:var(--bg3);border:1px solid var(--border);color:var(--text-muted);border-radius:6px;cursor:pointer;">수정</button>
    </div>`;
  }
  const cur=rounds[rIdx];
  const allDone=cur.every(mx=>mx.done);
  if(allDone){
    const actionsEl=document.getElementById('bd-actions');
    if(actionsEl){
      let ab=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
      ab+=cur.length===1
        ?`<button class="btn btn-primary" onclick="bdFinish()">🏆 순위 확정</button>`
        :`<button class="btn btn-primary" onclick="bdNextRound()">다음 라운드 ➡️</button>`;
      actionsEl.innerHTML=ab;
    }
  }
  toast('✅ 저장','success');
}

async function bdEditMatch(rIdx,mIdx){
  const rounds=JSON.parse(_bdData.rounds);
  const m=rounds[rIdx][mIdx];m.s1='';m.s2='';m.done=false;m.winner=null;m.loser=null;
  await sb.from('bracket_tournaments').update({rounds:JSON.stringify(rounds)}).eq('id',_bdId);
  _bdData.rounds=JSON.stringify(rounds);
  const cellEl=document.getElementById(`bs-cell-${rIdx}-${mIdx}`);
  if(cellEl){
    cellEl.outerHTML=`<div id="bs-cell-${rIdx}-${mIdx}" style="background:var(--surface2);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid var(--border);">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:8px;">${_tl(m.t1)} vs ${_tl(m.t2)}</div>
      <div style="display:grid;grid-template-columns:1fr 22px 1fr;gap:6px;align-items:center;margin-bottom:8px;">
        <input type="number" inputmode="numeric" min="0" max="30" placeholder="점수" id="bs-${rIdx}-${mIdx}-1"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px;font-size:1rem;text-align:center;font-weight:600;">
        <div style="text-align:center;color:var(--text-muted);font-weight:600;">:</div>
        <input type="number" inputmode="numeric" min="0" max="30" placeholder="점수" id="bs-${rIdx}-${mIdx}-2"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px;font-size:1rem;text-align:center;font-weight:600;">
      </div>
      <button ontouchend="event.preventDefault();bdConfirmMatch(${rIdx},${mIdx});" onclick="bdConfirmMatch(${rIdx},${mIdx});"
        style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;">✅ 결과 등록</button>
    </div>`;
  }
  const actionsEl=document.getElementById('bd-actions');
  if(actionsEl) actionsEl.innerHTML=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
}

async function bdNextRound(){
  const rounds=JSON.parse(_bdData.rounds);
  const winners=rounds[rounds.length-1].filter(m=>m.winner).map(m=>m.winner);
  if(winners.length<2){toast('진출 팀 부족','error');return;}
  rounds.push(_buildRound(winners));
  await sb.from('bracket_tournaments').update({rounds:JSON.stringify(rounds)}).eq('id',_bdId);
  _bdData.rounds=JSON.stringify(rounds);_renderBracketDetail(_bdData);
  setTimeout(()=>bdSwitchTab('bracket'),150);
}

async function bdFinish(){
  const rounds=JSON.parse(_bdData.rounds);
  const final=rounds[rounds.length-1][0];
  const champion=final.winner,runnerUp=final.loser;
  if(!champion){toast('1위 미결정','error');return;}
  let third=null;
  if(rounds.length>=2){
    const semi=rounds[rounds.length-2];
    const cs=semi.find(m=>m.winner&&(_tl(m.winner)===_tl(champion)));
    if(cs) third=cs.loser;
  }
  const cL=_tl(champion),ruL=runnerUp?_tl(runnerUp):null,tpL=third?_tl(third):null;
  await sb.from('bracket_tournaments').update({status:'done',winner_name:cL,runner_up:ruL,third_place:tpL}).eq('id',_bdId);
  Object.assign(_bdData,{status:'done',winner_name:cL,runner_up:ruL,third_place:tpL,rounds:JSON.stringify(rounds)});
  _renderBracketDetail(_bdData);renderBracketPage();
  toast(`🏆 1위: ${cL}!`,'success');
}


async function renderTournamentPage(){
  const addBBtn=document.getElementById('btn-add-bracket');
  if(addBBtn) addBBtn.style.display=ME?.role==='admin'?'':'none';
  renderBracketPage();
}

function openTournamentForm(){
  document.getElementById('tf-name').value='';document.getElementById('tf-date-start').value='';
  document.getElementById('tf-date-end').value='';document.getElementById('tf-place').value='';
  document.getElementById('tf-url').value='';document.getElementById('tf-note').value='';
  // 항상 등록 모드로 초기화
  document.querySelector('#modal-tournament-form .modal-title').textContent='🏆 대회 등록';
  document.querySelector('#modal-tournament-form .btn-primary').onclick=submitTournament;
  openModal('modal-tournament-form');
}

async function submitTournament(){
  const name=document.getElementById('tf-name').value.trim();
  const dateStart=document.getElementById('tf-date-start').value;
  const dateEnd=document.getElementById('tf-date-end').value;
  const place=document.getElementById('tf-place').value.trim();
  const url=document.getElementById('tf-url').value.trim();
  const note=document.getElementById('tf-note').value.trim();
  if(!name){toast('대회명을 입력하세요','error');return;}
  if(!dateStart){toast('시작일을 선택하세요','error');return;}
  if(dateEnd&&dateEnd<dateStart){toast('종료일이 시작일보다 빠릅니다','error');return;}
  const{error}=await sb.from('tournaments').insert({name,t_date:dateStart,t_date_end:dateEnd||null,place:place||null,url:url||null,note:note||null,created_by:ME.id});
  if(error){toast('등록 실패: '+error.message,'error');return;}
  toast('✅ 대회 등록 완료!','success');closeModal('modal-tournament-form');renderTournamentPage();
}

async function toggleLike(tournamentId, isLiked){
  if(isLiked){await sb.from('tournament_likes').delete().eq('tournament_id',tournamentId).eq('user_id',ME.id);}
  else{await sb.from('tournament_likes').insert({tournament_id:tournamentId,user_id:ME.id,user_name:ME.name});}
  renderTournamentPage();
}

function toggleLikesPanel(tournamentId){
  const panel=document.getElementById('likes-panel-'+tournamentId);
  const btn=document.getElementById('likes-btn-'+tournamentId);
  if(!panel) return;
  const isOpen=panel.style.display!=='none';
  panel.style.display=isOpen?'none':'block';
  btn.textContent=isOpen?'관심러들 ▼':'관심러들 ▲';
}

async function deleteTournament(id){
  if(!confirm('대회를 삭제할까요?')) return;
  await sb.from('tournament_likes').delete().eq('tournament_id',id);
  await sb.from('tournaments').delete().eq('id',id);
  toast('삭제 완료','success');renderTournamentPage();
}

async function openEditTournament(id){
  const{data:t}=await sb.from('tournaments').select('*').eq('id',id).single();
  if(!t){toast('불러오기 실패','error');return;}
  document.getElementById('tf-name').value=t.name||'';
  document.getElementById('tf-date-start').value=t.t_date||'';
  document.getElementById('tf-date-end').value=t.t_date_end||'';
  document.getElementById('tf-place').value=t.place||'';
  document.getElementById('tf-url').value=t.url||'';
  document.getElementById('tf-note').value=t.note||'';
  // 수정 모드 표시
  document.querySelector('#modal-tournament-form .modal-title').textContent='✏️ 대회 수정';
  document.querySelector('#modal-tournament-form .btn-primary').onclick=()=>updateTournament(id);
  openModal('modal-tournament-form');
}

async function updateTournament(id){
  const name=document.getElementById('tf-name').value.trim();
  const dateStart=document.getElementById('tf-date-start').value;
  const dateEnd=document.getElementById('tf-date-end').value;
  const place=document.getElementById('tf-place').value.trim();
  const url=document.getElementById('tf-url').value.trim();
  const note=document.getElementById('tf-note').value.trim();
  if(!name){toast('대회명을 입력하세요','error');return;}
  const{error}=await sb.from('tournaments').update({name,t_date:dateStart,t_date_end:dateEnd||null,place:place||null,url:url||null,note:note||null}).eq('id',id);
  if(error){toast('수정 실패: '+error.message,'error');return;}
  toast('✅ 수정 완료!','success');
  // 등록 버튼 원복
  document.querySelector('#modal-tournament-form .modal-title').textContent='🏆 대회 등록';
  document.querySelector('#modal-tournament-form .btn-primary').onclick=submitTournament;
  closeModal('modal-tournament-form');renderTournamentPage();
}

/* ── SCOREBOARD ── */
let _sbA=0, _sbB=0, _sbType='doubles', _sbFinishOpen=false, _wakeLock=null;

async function _requestWakeLock(){
  try{if('wakeLock' in navigator){_wakeLock=await navigator.wakeLock.request('screen');_wakeLock.addEventListener('release',()=>{_wakeLock=null;});}}catch(e){console.warn('WakeLock 실패:',e);}
}
function _releaseWakeLock(){if(_wakeLock){_wakeLock.release().catch(()=>{});_wakeLock=null;}}

function openScoreboard(){
  _sbA=0; _sbB=0; _sbType='doubles'; _sbFinishOpen=false;
  document.getElementById('sb-score-a').textContent='0';
  document.getElementById('sb-score-b').textContent='0';
  document.getElementById('sb-finish-panel').style.display='none';
  document.getElementById('sb-finish-btn').textContent='완료 ▼';
  document.getElementById('modal-scoreboard').style.display='flex';
  ['sb-top-a','sb-bot-a'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.background='#0D47A1';});
  ['sb-top-b','sb-bot-b'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.background='#B71C1C';});
  _requestWakeLock();
}

function sbChange(team,amt){
  if(team==='a'){_sbA=Math.max(0,_sbA+amt);document.getElementById('sb-score-a').textContent=_sbA;const inp=document.getElementById('sb-input-a');if(inp)inp.value=_sbA;}
  else{_sbB=Math.max(0,_sbB+amt);document.getElementById('sb-score-b').textContent=_sbB;const inp=document.getElementById('sb-input-b');if(inp)inp.value=_sbB;}
}

function sbReset(){if(!confirm('점수를 초기화할까요?')) return;_sbA=0; _sbB=0;document.getElementById('sb-score-a').textContent='0';document.getElementById('sb-score-b').textContent='0';const ia=document.getElementById('sb-input-a');const ib=document.getElementById('sb-input-b');if(ia)ia.value=0;if(ib)ib.value=0;}

function sbCourtChange(){
  [_sbA, _sbB] = [_sbB, _sbA];
  document.getElementById('sb-score-a').textContent=_sbA;document.getElementById('sb-score-b').textContent=_sbB;
  const topA=document.getElementById('sb-top-a');const botA=document.getElementById('sb-bot-a');const topB=document.getElementById('sb-top-b');const botB=document.getElementById('sb-bot-b');
  const isBlue=topA.style.background===''||topA.style.background.includes('0D47')||topA.style.background.includes('13,71');
  if(isBlue){topA.style.background='#B71C1C';botA.style.background='#B71C1C';topB.style.background='#0D47A1';botB.style.background='#0D47A1';}
  else{topA.style.background='#0D47A1';botA.style.background='#0D47A1';topB.style.background='#B71C1C';botB.style.background='#B71C1C';}
}

function sbFinish(){
  document.getElementById('modal-scoreboard').style.display='none';
  const panel=document.getElementById('sb-finish-panel');
  panel.style.display='block';panel.scrollTop=0;_sbFinishOpen=true;
  document.getElementById('sb-input-a').value=_sbA;document.getElementById('sb-input-b').value=_sbB;
}
function sbBackToBoard(){
  document.getElementById('sb-finish-panel').style.display='none';
  document.getElementById('sb-finish-btn').textContent='완료 ▼';_sbFinishOpen=false;
  document.getElementById('modal-scoreboard').style.display='flex';
}

function sbSetType(t){
  _sbType=t;
}

function _sbGetSelectedIds(excludeId){
  return ['sb-a1','sb-a2','sb-b1','sb-b2'].filter(id=>id!==excludeId).map(id=>document.getElementById(id)?.value).filter(v=>v&&v!=='');
}

function _sbBuildPlayerSelects(){
  const allSbPool=_usersCache||[];
  let poolA1=allSbPool,poolA2=allSbPool,poolB1=allSbPool,poolB2=allSbPool;
  const prev={a1:document.getElementById('sb-a1')?.value,a2:document.getElementById('sb-a2')?.value,b1:document.getElementById('sb-b1')?.value,b2:document.getElementById('sb-b2')?.value};
  const mkSel=(id,pool,label,req)=>{
    const selected=_sbGetSelectedIds(id);const cur=prev[id.replace('sb-','')]||'';
    let opts=req?`<option value="">선택하시오 *</option>`:`<option value="">없음</option>`;
    pool.forEach(u=>{if(selected.includes(u.id)) return;opts+=`<option value="${u.id}"${u.id===cur?' selected':''}>${u.name}</option>`;});
    return `<div><div style="font-size:.7rem;color:#888;margin-bottom:3px;">${label}${req?' <span style="color:#ff5252;">*</span>':''}</div><select id="${id}" onchange="_sbBuildPlayerSelects()" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:6px;padding:6px 8px;font-size:.82rem;">${opts}</select></div>`;
  };
  document.getElementById('sb-player-selects').innerHTML=`
    <div style="grid-column:span 2;font-size:.78rem;font-weight:700;padding-bottom:4px;border-bottom:1px solid #c0392b;color:#c0392b;">🔴 A팀</div>
    ${mkSel('sb-a1',poolA1,'선수1',true)}
    ${mkSel('sb-a2',poolA2,'선수2',false)}
    <div style="grid-column:span 2;font-size:.78rem;font-weight:700;padding-bottom:4px;border-bottom:1px solid #27ae60;color:#27ae60;margin-top:6px;">🟢 B팀</div>
    ${mkSel('sb-b1',poolB1,'선수1',true)}
    ${mkSel('sb-b2',poolB2,'선수2',false)}`;
}

function closeSbPanel(){
  _releaseWakeLock();
  document.getElementById('modal-scoreboard').style.display='none';
  document.getElementById('sb-finish-panel').style.display='none';
  _sbFinishOpen=false;const btn=document.getElementById('sb-finish-btn');if(btn)btn.textContent='완료 ▼';
}

async function sbSubmit(){
  const finalA=parseInt(document.getElementById('sb-input-a')?.value)||0;
  const finalB=parseInt(document.getElementById('sb-input-b')?.value)||0;
  _releaseWakeLock();
  document.getElementById('modal-scoreboard').style.display='none';
  document.getElementById('sb-finish-panel').style.display='none';
  _sbFinishOpen=false;
  await openRegisterModal();
  setTimeout(()=>{
    document.getElementById('reg-sa').value=finalA;
    document.getElementById('reg-sb').value=finalB;
    toast('점수가 이관됐어요! 선수 선택 후 등록 요청하세요 ✅','success');
  },400);
}

document.addEventListener('visibilitychange',async()=>{
  if(document.visibilityState==='visible'&&document.getElementById('modal-scoreboard')?.style.display!=='none'){
    await _requestWakeLock();
  }
});
