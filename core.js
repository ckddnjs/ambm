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
let _explicitLogout=false; // 명시적 로그아웃 여부 (네트워크 오류 구분용)
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
  // 안전 타이머: 2초 안에 ready 안 붙으면 강제 표시
  const _safetyTimer=setTimeout(()=>{
    if(!handled){
      console.warn('[AMBM] safety timer triggered - forcing ready');
      handled=true;
      initTheme();initFontScale();document.body.classList.add('ready');
      fadeOutLoading();
      ME?showApp():showLogin();
    }
  },2000);
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='INITIAL_SESSION'){
      // PWA 재시작 시 저장된 세션 복원
      if(handled) return;
      try{
        if(session?.user) await loadProfile(session.user);
      } catch(e){
        console.warn('[AMBM] INITIAL_SESSION loadProfile err',e);
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
      // INITIAL_SESSION 이후 중복 실행 방지
      if(handled&&ME) return;
      // 이메일 로그인은 직접 처리
      if(session?.user?.app_metadata?.provider==='email'&&handled) return;
      try{
        if(session?.user) await loadProfile(session.user);
      } catch(e){
        console.error('[AMBM] loadProfile error on SIGNED_IN',e);
        ME=null;
      }
      document.body.classList.add('ready');
      await fadeOutLoading();
      if(!ME){showLogin();return;}
      if(ME.status==='approved'){showApp();if(!handled)toast(`어서오세요, ${ME.name}님! 🏸`,'success');}
      else if(ME.status==='pending'){showPendingScreen(ME.name);toast('승인 대기 중입니다','warning');}
      else{showLogin();toast('이용 불가 계정','error');await sb.auth.signOut();ME=null;}
    } else if(event==='SIGNED_OUT'){
      // ⚠️ 네트워크 오류 SIGNED_OUT → 최대 3회 자동 복구 시도
      if(!_explicitLogout){
        let _recovered=false;
        const _retryDelays=[1000,3000,6000];
        const _tryRecover=async(attempt)=>{
          if(_recovered||attempt>=_retryDelays.length){
            if(!_recovered){ME=null;document.body.classList.add('ready');showLogin();}
            return;
          }
          setTimeout(async()=>{
            try{
              const{data:{session:s}}=await sb.auth.getSession();
              if(s?.user){
                await loadProfile(s.user);
                if(ME?.status==='approved'){_recovered=true;return;}
              }
            }catch(e){}
            _tryRecover(attempt+1);
          },_retryDelays[attempt]);
        };
        _tryRecover(0);
        return;
      }
      ME=null;_explicitLogout=false;
      document.body.classList.add('ready');
      showLogin();
    } else if(event==='TOKEN_REFRESHED'){
      // 토큰 갱신 성공 — 이미 로그인 상태면 유지
      if(session?.user&&ME&&session.user.id===ME.id) return;
      try{ if(session?.user) await loadProfile(session.user); }catch(e){}
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
  },1500);
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
  {size:13,label:'작게',    sub:'기본보다 작음'},
  {size:15,label:'보통',    sub:'기본 크기'},
  {size:17,label:'크게',    sub:'기본보다 큼'},
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
  // PWA status bar 색상 동적 업데이트
  const tc=document.getElementById('meta-theme-color');
  if(tc) tc.content=isLight?'#F8FAFC':'#0A0E1A';
  const cs=document.getElementById('meta-color-scheme');
  if(cs) cs.content=isLight?'light':'dark';
  document.documentElement.style.colorScheme=isLight?'light':'dark';
  setTimeout(()=>document.body.style.transition='',350);
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
  const tc=document.getElementById('meta-theme-color');
  if(tc) tc.content=isLight?'#F8FAFC':'#0A0E1A';
  const cs=document.getElementById('meta-color-scheme');
  if(cs) cs.content=isLight?'light':'dark';
  document.documentElement.style.colorScheme=isLight?'light':'dark';
}
async function doLogout(){
  if(ME) addLog(`로그아웃: ${ME.name}`,ME.id);
  _explicitLogout=true;
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
async function doLogoutFromPending(){_explicitLogout=true;await sb.auth.signOut();ME=null;document.getElementById('pending-screen')?.remove();showLogin();}
function switchTab(t){
  document.querySelectorAll('.login-tab').forEach((el,i)=>el.classList.toggle('active',(i===0&&t==='login')||(i===1&&t==='signup')));
  document.querySelectorAll('.login-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
}

/* ── INIT ── */
/* ── 날씨 (Open-Meteo fallback) ── */
const _WX_LAT=36.3543, _WX_LON=127.3782; // 대전 서구 둔산동
function _wxEmojiFromWmo(code,isDay){
  const d=(typeof isDay==='number')?isDay===1:((new Date().getHours())>=6&&(new Date().getHours())<20);
  const c=Number(code)||0;
  if(c===0) return d?'☀️':'🌙';
  if(c<=2)  return d?'🌤️':'☁️';
  if(c===3) return '☁️';
  if(c===45||c===48) return '🌫️';
  if(c>=51&&c<=57) return '🌦️';
  if(c>=61&&c<=67) return '🌧️';
  if(c>=71&&c<=77) return '🌨️';
  if(c>=80&&c<=82) return '🌧️';
  if(c>=85&&c<=86) return '🌨️';
  if(c>=95) return '⛈️';
  return d?'☀️':'🌙';
}
async function _updateHeaderWeather(){
  const el=document.getElementById('hdr-weather');
  if(!el) return;
  try{
    const cached=JSON.parse(localStorage.getItem('wx_ambm_v1')||'null');
    if(cached&&Date.now()-cached.ts<60000){
      el.innerHTML=`<span>${cached.emoji}</span><span style="font-weight:600;">${cached.temp}°</span>`;
      return;
    }
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${_WX_LAT}&longitude=${_WX_LON}&current=temperature_2m,weathercode,is_day&timezone=Asia%2FSeoul`;
    const res=await fetch(u);
    const j=await res.json();
    const cur=j?.current;
    if(!cur) throw new Error('no data');
    const emoji=_wxEmojiFromWmo(cur.weathercode,cur.is_day);
    const temp=Math.round(cur.temperature_2m);
    localStorage.setItem('wx_ambm_v1',JSON.stringify({emoji,temp,ts:Date.now()}));
    el.innerHTML=`<span>${emoji}</span><span style="font-weight:600;">${temp}°</span>`;
  }catch(e){ el.textContent=''; }
}
let _wxInterval=null;
function _startWeatherInterval(){
  if(_wxInterval) clearInterval(_wxInterval);
  _wxInterval=setInterval(_updateHeaderWeather,60000);
}

function initApp(){
  refreshHeader();buildNav();
  document.getElementById('reg-date').value=todayStr();
  // 일괄등록: 관리자만
  const commWriteBtn=document.getElementById('btn-comm-write');
  if(commWriteBtn) commWriteBtn.style.display=(ME?.role==='admin'||ME?.role==='writer')?'':'none';
  // 기록 등록버튼: 관리자만 표시
  const feedRegBtn=document.getElementById('btn-feed-register');
  if(feedRegBtn) feedRegBtn.style.display=ME?.role==='admin'?'':'none';
  // 날씨 시작
  _updateHeaderWeather();
  _startWeatherInterval();
  goHome();
}
function refreshHeader(){if(!ME) return; const el=document.getElementById('hdr-name'); if(el) el.textContent=ME.name;}

const NAV_ICONS={
  dashboard:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
  feed:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
  tournament:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zm-2 3c0 1.65-1.35 3-3 3s-3-1.35-3-3V5h6v3zM5 8V7h2v3.87C5.86 10.43 5 9.29 5 8zm14 0c0 1.29-.86 2.43-2 2.87V7h2v1z"/></svg>`,
  community:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`,
  balance:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>`,
  admin:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
  settings:`<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96a7.02 7.02 0 00-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.37 1.04.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
  register:`<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
};

const USER_NAVS=[
  {id:'dashboard',label:'홈'},
  {id:'feed',label:'기록'},
  {id:'register',label:'등록',fab:true},
  {id:'community',label:'소식'},
  {id:'settings',label:'설정'},
];
const ADMIN_NAVS=[
  {id:'dashboard',label:'홈'},
  {id:'feed',label:'기록'},
  {id:'register',label:'등록',fab:true},
  {id:'community',label:'소식'},
  {id:'settings',label:'설정'},
  {id:'admin',label:'관리'},
];
function buildNav(){
  const navs=ME.role==='admin'?ADMIN_NAVS:USER_NAVS;
  document.getElementById('bottom-nav').innerHTML=navs.map(n=>{
    if(n.fab){
      return `<button class="bottom-nav-item nav-fab" id="nav-${n.id}" onclick="navigateTo('register')">
        <div class="nav-fab-circle">${NAV_ICONS[n.id]||''}</div>
        <span>${n.label}</span>
      </button>`;
    }
    return `<button class="bottom-nav-item" id="nav-${n.id}" onclick="navigateTo('${n.id}')"><span class="nav-icon">${NAV_ICONS[n.id]||''}</span><span>${n.label}</span></button>`;
  }).join('');
}
function goHome(){navigateTo('dashboard');}
function navigateTo(page){
  currentPage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.getElementById('nav-'+page)?.classList.add('active');
  document.querySelector('.app-body').scrollTop=0;
  // feed 탭 이탈 시 스크롤 이벤트 정리
  if(page!=='feed' && typeof _detachFeedScroll==='function') _detachFeedScroll();
  switch(page){
    case 'dashboard':renderDashboard();break;
    case 'feed':
      // 이전 렌더 결과 초기화 후 새로 시작
      window._feedAllMatches=null;
      renderFeed();
      break;
    case 'register':
      renderRegisterPage();
      break;
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
