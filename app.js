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
  // 로고 이미지 주입 (logo.js의 base64 사용)
  const _applyLogo = () => {
    if(!window.AM_LOGO_B64) return;
    ['login-logo','loading-logo'].forEach(id=>{
      const el=document.getElementById(id);
      if(el && !el.src) el.src=window.AM_LOGO_B64;
    });
  };
  _applyLogo();
  // 다크모드 토글 시 필터 재적용
  window._logoApplyFn = _applyLogo;
  let handled=false;
  // 안전 타이머: 5초 안에 ready 클래스가 안 붙으면 강제로 화면 표시
  const _safetyTimer=setTimeout(()=>{
    if(!handled){
      console.warn('[AMBM] safety timer triggered - forcing ready');
      handled=true;
      initTheme();initFontScale();document.body.classList.add('ready');
      fadeOutLoading();
      ME?showApp():showLogin();
    }
  },5000);
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='INITIAL_SESSION'){
      try{
        if(session?.user) await loadProfile(session.user);
      } catch(e){
        console.error('[AMBM] loadProfile error on INITIAL_SESSION',e);
        ME=null;
      }
      clearTimeout(_safetyTimer);
      handled=true;
      initTheme();initFontScale();document.body.classList.add('ready');
      await fadeOutLoading();
      if(!ME) showLogin();
      else if(ME.status==='approved') showApp();
      else if(ME.status==='pending') showPendingScreen(ME.name);
      else{await sb.auth.signOut();showLogin();}
    } else if(event==='SIGNED_IN'){
      if(session?.user?.app_metadata?.provider==='email') return;
      try{
        if(session?.user) await loadProfile(session.user);
      } catch(e){
        console.error('[AMBM] loadProfile error on SIGNED_IN',e);
        ME=null;
      }
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
async function kakaoSignup(){
  if(!document.getElementById('privacy-agree')?.checked){toast('개인정보 수집·이용 동의가 필요합니다','error');return;}
  const{error}=await sb.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:APP_URL,scopes:'profile_nickname,account_email',queryParams:{prompt:'select_account'}}});
  if(error) toast('오류: '+error.message,'error');
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

/* ── 글자 크기 ── */
const _FONT_STEPS=[
  {size:14,label:'작게',  sub:'기본보다 작음'},
  {size:15,label:'보통',  sub:'기본 크기'},
  {size:17,label:'크게',  sub:'기본보다 큼'},
  {size:19,label:'매우 크게',sub:'최대 크기'},
];
let _fontStepIdx=1;
function applyFontScale(idx,save=true){
  idx=Math.max(0,Math.min(_FONT_STEPS.length-1,idx));
  _fontStepIdx=idx;
  const step=_FONT_STEPS[idx];
  document.documentElement.style.fontSize=step.size+'px';
  if(save) localStorage.setItem('font_scale_idx',idx);
  const label=document.getElementById('font-scale-label');
  const sub=document.getElementById('font-scale-sub');
  if(label) label.textContent=step.label;
  if(sub)   sub.textContent=step.sub;
  // 슬라이더 바 진행도 업데이트
  const bar=document.getElementById('font-scale-bar');
  if(bar) bar.style.width=(idx/(_FONT_STEPS.length-1)*100)+'%';
}
function adjustFontScale(delta){ applyFontScale(_fontStepIdx+delta); }
function initFontScale(){
  const saved=localStorage.getItem('font_scale_idx');
  applyFontScale(saved!==null?parseInt(saved):1,false);
}

/* ── DARK MODE ── */
function toggleDarkMode(){
  document.body.style.transition='background .3s,color .3s';
  const isLight=document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight?'light':'dark');
  _updateDmUI(isLight);
  setTimeout(()=>document.body.style.transition='',350);
  // 로고 필터 재적용
  if(window._logoApplyFn) setTimeout(window._logoApplyFn,10);
}
function _updateDmUI(isLight){
  const icon=document.getElementById('dm-icon'); const btn=document.getElementById('btn-darkmode');
  if(icon) icon.textContent=isLight?'☀️':'🌙';
  if(btn){btn.style.background=isLight?'rgba(255,255,255,.6)':'rgba(0,0,0,.25)';btn.style.color=isLight?'#1a202c':'#fff';btn.style.borderColor=isLight?'rgba(0,0,0,.15)':'rgba(255,255,255,.15)';}
  const icon2=document.getElementById('dm-icon-app');
  if(icon2) icon2.textContent=isLight?'☀️':'🌙';
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

const NAV_ICONS={
  dashboard:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
  feed:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
  tournament:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zm-2 3c0 1.65-1.35 3-3 3s-3-1.35-3-3V5h6v3zM5 8V7h2v3.87C5.86 10.43 5 9.29 5 8zm14 0c0 1.29-.86 2.43-2 2.87V7h2v1z"/></svg>`,
  community:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`,
  balance:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>`,
  admin:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
  settings:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96a7.02 7.02 0 00-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.37 1.04.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
};

const USER_NAVS=[
  {id:'dashboard',label:'홈'},
  {id:'feed',label:'기록'},
  {id:'community',label:'소식'},
  {id:'settings',label:'설정'},
];
const ADMIN_NAVS=[
  {id:'dashboard',label:'홈'},
  {id:'feed',label:'기록'},
  {id:'community',label:'소식'},
  {id:'admin',label:'관리'},
  {id:'settings',label:'설정'},
];
function buildNav(){
  const navs=ME.role==='admin'?ADMIN_NAVS:USER_NAVS;
  document.getElementById('bottom-nav').innerHTML=navs.map(n=>`<button class="bottom-nav-item" id="nav-${n.id}" onclick="navigateTo('${n.id}')"><span class="nav-icon">${NAV_ICONS[n.id]||''}</span><span>${n.label}</span></button>`).join('');
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
    case 'balance':renderBalancePage();break;
    case 'settings':renderSettingsPage();break;
  }
}

/* ── GRADE ── */
// ── profiles 캐시 헬퍼 ──
async function _getApprovedUsers(forceRefresh=false){
  if(!forceRefresh && window._profilesCache && window._profilesCache.length>0)
    return window._profilesCache;
  const{data}=await sb.from('profiles').select('id,name,exclude_stats').eq('status','approved').order('name');
  window._profilesCache=data||[];
  return window._profilesCache;
}

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
// RP 표시용: /10 반올림
const rpDisp=v=>Math.round((v||0)/10);

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
  // 경기 캐시: 30초 이내면 재조회 생략
  const _now=Date.now();
  if(!window._matchCacheTime||_now-window._matchCacheTime>30000||!_allMatchesCache.length){
    const{data:allMatches}=await sb.from('matches').select('*').eq('status','approved').order('match_date',{ascending:false}).order('created_at',{ascending:false});
    _allMatchesCache=allMatches||[];window._allMatchesCache=_allMatchesCache;
    window._matchCacheTime=_now;
    window._profilesCache=null; // 경기 새로 불러오면 프로필도 갱신
  }
  const myMatches=_allMatchesCache.filter(m=>[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(ME.id));
  const stats=computeStats(myMatches,ME.id);

  // 전체 유저 통계로 순위 계산 (exclude_stats 제외, 5경기 이상만 랭킹 산정)
  // profiles 전체 캐시 저장 (renderRankTable 재사용)
  if(!window._profilesCache||window._profilesCache.length===0){
    const{data:pCache}=await sb.from('profiles').select('*').eq('status','approved');
    window._profilesCache=pCache||[];
    window._guestModeNamesCache=await _loadGuestModeNames();
  }
  const allUsers=window._profilesCache;
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

  // 베스트 파트너 계산 (회원 + 비회원 모두 포함)
  const _partnerMap={};
  myMatches.forEach(m=>{
    const onA=[m.a1_id,m.a2_id].includes(ME.id);
    const won=(m.score_a>m.score_b)===onA;
    let pkey=null,pname=null;
    if(onA){
      if(m.a1_id===ME.id){
        pkey=m.a2_id||('name:'+m.a2_name); pname=m.a2_name;
      } else {
        pkey=m.a1_id||('name:'+m.a1_name); pname=m.a1_name;
      }
    } else {
      if(m.b1_id===ME.id){
        pkey=m.b2_id||('name:'+m.b2_name); pname=m.b2_name;
      } else {
        pkey=m.b1_id||('name:'+m.b1_name); pname=m.b1_name;
      }
    }
    if(!pkey||!pname) return;
    if(!_partnerMap[pkey]) _partnerMap[pkey]={name:pname,games:0,wins:0};
    _partnerMap[pkey].games++;if(won)_partnerMap[pkey].wins++;
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
  // profilesCache 보장 후 MVP 렌더
  if(!window._profilesCache||!window._profilesCache.length){
    const{data:pCache}=await sb.from('profiles').select('*').eq('status','approved');
    window._profilesCache=pCache||[];
  }
  renderMvpPodium(_allMatchesCache, window._profilesCache||[]);
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

/* ════════════════════════════════════════════════
   MVP 시상대 렌더 (파란 계열 - 새벽민턴)
   ════════════════════════════════════════════════ */
function renderMvpPodium(allMatches, users) {
  var wrap = document.getElementById('mvp-podium-wrap');
  if (!wrap) return;

  // 5경기 이상 + exclude_stats 제외 유저 통계 (회원 + 비회원 모두 포함)
  var excludeIds = new Set((users||[]).filter(u=>u.exclude_stats).map(u=>u.id));
  var userMap = {};
  (users||[]).forEach(u=>{ if(u.id&&u.name) userMap[u.id]=u; });
  var guestModeNames = window._guestModeNamesCache||new Set();

  var uStats = {};
  (allMatches||[]).filter(m=>m.status==='approved').forEach(m=>{
    var aWin=m.score_a>m.score_b;
    // 회원 (id 기반)
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id && !excludeIds.has(p.id))
    .forEach(p=>{
      if(!uStats[p.id]){
        var u=userMap[p.id];
        var nm=u?u.name:p.id;
        uStats[p.id]={id:p.id,name:nm,games:0,wins:0,diff:0,scored:0,conceded:0};
      }
      uStats[p.id].games++;
      if(p.win)uStats[p.id].wins++;
      uStats[p.id].scored+=p.s; uStats[p.id].conceded+=p.c;
    });
    // 비회원 (id null, name 기반)
    [{id:m.a1_id,name:m.a1_name,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.a2_id,name:m.a2_name,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,name:m.b1_name,win:!aWin,s:m.score_b,c:m.score_a},
     {id:m.b2_id,name:m.b2_name,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>!p.id && p.name && !guestModeNames.has(p.name))
    .forEach(p=>{
      var key='name:'+p.name;
      if(!uStats[key]) uStats[key]={id:key,name:p.name,games:0,wins:0,diff:0,scored:0,conceded:0};
      uStats[key].games++;
      if(p.win)uStats[key].wins++;
      uStats[key].scored+=p.s; uStats[key].conceded+=p.c;
    });
  });
  Object.values(uStats).forEach(u=>{
    u.diff=u.scored-u.conceded;
    u.ci=calcCI(u.wins,u.games,u.diff);
  });

  var qualified=Object.values(uStats).filter(u=>u.games>=5);
  var wr=u=>u.games>0?u.wins/u.games:0;
  qualified.sort((a,b)=>b.ci-a.ci||wr(b)-wr(a)||b.wins-a.wins||b.diff-a.diff);
  var top3=qualified.slice(0,3);

  if(!top3.length){
    wrap.innerHTML='<div style="text-align:center;padding:28px 0;color:var(--text-muted);font-size:.84rem;"><div style="font-size:2rem;margin-bottom:8px;">🏸</div>5경기 이상 완료된 선수가 없습니다</div>';
    return;
  }

  var order=[top3[1],top3[0],top3[2]];
  var podH=[68,94,54];
  var avSize=[64,80,58];
  var isLight=document.body.classList.contains('light-mode');
  var META=[
    {rank:'2',color:isLight?'#5B7A9A':'#A8B8C8',glow:'rgba(168,184,200,.2)', textSize:'.75rem',numSize:'1.2rem'},
    {rank:'1',color:isLight?'#1565C0':'#42A5F5',glow:'rgba(66,165,245,.3)', textSize:'.82rem',numSize:'1.5rem'},
    {rank:'3',color:isLight?'#8B4E1A':'#C87941',glow:'rgba(200,121,65,.18)',textSize:'.7rem', numSize:'1.1rem'}
  ];

  function mkCrown(color){
    return '<svg width="22" height="16" viewBox="0 0 22 16" fill="none" style="display:block;">'
      +'<path d="M1 14 L4 4 L8 9 L11 2 L14 9 L18 4 L21 14 Z" fill="'+color+'" opacity=".9"/>'
      +'<rect x="1" y="13" width="20" height="2.5" rx="1.2" fill="'+color+'"/>'
      +'<circle cx="11" cy="2" r="1.6" fill="'+color+'"/>'
      +'<circle cx="4.5" cy="4.5" r="1.2" fill="'+color+'" opacity=".7"/>'
      +'<circle cx="17.5" cy="4.5" r="1.2" fill="'+color+'" opacity=".7"/>'
      +'</svg>';
  }

  var cols=order.map(function(u,i){
    var m=META[i];
    var isFirst=(i===1);
    if(!u) return '<div style="flex:1"></div>';
    var uf=(users||[]).find(function(x){return x.id===u.id;});
    var av=avSize[i];
    var rpDisp=Math.round(u.ci);
    var wrPct=u.games?Math.round(u.wins/u.games*100):0;
    var ini=(u.name||'?')[0];
    var imgSrc=uf&&uf.avatar_url?uf.avatar_url:'';
    var avatarInner=imgSrc
      ?'<img src="'+imgSrc+'" style="width:100%;height:100%;object-fit:cover;">'
      :'<span style="font-size:'+(isFirst?'1.7rem':'1.3rem')+';font-weight:900;color:'+m.color+';">'+ini+'</span>';
    var rankLabels=['2nd','1st','3rd'];
    var badgeDot='<div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:'+m.color+';border:2px solid var(--bg2);display:flex;align-items:center;justify-content:center;z-index:2;"><span style="font-size:.48rem;font-weight:900;color:#fff;letter-spacing:-.3px;">'+rankLabels[i]+'</span></div>';
    var pid=u.id;
    return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;">'
      +'<div style="height:26px;display:flex;align-items:center;justify-content:center;">'+(isFirst?mkCrown(m.color):'')+'</div>'
      +'<div style="position:relative;margin-bottom:7px;">'
      +'<div style="position:absolute;inset:-3px;border-radius:50%;background:'+m.color+';opacity:.12;filter:blur(4px);"></div>'
      +'<div style="width:'+av+'px;height:'+av+'px;border-radius:50%;border:2px solid '+m.color+';box-shadow:0 0 '+(isFirst?'20':'11')+'px '+m.glow+';background:radial-gradient(circle at 35% 35%,'+m.color+'33,var(--bg2));display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;z-index:1;">'
      +avatarInner+'</div>'+badgeDot+'</div>'
      +'<div style="font-weight:800;font-size:'+m.textSize+';color:var(--text);width:100%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 3px;margin-bottom:2px;letter-spacing:-.2px;">'+u.name+'</div>'
      +'<div style="font-family:\'Black Han Sans\',sans-serif;font-size:'+(isFirst?'.9rem':'.76rem')+';color:'+m.color+';margin-bottom:7px;letter-spacing:.3px;">'+rpDisp+'</div>'
      +'<div style="width:100%;height:'+podH[i]+'px;position:relative;overflow:hidden;background:linear-gradient(170deg,'+m.color+'28 0%,'+m.color+'14 70%,transparent 100%);border:1px solid '+m.color+'55;border-bottom:none;border-radius:10px 10px 0 0;">'
      +'<div style="position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">'
      +'<span style="font-family:\'Black Han Sans\',sans-serif;font-size:'+m.numSize+';color:'+m.color+';line-height:1;">'+m.rank+'</span>'
      +'<span style="font-size:.58rem;color:'+m.color+'99;font-weight:700;letter-spacing:.3px;">'+wrPct+'% 승률</span>'
      +'</div></div></div>';
  });

  wrap.innerHTML='<div style="display:flex;align-items:flex-end;gap:5px;padding:0 2px;">'+cols.join('')+'</div>';
}

function renderRankTable(allMatches){
  // profiles는 대시보드 로딩 시 캐시된 것 사용 (매번 DB 재조회 X)
  const users=window._profilesCache||[];
  if(!users.length) return;
  const excludedIds=new Set(users.filter(u=>u.exclude_stats).map(u=>u.id));
  const guestModeNames=window._guestModeNamesCache||new Set();
  const userStats={};
  users.filter(u=>!u.exclude_stats).forEach(u=>{userStats[u.id]={id:u.id,name:u.name,games:0,wins:0,losses:0,scored:0,conceded:0,isGuest:false,isGuestMode:false};});
  const filtered=rankTab==='all'?allMatches:allMatches.filter(m=>m.match_type===rankTab);
  filtered.forEach(m=>{
    const aWin=m.score_a>m.score_b;
    // id 기반
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id&&!excludedIds.has(p.id)).forEach(p=>{
      if(!userStats[p.id])return;
      userStats[p.id].games++;
      if(p.win)userStats[p.id].wins++;else userStats[p.id].losses++;
      userStats[p.id].scored+=p.s;userStats[p.id].conceded+=p.c;
    });
    // 이름 기반 비회원 (id null, name 있음)
    [{id:m.a1_id,name:m.a1_name,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.a2_id,name:m.a2_name,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,name:m.b1_name,win:!aWin,s:m.score_b,c:m.score_a},
     {id:m.b2_id,name:m.b2_name,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>!p.id&&p.name).forEach(p=>{
      const isGM=guestModeNames.has(p.name);
      if(isGM) return; // 게스트 모드(랭킹 미반영) 이름은 랭킹에서 완전 제외
      const key='name:'+p.name;
      if(!userStats[key]) userStats[key]={id:key,name:p.name,games:0,wins:0,losses:0,scored:0,conceded:0,isGuest:true,isGuestMode:false};
      userStats[key].games++;
      if(p.win)userStats[key].wins++;else userStats[key].losses++;
      userStats[key].scored+=p.s;userStats[key].conceded+=p.c;
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
    const guestBadge='';
    return `<tr class="${u.id===ME.id?'me':''}" ${!isRanked?'style="opacity:0.55;"':''}>
    <td>${rankCell}</td>
    <td><span class="rank-name" onclick="goToFeedByName('${u.name.replace(/'/g,"\\'")}')">${u.name}</span>${guestBadge}</td>
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
    if(onA){
      if(m.a1_id===ME.id){ partnerId=m.a2_id||('name:'+m.a2_name); partnerName=m.a2_name; }
      else if(m.a2_id===ME.id){ partnerId=m.a1_id||('name:'+m.a1_name); partnerName=m.a1_name; }
    } else {
      if(m.b1_id===ME.id){ partnerId=m.b2_id||('name:'+m.b2_name); partnerName=m.b2_name; }
      else if(m.b2_id===ME.id){ partnerId=m.b1_id||('name:'+m.b1_name); partnerName=m.b1_name; }
    }
    if(!partnerId||!partnerName) return;
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
  const guestModeNamesSet=new Set(JSON.parse(localStorage.getItem('guest_mode_names')||'[]'));

  // 회원+비회원 통계 집계 (게스트모드 제외)
  const statsMap={};
  allMatches.forEach(m=>{
    const aWin=m.score_a>m.score_b;
    // id 기반 (회원)
    [{id:m.a1_id,name:m.a1_name,onA:true},{id:m.a2_id,name:m.a2_name,onA:true},
     {id:m.b1_id,name:m.b1_name,onA:false},{id:m.b2_id,name:m.b2_name,onA:false}]
    .filter(p=>p.id).forEach(p=>{
      const key=p.id;
      if(!statsMap[key]) statsMap[key]={id:key,name:p.name,games:0,wins:0,scored:0,conceded:0,isGuest:false};
      const s=statsMap[key]; const won=p.onA?aWin:!aWin;
      s.games++; if(won) s.wins++;
      s.scored+=p.onA?m.score_a:m.score_b; s.conceded+=p.onA?m.score_b:m.score_a;
    });
    // 이름 기반 (비회원, 게스트모드 제외)
    [{id:m.a1_id,name:m.a1_name,onA:true},{id:m.a2_id,name:m.a2_name,onA:true},
     {id:m.b1_id,name:m.b1_name,onA:false},{id:m.b2_id,name:m.b2_name,onA:false}]
    .filter(p=>!p.id&&p.name&&!guestModeNamesSet.has(p.name)).forEach(p=>{
      const key='name:'+p.name;
      if(!statsMap[key]) statsMap[key]={id:key,name:p.name,games:0,wins:0,scored:0,conceded:0,isGuest:true};
      const s=statsMap[key]; const won=p.onA?aWin:!aWin;
      s.games++; if(won) s.wins++;
      s.scored+=p.onA?m.score_a:m.score_b; s.conceded+=p.onA?m.score_b:m.score_a;
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
  // 날짜별 실제 경기수 집계 (이름 필터 전 전체 기준)
  const _fullCountByDate={};
  (matches||[]).forEach(m=>{ const d=m.match_date||''; _fullCountByDate[d]=(_fullCountByDate[d]||0)+1; });
  window._feedFullCountByDate=_fullCountByDate;

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
  el.innerHTML=renderMatchesWithDateHeaders(slice, _fullCountByDate) +
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
  el.innerHTML=renderMatchesWithDateHeaders(slice, window._feedFullCountByDate) +
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
  return `<div style="display:flex;align-items:center;gap:6px;padding:10px 0 6px;margin-top:2px;"><div class="feed-date-header" style="flex:1;margin:0;padding:0;"><span>${label}${countBadge}</span></div><button onclick="event.stopPropagation();openDateSummaryPage('${dateStr}')" style="flex-shrink:0;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text-muted);font-family:inherit;font-size:.68rem;cursor:pointer;">더보기 ›</button></div>`;
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

/* ── REGISTER ── */
async function openRegisterModal(){
  openModal('modal-register');
  await renderRegisterPage();
}

async function renderRegisterPage(){
  _usersCache=await _getApprovedUsers();
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
  if(window._submitLock){toast('처리 중입니다…','');return;}
  window._submitLock=true;
  const submitBtn=document.querySelector('[onclick="submitMatch()"]');
  if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='등록 중…';}
  try{ await _doSubmitMatch(); }
  finally{
    window._submitLock=false;
    if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='등록 요청';}
  }
}
async function _doSubmitMatch(){
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
  // onclick 속성으로 탭 매칭 (인덱스 방식보다 안전)
  document.querySelectorAll('#page-admin .sub-tab').forEach(el=>{
    const m=el.getAttribute('onclick')?.match(/switchAdminTab\('(\w+)'\)/);
    el.classList.toggle('active', m&&m[1]===tab);
  });
  switch(tab){case 'pending':renderAdminPending();break;case 'members':renderAdminMembers();break;case 'logs':renderAdminLogs();break;case 'tournamentImport':renderAdminTournamentImport();break;case 'matchDelete':renderAdminMatchDelete();break;}
}
async function renderAdminPending(){
  const el=document.getElementById('admin-content');
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.82rem;">불러오는 중...</div>`;
  // 가입 대기 회원
  const{data:pendingUsers,error:e1}=await sb.from('profiles').select('*').eq('status','pending').order('created_at',{ascending:false});
  // 경기 승인 대기
  const{data:matches,error:e2}=await sb.from('matches').select('*').eq('status','pending').order('created_at',{ascending:false});

  if(e1||e2){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><div>불러오기 실패<br><span style="font-size:.72rem;color:var(--danger);">${(e1||e2)?.message||'오류'}</span></div></div>`;
    return;
  }

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
          <div style="display:flex;gap:6px;">
            <button class="btn btn-success btn-sm" onclick="approveUser('${u.id}')">✅ 승인</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDenyUser('${u.id}','${u.name}')">❌ 거절</button>
          </div>
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
  // 비회원(이름만 있는) 경기 목록에서 이름 추출
  const{data:guestMatches}=await sb.from('matches').select('a1_name,a2_name,b1_name,b2_name,a1_id,a2_id,b1_id,b2_id').eq('status','approved');
  const memberNames=new Set((users||[]).map(u=>u.name));
  const guestNames=new Set();
  (guestMatches||[]).forEach(m=>{
    [{n:m.a1_name,id:m.a1_id},{n:m.a2_name,id:m.a2_id},{n:m.b1_name,id:m.b1_id},{n:m.b2_name,id:m.b2_id}]
    .forEach(p=>{if(p.n&&!p.id&&!memberNames.has(p.n)) guestNames.add(p.n);});
  });
  const guestArr=[...guestNames].sort();
  const guestModeNames=await _loadGuestModeNames();

  // 회원 목록
  const memberSection=`<div class="flex-between mb-2"><span class="text-muted" style="font-size:.82rem;">총 ${(users||[]).length}명</span><button class="btn btn-primary btn-sm" onclick="openCreateUserModal()">➕ 계정 생성</button></div>`+
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

  // 비회원 관리 섹션 (회원 목록 아래) - 테이블 형태
  const approvedUsers=(users||[]).filter(u=>u.status==='approved');
  const memberOptHtml=approvedUsers.map(u=>`<option value="${u.id}|${escHtml(u.name)}">${u.name}</option>`).join('');

  const guestSection=guestArr.length?`
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
      <div style="font-size:.84rem;font-weight:700;color:var(--text);margin-bottom:10px;">👻 비회원 관리 <span style="font-size:.74rem;font-weight:400;color:var(--text-muted);">(${guestArr.length}명)</span></div>
      <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:10px;line-height:1.6;">
        연계 버튼을 눌러 회원을 선택하면 해당 비회원의 경기 기록이 회원 이름으로 변경됩니다.<br>
        게스트모드 체크 시 경기 기록은 유지되지만 전체 랭킹에서 제외됩니다.
      </div>

      <!-- 2단 그리드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
        ${guestArr.map((nm)=>{
          const isGM=guestModeNames.has(nm);
          const safeId='gm-'+nm.replace(/[^a-zA-Z0-9가-힣]/g,'_');
          return `<div style="display:flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 9px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:.81rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(nm)}</div>
              ${isGM?'<div style="font-size:.62rem;color:#E65100;">랭킹제외</div>':''}
            </div>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;" title="랭킹 제외 (경기 기록은 유지)">
              <input type="checkbox" id="${safeId}" ${isGM?'checked':''} onchange="toggleGuestMode('${escHtml(nm)}',this.checked)"
                style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary);">
              <span style="font-size:.65rem;color:var(--text-muted);white-space:nowrap;">랭킹<br>제외</span>
            </label>
            <button onclick="openLinkGuestModal('${escHtml(nm)}')"
              style="font-size:.7rem;padding:3px 8px;background:var(--primary);border:none;border-radius:5px;cursor:pointer;color:#fff;white-space:nowrap;font-family:inherit;font-weight:600;flex-shrink:0;">
              연계
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>`:
    '<div style="margin-top:8px;font-size:.8rem;color:var(--text-muted);text-align:center;padding:8px 0;">비회원 기록 없음</div>';

  // 연계용 회원 선택 모달 HTML (동적으로 body에 삽입)
  if(!document.getElementById('modal-link-guest')){
    const modalEl=document.createElement('div');
    modalEl.id='modal-link-guest';
    modalEl.className='modal-overlay center';
    modalEl.innerHTML=`<div class="modal center-modal" style="max-width:340px;">
      <div class="modal-title">🔗 기록 연계</div>
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px;">
        <span id="link-guest-name" style="font-weight:700;color:var(--text);"></span>의 기록을 연계할 회원을 선택하세요.
      </div>
      <select class="form-select" id="link-guest-select" style="margin-bottom:16px;">
        <option value="">회원 선택...</option>
        ${memberOptHtml}
      </select>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('modal-link-guest')">취소</button>
        <button class="btn btn-primary" onclick="confirmLinkGuest()">연계</button>
      </div>
    </div>`;
    document.body.appendChild(modalEl);
  } else {
    // 이미 있으면 셀렉트 옵션만 갱신
    const sel=document.getElementById('link-guest-select');
    if(sel) sel.innerHTML='<option value="">회원 선택...</option>'+memberOptHtml;
  }

  el.innerHTML=memberSection+guestSection;
}

// ── 게스트 모드: localStorage 기반 저장 (logs 테이블 UUID 타입 충돌 방지) ──
async function _loadGuestModeNames(){
  try{
    const raw=localStorage.getItem('guest_mode_names');
    if(raw) return new Set(JSON.parse(raw));
  }catch(e){}
  return new Set();
}
async function _saveGuestModeNames(names){
  try{ localStorage.setItem('guest_mode_names',JSON.stringify([...names])); }catch(e){}
}

async function toggleGuestMode(name, enabled){
  const names=await _loadGuestModeNames();
  if(enabled) names.add(name); else names.delete(name);
  await _saveGuestModeNames(names);
  toast(enabled?`👻 "${name}" 게스트 모드 설정 (랭킹 제외)`:`"${name}" 랭킹 반영으로 변경`,'success');
  // 레이블 즉시 업데이트
  const safeId='gm-'+name.replace(/[^a-zA-Z0-9가-힣]/g,'_');
  const lbl=document.getElementById(safeId)?.closest('div')?.querySelector('span:last-child');
  if(lbl){ lbl.style.color=enabled?'#E65100':'var(--text-dim)'; lbl.textContent=enabled?'👻 랭킹 제외':'랭킹 반영'; }
}

// 비회원 기록을 기존 회원에 연계
// 연계 모달 열기
function openLinkGuestModal(guestName){
  window._linkGuestName=guestName;
  const nameEl=document.getElementById('link-guest-name');
  if(nameEl) nameEl.textContent=guestName;
  const sel=document.getElementById('link-guest-select');
  if(sel) sel.value='';
  openModal('modal-link-guest');
}

// 연계 확인
async function confirmLinkGuest(){
  const guestName=window._linkGuestName;
  if(!guestName){closeModal('modal-link-guest');return;}
  const sel=document.getElementById('link-guest-select');
  if(!sel||!sel.value){toast('회원을 선택하세요','error');return;}
  const [memberId,memberName]=sel.value.split('|');
  if(!memberId||!memberName){toast('회원 정보 오류','error');return;}
  closeModal('modal-link-guest');
  try{
    const cols=[
      {nameCol:'a1_name',idCol:'a1_id'},
      {nameCol:'a2_name',idCol:'a2_id'},
      {nameCol:'b1_name',idCol:'b1_id'},
      {nameCol:'b2_name',idCol:'b2_id'},
    ];
    let total=0;
    for(const {nameCol,idCol} of cols){
      const{data:rows}=await sb.from('matches').select('id').eq(nameCol,guestName).is(idCol,null);
      if(rows&&rows.length){
        await sb.from('matches').update({[idCol]:memberId,[nameCol]:memberName}).in('id',rows.map(r=>r.id));
        total+=rows.length;
      }
    }
    const gm=await _loadGuestModeNames(); gm.delete(guestName); await _saveGuestModeNames(gm);
    addLog(`비회원 연계: "${guestName}" → "${memberName}" (${total}건)`,ME.id);
    toast(`✅ "${memberName}"에 ${total}건 연계 완료`,'success');
    renderAdminMembers();
  }catch(e){toast('연계 실패: '+e.message,'error');}
}



// ── 이름→ID 매핑: DB profiles 직접 조회 (항상 최신) ──
async function _ensureUserMap(){
  // 이미 로드됐어도 매번 갱신
  const{data:users}=await sb.from('profiles').select('id,name').eq('status','approved');
  window._bfUsersMap={};
  (users||[]).forEach(u=>{ window._bfUsersMap[u.id]={id:u.id,name:u.name,score:0}; });
}

function _nameToId(nm){
  if(!nm) return null;
  const map=window._bfUsersMap||{};
  const found=Object.values(map).find(u=>u.name===nm);
  return found?found.id:null;
}

// 저장된 경기 중 idCol이 null이지만 nameCol에 회원 이름이 있는 경우 → ID 채워넣기
async function _fixMatchIds(matchIds){
  if(!matchIds||!matchIds.length) return;
  const map=window._bfUsersMap||{};
  const nameMap={};
  Object.values(map).forEach(u=>{ nameMap[u.name]=u.id; });

  const cols=[
    {nameCol:'a1_name',idCol:'a1_id'},
    {nameCol:'a2_name',idCol:'a2_id'},
    {nameCol:'b1_name',idCol:'b1_id'},
    {nameCol:'b2_name',idCol:'b2_id'},
  ];
  for(const {nameCol,idCol} of cols){
    // 해당 id가 null인 경기만 가져오기
    const{data:rows}=await sb.from('matches')
      .select(`id,${nameCol}`)
      .in('id',matchIds)
      .is(idCol,null);
    if(!rows||!rows.length) continue;
    // 이름별 그룹핑 후 업데이트
    const byName={};
    rows.forEach(r=>{ const nm=r[nameCol]; if(nm&&nameMap[nm]){if(!byName[nm]) byName[nm]=[]; byName[nm].push(r.id);} });
    for(const [nm,ids] of Object.entries(byName)){
      await sb.from('matches').update({[idCol]:nameMap[nm]}).in('id',ids);
    }
  }
}

async function renderAdminBatch(){
  await _ensureUserMap();
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
  
  
  // 이름 → ID 매핑 (공통 함수 사용 - batchSubmit에서 _ensureUserMap 후 _fixMatchIds로 후처리)
  return {
    match_date,
    match_type:'doubles',
    a1_name:aNames[0]||null, a1_id:_nameToId(aNames[0]),
    a2_name:aNames[1]||null, a2_id:_nameToId(aNames[1]),
    b1_name:bNames[0]||null, b1_id:_nameToId(bNames[0]),
    b2_name:bNames[1]||null, b2_id:_nameToId(bNames[1]),
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
  // 최신 회원 맵 로드 후 ID 재매핑
  await _ensureUserMap();
  const now=new Date().toISOString();
  const inserts=records.map(r=>{
    const{source,...rest}=r;
    // ID 재매핑
    return {
      ...rest,
      a1_id:rest.a1_id||_nameToId(rest.a1_name),
      a2_id:rest.a2_id||_nameToId(rest.a2_name),
      b1_id:rest.b1_id||_nameToId(rest.b1_name),
      b2_id:rest.b2_id||_nameToId(rest.b2_name),
      approved_by:ME.id, approved_at:now, created_at:now
    };
  });
  const{data:inserted,error}=await sb.from('matches').insert(inserts).select('id');
  if(error){
    toast('등록 실패: '+error.message,'error');
    if(btn){btn.disabled=false;btn.textContent=`📨 ${records.length}건 일괄 등록`;}
    return;
  }
  // null ID가 남아있을 경우 이름으로 후처리
  if(inserted?.length) await _fixMatchIds(inserted.map(r=>r.id));
  addLog(`일괄 등록 ${records.length}건`,ME.id);
  toast(`✅ ${records.length}건 등록 완료`,'success');
  window._batchParsed=[];
  document.getElementById('batch-input').value='';
  document.getElementById('batch-preview').innerHTML='';
  renderAdminBatch();
}


// ══════════════════════════════════════════════
//  대회 일괄 데이터 입력 (관리자 전용)
//  컬럼: 구분|날짜|선수A|선수B|점수1|점수2|선수C|선수D|단계|슬롯|라운드|BYE
// ══════════════════════════════════════════════

function renderAdminTournamentImport(){
  const el=document.getElementById('admin-content');
  if(!el) return;
  el.innerHTML=`
  <div style="margin-bottom:12px;">
    <div style="font-size:.88rem;font-weight:700;margin-bottom:6px;">🏆 대회 경기 일괄 입력</div>
    <div style="font-size:.76rem;color:var(--text-muted);background:var(--bg2);border-radius:8px;padding:10px 12px;margin-bottom:10px;line-height:1.7;">
      엑셀에서 <b>탭 구분 텍스트</b>를 복사해서 붙여넣으세요.<br>
      <b>컬럼 순서:</b> 구분 · 날짜 · 선수A · 선수B · 점수1 · 점수2 · 선수C · 선수D · 단계 · 슬롯 · 라운드 · BYE<br>
      <b>구분:</b> 개인 / 듀오 / 팀전 &nbsp;|&nbsp; <b>단계:</b> 리그 / 8강 / 4강 / 결승 &nbsp;|&nbsp; <b>슬롯:</b> A조, E1~E4, F1~F2, T<br>
      <b>부전승(BYE):</b> 마지막 컬럼에 BYE 입력 시 자동 처리
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
      <div style="font-size:.8rem;color:var(--text-muted);">대회명</div>
      <input id="ti-name" class="form-input" placeholder="예) 새벽민턴 3월 오픈" style="flex:1;font-size:.82rem;padding:6px 10px;">
    </div>
    <textarea id="ti-raw" placeholder="여기에 엑셀 데이터를 붙여넣으세요..."
      style="width:100%;min-height:200px;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:.78rem;font-family:monospace;resize:vertical;"></textarea>
  </div>
  <button onclick="tiParsePreview()" class="btn btn-primary" style="width:100%;margin-bottom:10px;">🔍 미리보기</button>
  <div id="ti-preview"></div>`;
}

function tiParsePreview(){
  const raw=(document.getElementById('ti-raw')?.value||'').trim();
  if(!raw){toast('데이터를 입력하세요','error');return;}
  const lines=raw.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('구분'));
  const result=_tiParseAll(lines);
  window._tiParsed=result;
  _tiRenderPreview(result);
}

function _tiParseAll(lines){
  // 결과 구조
  const out={
    type:null,     // individual|duo|team
    date:null,
    league:[],     // 조별 리그 [{gi,slot,row}]
    knockout:[],   // 본선 [{round,slot,row}]
    team:[],       // 팀전 라운드별
    errors:[]
  };
  lines.forEach((line,li)=>{
    try{
      const cols=line.split('\t').map(s=>s.trim());
      if(cols.length<6) return; // 빈 줄 무시
      const [kind,date,pA,pB,s1raw,s2raw,pC,pD,stage,slot,round,byeFlag]=cols;
      if(!kind) return;

      // 종목 감지
      const kindN=kind.trim();
      if(!out.type){
        if(kindN==='개인') out.type='individual';
        else if(kindN==='듀오') out.type='duo';
        else if(kindN==='팀전') out.type='team';
      }
      // 날짜
      if(date&&!out.date){
        const parts=date.split('-');
        if(parts.length===3){
          const yy=parts[0].length===2?'20'+parts[0]:parts[0];
          out.date=`${yy}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
        }
      }
      // 부전승
      const isBye=(byeFlag||'').toUpperCase()==='BYE';
      // 점수
      const s1=parseInt(s1raw), s2=parseInt(s2raw);
      const hasScore=!isNaN(s1)&&!isNaN(s2);

      const row={pA:pA||'',pB:pB||'',pC:pC||'',pD:pD||'',s1:hasScore?s1:null,s2:hasScore?s2:null,isBye,slot:slot||'',round:round||''};

      const stageN=(stage||'').trim();
      if(stageN==='리그') out.league.push(row);
      else if(['8강','4강','결승'].includes(stageN)) out.knockout.push({...row,stage:stageN});
      else if(kindN==='팀전') out.team.push({...row,round:round||''});
    }catch(e){
      out.errors.push({line:li+1,text:line,reason:e.message});
    }
  });
  return out;
}

function _tiRenderPreview(result){
  const wrap=document.getElementById('ti-preview');
  if(!wrap) return;
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀전'};
  let html=`<div style="background:var(--bg2);border-radius:10px;padding:12px;margin-bottom:10px;">`;
  html+=`<div style="font-weight:700;font-size:.85rem;margin-bottom:8px;">${typeLabel[result.type]||'종목 미감지'} · 날짜: ${result.date||'미감지'}</div>`;

  // 조별 리그
  if(result.league.length){
    // 슬롯별 그룹핑
    const bySlot={};
    result.league.forEach(r=>{
      const k=r.slot||'?';
      if(!bySlot[k]) bySlot[k]=[];
      bySlot[k].push(r);
    });
    html+=`<div style="font-size:.82rem;font-weight:700;color:var(--primary);margin-bottom:6px;">📋 조별 리그 (${result.league.length}경기)</div>`;
    Object.entries(bySlot).forEach(([slot,rows])=>{
      html+=`<div style="margin-bottom:8px;"><div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${slot}</div>`;
      rows.forEach(r=>{
        if(r.isBye) html+=`<div style="font-size:.76rem;padding:3px 6px;color:var(--warn);">🟡 부전승: ${r.pA}${r.pB?' / '+r.pB:''}</div>`;
        else html+=`<div style="font-size:.76rem;padding:3px 6px;display:flex;gap:8px;"><span>${r.pA}${r.pB?' / '+r.pB:''}</span><b style="color:var(--primary);">${r.s1??'?'}:${r.s2??'?'}</b><span>${r.pC}${r.pD?' / '+r.pD:''}</span></div>`;
      });
      html+=`</div>`;
    });
  }

  // 본선
  if(result.knockout.length){
    html+=`<div style="font-size:.82rem;font-weight:700;color:var(--info);margin-bottom:6px;margin-top:8px;">🏆 본선 토너먼트 (${result.knockout.length}경기)</div>`;
    const stageOrder=['8강','4강','결승'];
    stageOrder.forEach(st=>{
      const rows=result.knockout.filter(r=>r.stage===st);
      if(!rows.length) return;
      html+=`<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${st}</div>`;
      rows.forEach(r=>{
        if(r.isBye) html+=`<div style="font-size:.76rem;padding:3px 6px;color:var(--warn);">🟡 부전승(${r.slot}): ${r.pA}${r.pB?' / '+r.pB:''}</div>`;
        else html+=`<div style="font-size:.76rem;padding:3px 6px;display:flex;gap:8px;"><span style="min-width:60px;">[${r.slot}]</span><span>${r.pA}${r.pB?' / '+r.pB:''}</span><b style="color:var(--primary);">${r.s1??'?'}:${r.s2??'?'}</b><span>${r.pC}${r.pD?' / '+r.pD:''}</span></div>`;
      });
    });
  }

  // 팀전
  if(result.team.length){
    html+=`<div style="font-size:.82rem;font-weight:700;color:var(--warn);margin-bottom:6px;margin-top:8px;">🚩 팀전 (${result.team.length}경기)</div>`;
    result.team.forEach(r=>{
      html+=`<div style="font-size:.76rem;padding:3px 6px;display:flex;gap:8px;"><span style="min-width:32px;color:var(--text-muted);">${r.round}</span><span>${r.pA}${r.pB?' / '+r.pB:''}</span><b style="color:var(--primary);">${r.s1??'?'}:${r.s2??'?'}</b><span>${r.pC}${r.pD?' / '+r.pD:''}</span></div>`;
    });
  }

  if(result.errors.length){
    html+=`<div style="font-size:.78rem;color:var(--danger);margin-top:8px;">${result.errors.length}줄 파싱 오류</div>`;
    result.errors.forEach(e=>html+=`<div style="font-size:.72rem;color:var(--danger);padding:2px 0;">${e.line}번줄: ${e.reason}</div>`);
  }
  html+=`</div>`;

  const total=result.league.length+result.knockout.length+result.team.length;
  if(total>0){
    html+=`<button onclick="tiSubmit()" class="btn btn-primary" style="width:100%;margin-bottom:8px;">📥 ${total}경기 대회 생성 + 경기내역 등록</button>`;
  }
  wrap.innerHTML=html;
}

async function tiSubmit(){
  const result=window._tiParsed;
  if(!result) return;
  const nameInput=document.getElementById('ti-name');
  const name=(nameInput?.value||'').trim()||(result.date?result.date+' 대회':'대회');
  const btn=document.querySelector('#ti-preview .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='등록 중...';}
  try{
    // 1. bracket_tournament 생성
    const typeMap={'개인전':'individual','듀오전':'duo','팀전':'team'};
    const tType=result.type||'individual';
    const bracket=_tiBuildBracket(result);
    // groups 컬럼에 모든 데이터 통합 저장 (knockout, rounds, teams 포함)
    const bracketData={
      groups: bracket.groups,
      knockout: bracket.knockout,
      rounds: bracket.rounds,
      teams: bracket.teams||[]
    };
    const{data:bt,error:btErr}=await sb.from('bracket_tournaments').insert({
      name,
      match_date:result.date||new Date().toISOString().slice(0,10),
      status: (result.knockout.length>0)?'done':'league',
      tournament_type:tType,
      rounds:JSON.stringify(bracket.rounds),
      groups:JSON.stringify(bracketData),
      created_by:ME.id
    }).select().single();
    if(btErr) throw new Error('대회 생성 실패: '+btErr.message);

    // 2. 경기내역 일괄 등록 (matches 테이블)
    // 최신 회원 맵 로드 후 ID 재매핑
    await _ensureUserMap();
    const matchRecords=_tiExtractMatches(result);
    if(matchRecords.length){
      const now=new Date().toISOString();
      const inserts=matchRecords.map(r=>({
        ...r,
        // ID 재매핑 (이름으로 찾기)
        a1_id:r.a1_id||_nameToId(r.a1_name),
        a2_id:r.a2_id||_nameToId(r.a2_name),
        b1_id:r.b1_id||_nameToId(r.b1_name),
        b2_id:r.b2_id||_nameToId(r.b2_name),
        approved_by:ME.id,approved_at:now,created_at:now,status:'approved'
      }));
      const{data:inserted,error:mErr}=await sb.from('matches').insert(inserts).select('id');
      if(mErr) console.warn('경기내역 등록 부분실패:',mErr.message);
      // null ID 후처리
      if(inserted?.length) await _fixMatchIds(inserted.map(r=>r.id));
    }

    addLog(`대회 일괄 입력: ${name} (${matchRecords.length}경기)`,ME.id);
    toast(`✅ 대회 생성 완료! (경기 ${matchRecords.length}건 등록)`,'success');
    window._tiParsed=null;
    document.getElementById('ti-raw').value='';
    document.getElementById('ti-preview').innerHTML='';
    if(nameInput) nameInput.value='';
    // 대회 탭으로 이동
    setTimeout(()=>navigateTo('tournament'),600);
  }catch(e){
    toast(e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='📥 대회 생성 + 경기내역 등록';}
  }
}

function _tiBuildBracket(result){
  // groups: 조별 리그 데이터 구조화
  const isIndividual=result.type==='individual';
  const isDuo=result.type==='duo';

  // 슬롯별 조별 리그 그룹핑
  const bySlot={};
  result.league.forEach(r=>{
    const k=r.slot||'A조';
    if(!bySlot[k]) bySlot[k]=[];
    bySlot[k].push(r);
  });

  const groups=Object.entries(bySlot).map(([slot,rows])=>{
    // 선수/팀 목록 수집
    const playerSet={};
    rows.forEach(r=>{
      if(!r.isBye){
        // 팀 A
        const ka=r.pA+(isDuo&&r.pB?'/'+r.pB:'');
        if(!playerSet[ka]) playerSet[ka]={name:r.pA,p2_name:r.pB||null,id:ka,p1_id:ka};
        // 팀 B
        const kc=r.pC+(isDuo&&r.pD?'/'+r.pD:'');
        if(!playerSet[kc]) playerSet[kc]={name:r.pC,p2_name:r.pD||null,id:kc,p1_id:kc};
      }
    });
    const players=Object.values(playerSet);

    // 경기 목록 구조화
    const matches=rows.filter(r=>!r.isBye&&r.s1!==null).map(r=>{
      const t1={name:r.pA,id:r.pA+(isDuo&&r.pB?'/'+r.pB:''),p1_id:r.pA,p1_name:r.pA,p2_name:r.pB||null};
      const t2={name:r.pC,id:r.pC+(isDuo&&r.pD?'/'+r.pD:''),p1_id:r.pC,p1_name:r.pC,p2_name:r.pD||null};
      return{p1:t1,p2:t2,t1:t1,t2:t2,s1:r.s1,s2:r.s2,done:true};
    });

    // 순위 계산
    const st={};
    players.forEach(p=>{st[p.id]={team:p,wins:0,losses:0,diff:0,pf:0,pa:0};});
    matches.forEach(m=>{
      const k1=m.p1.id, k2=m.p2.id;
      if(!st[k1]||!st[k2]) return;
      st[k1].pf+=m.s1;st[k1].pa+=m.s2;st[k1].diff=st[k1].pf-st[k1].pa;
      st[k2].pf+=m.s2;st[k2].pa+=m.s1;st[k2].diff=st[k2].pf-st[k2].pa;
      if(m.s1>m.s2){st[k1].wins++;st[k2].losses++;}else{st[k2].wins++;st[k1].losses++;}
    });
    const standings=Object.values(st).sort((a,b)=>b.wins!==a.wins?b.wins-a.wins:b.diff-a.diff);

    return{name:slot,players,teams:players,matches,standings};
  });

  // 본선 knockout 구조
  const stageOrder=['8강','4강','결승'];
  const knockout=stageOrder.map(st=>{
    const rows=result.knockout.filter(r=>r.stage===st);
    if(!rows.length) return null;
    const matches=rows.map(r=>{
      const t1={name:r.pA+(r.pB?' / '+r.pB:''),p1_name:r.pA,p2_name:r.pB||null};
      const t2={name:r.isBye?'BYE':(r.pC+(r.pD?' / '+r.pD:'')),p1_name:r.pC,p2_name:r.pD||null};
      return{slot:r.slot,t1,t2,s1:r.isBye?null:r.s1,s2:r.isBye?null:r.s2,done:r.isBye||r.s1!==null,bye:r.isBye};
    });
    return{label:st,matches};
  }).filter(Boolean);

  // 팀전 rounds + 팀 구성원 자동 수집
  const rounds=[];
  const teamMembers={}; // {팀A이름: Set([선수들]), 팀B이름: Set([선수들])}
  if(result.team.length){
    // 모든 경기에서 팀별 선수 중복제거로 수집
    result.team.forEach(r=>{
      // pA/pB는 각 경기의 팀A 선수, pC/pD는 팀B 선수
      // 팀 이름은 라운드 컬럼의 팀 구분이 없으므로 A팀/B팀으로 구분
      // slot 컬럼을 팀 이름으로 사용 (없으면 A팀/B팀)
      const teamAName = r.slot==='R1'||!r.slot ? 'A팀' : (r.slot||'A팀');
      // 실제로는 선수 이름으로 팀을 구분 - A 컬럼 선수들 vs C 컬럼 선수들
      if(!teamMembers['A팀']) teamMembers['A팀']={members:new Set(),captain:null};
      if(!teamMembers['B팀']) teamMembers['B팀']={members:new Set(),captain:null};
      if(r.pA) teamMembers['A팀'].members.add(r.pA);
      if(r.pB) teamMembers['A팀'].members.add(r.pB);
      if(r.pC) teamMembers['B팀'].members.add(r.pC);
      if(r.pD) teamMembers['B팀'].members.add(r.pD);
    });
    const byRound={};
    result.team.forEach(r=>{const k=r.round||'R1';if(!byRound[k]) byRound[k]=[];byRound[k].push(r);});
    Object.entries(byRound).forEach(([rnd,rows])=>{
      const matches=rows.map(r=>({t1:{name:r.pA+(r.pB?' / '+r.pB:''),p1_name:r.pA,p2_name:r.pB||null},t2:{name:r.pC+(r.pD?' / '+r.pD:''),p1_name:r.pC,p2_name:r.pD||null},s1:r.s1,s2:r.s2,done:r.s1!==null}));
      rounds.push({label:rnd,matches});
    });
  }
  // teamMembers Set → Array 변환
  const teams=Object.entries(teamMembers).map(([name,info])=>({
    name, captain:info.captain, members:[...info.members]
  }));

  return{groups,knockout,rounds,teams};
}

function _tiExtractMatches(result){
  const date=result.date||new Date().toISOString().slice(0,10);
  const nameToId=(nm)=>{
    if(!nm) return null;
    const found=Object.values(window._bfUsersMap||{}).find(u=>u.name===nm);
    return found?found.id:null;
  };
  const records=[];
  const allRows=[...result.league,...result.knockout,...result.team];
  allRows.forEach(r=>{
    if(r.isBye||r.s1===null||r.s2===null) return;
    records.push({
      match_date:date,
      match_type:'doubles',
      a1_name:r.pA||null, a1_id:nameToId(r.pA),
      a2_name:r.pB||null, a2_id:nameToId(r.pB),
      b1_name:r.pC||null, b1_id:nameToId(r.pC),
      b2_name:r.pD||null, b2_id:nameToId(r.pD),
      score_a:r.s1, score_b:r.s2
    });
  });
  return records;
}


// ══════════════════════════════════════════════
//  경기내역 일괄 삭제 (관리자 전용)
// ══════════════════════════════════════════════

let _delSelectedIds = new Set();

async function renderAdminMatchDelete(){
  const el = document.getElementById('admin-content');
  if(!el) return;
  _delSelectedIds = new Set();
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
    <div style="font-size:.88rem;font-weight:700;">🗑️ 경기내역 일괄 삭제</div>
    <div style="display:flex;gap:6px;align-items:center;">
      <span id="del-count-label" style="font-size:.78rem;color:var(--text-muted);">0건 선택</span>
      <button id="del-all-btn" onclick="delToggleAll()" class="btn btn-ghost btn-sm">전체선택</button>
      <button onclick="delExecute()" class="btn btn-danger btn-sm" id="del-exec-btn" disabled>🗑️ 삭제</button>
    </div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
    <input id="del-date-f" type="date" class="form-input" style="font-size:.78rem;padding:5px 8px;width:140px;" onchange="renderAdminMatchDelete()">
    <input id="del-name-f" type="text" class="form-input" placeholder="이름 검색" style="font-size:.78rem;padding:5px 8px;flex:1;min-width:100px;" oninput="renderAdminMatchDelete()">
  </div>
  <div id="del-list">불러오는 중...</div>`;
  await _renderDelList();
}

async function _renderDelList(){
  const el = document.getElementById('del-list');
  if(!el) return;
  const dateF = document.getElementById('del-date-f')?.value||'';
  const nameF = (document.getElementById('del-name-f')?.value||'').trim().toLowerCase();
  let q = sb.from('matches').select('*').eq('status','approved').order('match_date',{ascending:false}).order('created_at',{ascending:false}).limit(300);
  if(dateF) q = q.eq('match_date', dateF);
  const {data:matches} = await q;
  let list = matches||[];
  if(nameF) list = list.filter(m=>[m.a1_name,m.a2_name,m.b1_name,m.b2_name].some(n=>(n||'').toLowerCase().includes(nameF)));
  if(!list.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><div>경기 없음</div></div>`;return;}

  let html='<div style="display:flex;flex-direction:column;gap:4px;">';
  list.forEach(m=>{
    const sel = _delSelectedIds.has(m.id);
    const aWin = m.score_a > m.score_b;
    const aNames=[m.a1_name,m.a2_name].filter(Boolean).join(' / ');
    const bNames=[m.b1_name,m.b2_name].filter(Boolean).join(' / ');
    html+=`<div onclick="delToggle('${m.id}',this)" data-id="${m.id}" style="display:flex;align-items:center;gap:8px;background:${sel?'rgba(255,82,82,.12)':'var(--surface)'};border:1.5px solid ${sel?'var(--danger)':'var(--border)'};border-radius:8px;padding:8px 10px;cursor:pointer;transition:all .15s;">
      <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${sel?'var(--danger)':'var(--border)'};background:${sel?'var(--danger)':'transparent'};flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        ${sel?'<span style="color:#fff;font-size:.7rem;font-weight:900;">✓</span>':''}
      </div>
      <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;min-width:70px;">${m.match_date||''}</span>
      <span style="font-size:.8rem;flex:1;${aWin?'font-weight:700;':'color:var(--text-muted);'}">${aNames}</span>
      <span style="font-size:.85rem;font-weight:900;color:var(--primary);flex-shrink:0;">${m.score_a}:${m.score_b}</span>
      <span style="font-size:.8rem;flex:1;text-align:right;${!aWin?'font-weight:700;':'color:var(--text-muted);'}">${bNames}</span>
    </div>`;
  });
  html+='</div>';
  el.innerHTML=html;
  _updateDelUI();
}

function delToggle(id, el){
  if(_delSelectedIds.has(id)) _delSelectedIds.delete(id);
  else _delSelectedIds.add(id);
  // 카드 스타일 즉시 업데이트
  const sel=_delSelectedIds.has(id);
  el.style.background=sel?'rgba(255,82,82,.12)':'var(--surface)';
  el.style.borderColor=sel?'var(--danger)':'var(--border)';
  const box=el.querySelector('div');
  if(box){box.style.borderColor=sel?'var(--danger)':'var(--border)';box.style.background=sel?'var(--danger)':'transparent';box.innerHTML=sel?'<span style="color:#fff;font-size:.7rem;font-weight:900;">✓</span>':'';}
  _updateDelUI();
}

function delToggleAll(){
  const cards=document.querySelectorAll('#del-list [data-id]');
  const allIds=[...cards].map(c=>c.dataset.id);
  const allSelected=allIds.every(id=>_delSelectedIds.has(id));
  if(allSelected){allIds.forEach(id=>_delSelectedIds.delete(id));}
  else{allIds.forEach(id=>_delSelectedIds.add(id));}
  _renderDelList();
}

function _updateDelUI(){
  const n=_delSelectedIds.size;
  const lbl=document.getElementById('del-count-label');
  const btn=document.getElementById('del-exec-btn');
  const allBtn=document.getElementById('del-all-btn');
  if(lbl) lbl.textContent=`${n}건 선택`;
  if(btn){btn.disabled=n===0;btn.textContent=n>0?`🗑️ ${n}건 삭제`:'🗑️ 삭제';}
  const cards=document.querySelectorAll('#del-list [data-id]');
  const allIds=[...cards].map(c=>c.dataset.id);
  if(allBtn) allBtn.textContent=allIds.length&&allIds.every(id=>_delSelectedIds.has(id))?'전체해제':'전체선택';
}

async function delExecute(){
  const ids=[..._delSelectedIds];
  if(!ids.length) return;
  showConfirm({
    icon:'🗑️', title:'경기 삭제', msg:`선택한 ${ids.length}건을 삭제합니다. 복구할 수 없습니다.`,
    okLabel:'삭제', okClass:'btn-danger',
    onOk: async()=>{
      const{error}=await sb.from('matches').delete().in('id',ids);
      if(error){toast('삭제 실패: '+error.message,'error');return;}
      addLog(`경기 ${ids.length}건 삭제`,ME.id);
      toast(`✅ ${ids.length}건 삭제 완료`,'success');
      _delSelectedIds.clear();
      renderAdminMatchDelete();
    }
  });
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

  // 선수 한 명 렌더: 회원 select + 비회원 직접입력 옵션 + 기존값 자동 설정
  const mkPlayerField=(fid,selId,selName,required)=>{
    const isGuest=!selId&&selName; // id 없고 이름만 있으면 비회원
    const noneOpt=required?'':`<option value="">없음</option>`;
    const memberOpts=(users||[]).map(u=>`<option value="${u.id}" ${u.id===selId?'selected':''}>${u.name}</option>`).join('');
    const guestSel=isGuest?'selected':'';
    return `<div>
      <select class="form-select" id="${fid}" onchange="emToggleGuest('${fid}')" style="margin-bottom:4px;">
        ${noneOpt}
        ${memberOpts}
        <option value="__guest__" ${guestSel}>✏️ 직접 입력</option>
      </select>
      <input class="form-input" id="${fid}-guest" placeholder="이름 직접 입력"
        value="${isGuest?selName:''}"
        style="display:${isGuest?'block':'none'};margin-top:4px;font-size:.85rem;">
    </div>`;
  };

  document.getElementById('modal-edit-body').innerHTML=`
    <div class="form-group"><label class="form-label">종목</label><select class="form-select" id="em-type"><option value="doubles">복식</option></select></div>
    <div class="form-group"><label class="form-label">경기 일자</label><input class="form-input" type="date" id="em-date" value="${m.match_date}"></div>
    <hr class="section-divider">
    <div style="font-size:.86rem;font-weight:700;color:var(--primary);margin-bottom:8px;">A팀</div>
    <div class="form-row-2">
      <div class="form-group"><label class="form-label">A팀 선수1</label>${mkPlayerField('em-a1',m.a1_id,m.a1_name,true)}</div>
      <div class="form-group"><label class="form-label">A팀 선수2</label>${mkPlayerField('em-a2',m.a2_id,m.a2_name,false)}</div>
    </div>
    <div class="form-group"><label class="form-label">A팀 점수</label><input class="form-input" type="number" id="em-sa" value="${m.score_a}" max="30" inputmode="numeric"></div>
    <hr class="section-divider">
    <div style="font-size:.86rem;font-weight:700;color:var(--danger);margin-bottom:8px;">B팀</div>
    <div class="form-row-2">
      <div class="form-group"><label class="form-label">B팀 선수1</label>${mkPlayerField('em-b1',m.b1_id,m.b1_name,true)}</div>
      <div class="form-group"><label class="form-label">B팀 선수2</label>${mkPlayerField('em-b2',m.b2_id,m.b2_name,false)}</div>
    </div>
    <div class="form-group"><label class="form-label">B팀 점수</label><input class="form-input" type="number" id="em-sb" value="${m.score_b}" max="30" inputmode="numeric"></div>
    <div class="form-group"><label class="form-label">관리자 메모</label><input class="form-input" type="text" id="em-note" value="${m.admin_note||''}"></div>`;
  document.getElementById('modal-edit-actions').innerHTML=`<button class="btn btn-ghost" onclick="closeModal('modal-edit-match')">취소</button><button class="btn btn-warn btn-sm" onclick="saveEditMatch(false)">수정</button><button class="btn btn-success btn-sm" onclick="saveEditMatch(true)">수정+승인</button>`;
  closeModal('modal-match');openModal('modal-edit-match');
}

function emToggleGuest(fid){
  const sel=document.getElementById(fid);
  const inp=document.getElementById(fid+'-guest');
  if(!inp) return;
  inp.style.display=sel?.value==='__guest__'?'block':'none';
  if(sel?.value==='__guest__') inp.focus();
}

async function saveEditMatch(andApprove){
  // id or guest name 읽기
  const readPlayer=(fid)=>{
    const sel=document.getElementById(fid);
    const val=sel?.value||'';
    if(val==='__guest__'){
      const nm=(document.getElementById(fid+'-guest')?.value||'').trim();
      return{id:null,name:nm||null};
    }
    if(!val) return{id:null,name:null};
    const opt=sel.options[sel.selectedIndex];
    return{id:val,name:opt?.text||null};
  };
  const a1=readPlayer('em-a1'),a2=readPlayer('em-a2');
  const b1=readPlayer('em-b1'),b2=readPlayer('em-b2');
  const upd={
    match_type:document.getElementById('em-type').value,
    match_date:document.getElementById('em-date').value,
    a1_id:a1.id,a1_name:a1.name,
    a2_id:a2.id||null,a2_name:a2.name||null,
    b1_id:b1.id,b1_name:b1.name,
    b2_id:b2.id||null,b2_name:b2.name||null,
    score_a:parseInt(document.getElementById('em-sa').value)||0,
    score_b:parseInt(document.getElementById('em-sb').value)||0,
    admin_note:document.getElementById('em-note').value||null,
    updated_at:nowISO()
  };
  if(andApprove){upd.status='approved';upd.approved_at=nowISO();upd.approved_by=ME.id;}
  await sb.from('matches').update(upd).eq('id',editMatchId);
  addLog(`경기 수정${andApprove?'+승인':''}:${editMatchId}`,ME.id);
  toast(andApprove?'✅ 수정+승인 완료':'✏️ 수정 완료','success');
  closeModal('modal-edit-match');
  if(adminTab==='pending') renderAdminPending();
}
async function approveUser(uid){await sb.from('profiles').update({status:'approved'}).eq('id',uid);addLog(`회원 승인: ${uid}`,ME.id);toast('승인 완료','success');renderAdminMembers();}
function confirmDenyUser(uid,name){
  showConfirm({icon:'❌',title:`${name} 가입을 거절하시겠습니까?`,msg:'계정이 거절 상태로 변경되며 로그인이 불가합니다.',okLabel:'거절',okClass:'btn-danger',onOk:async()=>{
    await sb.from('profiles').update({status:'rejected'}).eq('id',uid);
    addLog(`회원 가입거절: ${uid}`,ME.id);
    toast('가입 거절 완료','success');
    renderAdminPending();
  }});
}

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
async function createGuestProfile(name){
  if(!confirm(`'${name}' 이름으로 비회원 프로필을 생성할까요?\n(이메일 없이 이름만으로 생성됩니다)`)) return;
  const fakeId=crypto.randomUUID();
  const{error}=await sb.from('profiles').insert({
    id:fakeId, name, status:'approved', role:'user',
    games:0, wins:0, losses:0,
    created_at:new Date().toISOString()
  });
  if(error){toast('생성 실패: '+error.message,'error');return;}
  await _linkGuestMatchesToUser(fakeId, name);
  toast(`✅ '${name}' 프로필 생성 및 경기 기록 연결 완료`,'success');
  addLog(`비회원 프로필 생성: ${name}`, ME.id);
  renderAdminMembers();
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
  const allUsers=await _getApprovedUsers();
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
function balDeleteFromDetail(btId){
  showConfirm({icon:'🗑',title:'밸런스 내역 삭제',msg:'이 내역을 삭제하시겠습니까?',okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    const{error}=await sb.from('bracket_tournaments').delete().eq('id',btId);
    if(error){toast('삭제 실패','error');return;}
    closeModal('modal-bracket-detail');
    toast('삭제되었습니다','success');
    _balRenderHistory();
  }});
}

// ── 대회 상세 모달 ──
async function openBracketDetail(id){
  _bdId=id;
  const{data:bt}=await sb.from('bracket_tournaments').select('*').eq('id',id).single();
  if(!bt){toast('대회 정보를 불러올 수 없습니다','error');return;}
  // ── 밸런스 타입은 별도 모달 ──
  if(bt.status==='balance'){_openBalanceDetail(bt);return;}
  _bdData=bt;
  const titleEl=document.getElementById('bd-title');
  const contentEl=document.getElementById('bd-content');
  const actionsEl=document.getElementById('bd-actions');
  if(titleEl) titleEl.textContent='🎯 '+bt.name;
  if(!contentEl) return;
  const isAdmin=ME?.role==='admin';
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};
  const statusLabel={plan:'배분중',active:'진행중',league:'진행중',done:'완료',balance:'⚖️ 밸런스'};
  // groups 컬럼에 {groups,knockout,rounds,teams} 통합 저장 (일괄입력) 또는 순수 배열 (기존방식)
  const rawG=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG)?{groups:rawG}:rawG;
  const groups=data.groups||[];
  const knockout=data.knockout||[];
  const rawRounds=data.rounds?.length?data.rounds:(bt.rounds?(typeof bt.rounds==='string'?JSON.parse(bt.rounds||'[]'):bt.rounds):[]);
  const teamRounds=rawRounds||[];
  const teamsList=data.teams||[];
  const tType=bt.tournament_type||'individual';
  const isIndividual=tType==='individual';
  let html=`<div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px;">📅 ${fmtMatchDate(bt.match_date)} · ${typeLabel[tType]||'대회'} · <span style="color:${bt.status==='done'?'var(--primary)':bt.status==='plan'?'var(--warn)':'var(--info)'};">${statusLabel[bt.status]||bt.status}</span></div>`;
  if(bt.winner_name) html+=`<div style="background:rgba(255,215,0,.1);border:1px solid rgba(255,215,0,.3);border-radius:10px;padding:10px 14px;margin-bottom:12px;text-align:center;"><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px;">🏆 우승</div><div style="font-size:1.1rem;font-weight:700;color:#FFD700;">${bt.winner_name}</div></div>`;
  if(groups.length){
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px;">📋 조별 리그</div>`;
    groups.forEach((g,gi)=>{
      const gMatches=g.matches||[];
      bdCalcStandings([g],isIndividual);
      const standings=g.standings||[];
      html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;"><div style="font-weight:700;font-size:.88rem;color:var(--primary);margin-bottom:8px;">${g.name}</div>`;
      if(standings.length){
        html+=`<table style="width:100%;font-size:.76rem;border-collapse:collapse;margin-bottom:8px;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="padding:4px 2px;text-align:left;color:var(--text-muted);">순위</th><th style="padding:4px 2px;text-align:left;color:var(--text-muted);">선수</th><th style="padding:4px 2px;text-align:center;color:var(--text-muted);">승</th><th style="padding:4px 2px;text-align:center;color:var(--text-muted);">패</th><th style="padding:4px 2px;text-align:center;color:var(--text-muted);">득실</th></tr></thead><tbody>`;
        standings.forEach((s,si)=>{
          const nm=isIndividual?s.team.name:(s.team.p2_name?`${s.team.p1_name}/${s.team.p2_name}`:s.team.p1_name);
          const medal=si===0?'🥇':si===1?'🥈':si===2?'🥉':'';
          html+=`<tr style="border-bottom:1px solid var(--border);${si<2?'color:var(--primary);font-weight:600;':''}"><td style="padding:4px 2px;">${medal||si+1}</td><td style="padding:4px 2px;">${nm}</td><td style="padding:4px 2px;text-align:center;">${s.wins}</td><td style="padding:4px 2px;text-align:center;">${s.losses}</td><td style="padding:4px 2px;text-align:center;">${s.diff>0?'+':''}${s.diff}</td></tr>`;
        });
        html+=`</tbody></table>`;
      }
      const doneMatches=gMatches.filter(m=>m.done);
      if(doneMatches.length){
        html+=`<div style="font-size:.74rem;color:var(--text-muted);margin-bottom:4px;">경기 결과 (${doneMatches.length}/${gMatches.length})</div>`;
        doneMatches.forEach(m=>{
          const n1=isIndividual?m.p1.name:(m.t1.p2_name?`${m.t1.p1_name}/${m.t1.p2_name}`:m.t1.p1_name);
          const n2=isIndividual?m.p2.name:(m.t2.p2_name?`${m.t2.p1_name}/${m.t2.p2_name}`:m.t2.p1_name);
          const w1=parseInt(m.s1)>parseInt(m.s2);
          html+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 4px;font-size:.74rem;border-bottom:1px solid var(--border);"><span style="${w1?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n1}</span><span style="padding:0 8px;font-weight:700;color:var(--primary);">${m.s1}:${m.s2}</span><span style="${!w1?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n2}</span></div>`;
        });
      }
      if(isAdmin){
        const pendingMatches=gMatches.filter(m=>!m.done);
        if(pendingMatches.length){
          html+=`<div style="font-size:.74rem;color:var(--accent);margin-top:6px;margin-bottom:4px;">⏳ 미완료 (${pendingMatches.length}경기)</div>`;
          pendingMatches.forEach(m=>{
            const n1=isIndividual?m.p1.name:(m.t1.p2_name?`${m.t1.p1_name}/${m.t1.p2_name}`:m.t1.p1_name);
            const n2=isIndividual?m.p2.name:(m.t2.p2_name?`${m.t2.p1_name}/${m.t2.p2_name}`:m.t2.p1_name);
            const realMi=gMatches.indexOf(m);
            html+=`<div style="display:flex;align-items:center;gap:4px;padding:4px 0;font-size:.78rem;border-bottom:1px solid var(--border);"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n1}</span><input type="number" placeholder="0" min="0" max="30" id="bd-s1-${gi}-${realMi}" style="width:42px;text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px;font-size:.78rem;color:var(--text);"><span style="color:var(--text-muted);">:</span><input type="number" placeholder="0" min="0" max="30" id="bd-s2-${gi}-${realMi}" style="width:42px;text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:3px;font-size:.78rem;color:var(--text);"><span style="flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n2}</span><button onclick="bdSaveMatchScore('${id}',${gi},${realMi})" style="background:var(--primary);border:none;color:#fff;border-radius:6px;padding:3px 8px;font-size:.72rem;cursor:pointer;flex-shrink:0;">저장</button></div>`;
          });
        }
      }
      html+=`</div>`;
    });
  }
  if(knockout.length){
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px;margin-top:4px;">🏆 본선 토너먼트</div>`;
    html+=_renderKnockoutBracket(knockout);
  }
  if(teamsList.length||teamRounds.length){
    html+=`<div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:10px;margin-top:4px;">🚩 팀전</div>`;
    // 팀 구성원 카드 (팀장 지정 포함)
    if(teamsList.length){
      html+=`<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">`;
      teamsList.forEach((team,ti)=>{
        const captain=team.captain||'(미지정)';
        const captainSet=!!team.captain;
        html+=`<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:6px;">${team.name}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:6px;">
            🚩 팀장: <span style="color:${captainSet?'var(--primary)':'var(--warn)'};font-weight:700;">${captain}</span>
            ${isAdmin?`<button onclick="bdEditTeamCaptain('${id}',${ti})" style="margin-left:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:.68rem;cursor:pointer;color:var(--text-muted);">수정</button>`:''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${(team.members||[]).map(m=>`<span style="font-size:.74rem;background:var(--bg3);border-radius:12px;padding:2px 8px;">${m}</span>`).join('')}
          </div>
        </div>`;
      });
      html+=`</div>`;
    }
    if(teamRounds.length){
      html+=_renderTeamRounds(teamRounds);
    }
  }
  if(!groups.length&&!knockout.length&&!teamsList.length&&!teamRounds.length){
    if(bt.status==='balance'){
      html+=_renderBalanceSavedView(bt, data);
    } else {
      html+=`<div class="empty-state"><div class="empty-icon">📋</div><div>아직 대회 데이터가 없습니다</div></div>`;
    }
  }
  contentEl.innerHTML=html;
  if(actionsEl) actionsEl.innerHTML=`<button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>`;
  openModal('modal-bracket-detail');
}



// ── 저장된 밸런스 상세 뷰 ──
function _renderBalanceSavedView(bt, data){
  const tType=bt.tournament_type||'individual';
  const isTeam=tType==='team';
  const isDuo=tType==='duo';
  const pal=['#5B9CF6','#F59E0B','#10B981','#F472B6','#A78BFA','#34D399'];

  // score 보완: 저장된 score가 없으면 _balUserPool에서 찾음
  const _scoreByName=(name,savedScore)=>{
    if(savedScore) return savedScore;
    const u=(window._balUserPool||[]).find(x=>x.name===name);
    return u?.score||0;
  };

  let groups=[], scores=[];
  if(isTeam){
    (data.teams||[]).forEach(t=>{
      // players 배열(score 포함) 우선, 없으면 members 이름만
      const rawPlayers=t.players||(t.members||[]).map(n=>({name:n,score:0}));
      const players=rawPlayers.map(p=>({...p,score:_scoreByName(p.name,p.score)}));
      const avg=players.length?Math.round(players.reduce((s,p)=>s+(p.score||0),0)/players.length):0;
      groups.push({name:t.name,players,captain:t.captain,isTeam:true});
      scores.push(avg);
    });
  } else {
    (data.groups||[]).forEach(g=>{
      if(isDuo){
        const pairs=(g.teams||[]).map(t=>({
          ...t,
          p1_score:_scoreByName(t.p1_name,t.p1_score),
          p2_score:t.p2_name?_scoreByName(t.p2_name,t.p2_score):0,
        }));
        const avg=pairs.length?Math.round(pairs.reduce((s,t)=>{
          const s1=t.p1_score||0, s2=t.p2_score||0;
          return s+(s1+(t.p2_name?s2:0))/(t.p2_name?2:1);
        },0)/pairs.length):0;
        groups.push({name:g.name,pairs,isDuo:true});
        scores.push(avg);
      } else {
        const players=(g.players||[]).map(p=>({...p,score:_scoreByName(p.name,p.score)}));
        const avg=players.length?Math.round(players.reduce((s,p)=>s+(p.score||0),0)/players.length):0;
        groups.push({name:g.name,players,isDuo:false});
        scores.push(avg);
      }
    });
  }

  const grade=_calcBalanceGrade(scores);
  const maxSc=Math.max(...scores,1);

  let html=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">`;
  html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <div style="font-size:.88rem;font-weight:700;">밸런스 평가</div>
    <div style="font-size:.86rem;font-weight:700;color:${grade.color};">${grade.label} <span style="font-weight:400;color:var(--text-muted);">(${grade.pct}점)</span></div>
  </div>
  <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:14px;">
    <div style="height:100%;width:${grade.pct}%;background:${grade.color};border-radius:3px;"></div>
  </div>`;

  groups.forEach((g,gi)=>{
    const color=pal[gi%pal.length];
    const pct=maxSc>0?Math.round(scores[gi]/maxSc*100):0;
    html+=`<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:.92rem;font-weight:700;color:${color};">${g.name}</div>
        <div style="font-size:.84rem;font-weight:700;color:${color};">평균 ${rpDisp(scores[gi])}</div>
      </div>
      <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    if(g.isTeam){
      (g.players||[]).forEach(p=>{
        html+=`<div style="display:flex;align-items:center;gap:5px;background:var(--bg3);border-radius:8px;padding:6px 12px;">
          <span style="font-size:.92rem;font-weight:600;">${p.name}${p.name===g.captain?'⭐':''}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(p.score||0)}</span>
        </div>`;
      });
    } else if(g.isDuo){
      (g.pairs||[]).forEach(t=>{
        html+=`<div style="background:var(--bg3);border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
          <span style="font-size:.92rem;font-weight:600;">${t.p1_name}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(t.p1_score||0)}</span>
          ${t.p2_name?`<span style="font-size:.78rem;color:var(--text-dim);">/</span>
          <span style="font-size:.92rem;font-weight:600;">${t.p2_name}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(t.p2_score||0)}</span>`:''}
        </div>`;
      });
    } else {
      (g.players||[]).forEach(p=>{
        html+=`<div style="display:flex;align-items:center;gap:5px;background:var(--bg3);border-radius:8px;padding:6px 12px;">
          <span style="font-size:.92rem;font-weight:600;">${p.name}</span>
          <span style="font-size:.78rem;color:var(--text-muted);">${rpDisp(p.score||0)}</span>
        </div>`;
      });
    }
    html+=`</div></div>`;
  });
  html+=`</div>`;
  return html;
}

// ── 팀장 수정 ──
async function bdEditTeamCaptain(btId, teamIdx){
  const{data:bt}=await sb.from('bracket_tournaments').select('groups').eq('id',btId).single();
  if(!bt){toast('대회 정보 없음','error');return;}
  const rawG2=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG2)?{}:rawG2;
  const teams=data.teams||[];
  const team=teams[teamIdx];
  if(!team){toast('팀 정보 없음','error');return;}
  const members=team.members||[];
  if(!members.length){toast('팀원이 없습니다','error');return;}

  // 팝업: 팀원 목록에서 팀장 선택
  const btIdSafe=btId.replace(/[^a-zA-Z0-9_-]/g,'');
  const modalHtml=`
    <div style="background:var(--modal-bg,var(--surface));border-radius:16px;padding:20px;max-width:320px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.4);">
      <div style="font-weight:700;font-size:.95rem;margin-bottom:4px;">🚩 팀장 지정 — ${team.name}</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:14px;">현재: ${team.captain||'미지정'}</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
        ${members.map(m=>`
          <button onclick="bdSetTeamCaptain('${btId}',${teamIdx},'${m}')" style="background:${team.captain===m?'var(--primary)':'var(--bg2)'};color:${team.captain===m?'#fff':'var(--text)'};border:1.5px solid ${team.captain===m?'var(--primary)':'var(--border)'};border-radius:8px;padding:9px 14px;font-size:.88rem;font-weight:600;cursor:pointer;text-align:left;font-family:inherit;">
            ${team.captain===m?'✅ ':''}${m}
          </button>`).join('')}
      </div>
      <button onclick="document.getElementById('captain-pick-modal').remove()" class="btn btn-ghost" style="width:100%;">닫기</button>
    </div>`;
  let overlay=document.getElementById('captain-pick-modal');
  if(overlay) overlay.remove();
  overlay=document.createElement('div');
  overlay.id='captain-pick-modal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML=modalHtml;
  overlay.addEventListener('click',e=>{if(e.target===overlay) overlay.remove();});
  document.body.appendChild(overlay);
}

async function bdSetTeamCaptain(btId, teamIdx, captainName){
  document.getElementById('captain-pick-modal')?.remove();
  const{data:bt}=await sb.from('bracket_tournaments').select('groups').eq('id',btId).single();
  if(!bt) return;
  const rawG3=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG3)?{}:rawG3;
  const teams=data.teams||[];
  if(!teams[teamIdx]) return;
  teams[teamIdx].captain=captainName;
  data.teams=teams;
  const{error}=await sb.from('bracket_tournaments').update({groups:JSON.stringify(data)}).eq('id',btId);
  if(error){toast('저장 실패','error');return;}
  toast(`✅ ${teams[teamIdx].name} 팀장: ${captainName}`,'success');
  openBracketDetail(btId);
}

// ── 본선 토너먼트 시각화 ──
function _renderKnockoutBracket(knockout){
  // 라운드별 카드 레이아웃
  let html=`<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">`;
  knockout.forEach(round=>{
    const label=round.label||'라운드';
    const stageColor={'8강':'var(--info)','4강':'var(--warn)','결승':'#FFD700'}[label]||'var(--primary)';
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">`;
    html+=`<div style="font-weight:700;font-size:.82rem;color:${stageColor};margin-bottom:8px;display:flex;align-items:center;gap:6px;">`;
    html+=`<span style="background:${stageColor};color:#fff;border-radius:4px;padding:1px 8px;font-size:.72rem;">${label}</span></div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:6px;">`;
    (round.matches||[]).forEach(m=>{
      const n1=_tl(m.t1)||'TBD', n2=_tl(m.t2)||'TBD';
      const isBye=m.bye||(n2==='BYE');
      const done=m.done&&!isBye;
      const w1=done&&parseInt(m.s1)>parseInt(m.s2);
      const w2=done&&!w1;
      if(isBye){
        html+=`<div style="display:flex;align-items:center;gap:8px;background:var(--surface);border-radius:8px;padding:8px 10px;border:1px dashed var(--border);">
          <span style="font-size:.8rem;font-weight:700;flex:1;">${n1}</span>
          <span style="font-size:.72rem;background:rgba(255,152,0,.15);color:var(--warn);border-radius:12px;padding:2px 8px;">부전승 🟡</span>
        </div>`;
      } else {
        const slotBadge=m.slot?`<span style="font-size:.68rem;color:var(--text-muted);background:var(--bg3);border-radius:4px;padding:1px 5px;margin-left:4px;">${m.slot}</span>`:'';
        html+=`<div style="background:var(--surface);border-radius:8px;border:1px solid var(--border);overflow:hidden;">
          <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--border);${w1?'background:rgba(41,121,255,.06);':''}">
            <span style="font-size:.8rem;flex:1;${w1?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n1}${slotBadge}</span>
            <span style="font-size:.9rem;font-weight:900;color:${done?'var(--primary)':'var(--text-muted)'};min-width:28px;text-align:right;">${done?m.s1:'—'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;${w2?'background:rgba(41,121,255,.06);':''}">
            <span style="font-size:.8rem;flex:1;${w2?'font-weight:700;color:var(--text);':'color:var(--text-muted);'}">${n2}</span>
            <span style="font-size:.9rem;font-weight:900;color:${done?'var(--primary)':'var(--text-muted)'};min-width:28px;text-align:right;">${done?m.s2:'—'}</span>
          </div>
        </div>`;
      }
    });
    html+=`</div></div>`;
  });
  html+=`</div>`;
  return html;
}

// ── 팀전 라운드 시각화 ──
function _renderTeamRounds(rounds){
  // 팀 색상: A팀 파랑, B팀 주황 — 강조는 최소화
  const CA={c:'#5B9CF6',dim:'rgba(91,156,246,.15)'};
  const CB={c:'#F59E0B',dim:'rgba(245,158,11,.15)'};

  // 선수별 스탯 수집
  const playerSide={}, playerStats={};
  rounds.forEach(r=>{
    (r.matches||[]).forEach(m=>{
      const p1s=[m.t1?.p1_name,m.t1?.p2_name].filter(Boolean);
      const p2s=[m.t2?.p1_name,m.t2?.p2_name].filter(Boolean);
      p1s.forEach(n=>{if(!playerSide[n])playerSide[n]='A';});
      p2s.forEach(n=>{if(!playerSide[n])playerSide[n]='B';});
      if(m.done&&m.s1!==null){
        const s1=parseInt(m.s1),s2=parseInt(m.s2),aWin=s1>s2;
        [...p1s,...p2s].forEach(n=>{if(!playerStats[n])playerStats[n]={wins:0,losses:0,pf:0,pa:0,team:playerSide[n]||'A'};});
        p1s.forEach(n=>{if(!playerStats[n])return;playerStats[n].pf+=s1;playerStats[n].pa+=s2;if(aWin)playerStats[n].wins++;else playerStats[n].losses++;});
        p2s.forEach(n=>{if(!playerStats[n])return;playerStats[n].pf+=s2;playerStats[n].pa+=s1;if(!aWin)playerStats[n].wins++;else playerStats[n].losses++;});
      }
    });
  });

  // 라운드별 승패
  const roundSummary=rounds.map(r=>{
    let aW=0,bW=0;
    (r.matches||[]).forEach(m=>{if(!m.done||m.s1===null)return;parseInt(m.s1)>parseInt(m.s2)?aW++:bW++;});
    return {label:r.label||'R?',aWins:aW,bWins:bW};
  });
  const totalA=roundSummary.reduce((s,r)=>s+r.aWins,0);
  const totalB=roundSummary.reduce((s,r)=>s+r.bWins,0);
  const winner=totalA>totalB?'A':totalA<totalB?'B':null;
  let diffA=0,diffB=0;
  rounds.forEach(r=>{(r.matches||[]).forEach(m=>{if(!m.done||m.s1===null)return;diffA+=parseInt(m.s1)-parseInt(m.s2);diffB+=parseInt(m.s2)-parseInt(m.s1);});});

  let html=`<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">`;

  // ── 스코어보드 ──
  const winnerBorder=winner?`border:1.5px solid ${winner==='A'?CA.c:CB.c};`:'border:1px solid var(--border);';
  html+=`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0;background:var(--bg2);border-radius:12px;overflow:hidden;${winnerBorder}">
    <div style="text-align:center;padding:14px 10px;background:${totalA>totalB?CA.dim:'transparent'};">
      <div style="font-size:.7rem;font-weight:700;color:${CA.c};letter-spacing:.08em;margin-bottom:4px;">A팀</div>
      <div style="font-size:2rem;font-weight:900;color:${totalA>totalB?CA.c:'var(--text)'};line-height:1;">${totalA}</div>
      <div style="font-size:.68rem;color:var(--text-muted);margin-top:3px;">${diffA>=0?'+':''}${diffA} 득실</div>
    </div>
    <div style="padding:0 14px;font-size:.72rem;color:var(--text-muted);font-weight:600;">vs</div>
    <div style="text-align:center;padding:14px 10px;background:${totalB>totalA?CB.dim:'transparent'};">
      <div style="font-size:.7rem;font-weight:700;color:${CB.c};letter-spacing:.08em;margin-bottom:4px;">B팀</div>
      <div style="font-size:2rem;font-weight:900;color:${totalB>totalA?CB.c:'var(--text)'};line-height:1;">${totalB}</div>
      <div style="font-size:.68rem;color:var(--text-muted);margin-top:3px;">${diffB>=0?'+':''}${diffB} 득실</div>
    </div>
  </div>`;

  // ── 라운드별 카드 ──
  rounds.forEach((round,ri)=>{
    const rs=roundSummary[ri];
    const rAW=rs.aWins>rs.bWins, rBW=rs.bWins>rs.aWins;
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;">`;
    // 라운드 헤더
    html+=`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:6px 12px;border-bottom:1px solid var(--border);">
      <div style="font-size:.78rem;font-weight:700;color:${rAW?CA.c:'var(--text-muted)'};">${rs.aWins}승</div>
      <div style="font-size:.74rem;color:var(--text-muted);font-weight:600;padding:0 10px;">${rs.label}</div>
      <div style="font-size:.78rem;font-weight:700;color:${rBW?CB.c:'var(--text-muted)'};text-align:right;">${rs.bWins}승</div>
    </div>`;
    // 개별 경기
    (round.matches||[]).forEach((m,mi)=>{
      const n1=_tl(m.t1)||'TBD', n2=_tl(m.t2)||'TBD';
      const done=m.done&&m.s1!==null;
      const w1=done&&parseInt(m.s1)>parseInt(m.s2), w2=done&&!w1;
      const sep=mi>0?'border-top:1px solid var(--border);':'';
      html+=`<div style="display:grid;grid-template-columns:1fr 52px 1fr;align-items:center;${sep}">
        <div style="padding:9px 12px;display:flex;align-items:center;gap:6px;">
          <div style="width:2px;height:18px;background:${w1?CA.c:'var(--border)'};border-radius:1px;flex-shrink:0;"></div>
          <span style="font-size:.8rem;${w1?`font-weight:700;color:var(--text);`:'color:var(--text-muted);'}">${n1}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:3px;border-left:1px solid var(--border);border-right:1px solid var(--border);height:100%;padding:6px 0;">
          <span style="font-size:.9rem;font-weight:800;color:${w1?CA.c:done?'var(--text-muted)':'var(--text-muted)'};">${done?m.s1:'—'}</span>
          <span style="font-size:.65rem;color:var(--text-dim);">:</span>
          <span style="font-size:.9rem;font-weight:800;color:${w2?CB.c:done?'var(--text-muted)':'var(--text-muted)'};">${done?m.s2:'—'}</span>
        </div>
        <div style="padding:9px 12px;display:flex;align-items:center;justify-content:flex-end;gap:6px;">
          <span style="font-size:.8rem;${w2?`font-weight:700;color:var(--text);`:'color:var(--text-muted);'}">${n2}</span>
          <div style="width:2px;height:18px;background:${w2?CB.c:'var(--border)'};border-radius:1px;flex-shrink:0;"></div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  });

  // ── 개인별 전적 ──
  const players=Object.entries(playerStats).sort((a,b)=>a[1].team!==b[1].team?(a[1].team==='A'?-1:1):b[1].wins-a[1].wins);
  if(players.length){
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
      <div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">📋 개인별 전적</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
    ['A','B'].forEach(side=>{
      const T=side==='A'?CA:CB;
      const sp=players.filter(([,s])=>s.team===side);
      html+=`<div>
        <div style="font-size:.7rem;font-weight:700;color:${T.c};margin-bottom:5px;padding-bottom:4px;border-bottom:1.5px solid ${T.c}40;">${side}팀</div>`;
      sp.forEach(([name,s])=>{
        const total=s.wins+s.losses, diff=s.pf-s.pa;
        html+=`<div style="display:flex;align-items:center;gap:4px;padding:4px 0;border-bottom:1px solid var(--border);">
          <span style="flex:1;font-size:.76rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
          <span style="font-size:.68rem;color:var(--text-muted);">${total}전</span>
          <span style="font-size:.7rem;font-weight:700;color:${T.c};">${s.wins}승</span>
          <span style="font-size:.68rem;color:var(--text-muted);">${s.losses}패</span>
          <span style="font-size:.67rem;color:${diff>=0?T.c:'var(--danger)'};">${diff>=0?'+':''}${diff}</span>
        </div>`;
      });
      html+=`</div>`;
    });
    html+=`</div></div>`;
  }

  // ── 우승 배너 ──
  if(winner){
    const T=winner==='A'?CA:CB;
    html+=`<div style="text-align:center;background:${T.dim};border:1.5px solid ${T.c}60;border-radius:10px;padding:10px;">
      <span style="font-size:.88rem;font-weight:800;color:${T.c};">🏆 ${winner}팀 우승 &nbsp;${winner==='A'?totalA:totalB} : ${winner==='A'?totalB:totalA}</span>
    </div>`;
  } else if(totalA+totalB>0){
    html+=`<div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
      <span style="font-size:.82rem;font-weight:700;color:var(--text-muted);">🤝 무승부 &nbsp;${totalA} : ${totalB}</span>
    </div>`;
  }

  html+=`</div>`;
  return html;
}


async function bdSaveMatchScore(btId,gi,mi){
  const s1=parseInt(document.getElementById(`bd-s1-${gi}-${mi}`)?.value);
  const s2=parseInt(document.getElementById(`bd-s2-${gi}-${mi}`)?.value);
  if(isNaN(s1)||isNaN(s2)){toast('점수를 입력하세요','error');return;}
  if(s1===s2){toast('동점은 불가','error');return;}
  const{data:bt}=await sb.from('bracket_tournaments').select('groups').eq('id',btId).single();
  if(!bt){toast('대회 정보 없음','error');return;}
  const rawG4=bt.groups?(typeof bt.groups==='string'?JSON.parse(bt.groups||'{}'):bt.groups):{};
  const data=Array.isArray(rawG4)?{groups:rawG4}:rawG4;
  if(!data.groups?.[gi]?.matches?.[mi]){toast('경기 정보 없음','error');return;}
  data.groups[gi].matches[mi].s1=s1;data.groups[gi].matches[mi].s2=s2;data.groups[gi].matches[mi].done=true;
  await sb.from('bracket_tournaments').update({groups:JSON.stringify(data)}).eq('id',btId);
  toast('✅ 저장 완료','success');openBracketDetail(btId);
}

// ── 목록 렌더 ──
async function renderBracketPage(){
  // btn-add-bracket 미사용 (대회만들기 비활성)
  const importBtn=document.getElementById('btn-bulk-import');
  if(importBtn) importBtn.style.display=ME?.role==='admin'?'block':'none';
  // btn-balance 미사용 (별도 탭으로 이동)
  const el=document.getElementById('bracket-list');
  if(!el) return;
  el.innerHTML=`<div class="skeleton sk-card"></div>`.repeat(3);
  const{data:list}=await sb.from('bracket_tournaments').select('*').neq('status','balance').order('created_at',{ascending:false});
  if(!list||!list.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🎯</div><div>등록된 대회가 없어요</div></div>`;
    return;
  }
  const typeLabel={individual:'👤 개인전',duo:'👥 듀오전',team:'🚩 팀장전'};
  el.innerHTML=list.map(bt=>{
    const isDone=bt.status==='done';
    const isLeague=bt.status==='league'||bt.status==='active';
    const isPlan=bt.status==='plan';
    const isBalance=bt.status==='balance';
    const isAdmin=ME?.role==='admin';
    const tLabel=typeLabel[bt.tournament_type]||'대회';
    return `<div class="card" style="margin-bottom:12px;cursor:pointer;${isBalance?'border-left:3px solid #00C896;':''}" onclick="openBracketDetail('${bt.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:.95rem;margin-bottom:3px;">${bt.name}</div>
          <div style="font-size:.78rem;color:var(--text-muted);">📅 ${fmtMatchDate(bt.match_date)} · ${tLabel}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:.75rem;padding:3px 10px;border-radius:12px;font-weight:700;
            background:${isBalance?'rgba(0,200,150,.12)':isDone?'rgba(41,121,255,.12)':isLeague?'rgba(41,121,255,.15)':'rgba(255,152,0,.12)'};
            color:${isBalance?'#00C896':isDone?'var(--primary)':isLeague?'var(--info)':'var(--warn)'};">
            ${isBalance?'⚖️':isDone?'완료':isLeague?'진행중':isPlan?'배분중':'준비중'}
          </span>
          ${isAdmin?`<button onclick="event.stopPropagation();deleteBracket('${bt.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.8rem;padding:2px 6px;">✕</button>`:''}
        </div>
      </div>
      ${isDone&&bt.winner_name?`<div style="font-size:.8rem;color:var(--primary);margin-top:6px;">🏆 ${bt.winner_name}</div>`:''}
    </div>`;
  }).join('');
}

async function deleteBracket(id){
  // 연관 경기 수 미리 확인
  const{data:bt}=await sb.from('bracket_tournaments').select('name,match_date,groups').eq('id',id).single();
  if(!bt) return;
  // 대회 날짜로 경기 추정 (match_date 동일 건)
  const{data:relMatches}=await sb.from('matches').select('id').eq('match_date',bt.match_date).eq('status','approved');
  const relCount=relMatches?.length||0;
  const msg=relCount>0
    ?`"${bt.name}" 대회와 같은 날짜의 경기내역 ${relCount}건도 함께 삭제됩니다.\n삭제하면 복구할 수 없습니다.`
    :`"${bt.name}" 대회를 삭제합니다. 복구할 수 없습니다.`;
  showConfirm({icon:'🗑️',title:'대회 삭제',msg,okLabel:'삭제',okClass:'btn-danger',onOk:async()=>{
    // 1. 연관 경기 삭제
    if(relCount>0){
      const ids=(relMatches||[]).map(m=>m.id);
      await sb.from('matches').delete().in('id',ids);
    }
    // 2. 대회 삭제
    await sb.from('bracket_tournaments').delete().eq('id',id);
    addLog(`대회 삭제: ${bt.name} (경기 ${relCount}건 포함)`,ME.id);
    toast(`삭제 완료 (경기 ${relCount}건 포함)`,'warning');
    renderBracketPage();
  }});
}

// ══════════════════
//  STEP 1: 폼 토글 & 참석자 선택
// ══════════════════

// ══════════════════════════════════════════════════════════
//  ⚖️  밸런스 비교  (관리자 전용 · 대회 탭)
// ══════════════════════════════════════════════════════════

let _balType      = 'individual';
let _balAttendees = [];   // [{id,name,score(=CI),ci,wins,losses,games,diff,...}]
let _balResult    = null; // 배분 결과
let _balDuoPairs  = [];   // [{p1,p2}] 듀오 페어 (수동 구성)

// ── 밸런스 페이지 진입 ──
let _balCurrentTab='compare';
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
    activeUsers.forEach(u=>{stats[u.id]={id:u.id,name:u.name,isGuest:false,games:0,wins:0,scored:0,conceded:0};});
    // 비회원(id없음, 게스트모드 제외) 수집
    const guestModeNames=window._guestModeNamesCache||await _loadGuestModeNames();
    const guestStats={};
    matches.forEach(m=>{
      const aWin=m.score_a>m.score_b;
      // 정회원 (id 기반)
      [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
       {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
      .filter(p=>p.id&&stats[p.id]).forEach(p=>{
        stats[p.id].games++;if(p.win)stats[p.id].wins++;
        stats[p.id].scored+=p.s;stats[p.id].conceded+=p.c;
      });
      // 비회원 (이름 기반, id없음, 게스트모드 제외, 회원이름 제외)
      [{n:m.a1_name,id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},
       {n:m.a2_name,id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
       {n:m.b1_name,id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},
       {n:m.b2_name,id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
      .filter(p=>p.n&&!p.id&&!memberNames.has(p.n)&&!guestModeNames.has(p.n))
      .forEach(p=>{
        if(!guestStats[p.n]) guestStats[p.n]={id:'guest:'+p.n,name:p.n,isGuest:true,games:0,wins:0,scored:0,conceded:0};
        guestStats[p.n].games++;if(p.win)guestStats[p.n].wins++;
        guestStats[p.n].scored+=p.s;guestStats[p.n].conceded+=p.c;
      });
    });
    const allStats=[...Object.values(stats),...Object.values(guestStats)];
    window._balUserPool=allStats.map(u=>{
      const diff=u.scored-u.conceded;
      const ci=Math.round(calcCI(u.wins,u.games,diff));
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

/* ── 설정 페이지 렌더 ── */
async function renderSettingsPage(){
  // 글자 크기 UI 동기화
  applyFontScale(_fontStepIdx, false);

  // 아바타
  const avatarEl=document.getElementById('settings-avatar');
  if(avatarEl){
    if(ME.avatar_url){
      avatarEl.innerHTML=`<img src="${ME.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      avatarEl.textContent=ME.name?.[0]||'?';
    }
  }
  // 이름/이메일
  const nameEl=document.getElementById('settings-name');
  const emailEl=document.getElementById('settings-email');
  if(nameEl) nameEl.textContent=ME.name||'';
  const genderLabel=ME.gender==='female'?'여성':ME.gender==='male'?'남성':'';
  if(emailEl) emailEl.textContent=[ME.email,genderLabel].filter(Boolean).join(' · ');

  // 다크모드 버튼
  const dmBtn=document.getElementById('darkmode-settings-btn');
  if(dmBtn){
    const isLight=document.body.classList.contains('light-mode');
    dmBtn.textContent=isLight?'🌙 다크로 변경':'☀️ 라이트로 변경';
  }
}

/* ── 아바타 업로드 ── */
async function uploadAvatar(input){
  let file=input.files[0];
  if(!file) return;
  input.value='';

  if(file.size>2*1024*1024){
    toast('이미지 최적화 중...','info');
    file=await new Promise(resolve=>{
      const img=new Image();
      const url=URL.createObjectURL(file);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const MAX=1200;
        let w=img.width,h=img.height;
        if(w>h&&w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        else if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        canvas.toBlob(blob=>resolve(new File([blob],'avatar.jpg',{type:'image/jpeg'})),'image/jpeg',0.88);
      };
      img.src=url;
    });
  }

  toast('업로드 중...','info');
  try{
    const path=`${ME.id}/avatar.jpg`;
    let{error:upErr}=await sb.storage.from('avatars').upload(path,file,{
      contentType:'image/jpeg',cacheControl:'0',upsert:true
    });
    if(upErr&&(upErr.message?.includes('already exists')||upErr.statusCode==='409'||upErr.error==='Duplicate')){
      await sb.storage.from('avatars').remove([path]).catch(()=>{});
      const{error:upErr2}=await sb.storage.from('avatars').upload(path,file,{contentType:'image/jpeg',cacheControl:'0'});
      upErr=upErr2;
    }
    if(upErr) throw upErr;

    const{data}=sb.storage.from('avatars').getPublicUrl(path);
    const url=data.publicUrl+'?t='+Date.now();
    await sb.from('profiles').update({avatar_url:url}).eq('id',ME.id);
    ME.avatar_url=url;

    const avatarEl=document.getElementById('settings-avatar');
    if(avatarEl) avatarEl.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    const hdrAvatar=document.getElementById('hdr-avatar');
    if(hdrAvatar) hdrAvatar.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    _usersCache=[];
    toast('✅ 프로필 사진이 업데이트됐어요!','success');
  }catch(e){
    console.error(e);
    const msg=e.message?.includes('row-level security')||e.message?.includes('policy')
      ?'저장 권한 오류 — Supabase Storage 버킷 RLS 정책을 확인해주세요'
      :'업로드 실패: '+e.message;
    toast(msg,'error');
  }
}
