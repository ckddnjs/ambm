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
let regMatchType='men', adminTab='pending', editMatchId='';
let signupGender='', createGender='';
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
  const pg=localStorage.getItem('kakao_pending_gender')||'';
  if(pn) localStorage.removeItem('kakao_pending_name');
  if(pg) localStorage.removeItem('kakao_pending_gender');
  if(error?.code==='PGRST116'){
    // 신규 가입: localStorage의 이름·성별 사용
    const name=pn||authUser.user_metadata?.full_name||authUser.user_metadata?.name||authUser.user_metadata?.nickname||authUser.email?.split('@')[0]||'신규회원';
    const gender=pg||authUser.user_metadata?.gender||'';
    const{data:np,error:insErr}=await sb.from('profiles').upsert({
      id:authUser.id,email:authUser.email||'',name,role:'user',status:'pending',
      provider:authUser.app_metadata?.provider||'email',
      gender,wins:0,losses:0,games:0
    }).select().single();
    if(insErr) console.error('profile insert error',insErr);
    if(np) ME=np;
    addLog(`신규 가입: ${name}`);
  } else if(data){
    ME=data;
    // 기존 유저인데 성별 누락 시 localStorage 값으로 보완
    if(!data.gender&&pg){
      await sb.from('profiles').update({gender:pg}).eq('id',authUser.id);
      ME={...data,gender:pg};
    }
  }
}

function selectSignupGender(g){
  signupGender=g;
  document.getElementById('sg-male').classList.toggle('selected',g==='male');
  document.getElementById('sg-female').classList.toggle('selected',g==='female');
}
function selectCreateGender(g){
  createGender=g;
  document.getElementById('nu-male').classList.toggle('selected',g==='male');
  document.getElementById('nu-female').classList.toggle('selected',g==='female');
}

/* ── AUTH ── */
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
    <div style="font-size:.86rem;color:var(--text-muted);margin-bottom:14px;line-height:1.6;">이름과 성별을 입력 후 카카오 로그인을 진행합니다.</div>
    <div class="form-group"><label class="form-label">이름 *</label><input class="form-input" type="text" id="kakao-name-input" placeholder="실명" oninput="this.value=this.value.replace(/[0-9]/g,'')"></div>
    <div class="form-group">
      <label class="form-label">성별 *</label>
      <div class="gender-row">
        <button class="gender-btn" id="kk-male" onclick="selectKakaoGender('male')">👨 남성</button>
        <button class="gender-btn" id="kk-female" onclick="selectKakaoGender('female')">👩 여성</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-kakao-name').remove()">취소</button>
      <button class="btn btn-primary" onclick="proceedKakaoSignup()">다음 →</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  setTimeout(()=>document.getElementById('kakao-name-input')?.focus(),100);
}
let kakaoGender='';
function selectKakaoGender(g){
  kakaoGender=g;
  document.getElementById('kk-male')?.classList.toggle('selected',g==='male');
  document.getElementById('kk-female')?.classList.toggle('selected',g==='female');
}
async function proceedKakaoSignup(){
  const name=document.getElementById('kakao-name-input')?.value.trim();
  if(!name){toast('이름 입력 필요','error');return;}
  if(!kakaoGender){toast('성별을 선택하세요','error');return;}
  localStorage.setItem('kakao_pending_name',name);
  localStorage.setItem('kakao_pending_gender',kakaoGender);
  document.getElementById('modal-kakao-name')?.remove();
  const{error}=await sb.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:APP_URL,scopes:'profile_nickname,account_email',queryParams:{prompt:'select_account'}}});
  if(error){localStorage.removeItem('kakao_pending_name');localStorage.removeItem('kakao_pending_gender');toast('오류: '+error.message,'error');}
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
  if(!signupGender){toast('성별을 선택해주세요','error');return;}
  if(!email){toast('이메일 입력','error');return;}
  if(!pw||pw.length<4){toast('비밀번호 4자 이상 입력','error');return;}
  try {
    const res=await fetch('/api/admin/signup',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:pw,name,gender:signupGender})
    });
    const json=await res.json();
    if(!res.ok){toast('가입 실패: '+(json.error||res.status),'error');return;}
    toast('가입 신청 완료! 관리자 승인 후 로그인 가능합니다 ✅','success');
    ['signup-name','signup-email','signup-pw'].forEach(id=>document.getElementById(id).value='');
    signupGender='';
    document.getElementById('sg-male').classList.remove('selected');
    document.getElementById('sg-female').classList.remove('selected');
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
  {id:'compare',icon:'⚔️',label:'전력비교'},
  {id:'tournament',icon:'🏆',label:'대회'},
  {id:'community',icon:'📢',label:'공지'}
];
const ADMIN_NAVS=[
  {id:'dashboard',icon:'📊',label:'통계'},
  {id:'feed',icon:'📋',label:'경기내역'},
  {id:'compare',icon:'⚔️',label:'전력비교'},
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
  const typeGames={men:stats.men?.games||0, women:stats.women?.games||0, mixed:stats.mixed?.games||0};
  const mainTypeKey=Object.entries(typeGames).sort((a,b)=>b[1]-a[1])[0][0];
  const mainTypeLabel={men:'남복',women:'여복',mixed:'혼합복식'}[mainTypeKey]||'-';

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
  const cats=['men','women','mixed','total'];
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
  ['men','women','mixed','total'].forEach(c=>{s[c].diff=s[c].scored-s[c].conceded;});
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
  const sameType=ME?.gender==='female'?'women':'men';
  const typeLabel={men:'남복',women:'여복',mixed:'혼복'};
  const typeIcon={men:'🔵',women:'🩷',mixed:'🟡'};
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

  const cats=[sameType,'mixed','total'];
  const catLabel={[sameType]:typeLabel[sameType],mixed:'혼복',total:'합계'};
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
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;color:var(--primary);">${d.wins}</td>
      <td style="text-align:center;padding:7px 4px;font-size:.8rem;color:var(--danger);">${d.losses}</td>
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
  ['men','women','mixed'].forEach(t=>{
    const btn=document.getElementById('legend-'+t);
    if(!btn) return;
    const active=sel.value===t;
    const colors={men:'#4285F4',women:'#E91E8C',mixed:'#F9A825'};
    btn.style.borderColor=active?colors[t]:'transparent';
    btn.style.background=active?colors[t]+'22':'transparent';
    btn.style.color=active?colors[t]:'var(--text-muted)';
  });
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
  document.querySelectorAll('#rank-tabs .sub-tab').forEach((el,i)=>el.classList.toggle('active',['all','men','women','mixed'][i]===tab));
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
  const tabs=['all','same','mixed'];
  document.querySelectorAll('#partner-tabs .sub-tab').forEach((el,i)=>el.classList.toggle('active',tabs[i]===tab));
  renderPartner(_allMatchesCache);
}
function updatePartnerTabLabel(){
  const sameLabel=ME?.gender==='female'?'여복':'남복';
  const el=document.getElementById('partner-tab-same');
  if(el) el.textContent=sameLabel;
}
function renderPartner(allMatches){
  updatePartnerTabLabel();
  const el=document.getElementById('partner-list');
  if(!el) return;
  const sameType=ME?.gender==='female'?'women':'men';
  const filtered=allMatches.filter(m=>{
    if(m.status!=='approved') return false;
    if(partnerTab==='same') return m.match_type===sameType;
    if(partnerTab==='mixed') return m.match_type==='mixed';
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
async function renderFeed(forceNameQ){
  _feedPage=1;
  await _renderFeedInner(forceNameQ);
}

async function _renderFeedInner(forceNameQ){
  const el=document.getElementById('feed-list');
  // 범례 버튼 상태 동기화
  const _typeF=document.getElementById('feed-type-filter')?.value||'';
  ['men','women','mixed'].forEach(t=>{
    const btn=document.getElementById('legend-'+t);
    if(!btn) return;
    const active=_typeF===t;
    const colors={men:'#4285F4',women:'#E91E8C',mixed:'#F9A825'};
    btn.style.borderColor=active?colors[t]:'transparent';
    btn.style.background=active?colors[t]+'22':'transparent';
    btn.style.color=active?colors[t]:'var(--text-muted)';
  });
  if(_feedPage===1) el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(4);
  const typeF=document.getElementById('feed-type-filter')?.value||'';
  const statF=document.getElementById('feed-status-filter')?.value;
  const rawName=forceNameQ!==undefined?forceNameQ:(document.getElementById('feed-name-search')?.value||'');
  const nameQ=rawName.trim().toLowerCase();
  const clearBtn=document.getElementById('feed-search-clear');
  if(clearBtn) clearBtn.style.display=nameQ?'block':'none';
  const sortF=document.getElementById('feed-sort-filter')?.value||'desc';
  let q=sb.from('matches').select('*').limit(500);
  if(typeF) q=q.eq('match_type',typeF);
  if(statF!=='') q=q.eq('status',statF||'approved');
  let{data:matches}=await q;

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
  const tLabel={men:'<span class="type-pill type-men">남복</span>',women:'<span class="type-pill type-women">여복</span>',mixed:'<span class="type-pill type-mixed">혼복</span>'}[m.match_type]||'';

  // 이름: 가로 나열 (2인이면 / 구분)
  const aNames=[m.a1_name,m.a2_name].filter(Boolean).join(' ');
  const bNames=[m.b1_name,m.b2_name].filter(Boolean).join(' ');

  const typeClass={men:'mc-men',women:'mc-women',mixed:'mc-mixed'}[m.match_type]||'';

  return `<div class="match-card ${isMe?'my-match':''} ${typeClass}" onclick="openMatchDetail('${m.id}',${isAdmin})">
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
    <div class="detail-row"><span class="detail-key">종목</span><span class="detail-val">${{men:'🔵 남복',women:'🩷 여복',mixed:'🟡 혼복'}[m.match_type]}</span></div>
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
  const{data:users}=await sb.from('profiles').select('id,name,gender').eq('status','approved').order('name');
  _usersCache=users||[];
  // 여자 회원이면 여복 탭 먼저
  if(ME?.gender==='female' && regMatchType==='men'){
    regMatchType='women';
    ['men','women','mixed'].forEach(k=>document.getElementById('rt-'+k)?.classList.toggle('active',k==='women'));
  }
  updateRegisterSelects();
}
let _usersCache=[];

function updateRegisterLabels(){
  const t=regMatchType;
  if(t==='mixed'){
    document.getElementById('lbl-a1').innerHTML='남자 <span style="color:var(--danger);">*</span>';
    document.getElementById('lbl-a2').innerHTML='여자';
    document.getElementById('lbl-b1').innerHTML='남자 <span style="color:var(--danger);">*</span>';
    document.getElementById('lbl-b2').innerHTML='여자';
  } else {
    document.getElementById('lbl-a1').innerHTML='선수 1 <span style="color:var(--danger);">*</span>';
    document.getElementById('lbl-a2').innerHTML='선수 2';
    document.getElementById('lbl-b1').innerHTML='선수 1 <span style="color:var(--danger);">*</span>';
    document.getElementById('lbl-b2').innerHTML='선수 2';
  }
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
  const menOnly=_usersCache.filter(u=>u.gender==='male');
  const womenOnly=_usersCache.filter(u=>u.gender==='female');
  let poolA1, poolA2, poolB1, poolB2;
  if(t==='men'){poolA1=poolA2=poolB1=poolB2=menOnly;}
  else if(t==='women'){poolA1=poolA2=poolB1=poolB2=womenOnly;}
  else{poolA1=poolB1=menOnly; poolA2=poolB2=womenOnly;}

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
  ['men','women','mixed'].forEach(k=>document.getElementById('rt-'+k)?.classList.toggle('active',k===t));
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
  regMatchType=ME?.gender==='female'?'women':'men';
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
  const{data:matches}=await sb.from('matches').select('*').eq('status','pending').order('created_at',{ascending:false});
  const el=document.getElementById('admin-content');
  if(!matches||!matches.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">✅</div><div>승인 대기 없음</div></div>`;return;}
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="chk-all-pending" onchange="toggleAllPending(this.checked)" style="width:16px;height:16px;cursor:pointer;">
        <span style="font-size:.82rem;color:var(--text-muted);">대기 중 ${matches.length}건 <span class="pending-dot"></span></span>
      </div>
      <button onclick="bulkApprovePending()" class="btn btn-success btn-sm" id="btn-bulk-approve" style="display:none;">✅ 선택 일괄승인</button>
    </div>
    <div id="pending-cards">`+
    matches.map(m=>`
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;">
        <input type="checkbox" class="pending-chk" data-id="${m.id}" onchange="onPendingChkChange()" style="width:16px;height:16px;margin-top:14px;cursor:pointer;flex-shrink:0;">
        <div style="flex:1;">${matchCardHTML(m,true)}</div>
      </div>`).join('')+
    `</div>`;
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
  el.innerHTML=`<div class="filter-row"><input class="form-input" type="search" id="adm-search" placeholder="검색..." oninput="filterAdminAll()" style="flex:2;"><select class="form-select" id="adm-type-f" onchange="filterAdminAll()"><option value="">전체 종목</option><option value="men">남복</option><option value="women">여복</option><option value="mixed">혼복</option></select><select class="form-select" id="adm-stat-f" onchange="filterAdminAll()"><option value="">전체 상태</option><option value="pending">대기</option><option value="approved">승인</option><option value="rejected">반려</option></select></div><div id="adm-all-list"></div>`;
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
          <div style="font-weight:700;font-size:.92rem;">${u.name} ${gLabel(u.gender)}${u.role==='writer'?'<span class="admin-tag" style="background:rgba(92,107,192,.12);border-color:rgba(92,107,192,.3);color:#5C6BC0;">작성자</span>':u.role==='admin'?'<span class="admin-tag">ADMIN</span>':''} ${u.exclude_stats?'<span class="admin-tag" style="background:rgba(255,152,0,.12);border-color:rgba(255,152,0,.3);color:#E65100;">통계제외</span>':''} <span style="font-size:.72rem;color:${u.status==='approved'?'var(--primary)':u.status==='pending'?'var(--accent)':'var(--danger)'}">${u.status==='approved'?'승인':u.status==='pending'?'대기':'정지'}</span></div>
          <div style="font-size:.74rem;color:var(--text-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.email}</div>
        </div>
        <div style="display:flex;flex-direction:row;gap:4px;flex-shrink:0;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-ghost btn-xs" onclick="openEditUser('${u.id}','${escHtml(u.name)}','${u.gender}','${u.status}','${u.role}',${!!u.exclude_stats})">✏️ 수정</button>
          ${u.status==='pending'?`<button class="btn btn-success btn-xs" onclick="approveUser('${u.id}')">✅ 승인</button>`:''}
        </div>
        </div>
      </div>
    </div>`).join('');
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
    <div class="form-group"><label class="form-label">종목</label><select class="form-select" id="em-type"><option value="men" ${m.match_type==='men'?'selected':''}>남복</option><option value="women" ${m.match_type==='women'?'selected':''}>여복</option><option value="mixed" ${m.match_type==='mixed'?'selected':''}>혼복</option></select></div>
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

  const{error}=await sb.from('profiles').update({name,gender:_editUserGender,status,role,exclude_stats:excludeStats}).eq('id',id);
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
  createGender='';
  document.getElementById('nu-male').classList.remove('selected');
  document.getElementById('nu-female').classList.remove('selected');
  openModal('modal-create-user');
}
async function createUser(){
  const name=document.getElementById('nu-name').value.trim();
  const email=document.getElementById('nu-email').value.trim();
  const pw=document.getElementById('nu-pw').value;
  const role=document.getElementById('nu-role').value;
  if(!name||!email){toast('이름/이메일 입력','error');return;}
  if(!createGender){toast('성별을 선택하세요','error');return;}
  if(!pw||pw.length<4){toast('비밀번호는 4자 이상','error');return;}
  try {
    const session=await sb.auth.getSession();
    const token=session.data.session?.access_token;
    if(!token){toast('로그인 세션 없음','error');return;}
    const res=await fetch('/api/admin/create-user',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({email,password:pw,name,gender:createGender,role})
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
   전력비교 (Compare) 페이지
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
  const{data:users}=await sb.from('profiles').select('id,name,gender').eq('status','approved').order('name');
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
    <div><div class="page-title">⚔️ 전력비교</div><div class="page-sub">라인업 승률 예측<br><span style="font-size:.72rem;color:var(--text-muted);">*단, 경기수 표본이 적으면 부정확할 수 있습니다.</span></div></div>
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
    <button onclick="runCompare()" class="btn btn-primary" style="width:100%;margin-top:10px;font-size:.92rem;padding:10px;">🔍 전력 비교</button>
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


/* ══════════════════════════════════════
   BRACKET TOURNAMENT v3
══════════════════════════════════════ */
let _bfUserOpts='';
let _bdId=null, _bdData=null;
let _btTeamCount=0;

async function renderBracketPage(){
  const addBtn=document.getElementById('btn-add-bracket');
  if(addBtn) addBtn.style.display=ME?.role==='admin'?'block':'none';
  if(addBtn) addBtn.style.display=ME?.role==='admin'?'block':'none';
  const el=document.getElementById('bracket-list');
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);
  const{data:list}=await sb.from('bracket_tournaments').select('*').order('created_at',{ascending:false});
  if(!list||!list.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🎯</div><div>등록된 토너먼트가 없어요</div></div>`;return;}
  el.innerHTML=list.map(bt=>{
    const isDone=bt.status==='done';
    const isLeague=bt.status==='league'||bt.status==='active';
    const isAdmin=ME?.role==='admin';
    return `<div class="card" style="margin-bottom:12px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="flex:1;min-width:0;cursor:pointer;" onclick="openBracketDetail('${bt.id}')">
          <div style="font-weight:700;font-size:.95rem;margin-bottom:3px;">${bt.name}</div>
          <div style="font-size:.78rem;color:var(--text-muted);">📅 ${fmtMatchDate(bt.match_date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:.75rem;padding:3px 10px;border-radius:12px;font-weight:700;
            background:${isDone?'rgba(0,200,150,.15)':isLeague?'rgba(41,121,255,.15)':'rgba(255,152,0,.15)'};
            color:${isDone?'var(--primary)':isLeague?'var(--info)':'var(--warn)'};">
            ${isDone?'완료':isLeague?'리그중':'본선중'}
          </span>
          ${isAdmin?`<button onclick="event.stopPropagation();editBracketTournament('${bt.id}','${escHtml(bt.name)}','${bt.match_date||''}')" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:.72rem;cursor:pointer;color:var(--text);">✏️</button>
          <button onclick="event.stopPropagation();deleteBracketTournament('${bt.id}')" style="background:none;border:none;cursor:pointer;font-size:.82rem;color:var(--danger);padding:2px;">🗑</button>`:''}
        </div>
      </div>
      ${bt.winner_name?`<div style="margin-top:8px;font-size:.85rem;color:var(--primary);font-weight:700;cursor:pointer;" onclick="openBracketDetail('${bt.id}')">🥇 1위: ${bt.winner_name}</div>`:''}
    </div>`;
  }).join('');
}

async function deleteBracketTournament(id){
  showConfirm({icon:'🗑️',title:'토너먼트 삭제',msg:'삭제된 토너먼트는 복구할 수 없습니다.',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    await sb.from('bracket_tournaments').delete().eq('id',id);
    toast('삭제 완료','success');renderBracketPage();
  }});
}

function editBracketTournament(id,name,date){
  let m=document.getElementById('modal-edit-bracket');if(m)m.remove();
  m=document.createElement('div');m.id='modal-edit-bracket';m.className='modal-overlay center open';
  m.innerHTML=`<div class="modal center-modal">
    <div class="modal-title">✏️ 토너먼트 수정</div>
    <div class="form-group"><label class="form-label">대회명</label><input class="form-input" id="eb-name" value="${escHtml(name)}"></div>
    <div class="form-group"><label class="form-label">날짜</label><input class="form-input" type="date" id="eb-date" value="${date}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-edit-bracket').remove()">취소</button>
      <button class="btn btn-primary" onclick="saveEditBracket('${id}')">저장</button>
    </div>
  </div>`;
  document.body.appendChild(m);
}

async function saveEditBracket(id){
  const name=document.getElementById('eb-name')?.value.trim();
  const date=document.getElementById('eb-date')?.value;
  if(!name){toast('대회명을 입력하세요','error');return;}
  const{error}=await sb.from('bracket_tournaments').update({name,match_date:date||null}).eq('id',id);
  if(error){toast('수정 실패: '+error.message,'error');return;}
  document.getElementById('modal-edit-bracket')?.remove();
  toast('✅ 수정 완료','success');renderBracketPage();
}

async function openBracketForm(){
  _btTeamCount=0;
  document.getElementById('bf-name').value='';
  document.getElementById('bf-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('bf-teams-wrap').innerHTML='';
  const{data:users}=await sb.from('profiles').select('id,name,gender').eq('status','approved').order('name');
  _bfUserOpts=(users||[]).map(u=>`<option value="${u.id}" data-name="${u.name}">${u.name}</option>`).join('');
  bfAddTeam();bfAddTeam();bfAddTeam();bfAddTeam();
  openModal('modal-bracket-form');
}

function bfAddTeam(){
  _btTeamCount++;
  const idx=_btTeamCount;
  const wrap=document.getElementById('bf-teams-wrap');
  const div=document.createElement('div');
  div.id=`bf-team-${idx}`;
  div.style.cssText='background:var(--bg3);border-radius:10px;padding:10px 12px;position:relative;margin-bottom:8px;';
  div.innerHTML=`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <span style="font-size:.78rem;font-weight:700;color:var(--primary);">팀 ${idx}</span>
      <button ontouchend="event.preventDefault();bfToggleDirect(${idx});" onclick="bfToggleDirect(${idx});" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:.7rem;border-radius:6px;padding:2px 7px;cursor:pointer;margin-left:auto;">✏️ 직접입력</button>
      ${idx>1?`<button ontouchend="event.preventDefault();bfRemoveTeam(${idx});" onclick="bfRemoveTeam(${idx});" style="background:none;border:none;color:var(--danger);font-size:1rem;cursor:pointer;padding:0 4px;">✕</button>`:''}
    </div>
    <div id="bf-sel-${idx}" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      <select class="form-select bf-p1" data-team="${idx}" onchange="bfCheckDups()" style="font-size:.85rem;">
        <option value="">선수1 선택 *</option>${_bfUserOpts}
      </select>
      <select class="form-select bf-p2" data-team="${idx}" onchange="bfCheckDups()" style="font-size:.85rem;">
        <option value="">선수2 (선택)</option>${_bfUserOpts}
      </select>
    </div>
    <div id="bf-direct-${idx}" style="display:none;grid-template-columns:1fr 1fr;gap:6px;">
      <input class="form-input bf-d1" data-team="${idx}" type="text" placeholder="선수1 이름 *" style="font-size:.85rem;">
      <input class="form-input bf-d2" data-team="${idx}" type="text" placeholder="선수2 이름 (선택)" style="font-size:.85rem;">
    </div>`;
  wrap.appendChild(div);
  bfCheckDups();
}

function bfToggleDirect(idx){
  const sel=document.getElementById(`bf-sel-${idx}`);
  const dir=document.getElementById(`bf-direct-${idx}`);
  if(!sel||!dir) return;
  const isDirect=dir.style.display!=='none';
  sel.style.display=isDirect?'grid':'none';
  dir.style.display=isDirect?'none':'grid';
}

function bfRemoveTeam(idx){document.getElementById(`bf-team-${idx}`)?.remove();bfCheckDups();}

function bfCheckDups(){
  const allSels=[...document.querySelectorAll('#bf-teams-wrap select')];
  const vals=allSels.map(s=>s.value).filter(v=>v);
  allSels.forEach(sel=>{
    const otherVals=allSels.filter(s=>s!==sel).map(s=>s.value).filter(v=>v);
    [...sel.options].forEach(opt=>{if(!opt.value)return;opt.disabled=otherVals.includes(opt.value);});
    sel.style.borderColor=(sel.value&&vals.filter(v=>v===sel.value).length>1)?'var(--danger)':'';
  });
}

function _tl(t){
  if(!t||t.p1_id==='BYE') return '부전승';
  return `${t.p1_name}${t.p2_name?'  '+t.p2_name:''}`;
}

function _isMyTeam(t){
  if(!ME||!t) return false;
  return t.p1_id===ME.id||t.p2_id===ME.id;
}

async function submitBracketTournament(){
  const name=document.getElementById('bf-name').value.trim();
  const date=document.getElementById('bf-date').value;
  if(!name){toast('대회명 입력','error');return;}
  if(!date){toast('날짜 입력','error');return;}
  const teamDivs=[...document.querySelectorAll('#bf-teams-wrap > div[id^="bf-team-"]')];
  const teams=[];
  for(const div of teamDivs){
    const isDirect=document.getElementById(`bf-direct-${div.id.replace('bf-team-','')}`)?.style.display!=='none';
    if(isDirect){
      const d1=div.querySelector('.bf-d1')?.value.trim();
      const d2=div.querySelector('.bf-d2')?.value.trim()||'';
      if(!d1) continue;
      teams.push({p1_id:null,p1_name:d1,p2_id:null,p2_name:d2||null});
    } else {
      const p1sel=div.querySelector('.bf-p1');
      const p2sel=div.querySelector('.bf-p2');
      if(!p1sel||!p1sel.value) continue;
      const p1id=p1sel.value, p2id=p2sel?.value||'';
      const p1name=p1sel.options[p1sel.selectedIndex]?.dataset.name||'';
      const p2name=p2id?(p2sel.options[p2sel.selectedIndex]?.dataset.name||''):'';
      teams.push({p1_id:p1id,p1_name:p1name,p2_id:p2id||null,p2_name:p2name||null});
    }
  }
  if(teams.length<3){toast('최소 3팀 이상','error');return;}
  const allIds=teams.flatMap(t=>[t.p1_id,t.p2_id].filter(Boolean));
  if(new Set(allIds).size!==allIds.length){toast('중복 선수','error');return;}
  const shuffled=[...teams].sort(()=>Math.random()-.5);
  const numGroups=teams.length<=5?1:Math.ceil(teams.length/4);
  const groups=[];
  for(let i=0;i<numGroups;i++)
    groups.push({name:numGroups===1?'풀리그':`${String.fromCharCode(65+i)}조`,teams:[],matches:[],standings:[]});
  shuffled.forEach((t,i)=>groups[i%numGroups].teams.push(t));
  groups.forEach(g=>{
    for(let i=0;i<g.teams.length;i++)
      for(let j=i+1;j<g.teams.length;j++)
        g.matches.push({t1:g.teams[i],t2:g.teams[j],s1:'',s2:'',done:false});
  });
  const{data,error}=await sb.from('bracket_tournaments').insert({
    name,match_date:date,status:'league',
    teams:JSON.stringify(shuffled),groups:JSON.stringify(groups),
    rounds:JSON.stringify([]),winner_name:null,runner_up:null,third_place:null,created_by:ME.id
  }).select().single();
  if(error){toast('생성 실패: '+error.message,'error');return;}
  closeModal('modal-bracket-form');
  toast('✅ 토너먼트 생성! 조별 리그를 진행하세요.','success');
  renderBracketPage();
  setTimeout(()=>openBracketDetail(data.id),500);
}

async function openBracketDetail(id){
  _bdId=id;
  const{data}=await sb.from('bracket_tournaments').select('*').eq('id',id).single();
  if(!data) return;
  _bdData=data;
  document.getElementById('bd-title').textContent='🎯 '+data.name;
  _renderBracketDetail(data);
  openModal('modal-bracket-detail');
}

function _renderBracketDetail(data){
  const isAdmin=ME?.role==='admin';
  const status=data.status||'league';
  const groups=JSON.parse(data.groups||'[]');
  const rounds=JSON.parse(data.rounds||'[]');
  const isLeague=status==='league'||status==='active';
  const hasKnockout=rounds.length>0;
  let html='';

  html+=`<div style="display:flex;gap:0;background:var(--bg3);border-radius:10px;padding:3px;margin-bottom:14px;">
    <button id="bd-tab-league" onclick="bdSwitchTab('league')"
      style="flex:1;border:none;cursor:pointer;padding:8px;border-radius:8px;font-size:.83rem;font-weight:600;background:var(--primary);color:#000;">📊 조별 리그</button>
    <button id="bd-tab-bracket" onclick="bdSwitchTab('bracket')"
      style="flex:1;border:none;cursor:pointer;padding:8px;border-radius:8px;font-size:.83rem;font-weight:600;background:transparent;color:var(--text-muted);">🏆 본선 대진</button>
  </div>`;

  html+=`<div id="bd-league-view">`;
  groups.forEach((g,gi)=>{
    const myGroupTeam=g.teams.find(t=>_isMyTeam(t));
    const myGroupHL=myGroupTeam?'border-color:var(--primary);box-shadow:0 0 0 2px rgba(0,200,150,.2);':'';
    html+=`<div style="margin-bottom:16px;background:var(--surface);border:1px solid var(--border);${myGroupHL}border-radius:12px;padding:12px;">`;
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--primary);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
      ${g.name}${myGroupTeam?`<span style="font-size:.7rem;background:rgba(0,200,150,.15);color:var(--primary);padding:2px 7px;border-radius:8px;">내 조</span>`:''}
    </div>`;

    if(g.standings&&g.standings.length){
      html+=`<div style="overflow-x:auto;margin-bottom:10px;" id="bd-standings-${gi}"><table style="width:100%;border-collapse:collapse;font-size:.78rem;text-align:center;">
        <thead><tr style="background:var(--bg3);"><th style="padding:6px 4px;">순위</th><th style="padding:6px;text-align:left;">팀</th><th>경기</th><th>승</th><th>득실</th></tr></thead>
        <tbody>`;
      g.standings.forEach((s,ri)=>{
        const isMe=_isMyTeam(s.team);
        const hl=isMe?'background:rgba(0,200,150,.07);font-weight:700;':'';
        const diff=s.diff>0?`+${s.diff}`:s.diff;
        html+=`<tr style="${hl}">
          <td style="padding:6px 4px;font-weight:700;color:${ri===0?'var(--primary)':ri===1?'var(--accent)':'var(--text-muted)'};">${ri+1}</td>
          <td style="padding:6px;text-align:left;">${_tl(s.team)}${isMe?` <span style="font-size:.65rem;color:var(--primary);">◀나</span>`:''}${ri<2?` <span style="font-size:.65rem;color:var(--text-muted);">본선↑</span>`:''}</td>
          <td>${s.played}</td><td>${s.wins}</td><td>${diff}</td>
        </tr>`;
      });
      html+=`</tbody></table></div>`;
    }

    const doneMatches=g.matches.filter(m=>m.done);
    const pendingMatches=g.matches.filter(m=>!m.done);
    html+=`<button onclick="bdToggleMatches(${gi})" id="bd-toggle-${gi}"
      style="width:100%;padding:6px;background:transparent;border:1px solid var(--border);border-radius:8px;font-size:.78rem;color:var(--text-muted);cursor:pointer;margin-bottom:6px;">
      📋 경기 내역 보기 (완료 ${doneMatches.length}/${g.matches.length})
    </button>
    <div id="bd-matches-${gi}" style="display:none;">`;

    html+=`<div class="league-matches-grid">`;
    g.matches.forEach((m,mi)=>{
      if(m.done){
        const aWin=parseInt(m.s1)>parseInt(m.s2);
        html+=`<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:.78rem;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:${aWin?700:400};color:${aWin?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(m.t1)}</div>
            <div style="font-weight:${!aWin?700:400};color:${!aWin?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(m.t2)}</div>
          </div>
          <div style="text-align:center;flex-shrink:0;min-width:38px;">
            <div style="font-weight:700;color:${aWin?'var(--primary)':'var(--text-muted)'};">${m.s1}</div>
            <div style="font-weight:700;color:${!aWin?'var(--primary)':'var(--text-muted)'};">${m.s2}</div>
          </div>
          ${isAdmin&&isLeague?`<button onclick="bdEditLeague(${gi},${mi})" style="font-size:.65rem;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text-muted);flex-shrink:0;">수정</button>`:''}
        </div>`;
      } else if(isAdmin&&isLeague){
        html+=`<div id="bl-cell-${gi}-${mi}" style="background:var(--surface2);border-radius:8px;padding:8px;border:1px solid var(--border);">
          <div style="font-size:.74rem;margin-bottom:4px;display:flex;justify-content:space-between;color:var(--text-muted);">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%;">${_tl(m.t1)}</span>
            <span>vs</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%;text-align:right;">${_tl(m.t2)}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 14px 1fr auto;gap:4px;align-items:center;">
            <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-1"
              style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
            <div style="text-align:center;color:var(--text-muted);font-size:.78rem;">:</div>
            <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-2"
              style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
            <button ontouchend="event.preventDefault();bdConfirmLeague(${gi},${mi});" onclick="bdConfirmLeague(${gi},${mi});"
              style="padding:5px 8px;background:var(--primary);color:#000;border:none;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;">✓</button>
          </div>
        </div>`;
      } else {
        html+=`<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);opacity:.6;font-size:.78rem;">
          <div style="flex:1;">
            <div style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(m.t1)}</div>
            <div style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(m.t2)}</div>
          </div>
          <span style="font-size:.68rem;color:var(--text-dim);">대기</span>
        </div>`;
      }
    });
    html+=`</div>`; /* /league-matches-grid */
    html+=`</div>`; /* /bd-matches-gi */
    html+=`</div>`; /* /group card */
  });

  if(isAdmin&&isLeague){
    const allDone=groups.length>0&&groups.every(g=>g.matches.every(m=>m.done));
    if(allDone){
      html+=`<div id="bd-knockout-btn-wrap"><button onclick="bdStartKnockout()" style="width:100%;padding:12px;background:var(--primary);color:#000;border:none;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;margin-top:4px;">🏆 본선 대진표 생성 →</button></div>`;
    } else {
      html+=`<div id="bd-knockout-btn-wrap"><div style="text-align:center;font-size:.82rem;color:var(--text-muted);padding:8px;margin-top:4px;">모든 조별 경기 완료 후 본선 진출 가능</div></div>`;
    }
  }
  html+=`</div>`; /* /bd-league-view */

  html+=`<div id="bd-bracket-view" style="display:none;">`;
  if(rounds.length>0){
    html+=_renderBracketVisual(rounds);
    if(isAdmin&&status==='knockout') html+=_renderBracketInput(rounds);
  } else if(isLeague&&groups.length>0){
    // 조별리그 중 미리보기: 현재 순위 기반으로 예상 대진 표시
    html+=_renderBracketPreview(groups);
  } else {
    html+=`<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:.88rem;">조별 리그 완료 후 본선 대진표가 생성됩니다.</div>`;
  }
  /* ── 1위/2위/3위로 변경 ── */
  if(data.winner_name){
    html+=`<div style="text-align:center;padding:16px;background:rgba(0,200,150,.08);border-radius:12px;border:1px solid rgba(0,200,150,.25);margin-top:12px;">
      <div style="font-size:1.4rem;">🏆</div>
      <div style="font-weight:700;color:var(--primary);font-size:1rem;margin-top:4px;">🥇 1위: ${data.winner_name}</div>
      ${data.runner_up?`<div style="font-size:.88rem;color:var(--text-muted);margin-top:4px;">🥈 2위: ${data.runner_up}</div>`:''}
      ${data.third_place?`<div style="font-size:.88rem;color:var(--text-muted);margin-top:2px;">🥉 3위: ${data.third_place}</div>`:''}
    </div>`;
  }
  html+=`</div>`; /* /bd-bracket-view */

  let actionBtns=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
  if(isAdmin&&rounds.length>0&&status==='knockout'){
    const cur=rounds[rounds.length-1];
    if(cur.every(m=>m.done)){
      actionBtns+=cur.length===1
        ?`<button class="btn btn-primary" onclick="bdFinish()">🏆 순위 확정</button>`
        :`<button class="btn btn-primary" onclick="bdNextRound()">다음 라운드 ➡️</button>`;
    }
  }
  document.getElementById('bd-actions').innerHTML=actionBtns;
  document.getElementById('bd-body').innerHTML=html;
}

function bdToggleMatches(gi){
  const el=document.getElementById(`bd-matches-${gi}`);
  const btn=document.getElementById(`bd-toggle-${gi}`);
  if(!el) return;
  const isOpen=el.style.display!=='none';
  el.style.display=isOpen?'none':'block';
  if(btn){
    const g=_bdData?JSON.parse(_bdData.groups||'[]')[gi]:null;
    const doneCount=g?g.matches.filter(m=>m.done).length:0;
    const totalCount=g?g.matches.length:0;
    btn.textContent=isOpen
      ?`📋 경기 내역 보기 (완료 ${doneCount}/${totalCount})`
      :`📋 경기 내역 닫기 (완료 ${doneCount}/${totalCount})`;
  }
}

function bdSwitchTab(tab){
  document.getElementById('bd-league-view').style.display=tab==='league'?'block':'none';
  document.getElementById('bd-bracket-view').style.display=tab==='bracket'?'block':'none';
  const lBtn=document.getElementById('bd-tab-league');
  const bBtn=document.getElementById('bd-tab-bracket');
  if(lBtn){lBtn.style.background=tab==='league'?'var(--primary)':'transparent';lBtn.style.color=tab==='league'?'#000':'var(--text-muted)';}
  if(bBtn){bBtn.style.background=tab==='bracket'?'var(--primary)':'transparent';bBtn.style.color=tab==='bracket'?'#000':'var(--text-muted)';}
}

function _renderBracketVisual(rounds){
  const CW=152, CH=40, CARD=CH*2, COL_GAP=44, LABEL=22, MATCH_GAP=24;
  const totalR=rounds.length;
  const firstCount=rounds[0].length;
  const totalRoundsNeeded=Math.ceil(Math.log2(firstCount*2));
  const displayR=Math.max(totalR, totalRoundsNeeded);

  function matchTop(rIdx, mIdx){
    if(rIdx===0) return LABEL + mIdx*(CARD+MATCH_GAP);
    return LABEL + mIdx*matchSpan(rIdx) + matchSpan(rIdx)/2 - CARD/2;
  }
  function matchSpan(rIdx){
    if(rIdx===0) return CARD+MATCH_GAP;
    return matchSpan(rIdx-1)*2;
  }
  function matchCountForRound(rIdx){ return Math.max(1, firstCount / Math.pow(2,rIdx)); }

  const totalH=LABEL + firstCount*CARD + (firstCount-1)*MATCH_GAP + 8;
  const totalW=displayR*(CW+COL_GAP);

  let svgLines='', cardsHtml='';

  for(let rIdx=0; rIdx<displayR; rIdx++){
    const rName=rIdx===displayR-1?'결승':(rIdx===displayR-2&&displayR>1?'4강':(rIdx===displayR-3&&displayR>2?'8강':'16강'));
    const colX=rIdx*(CW+COL_GAP);
    const round=rounds[rIdx]||null;
    const mCount=matchCountForRound(rIdx);

    cardsHtml+=`<div style="position:absolute;left:${colX}px;top:0;width:${CW}px;text-align:center;font-size:.7rem;font-weight:700;color:var(--primary);line-height:${LABEL}px;">${rName}</div>`;

    for(let mIdx=0; mIdx<mCount; mIdx++){
      const m=round?round[mIdx]:null;
      const top=matchTop(rIdx, mIdx);
      const midY=top+CARD/2;
      const isBye=m&&(m.t1.p1_id==='BYE'||m.t2.p1_id==='BYE');
      const t1w=m&&m.done&&m.winner&&m.winner.p1_id===m.t1.p1_id;
      const t2w=m&&m.done&&m.winner&&m.winner.p1_id===m.t2.p1_id;

      if(m){
        cardsHtml+=`<div style="position:absolute;left:${colX}px;top:${top}px;width:${CW}px;">
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 1px 5px rgba(0,0,0,.09);">
            <div style="padding:0 9px;display:flex;justify-content:space-between;align-items:center;height:${CH}px;border-bottom:1px solid var(--border);font-size:.79rem;font-weight:${t1w?700:400};color:${t1w?'var(--primary)':m.t1.p1_id==='BYE'?'var(--text-dim)':'var(--text)'};background:${t1w?'rgba(0,200,150,.11)':'transparent'};">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:86px;">${_tl(m.t1)}</span>
              <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
                ${m.done&&!isBye?`<span style="font-size:.62rem;padding:1px 4px;border-radius:4px;font-weight:700;background:${t1w?'rgba(0,200,150,.2)':'rgba(255,80,80,.12)'};color:${t1w?'var(--primary)':'var(--danger)'};">${t1w?'승':'패'}</span>`:''}
                <span style="font-weight:700;color:var(--primary);min-width:14px;text-align:right;font-size:.82rem;">${m.done&&!isBye?m.s1:''}</span>
              </div>
            </div>
            <div style="padding:0 9px;display:flex;justify-content:space-between;align-items:center;height:${CH}px;font-size:.79rem;font-weight:${t2w?700:400};color:${t2w?'var(--primary)':m.t2.p1_id==='BYE'?'var(--text-dim)':'var(--text)'};background:${t2w?'rgba(0,200,150,.11)':'transparent'};">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:86px;">${_tl(m.t2)}</span>
              <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
                ${m.done&&!isBye?`<span style="font-size:.62rem;padding:1px 4px;border-radius:4px;font-weight:700;background:${t2w?'rgba(0,200,150,.2)':'rgba(255,80,80,.12)'};color:${t2w?'var(--primary)':'var(--danger)'};">${t2w?'승':'패'}</span>`:''}
                <span style="font-weight:700;color:var(--primary);min-width:14px;text-align:right;font-size:.82rem;">${m.done&&!isBye?m.s2:''}</span>
              </div>
            </div>
          </div>
        </div>`;
      } else {
        cardsHtml+=`<div style="position:absolute;left:${colX}px;top:${top}px;width:${CW}px;">
          <div style="border:1.5px dashed var(--border);border-radius:8px;height:${CARD}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:0;opacity:.45;">
            <div style="height:${CH}px;width:100%;display:flex;align-items:center;padding:0 10px;border-bottom:1px dashed var(--border);box-sizing:border-box;"><span style="font-size:.72rem;color:var(--text-muted);">진출자 대기</span></div>
            <div style="height:${CH}px;width:100%;display:flex;align-items:center;padding:0 10px;box-sizing:border-box;"><span style="font-size:.72rem;color:var(--text-muted);">진출자 대기</span></div>
          </div>
        </div>`;
      }

      if(rIdx < displayR-1){
        const nextMIdx=Math.floor(mIdx/2);
        const nextTop=matchTop(rIdx+1, nextMIdx);
        const nextMidY=nextTop+CARD/2;
        const x1=colX+CW, x2=colX+CW+COL_GAP;
        const xMid=x1+COL_GAP/2;
        const hasData=!!round;
        const strokeStyle=hasData?`stroke="#4caf8a" stroke-width="1.8"`:`stroke="#aaa" stroke-width="1.2" stroke-dasharray="4,3"`;
        svgLines+=`<polyline points="${x1},${midY} ${xMid},${midY} ${xMid},${nextMidY} ${x2},${nextMidY}" fill="none" ${strokeStyle} stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    }
  }

  const svg=`<svg style="position:absolute;top:0;left:0;width:${totalW}px;height:${totalH}px;pointer-events:none;overflow:visible;" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg>`;
  return `<div style="overflow-x:auto;overflow-y:visible;padding-bottom:12px;margin-bottom:14px;">
    <div style="position:relative;width:${totalW}px;height:${totalH}px;">${svg}${cardsHtml}</div>
  </div>`;
}

function _renderBracketInput(rounds){
  const cur=rounds[rounds.length-1], rIdx=rounds.length-1;
  const rName=cur.length===1?'결승':(cur.length===2?'4강':(cur.length===4?'8강':'16강'));
  let html=`<div><div style="font-size:.8rem;font-weight:700;color:var(--primary);margin-bottom:8px;padding:6px 0;border-bottom:1px solid var(--border);">✏️ ${rName} 점수 입력</div>`;
  cur.forEach((m,mIdx)=>{
    const isBye=m.t1.p1_id==='BYE'||m.t2.p1_id==='BYE';
    if(isBye){html+=`<div id="bs-cell-${rIdx}-${mIdx}" style="font-size:.82rem;color:var(--text-muted);padding:8px;text-align:center;background:var(--bg3);border-radius:8px;margin-bottom:8px;">🎉 부전승: ${_tl(m.winner||m.t1)}</div>`;return;}
    if(m.done){
      html+=`<div id="bs-cell-${rIdx}-${mIdx}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface2);border-radius:9px;margin-bottom:8px;border:1px solid var(--border);">
        <span style="flex:1;font-size:.84rem;">${_tl(m.t1)}</span>
        <span style="font-weight:700;color:var(--primary);">${m.s1} : ${m.s2}</span>
        <span style="flex:1;font-size:.84rem;text-align:right;">${_tl(m.t2)}</span>
        <button onclick="bdEditMatch(${rIdx},${mIdx})" style="font-size:.72rem;padding:3px 9px;background:var(--bg3);border:1px solid var(--border);color:var(--text-muted);border-radius:6px;cursor:pointer;">수정</button>
      </div>`;
    } else {
      html+=`<div id="bs-cell-${rIdx}-${mIdx}" style="background:var(--surface2);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid var(--border);">
        <div style="font-size:.82rem;font-weight:600;margin-bottom:8px;">${_tl(m.t1)} vs ${_tl(m.t2)}</div>
        <div style="display:grid;grid-template-columns:1fr 22px 1fr;gap:6px;align-items:center;margin-bottom:8px;">
          <input type="number" inputmode="numeric" min="0" max="30" placeholder="점수" id="bs-${rIdx}-${mIdx}-1"
            style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px;font-size:1rem;text-align:center;font-weight:600;">
          <div style="text-align:center;color:var(--text-muted);font-weight:600;">:</div>
          <input type="number" inputmode="numeric" min="0" max="30" placeholder="점수" id="bs-${rIdx}-${mIdx}-2"
            style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px;font-size:1rem;text-align:center;font-weight:600;">
        </div>
        <button ontouchend="event.preventDefault();bdConfirmMatch(${rIdx},${mIdx});" onclick="bdConfirmMatch(${rIdx},${mIdx});"
          style="width:100%;padding:10px;background:var(--primary);color:#000;border:none;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;">✅ 결과 등록</button>
      </div>`;
    }
  });
  return html+'</div>';
}

async function bdConfirmLeague(gi,mi){
  const s1v=document.getElementById(`bl-${gi}-${mi}-1`)?.value;
  const s2v=document.getElementById(`bl-${gi}-${mi}-2`)?.value;
  if(!s1v||!s2v){toast('점수 입력','error');return;}
  const n1=parseInt(s1v),n2=parseInt(s2v);
  if(isNaN(n1)||isNaN(n2)||n1===n2){toast(n1===n2?'동점 불가':'숫자 입력','error');return;}
  const groups=JSON.parse(_bdData.groups);
  const m=groups[gi].matches[mi];
  m.s1=n1;m.s2=n2;m.done=true;
  bdCalcStandings(groups);
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(groups)}).eq('id',_bdId);
  _bdData.groups=JSON.stringify(groups);

  // 전체 재렌더 대신 해당 경기 셀만 교체
  const aWin=n1>n2;
  const cellEl=document.getElementById(`bl-cell-${gi}-${mi}`);
  if(cellEl){
    cellEl.outerHTML=`<div id="bl-cell-${gi}-${mi}" style="display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:.78rem;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:${aWin?700:400};color:${aWin?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(m.t1)}</div>
        <div style="font-weight:${!aWin?700:400};color:${!aWin?'var(--text)':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_tl(m.t2)}</div>
      </div>
      <div style="text-align:center;flex-shrink:0;min-width:38px;">
        <div style="font-weight:700;color:${aWin?'var(--primary)':'var(--text-muted)'};">${n1}</div>
        <div style="font-weight:700;color:${!aWin?'var(--primary)':'var(--text-muted)'};">${n2}</div>
      </div>
      <button onclick="bdEditLeague(${gi},${mi})" style="font-size:.65rem;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text-muted);flex-shrink:0;">수정</button>
    </div>`;
  }

  // 순위표만 업데이트
  bdUpdateStandingsDOM(gi, groups[gi]);

  // 경기내역 버튼 카운터 업데이트
  const g=groups[gi];
  const doneCount=g.matches.filter(mx=>mx.done).length;
  const btn=document.getElementById(`bd-toggle-${gi}`);
  if(btn&&btn.textContent.includes('닫기'))
    btn.textContent=`📋 경기 내역 닫기 (완료 ${doneCount}/${g.matches.length})`;
  else if(btn)
    btn.textContent=`📋 경기 내역 보기 (완료 ${doneCount}/${g.matches.length})`;

  // 모든 조 완료 시 본선 버튼 표시
  const allGroupsDone=groups.every(grp=>grp.matches.every(mx=>mx.done));
  const knockoutBtnWrap=document.getElementById('bd-knockout-btn-wrap');
  if(knockoutBtnWrap){
    if(allGroupsDone){
      knockoutBtnWrap.innerHTML=`<button onclick="bdStartKnockout()" style="width:100%;padding:12px;background:var(--primary);color:#000;border:none;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;margin-top:4px;">🏆 본선 대진표 생성 →</button>`;
    }
  }

  toast('✅ 저장','success');
}

async function bdEditLeague(gi,mi){
  const groups=JSON.parse(_bdData.groups);
  groups[gi].matches[mi].done=false;groups[gi].matches[mi].s1='';groups[gi].matches[mi].s2='';
  bdCalcStandings(groups);
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(groups)}).eq('id',_bdId);
  _bdData.groups=JSON.stringify(groups);

  // 해당 셀만 input으로 교체
  const m=groups[gi].matches[mi];
  const cellEl=document.getElementById(`bl-cell-${gi}-${mi}`);
  if(cellEl){
    const isLeague=(_bdData.status==='league'||_bdData.status==='active');
    cellEl.outerHTML=`<div id="bl-cell-${gi}-${mi}" style="background:var(--surface2);border-radius:8px;padding:8px;border:1px solid var(--border);">
      <div style="font-size:.74rem;margin-bottom:4px;display:flex;justify-content:space-between;color:var(--text-muted);">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%;">${_tl(m.t1)}</span>
        <span>vs</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%;text-align:right;">${_tl(m.t2)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 14px 1fr auto;gap:4px;align-items:center;">
        <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-1"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
        <div style="text-align:center;color:var(--text-muted);font-size:.78rem;">:</div>
        <input type="number" inputmode="numeric" min="0" max="30" id="bl-${gi}-${mi}-2"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;font-size:.88rem;text-align:center;width:100%;box-sizing:border-box;">
        <button ontouchend="event.preventDefault();bdConfirmLeague(${gi},${mi});" onclick="bdConfirmLeague(${gi},${mi});"
          style="padding:5px 8px;background:var(--primary);color:#000;border:none;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;">✓</button>
      </div>
    </div>`;
  }
  bdUpdateStandingsDOM(gi, groups[gi]);
}

function bdUpdateStandingsDOM(gi, group){
  const standWrap=document.getElementById(`bd-standings-${gi}`);
  if(!standWrap||!group.standings||!group.standings.length) return;
  let rows='';
  group.standings.forEach((s,ri)=>{
    const isMe=_isMyTeam(s.team);
    const hl=isMe?'background:rgba(0,200,150,.07);font-weight:700;':'';
    const diff=s.diff>0?`+${s.diff}`:s.diff;
    rows+=`<tr style="${hl}">
      <td style="padding:6px 4px;font-weight:700;color:${ri===0?'var(--primary)':ri===1?'var(--accent)':'var(--text-muted)'};">${ri+1}</td>
      <td style="padding:6px;text-align:left;">${_tl(s.team)}${isMe?` <span style="font-size:.65rem;color:var(--primary);">◀나</span>`:''}${ri<2?` <span style="font-size:.65rem;color:var(--text-muted);">본선↑</span>`:''}</td>
      <td>${s.played}</td><td>${s.wins}</td><td>${diff}</td>
    </tr>`;
  });
  standWrap.querySelector('tbody').innerHTML=rows;
}

function _renderBracketPreview(groups){
  const isLight=document.body.classList.contains('light-mode');
  const C={
    teamBg:     isLight?'rgba(0,120,90,.10)' :'rgba(0,200,150,.18)',
    teamBdr:    isLight?'rgba(0,120,90,.40)' :'rgba(0,200,150,.45)',
    teamLabel:  isLight?'rgba(0,100,75,.85)' :'rgba(0,200,150,.9)',
    teamText:   isLight?'#0D3B2E'            :'#e0fff7',
    byeBg:      isLight?'rgba(150,150,150,.18)':'rgba(80,80,80,.35)',
    byeBdr:     isLight?'rgba(150,150,150,.4)' :'rgba(80,80,80,.5)',
    byeText:    isLight?'#888'               :'#666',
    slotBg:     isLight?'rgba(0,120,90,.05)' :'rgba(40,40,60,.5)',
    slotBdr:    isLight?'rgba(0,120,90,.22)' :'rgba(0,200,150,.25)',
    slotText:   isLight?'rgba(0,100,75,.5)'  :'rgba(0,200,150,.45)',
    champBg:    isLight?'rgba(180,130,0,.10)':'rgba(255,214,0,.12)',
    champBdr:   isLight?'rgba(180,130,0,.38)':'rgba(255,214,0,.45)',
    champText:  isLight?'#7A5700'            :'rgba(255,214,0,.85)',
    line1:      isLight?'rgba(0,120,90,.45)' :'rgba(0,200,150,.45)',
    line2:      isLight?'rgba(0,120,90,.25)' :'rgba(0,200,150,.25)',
    colLabel:   isLight?'rgba(0,100,75,.75)' :'rgba(0,200,150,.7)',
    colLabelDim:isLight?'rgba(0,100,75,.38)' :'rgba(0,200,150,.35)',
  };

  const G=groups.length;
  let pool=[];
  if(G===1){
    const st=groups[0].standings||[];
    pool=st.map((s,i)=>({team:s.team,label:`${groups[0].name} ${i+1}\uC704`}));
    if(!pool.length) pool=groups[0].teams.map((t,i)=>({team:t,label:`${groups[0].name} ${i+1}\uC704`}));
  } else {
    const left=[],right=[];
    for(let i=0;i<G;i++){
      const st=groups[i].standings||[];
      const g1=st[0]?.team||groups[i].teams[0];
      const g2=st[1]?.team||groups[i].teams[1];
      if(i%2===0){
        if(g1)left.push({team:g1,label:`${groups[i].name} 1\uC704`});
        if(g2)right.push({team:g2,label:`${groups[i].name} 2\uC704`});
      } else {
        if(g1)right.push({team:g1,label:`${groups[i].name} 1\uC704`});
        if(g2)left.push({team:g2,label:`${groups[i].name} 2\uC704`});
      }
    }
    pool=[...left,...right];
  }

  const target=Math.pow(2,Math.ceil(Math.log2(Math.max(pool.length,2))));
  while(pool.length<target) pool.push({team:{p1_id:'BYE',p1_name:'\uBD80\uC804\uC2B9'},label:'?'});

  const totalRounds=Math.log2(target);
  const colLabels=[];
  for(let r=0;r<totalRounds;r++){
    const n=target/Math.pow(2,r);
    colLabels.push(n===2?'\uACB0\uC2B9':n===4?'4\uAC15':n===8?'8\uAC15':'16\uAC15');
  }
  colLabels.push('\uD83C\uDFC6 \uC6B0\uC2B9');

  const totalCols=totalRounds+1;
  const pairs=[];
  for(let i=0;i<pool.length;i+=2) pairs.push([pool[i],pool[i+1]]);

  const CARD_H=52, GAP=8, PAIR_GAP=20;
  const COL_W=150, COL_GAP=44;
  const TOP_LABEL=24;
  const pairH=CARD_H*2+GAP;
  const totalH=TOP_LABEL+pairs.length*(pairH+PAIR_GAP)+PAIR_GAP;
  const svgW=totalCols*(COL_W+COL_GAP);
  const svgH=Math.max(totalH,pairH*2+TOP_LABEL);

  let cards='';
  let lines='';

  // 컬럼 라벨
  for(let col=0;col<totalCols;col++){
    const cx=col*(COL_W+COL_GAP)+COL_W/2;
    const isChamp=col===totalCols-1;
    const isFirst=col===0;
    const fill=isChamp?C.champText:(isFirst?C.colLabel:C.colLabelDim);
    cards+=`<text x="${cx}" y="${TOP_LABEL-6}" font-size="10" fill="${fill}" font-weight="${isChamp?800:700}" font-family="inherit" text-anchor="middle">${colLabels[col]}</text>`;
  }

  const pairCenterYs=[];

  // 첫 라운드 카드
  pairs.forEach((pair,pi)=>{
    const y0=TOP_LABEL+PAIR_GAP+pi*(pairH+PAIR_GAP);
    const y1=y0+CARD_H+GAP;
    const midY=(y0+CARD_H/2+y1+CARD_H/2)/2;
    pairCenterYs.push(midY);

    [pair[0],pair[1]].forEach((p,ti)=>{
      const cy=ti===0?y0:y1;
      const isBye=p.team?.p1_id==='BYE';
      const name=isBye?'\uBD80\uC804\uC2B9':_tl(p.team);
      const nm=name.length>15?name.slice(0,14)+'\u2026':name;
      cards+=`<g>
        <rect x="0" y="${cy}" width="${COL_W}" height="${CARD_H}" rx="7" fill="${isBye?C.byeBg:C.teamBg}" stroke="${isBye?C.byeBdr:C.teamBdr}" stroke-width="1.2"/>
        <text x="10" y="${cy+16}" font-size="9" fill="${C.teamLabel}" font-weight="700" font-family="inherit">${p.label}</text>
        <text x="10" y="${cy+35}" font-size="12" fill="${isBye?C.byeText:C.teamText}" font-weight="700" font-family="inherit">${nm}</text>
      </g>`;
    });

    const jx=COL_W+COL_GAP/2;
    lines+=`<polyline points="${COL_W},${y0+CARD_H/2} ${jx},${y0+CARD_H/2} ${jx},${y1+CARD_H/2} ${COL_W},${y1+CARD_H/2}" fill="none" stroke="${C.line1}" stroke-width="1.5"/>`;
    lines+=`<line x1="${jx}" y1="${midY}" x2="${COL_W+COL_GAP}" y2="${midY}" stroke="${C.line1}" stroke-width="1.5"/>`;

    const nx=COL_W+COL_GAP;
    const ny=midY-CARD_H/2;
    cards+=`<g>
      <rect x="${nx}" y="${ny}" width="${COL_W}" height="${CARD_H}" rx="7" fill="${C.slotBg}" stroke="${C.slotBdr}" stroke-width="1" stroke-dasharray="4,3"/>
      <text x="${nx+COL_W/2}" y="${ny+CARD_H/2+5}" font-size="11" fill="${C.slotText}" font-weight="600" font-family="inherit" text-anchor="middle">\uC9C4\uCD9C\uD300</text>
    </g>`;
  });

  // 결승→우승 연결
  const champX=totalRounds*(COL_W+COL_GAP);
  const champY=svgH/2-CARD_H/2;

  if(totalRounds>=3){
    for(let pi=0;pi<pairCenterYs.length;pi+=2){
      if(pi+1>=pairCenterYs.length) break;
      const cy1=pairCenterYs[pi];
      const cy2=pairCenterYs[pi+1];
      const nx=COL_W+COL_GAP;
      const jx2=nx+COL_W+COL_GAP/2;
      const midY2=(cy1+cy2)/2;
      lines+=`<polyline points="${nx+COL_W},${cy1} ${jx2},${cy1} ${jx2},${cy2} ${nx+COL_W},${cy2}" fill="none" stroke="${C.line2}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
      lines+=`<line x1="${jx2}" y1="${midY2}" x2="${nx+COL_W+COL_GAP}" y2="${midY2}" stroke="${C.line2}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
      const nx2=nx+COL_W+COL_GAP;
      const ny2=midY2-CARD_H/2;
      cards+=`<g>
        <rect x="${nx2}" y="${ny2}" width="${COL_W}" height="${CARD_H}" rx="7" fill="${C.slotBg}" stroke="${C.slotBdr}" stroke-width="1" stroke-dasharray="4,3"/>
        <text x="${nx2+COL_W/2}" y="${ny2+CARD_H/2+5}" font-size="11" fill="${C.slotText}" font-weight="600" font-family="inherit" text-anchor="middle">\uC9C4\uCD9C\uD300</text>
      </g>`;
      // 결승→우승 연결
      lines+=`<line x1="${nx2+COL_W}" y1="${midY2}" x2="${champX}" y2="${svgH/2}" stroke="${C.champBdr}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
    }
  } else {
    const lastMidY=pairCenterYs[0]??svgH/2;
    lines+=`<line x1="${COL_W+COL_GAP+COL_W}" y1="${lastMidY}" x2="${champX}" y2="${svgH/2}" stroke="${C.champBdr}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
  }

  // 우승 카드
  cards+=`<g>
    <rect x="${champX}" y="${champY}" width="${COL_W}" height="${CARD_H}" rx="9" fill="${C.champBg}" stroke="${C.champBdr}" stroke-width="1.8"/>
    <text x="${champX+COL_W/2}" y="${champY+19}" font-size="14" fill="${C.champText}" font-weight="800" font-family="inherit" text-anchor="middle">\uD83C\uDFC6</text>
    <text x="${champX+COL_W/2}" y="${champY+37}" font-size="10" fill="${C.champText}" font-weight="700" font-family="inherit" text-anchor="middle">\uCD5C\uC885 \uC6B0\uC2B9</text>
  </g>`;

  return `<div style="padding:8px 0;">
    <div style="font-size:.75rem;color:var(--accent);font-weight:700;text-align:center;margin-bottom:12px;padding:5px 10px;background:rgba(var(--accent-rgb,255,214,0),.08);border-radius:8px;border:1px solid rgba(var(--accent-rgb,255,214,0),.2);">
      \uD83D\uDCCA \uD604\uC7AC \uC21C\uC704 \uAE30\uC900 \uC608\uC0C1 \uB300\uC9C4 (\uB9AC\uADF8 \uC9C4\uD589 \uC911)
    </div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
      <svg width="${svgW}" height="${svgH}" style="display:block;min-width:${svgW}px;font-family:inherit;">
        ${cards}
        ${lines}
      </svg>
    </div>
  </div>`;
}
function bdCalcStandings(groups){
  groups.forEach(g=>{
    const st={};
    g.teams.forEach(t=>{st[t.p1_id]={team:t,wins:0,losses:0,diff:0,pf:0,pa:0,played:0};});
    g.matches.forEach(m=>{
      if(!m.done) return;
      const s1=parseInt(m.s1),s2=parseInt(m.s2),k1=m.t1.p1_id,k2=m.t2.p1_id;
      st[k1].played++;st[k2].played++;
      st[k1].pf+=s1;st[k1].pa+=s2;st[k2].pf+=s2;st[k2].pa+=s1;
      st[k1].diff=st[k1].pf-st[k1].pa;st[k2].diff=st[k2].pf-st[k2].pa;
      if(s1>s2){st[k1].wins++;st[k2].losses++;}else{st[k2].wins++;st[k1].losses++;}
    });
    g.standings=Object.values(st).sort((a,b)=>b.wins!==a.wins?b.wins-a.wins:b.diff-a.diff);
  });
}

async function bdStartKnockout(){
  const groups=JSON.parse(_bdData.groups);
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
  while(arr.length<target) arr.push({p1_id:'BYE',p1_name:'부전승',p2_id:null,p2_name:null});
  const matches=[];
  for(let i=0;i<arr.length;i+=2){
    const t1=arr[i],t2=arr[i+1];
    const isBye=t1.p1_id==='BYE'||t2.p1_id==='BYE';
    const winner=isBye?(t1.p1_id==='BYE'?t2:t1):null;
    matches.push({t1,t2,s1:isBye?(t2.p1_id==='BYE'?25:0):'',s2:isBye?(t1.p1_id==='BYE'?25:0):'',done:isBye,winner,loser:null,id:`m_${i/2}`});
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

  // 해당 셀만 교체
  const cellEl=document.getElementById(`bs-cell-${rIdx}-${mIdx}`);
  if(cellEl){
    cellEl.outerHTML=`<div id="bs-cell-${rIdx}-${mIdx}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface2);border-radius:9px;margin-bottom:8px;border:1px solid var(--border);">
      <span style="flex:1;font-size:.84rem;">${_tl(m.t1)}</span>
      <span style="font-weight:700;color:var(--primary);">${n1} : ${n2}</span>
      <span style="flex:1;font-size:.84rem;text-align:right;">${_tl(m.t2)}</span>
      <button onclick="bdEditMatch(${rIdx},${mIdx})" style="font-size:.72rem;padding:3px 9px;background:var(--bg3);border:1px solid var(--border);color:var(--text-muted);border-radius:6px;cursor:pointer;">수정</button>
    </div>`;
  }

  // 모든 경기 완료 시 액션 버튼 업데이트
  const cur=rounds[rIdx];
  const allDone=cur.every(mx=>mx.done);
  if(allDone){
    const actionsEl=document.getElementById('bd-actions');
    if(actionsEl){
      let actionBtns=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
      actionBtns+=cur.length===1
        ?`<button class="btn btn-primary" onclick="bdFinish()">🏆 순위 확정</button>`
        :`<button class="btn btn-primary" onclick="bdNextRound()">다음 라운드 ➡️</button>`;
      actionsEl.innerHTML=actionBtns;
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
        style="width:100%;padding:10px;background:var(--primary);color:#000;border:none;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;">✅ 결과 등록</button>
    </div>`;
  }
  // 액션 버튼 원복
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
  renderBracketPage();setTimeout(()=>bdSwitchTab('bracket'),150);
}

async function bdFinish(){
  const rounds=JSON.parse(_bdData.rounds);
  const final=rounds[rounds.length-1][0];
  const champion=final.winner,runnerUp=final.loser;
  if(!champion){toast('1위 미결정','error');return;}
  let third=null;
  if(rounds.length>=2){
    const semi=rounds[rounds.length-2];
    const cs=semi.find(m=>m.winner&&m.winner.p1_id===champion.p1_id);
    if(cs) third=cs.loser;
  }
  const cL=_tl(champion),ruL=runnerUp?_tl(runnerUp):null,tpL=third?_tl(third):null;
  await sb.from('bracket_tournaments').update({status:'done',winner_name:cL,runner_up:ruL,third_place:tpL}).eq('id',_bdId);
  Object.assign(_bdData,{status:'done',winner_name:cL,runner_up:ruL,third_place:tpL,rounds:JSON.stringify(rounds)});
  _renderBracketDetail(_bdData);renderBracketPage();
  toast(`🏆 1위: ${cL}!`,'success');
}

/* ── TOURNAMENT MAIN TAB SWITCH ── */
let _tournamentMainTab='external';
function switchTournamentMainTab(tab){
  _tournamentMainTab=tab;
  document.getElementById('tmain-tab-external')?.classList.toggle('active',tab==='external');
  document.getElementById('tmain-tab-bracket')?.classList.toggle('active',tab==='bracket');
  document.getElementById('tmain-external').style.display=tab==='external'?'block':'none';
  document.getElementById('tmain-bracket').style.display=tab==='bracket'?'block':'none';
  // 버튼 표시: 각 탭에 맞는 버튼만
  const addTBtn=document.getElementById('btn-add-tournament');
  const addBBtn=document.getElementById('btn-add-bracket');
  if(addTBtn) addTBtn.style.display=(tab==='external'&&ME?.role==='admin')?'':'none';
  if(addBBtn) addBBtn.style.display=(tab==='bracket'&&ME?.role==='admin')?'':'none';
  if(tab==='bracket') renderBracketPage();
}

/* ── TOURNAMENT ── */
async function renderTournamentPage(){
  // 서브탭 초기화 (대회 탭이 기본)
  _tournamentMainTab='external';
  document.getElementById('tmain-tab-external')?.classList.add('active');
  document.getElementById('tmain-tab-bracket')?.classList.remove('active');
  document.getElementById('tmain-external') && (document.getElementById('tmain-external').style.display='block');
  document.getElementById('tmain-bracket') && (document.getElementById('tmain-bracket').style.display='none');
  const addBtn=document.getElementById('btn-add-tournament');
  if(addBtn) addBtn.style.display=ME?.role==='admin'?'':'none';
  const addBBtn=document.getElementById('btn-add-bracket');
  if(addBBtn) addBBtn.style.display='none';
  const el=document.getElementById('tournament-list');
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);
  const{data:list,error}=await sb.from('tournaments').select('*').order('t_date',{ascending:true});
  if(error){el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><div>불러오기 실패</div></div>`;return;}
  if(!list||!list.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🏆</div><div>등록된 대회가 없어요</div></div>`;return;}
  const{data:likes}=await sb.from('tournament_likes').select('tournament_id,user_id,user_name');
  const likerIds=[...new Set((likes||[]).map(l=>l.user_id))];
  let genderMap={};
  if(likerIds.length){
    const{data:gProfiles}=await sb.from('profiles').select('id,gender').in('id',likerIds);
    (gProfiles||[]).forEach(p=>{genderMap[p.id]=p.gender;});
  }
  const likeMap={};
  (likes||[]).forEach(l=>{
    if(!likeMap[l.tournament_id])likeMap[l.tournament_id]=[];
    likeMap[l.tournament_id].push({id:l.user_id,name:l.user_name,gender:genderMap[l.user_id]||''});
  });
  const today=new Date().toISOString().slice(0,10);
  el.innerHTML=list.map(t=>{
    const myLike=(likeMap[t.id]||[]).some(l=>l.id===ME.id);
    const likeCount=(likeMap[t.id]||[]).length;
    const endDate=t.t_date_end||t.t_date;
    const isPast=endDate<today;
    const dateLabel=fmtTourneyDate(t.t_date,t.t_date_end);
    const isAdmin=ME?.role==='admin';
    return `<div class="card" style="margin-bottom:12px;${isPast?'opacity:.55':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div style="font-weight:700;font-size:1rem;flex:1;">${t.name}${isPast?'<span style="font-size:.72rem;color:var(--text-dim);margin-left:6px;">종료</span>':''}</div>
        ${isAdmin?`<div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="openEditTournament('${t.id}')" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:.72rem;cursor:pointer;color:var(--text);">✏️</button>
          <button onclick="deleteTournament('${t.id}')" style="background:none;border:none;cursor:pointer;font-size:.82rem;color:var(--danger);padding:2px;">🗑</button>
        </div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.82rem;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
            <span>📅 ${dateLabel}</span>${t.place?`<span>📍 ${t.place}</span>`:''}
          </div>
          ${t.url?`<a href="${t.url}" target="_blank" rel="noopener" style="display:inline-block;font-size:.8rem;color:var(--primary);margin-bottom:4px;">🔗 링크</a>`:''}
          ${t.note?`<div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;border-top:1px solid var(--border);padding-top:6px;">${t.note}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;">
          <button onclick="toggleLike('${t.id}',${myLike})" style="background:none;border:none;cursor:pointer;font-size:1.5rem;line-height:1;padding:2px;">${myLike?'❤️':'🤍'}</button>
          <span style="font-size:.72rem;color:var(--text-muted);font-weight:600;">${likeCount}명</span>
          <button onclick="toggleLikesPanel('${t.id}')" id="likes-btn-${t.id}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:.68rem;color:var(--text);padding:2px 6px;white-space:nowrap;margin-top:2px;">관심러 ▼</button>
        </div>
      </div>
      <div id="likes-panel-${t.id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        ${(()=>{
          const lk=likeMap[t.id]||[];
          if(!lk.length) return '<div style="font-size:.82rem;color:var(--text-muted);text-align:center;padding:6px 0;">아직 관심 표시한 멤버가 없어요</div>';
          const men=lk.filter(l=>l.gender==='male');
          const women=lk.filter(l=>l.gender==='female');
          let h=`<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px;">❤️ 총 ${lk.length}명</div>`;
          if(men.length){h+=`<div style="font-size:.75rem;font-weight:700;color:var(--primary);margin-bottom:4px;">👨 남성 (${men.length}명)</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${men.map(l=>`<span style="background:rgba(0,150,255,.1);border:1px solid rgba(0,150,255,.2);border-radius:20px;padding:3px 10px;font-size:.82rem;">🏸 ${l.name}</span>`).join('')}</div>`;}
          if(women.length){h+=`<div style="font-size:.75rem;font-weight:700;color:#e91e8c;margin-bottom:4px;">👩 여성 (${women.length}명)</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${women.map(l=>`<span style="background:rgba(233,30,140,.1);border:1px solid rgba(233,30,140,.2);border-radius:20px;padding:3px 10px;font-size:.82rem;">🏸 ${l.name}</span>`).join('')}</div>`;}
          return h;
        })()}
      </div>
    </div>`;
  }).join('');
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
let _sbA=0, _sbB=0, _sbType='men', _sbFinishOpen=false, _wakeLock=null;

async function _requestWakeLock(){
  try{if('wakeLock' in navigator){_wakeLock=await navigator.wakeLock.request('screen');_wakeLock.addEventListener('release',()=>{_wakeLock=null;});}}catch(e){console.warn('WakeLock 실패:',e);}
}
function _releaseWakeLock(){if(_wakeLock){_wakeLock.release().catch(()=>{});_wakeLock=null;}}

function openScoreboard(){
  _sbA=0; _sbB=0; _sbType='men'; _sbFinishOpen=false;
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
  const t=_sbType;
  const menPool=(_usersCache||[]).filter(u=>u.gender==='male');
  const womenPool=(_usersCache||[]).filter(u=>u.gender==='female');
  let poolA1,poolA2,poolB1,poolB2;
  if(t==='men'){poolA1=poolA2=poolB1=poolB2=menPool;}
  else if(t==='women'){poolA1=poolA2=poolB1=poolB2=womenPool;}
  else{poolA1=poolB1=menPool;poolA2=poolB2=womenPool;}
  const prev={a1:document.getElementById('sb-a1')?.value,a2:document.getElementById('sb-a2')?.value,b1:document.getElementById('sb-b1')?.value,b2:document.getElementById('sb-b2')?.value};
  const mkSel=(id,pool,label,req)=>{
    const selected=_sbGetSelectedIds(id);const cur=prev[id.replace('sb-','')]||'';
    let opts=req?`<option value="">선택하시오 *</option>`:`<option value="">없음</option>`;
    pool.forEach(u=>{if(selected.includes(u.id)) return;opts+=`<option value="${u.id}"${u.id===cur?' selected':''}>${u.name}</option>`;});
    return `<div><div style="font-size:.7rem;color:#888;margin-bottom:3px;">${label}${req?' <span style="color:#ff5252;">*</span>':''}</div><select id="${id}" onchange="_sbBuildPlayerSelects()" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:6px;padding:6px 8px;font-size:.82rem;">${opts}</select></div>`;
  };
  document.getElementById('sb-player-selects').innerHTML=`
    <div style="grid-column:span 2;font-size:.78rem;font-weight:700;padding-bottom:4px;border-bottom:1px solid #c0392b;color:#c0392b;">🔴 A팀</div>
    ${mkSel('sb-a1',poolA1,t==='mixed'?'남자':'선수1',true)}
    ${mkSel('sb-a2',poolA2,t==='mixed'?'여자':'선수2',false)}
    <div style="grid-column:span 2;font-size:.78rem;font-weight:700;padding-bottom:4px;border-bottom:1px solid #27ae60;color:#27ae60;margin-top:6px;">🟢 B팀</div>
    ${mkSel('sb-b1',poolB1,t==='mixed'?'남자':'선수1',true)}
    ${mkSel('sb-b2',poolB2,t==='mixed'?'여자':'선수2',false)}`;
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
