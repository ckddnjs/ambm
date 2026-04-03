/* ══════════════════════════════════════════

/* ══════════════════════════════════════
   🏸 반응속도 테스트
══════════════════════════════════════ */
let _rtState='idle';
let _rtStartTime=0;
let _rtTimer=null;
let _rtRound=0;
let _rtResults=[];
const _RT_ROUNDS=5;

// ── 글자 크기 조절 ──
const _FONT_STEPS = [
  {size: 14, label: '작게',   sub: '기본보다 작음'},
  {size: 15, label: '보통',   sub: '기본 크기'},
  {size: 17, label: '크게',   sub: '기본보다 큼'},
  {size: 19, label: '매우 크게', sub: '최대 크기'},
];
let _fontStepIdx = 1; // 기본: 보통(15px)

function applyFontScale(idx, save=true){
  idx = Math.max(0, Math.min(_FONT_STEPS.length-1, idx));
  _fontStepIdx = idx;
  const step = _FONT_STEPS[idx];
  document.documentElement.style.fontSize = step.size + 'px';
  if(save) localStorage.setItem('font_scale_idx', idx);
  const label = document.getElementById('font-scale-label');
  const sub   = document.getElementById('font-scale-sub');
  if(label) label.textContent = step.label;
  if(sub)   sub.textContent   = step.sub;
}

function adjustFontScale(delta){
  applyFontScale(_fontStepIdx + delta);
}

function initFontScale(){
  const saved = localStorage.getItem('font_scale_idx');
  applyFontScale(saved !== null ? parseInt(saved) : 1, false);
}

async function renderSettingsPage() {
  // 글자 크기 UI 동기화
  const step = _FONT_STEPS[_fontStepIdx];
  const label = document.getElementById('font-scale-label');
  const sub   = document.getElementById('font-scale-sub');
  if(label) label.textContent = step.label;
  if(sub)   sub.textContent   = step.sub;

  // 아바타 표시
  const avatarEl = document.getElementById('settings-avatar');
  if (avatarEl) {
    if (ME.avatar_url) {
      avatarEl.innerHTML = `<img src="${ME.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      avatarEl.textContent = ME.name?.[0] || '?';
    }
  }
  // 이름/이메일
  const nameEl = document.getElementById('settings-name');
  const emailEl = document.getElementById('settings-email');
  if(nameEl) nameEl.textContent = ME.name || '';
  const genderLabel = ME.gender==='female' ? '여성' : ME.gender==='male' ? '남성' : '';
  if(emailEl) emailEl.textContent = [ME.email, genderLabel].filter(Boolean).join(' · ');

  // 알림 상태
  const pushBtn = document.getElementById('push-toggle-settings');
  const pushText = document.getElementById('push-status-text');
  if (pushBtn && pushText) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      pushText.textContent = '앱으로 설치 후 이용 가능 (하단 참고)';
      pushBtn.textContent = '미지원';
      pushBtn.disabled = true;
    } else {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
      const on = Notification.permission === 'granted' && sub;
      pushText.textContent = on ? '✅ 알림이 켜져 있어요' : '알림이 꺼져 있어요';
      pushBtn.textContent = on ? '🔔 끄기' : '🔕 켜기';
      pushBtn.style.color = on ? 'var(--primary)' : 'var(--text)';
    }
  }

  // 다크모드 버튼
  const dmBtn = document.getElementById('darkmode-settings-btn');
  if (dmBtn) {
    const isLight = document.body.classList.contains('light-mode');
    dmBtn.textContent = isLight ? '🌙 다크로 변경' : '☀️ 라이트로 변경';
  }
}

/* 프로필 사진 업로드 */
async function uploadAvatar(input) {
  let file = input.files[0];
  if (!file) return;
  input.value = '';

  // 2MB 초과시 canvas로 자동 리사이즈
  if (file.size > 2 * 1024 * 1024) {
    toast('이미지 최적화 중...', 'info');
    file = await new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(new File([blob], 'avatar.jpg', {type:'image/jpeg'})), 'image/jpeg', 0.88);
      };
      img.src = url;
    });
  }

  toast('업로드 중...', 'info');
  try {
    const path = `${ME.id}/avatar.jpg`;
    // upsert:true 로 already-exists 에러 방지 (update 권한 없으면 삭제 후 재업로드)
    let { error: upErr } = await sb.storage.from('avatars').upload(path, file, {
      contentType: 'image/jpeg',
      cacheControl: '0',
      upsert: true
    });
    if (upErr && (upErr.message?.includes('already exists') || upErr.statusCode === '409' || upErr.error === 'Duplicate')) {
      // upsert 실패 시 삭제 후 재시도
      await sb.storage.from('avatars').remove([path]).catch(()=>{});
      const { error: upErr2 } = await sb.storage.from('avatars').upload(path, file, {
        contentType: 'image/jpeg',
        cacheControl: '0'
      });
      upErr = upErr2;
    }
    if (upErr) throw upErr;

    const { data } = sb.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl + '?t=' + Date.now();

    await sb.from('profiles').update({ avatar_url: url }).eq('id', ME.id);
    ME.avatar_url = url;

    // 아바타 즉시 반영 (설정 페이지)
    const avatarEl = document.getElementById('settings-avatar');
    if (avatarEl) {
      avatarEl.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
    // 헤더 아바타도 반영
    const hdrAvatar = document.getElementById('hdr-avatar');
    if (hdrAvatar) {
      hdrAvatar.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
    // 캐시 갱신
    _usersCache = [];

    toast('✅ 프로필 사진이 업데이트됐어요!', 'success');
  } catch(e) {
    console.error(e);
    const msg = e.message?.includes('row-level security') || e.message?.includes('policy')
      ? '저장 권한 오류 — Supabase Storage 버킷 RLS 정책을 확인해주세요'
      : '업로드 실패: ' + e.message;
    toast(msg, 'error');
  }
}

/* ══════════════════════════════════════
   🃏 선수 카드 모달
══════════════════════════════════════ */
async function showPlayerCard(userId) {
  const allMatches = window._allMatchesCache || [];
  // avatar_url 포함 여부 확인 후 필요시 DB 직접 조회
  let users = _usersCache.length ? _usersCache : [];
  const hasAvatar = users.some(u => 'avatar_url' in u && 'player_tag' in u);
  if(!users.length || !hasAvatar){
    const data = _usersCache.length ? _usersCache : [];
    users = data || [];
    if(users.length){ _usersCache = users; window._usersCache = users; }
  }
  // 개별 유저 avatar 보장
  let user = (users || []).find(u => u.id === userId);
  if(user && !('avatar_url' in user)){
    const {data:ud} = await sb.from('profiles').select('id,name,gender,avatar_url,exclude_stats,player_tag').eq('id',userId).single();
    if(ud) user = ud;
  }
  if (!user) return;

  // 스탯 계산
  const myMatches = allMatches.filter(m =>
    m.status === 'approved' && [m.a1_id, m.a2_id, m.b1_id, m.b2_id].includes(userId)
  );
  let wins = 0, losses = 0, scored = 0, conceded = 0, maxStreak = 0, curStreak = 0;
  // 최근 5경기: 날짜+생성시각 기준 내림차순 정렬 (대시보드와 동일 로직)
  const recent = [...myMatches].sort((a,b)=>{
    const dd = new Date(b.match_date) - new Date(a.match_date);
    return dd !== 0 ? dd : new Date(b.created_at||0) - new Date(a.created_at||0);
  }).slice(0,5);

  myMatches.forEach(m => {
    const inA = [m.a1_id, m.a2_id].includes(userId);
    const win = inA ? m.score_a > m.score_b : m.score_b > m.score_a;
    if (win) { wins++; curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else { losses++; curStreak = 0; }
    scored += inA ? (m.score_a || 0) : (m.score_b || 0);
    conceded += inA ? (m.score_b || 0) : (m.score_a || 0);
  });

  const games = wins + losses;
  const wr = games ? Math.round(wins / games * 100) : 0;
  const avgDiff = games ? ((scored - conceded) / games).toFixed(1) : '0.0';
  const ci = calcCI(wins, games, games ? parseFloat(avgDiff)*games : 0);

  // 티어
  const tier = ci >= 1070 ? {label:'GOLD', cls:'gold'} : ci >= 1040 ? {label:'SILVER', cls:'green'} : {label:'BRONZE', cls:'silver'};

  // 랭킹
  const excludeSet2=new Set((window._rankExcludedIds||[]));
  const pcStats=buildMatchStats(allMatches.filter(m=>m.status==='approved'),
    {seedUsers:(users||[]).filter(u=>!u.exclude_stats),excludeIds:excludeSet2});
  const ranked=Object.values(pcStats).filter(r=>r.games>=5).sort((a,b)=>b.ci-a.ci);
  const rank = ranked.findIndex(r=>r.id===userId) + 1;
  const total = ranked.length;

  // 최근폼 dots
  const formDots = recent.map(m => {
    const inA = [m.a1_id, m.a2_id].includes(userId);
    const win = inA ? m.score_a > m.score_b : m.score_b > m.score_a;
    return `<div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:900;${win?'background:rgba(0,200,150,.2);color:var(--primary);border:1px solid rgba(0,200,150,.4)':'background:rgba(255,82,82,.15);color:#FF5252;border:1px solid rgba(255,82,82,.3)'};">${win?'W':'L'}</div>`;
  }).join('');

  // 아바타
  const avatarHtml = user.avatar_url
    ? `<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;cursor:pointer;" onclick="showAvatarFull('${user.avatar_url}','${user.name}')">`
    : `<span style="font-size:2.2rem;">${user.name?.[0]||'?'}</span>`;

  // 티어 컬러
  const tierColor = tier.cls==='gold' ? '#FFD600' : tier.cls==='green' ? '#00C896' : '#90CAF9';

  // 업적 계산용 추가 데이터 조회
  const [ccStatRes, rtLogRes, stockRes, walletRes] = await Promise.all([
    sb.from('prediction_stats').select('correct_votes').eq('user_id',userId).maybeSingle(),
    sb.from('reaction_scores').select('avg_ms').eq('user_id',userId).maybeSingle(),
    sb.from('stock_portfolio').select('id').eq('user_id',userId),
    sb.from('stock_wallets').select('cash').eq('user_id',userId).maybeSingle(),
  ]);
  let bestRT=rtLogRes.data?.avg_ms||0;
  const achStats={
    totalGames:games, totalWins:wins, totalWR:games?wins/games:0, maxStreak,
    bestRT, ccCorrect:ccStatRes.data?.correct_votes||0,
    stockBuyTotal:(stockRes.data||[]).length,
    stockProfit:walletRes.data?(walletRes.data.cash-1000):0,
    // 업적 체크에 필요한 추가 필드 (0 기본값)
    weekGames:0, weekWins:0, weekPartners:0, ccVotes:0, hasMixedCombo:false,
  };

  // 대표 포켓몬 조회 (poke_buddy 테이블 기준 — 출석체크와 동일)
  let repPokemonHtml='';
  try{
    const {data:pbData}=await sb.from('poke_buddy').select('rep_pokemon_id,wild_pokemon_id').eq('user_id',userId).maybeSingle();
    let repId=pbData?.rep_pokemon_id||pbData?.wild_pokemon_id||null;
    if(repId){
      repPokemonHtml=`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${repId}.png`;
    }
  }catch(e){}

  // 라이트/다크 모드 대응
  const isDark=document.body.classList.contains('light-mode')===false;
  const cardBg   =isDark?'linear-gradient(145deg,#0d1f2d,#111c2e)':'var(--surface)';
  const textMain =isDark?'#ffffff':'var(--text)';
  const textSub  =isDark?'rgba(255,255,255,.4)':'var(--text-muted)';
  const textTag  =isDark?'rgba(255,255,255,.35)':'var(--text-muted)';
  const cellBg   =isDark?'rgba(255,255,255,.02)':'var(--bg2)';
  const cellBd   =isDark?'rgba(255,255,255,.04)':'var(--border)';
  const cellLine =isDark?'rgba(255,255,255,.06)':'var(--border)';
  const outerBd  =isDark?'rgba(255,255,255,.06)':'var(--border-str,rgba(0,0,0,.12))';
  const divider  =isDark?`linear-gradient(90deg,transparent,${tierColor}44,transparent)`:`linear-gradient(90deg,transparent,${tierColor}66,transparent)`;
  const rankColor=isDark?'#FFD600':tierColor;
  const formNone =isDark?'rgba(255,255,255,.3)':'var(--text-muted)';

  const html = `
  <div style="background:${cardBg};border-radius:16px;overflow:visible;position:relative;max-width:320px;margin:0 auto;">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 80% 0%,${tierColor}22 0%,transparent 60%);pointer-events:none;"></div>
    <div style="position:absolute;right:-16px;bottom:-16px;font-size:100px;opacity:.04;line-height:1;pointer-events:none;">🏸</div>

    <!-- 티어 + 업적 뱃지 -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 14px 0;">
      <div>
        <div style="font-family:'Black Han Sans',sans-serif;font-size:2rem;line-height:1;color:${tierColor};text-shadow:0 0 20px ${tierColor}88;">${Math.round(ci)}</div>
        <div style="font-size:.6rem;font-weight:700;letter-spacing:1.5px;color:${tierColor}aa;">${tier.label}</div>
        ${user.player_tag ? `<div style="margin-top:5px;font-size:.7rem;color:${textTag};font-style:italic;">"${user.player_tag}"</div>` : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px;max-width:130px;">${(()=>{
          if(typeof ACHIEVEMENTS==='undefined') return '';
          const done=ACHIEVEMENTS.filter(a=>a.check(achStats)).sort((a,b)=>b.reward-a.reward).slice(0,3);
          return done.map(a=>`<span title="${a.title}" style="width:26px;height:26px;border-radius:8px;background:rgba(255,214,0,.12);border:1px solid rgba(255,214,0,.25);display:flex;align-items:center;justify-content:center;font-size:.9rem;cursor:default;">${a.icon}</span>`).join('');
        })()}</div>
    </div>

    <!-- 아바타 + 이름 -->
    <div style="text-align:center;padding:10px 16px 8px;">
      <div style="position:relative;width:110px;height:110px;margin:0 auto 28px;">
        <div style="width:110px;height:110px;border-radius:50%;background:linear-gradient(135deg,${tierColor},#2979FF);display:flex;align-items:center;justify-content:center;border:3px solid ${tierColor}66;box-shadow:0 0 32px ${tierColor}55;overflow:hidden;">${avatarHtml}</div>
        ${repPokemonHtml?`<img src="${repPokemonHtml}" style="position:absolute;width:60px;height:60px;object-fit:contain;bottom:-24px;right:-22px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));pointer-events:none;z-index:2;">`:''}
      </div>
      <div style="font-family:'Black Han Sans',sans-serif;font-size:1.3rem;color:${textMain};letter-spacing:1px;">${user.name}</div>
      <div style="font-size:.73rem;color:${textSub};margin-top:2px;">전체 <span style="color:${rankColor};font-weight:700;">${rank}위</span> / ${total}명</div>
    </div>

    <!-- 구분선 -->
    <div style="margin:0 16px;height:1px;background:${divider};"></div>

    <!-- 스탯 -->
    <div style="margin:10px 16px;border-radius:12px;overflow:hidden;border:1px solid ${outerBd};">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${cellBd};">
        ${[
          [games+'경기','경기수','#5B9CF6'],
          [wins+'승','승리','#00C896'],
          [losses+'패','패배','#FF5252']
        ].map(([v,l,c])=>`<div style="background:${cellBg};padding:9px 4px;text-align:center;">
          <div style="font-size:1rem;font-weight:900;color:${c};">${v}</div>
          <div style="font-size:.58rem;color:${textSub};margin-top:2px;">${l}</div>
        </div>`).join('')}
      </div>
      <div style="height:1px;background:${cellLine};"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${cellBd};">
        ${[
          [wr+'%','승률',tierColor],
          [(parseFloat(avgDiff)>=0?'+':'')+avgDiff,'평균득실',parseFloat(avgDiff)>=0?'#00C896':'#FF5252'],
          [maxStreak+'연승','최장연승',isDark?'#FFD600':'#D4A017']
        ].map(([v,l,c])=>`<div style="background:${cellBg};padding:9px 4px;text-align:center;">
          <div style="font-size:1rem;font-weight:900;color:${c};">${v}</div>
          <div style="font-size:.58rem;color:${textSub};margin-top:2px;">${l}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- 최근폼 -->
    <div style="padding:4px 16px 14px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:.65rem;color:${formNone};letter-spacing:.5px;flex-shrink:0;">최근폼</span>
      <div style="display:flex;gap:4px;flex:1;">${formDots || '<span style="font-size:.75rem;color:'+formNone+';">경기 없음</span>'}</div>
    </div>
  </div>`;

  // 모달 열기
  const modal = document.getElementById('modal-player-card');
  const body = document.getElementById('player-card-body');
  if (modal && body) { body.innerHTML = html; modal.style.display='flex'; }
}

// safe-area 동적 대응

/* ── 미니게임 탭 전환 ── */


/* ── 후생동 뽑기 룰렛 ── */
const GACHA_PRIZES=[
  {pts:50,  label:'50P',  color:'#888780', weight:30},
  {pts:100, label:'100P', color:'#888780', weight:28},
  {pts:200, label:'200P', color:'#5DCAA5', weight:18},
  {pts:300, label:'300P', color:'#378ADD', weight:12},
  {pts:500, label:'500P', color:'#7F77DD', weight:8},
  {pts:500, label:'500P', color:'#EF9F27', weight:4},
];
// 룰렛 색상 (배드민턴 테마)
const ROULETTE_SEGS=[
  {pts:50,  label:'50P',  color:'#888780'},
  {pts:200, label:'200P', color:'#1D9E75'},
  {pts:100, label:'100P', color:'#378ADD'},
  {pts:500, label:'500P', color:'#7F77DD'},
  {pts:50,  label:'50P',  color:'#888780'},
  {pts:300, label:'300P', color:'#5C7CFA'},
  {pts:100, label:'100P', color:'#378ADD'},
  {pts:500, label:'500P', color:'#EF9F27'},
];
let _gachaAngle=0, _gachaDone=false;
