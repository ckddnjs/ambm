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

