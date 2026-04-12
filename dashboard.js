/* ── DASHBOARD ── */
async function renderDashboard(){
  const{data:prof}=await sb.from('profiles').select('*').eq('id',ME.id).single();
  if(prof) ME=prof;
  // 경기 캐시: 30초 이내면 재조회 생략
  const _now=Date.now();
  if(!window._matchCacheTime||_now-window._matchCacheTime>30000||!_allMatchesCache.length){
    const{data:allMatches}=await sb.from('matches').select('id,match_type,match_date,a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b,status,note,admin_note,submitter_id,submitter_name,approved_at,created_at').eq('status','approved').order('match_date',{ascending:false}).order('created_at',{ascending:false});
    _allMatchesCache=allMatches||[];window._allMatchesCache=_allMatchesCache;
    window._matchCacheTime=_now;
    window._profilesCache=null; // 경기 새로 불러오면 프로필도 갱신
  }
  const myMatches=_allMatchesCache.filter(m=>[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(ME.id));
  const stats=computeStats(myMatches,ME.id);

  // 전체 유저 통계로 순위 계산 (renderRankTable과 동일한 기준: 회원+비회원)
  if(!window._profilesCache||window._profilesCache.length===0){
    const{data:pCache}=await sb.from('profiles').select('*').eq('status','approved');
    window._profilesCache=pCache||[];
    window._guestModeNamesCache=await _loadGuestModeNames();
  }
  const allUsers=window._profilesCache;
  const guestModeNames=window._guestModeNamesCache||new Set();
  const excludedIds=new Set((allUsers||[]).filter(u=>u.exclude_stats).map(u=>u.id));
  const uStats={};
  // 회원 초기화
  (allUsers||[]).filter(u=>!u.exclude_stats).forEach(u=>uStats[u.id]={id:u.id,games:0,wins:0,diff:0,scored:0,conceded:0});
  _allMatchesCache.forEach(m=>{
    const aWin=m.score_a>m.score_b;
    // 회원 (id 기반)
    [{id:m.a1_id,win:aWin,s:m.score_a,c:m.score_b},{id:m.a2_id,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,win:!aWin,s:m.score_b,c:m.score_a},{id:m.b2_id,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>p.id&&!excludedIds.has(p.id)).forEach(p=>{
      if(!uStats[p.id])return;
      uStats[p.id].games++;if(p.win)uStats[p.id].wins++;
      uStats[p.id].scored+=p.s;uStats[p.id].conceded+=p.c;
    });
    // 비회원 (name 기반)
    [{id:m.a1_id,name:m.a1_name,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.a2_id,name:m.a2_name,win:aWin,s:m.score_a,c:m.score_b},
     {id:m.b1_id,name:m.b1_name,win:!aWin,s:m.score_b,c:m.score_a},
     {id:m.b2_id,name:m.b2_name,win:!aWin,s:m.score_b,c:m.score_a}]
    .filter(p=>!p.id&&p.name&&!guestModeNames.has(p.name)).forEach(p=>{
      const key='name:'+p.name;
      if(!uStats[key]) uStats[key]={id:key,games:0,wins:0,diff:0,scored:0,conceded:0};
      uStats[key].games++;if(p.win)uStats[key].wins++;
      uStats[key].scored+=p.s;uStats[key].conceded+=p.c;
    });
  });
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
  const myWrRank=stats.total.games>=MIN_G?wrRanked.findIndex(u=>u.id===ME.id)+1:0;
  const myDiffRank=stats.total.games>=MIN_G?diffRanked.findIndex(u=>u.id===ME.id)+1:0;
  const myGamesRank=stats.total.games>=MIN_G?gamesRanked.findIndex(u=>u.id===ME.id)+1:0;
  const total=rankedAll.length;
  const ciRanked=[...rankedAll].sort((a,b)=>b.ci-a.ci);
  const myCIRank=stats.total.games>=MIN_G?ciRanked.findIndex(u=>u.id===ME.id)+1:0;

  const ci=calcCI(stats.total.wins,stats.total.games,stats.total.diff||0);
  const grade=ciToLabel(ci);

  // 맞춤형 인사말: 시간대 + 연승/연패 + 경기수 상황 반영
  const _h=new Date().getHours();
  const _timeGreet=_h>=5&&_h<9?'좋은 아침이에요':_h>=9&&_h<12?'오전부터 스매시':_h>=12&&_h<14?'점심 후 한 판':_h>=14&&_h<18?'오후에도 풀스윙':_h>=18&&_h<22?'저녁 경기 파이팅':'새벽민턴, 달려봐요';
  const _sortedM=[...myMatches].sort((a,b)=>new Date(b.match_date)-new Date(a.match_date));
  let _curStreak=0,_curType='';
  if(_sortedM.length>0){
    const _first=[_sortedM[0].a1_id,_sortedM[0].a2_id].includes(ME.id)?_sortedM[0].score_a>_sortedM[0].score_b:_sortedM[0].score_b>_sortedM[0].score_a;
    _curType=_first?'승':'패';
    for(const _m of _sortedM){
      const _onA=[_m.a1_id,_m.a2_id].includes(ME.id);
      const _w=_onA?_m.score_a>_m.score_b:_m.score_b>_m.score_a;
      if((_w&&_curType==='승')||(!_w&&_curType==='패')) _curStreak++;
      else break;
    }
  }
  const _totalG=stats.total.games||0;
  let _greeting='';
  if(_curStreak>=3&&_curType==='승') _greeting=`${_curStreak}연승 중! 지금 이 기세 🔥`;
  else if(_curStreak>=3&&_curType==='패') _greeting=`슬럼프는 곧 끝나요, 다시 스매시 💪`;
  else if(_curStreak===2&&_curType==='승') _greeting=`2연승! 다음 경기도 기대돼요 ⚡`;
  else if(_totalG===0) _greeting=`첫 경기를 기록해볼까요? 🏸`;
  else if(_totalG<5) _greeting=`경기 ${_totalG}개째, 계속 쌓아가요!`;
  else _greeting=_timeGreet+' 🏸';
  const _helloEl=document.getElementById('dash-hello');
  if(_helloEl) _helloEl.innerHTML=
    `<span style="font-family:'Black Han Sans',sans-serif;font-weight:700;color:var(--text);">${ME.name}님,</span>`+
    `<span style="font-family:'Noto Sans KR',sans-serif;font-weight:400;font-size:.78rem;color:var(--text);opacity:.75;"> ${_greeting}</span>`;
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
    if(!_partnerMap[pkey]) _partnerMap[pkey]={id:pkey,name:pname,games:0,wins:0};
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
  const wrCircle='<svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="'+r+'" fill="none" stroke="var(--bg3)" stroke-width="7"/><circle cx="36" cy="36" r="'+r+'" fill="none" stroke="#5BA4F5" stroke-width="7" stroke-dasharray="'+wrFill+' '+circ+'" stroke-linecap="round" transform="rotate(-90 36 36)"/></svg>';

  document.getElementById('my-overview-card').innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'+
      '<div style="font-size:1rem;font-weight:700;color:var(--text);">📊 나의 현황</div>'+
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
            '<div style="font-family:Black Han Sans,sans-serif;font-size:1.05rem;color:#5BA4F5;">'+wr+'%</div>'+
          '</div>'+
        '</div>'+
        '<div style="font-size:.76rem;color:var(--text-muted);font-weight:600;margin-top:4px;">'+stats.total.wins+'승 '+stats.total.losses+'패</div>'+
      '</div>'+
      // 2열: 베스트 파트너
      '<div class="stat-card" style="padding:10px 6px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">'+
        '<div style="font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:6px;">베스트 파트너</div>'+
        (bestPartner?
          '<div style="padding-bottom:7px;border-bottom:1px solid var(--border);width:100%;text-align:center;margin-bottom:7px;">'+
            '<div style="font-size:.95rem;font-weight:700;color:var(--primary);cursor:pointer;" onclick="'+
              (bestPartner.id&&!bestPartner.id.startsWith('name:')?
                `showPlayerCard('${bestPartner.id}','${bestPartner.name.replace(/'/g,"\\'")}')`:
                `goToFeedByName('${bestPartner.name.replace(/'/g,"\\'")}')`)+'">'+
              bestPartner.name+
            '</div>'+
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
      '<div id="my-type-stats" style="display:none;margin-bottom:12px;"></div>'+
      '<div style="display:flex;justify-content:center;align-items:center;cursor:pointer;" onclick="toggleTypeStats()">'+
        '<span id="type-stats-toggle-icon" style="font-size:.82rem;color:var(--text-muted);border:1px solid var(--border);border-radius:20px;padding:4px 18px;">더보기</span>'+
      '</div>'+
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
  icon.textContent=open?'닫기':'더보기';
}

/* ─ 종목별 세부 통계 테이블 ─ */
function renderMyTypeStats(stats, allM){
  const d=stats.total||{games:0,wins:0,losses:0,diff:0,scored:0,conceded:0};
  const games=d.games||0;
  const wins=d.wins||0;
  const diff=d.diff||0;

  const wr=games>0?wins/games:0;
  const confidence=games>0?games/(games+15):0;
  const adjustedWR=wr*confidence;
  const avgDiff=games>0?diff/games:0;
  const wrScore=adjustedWR*200;
  const diffScore=avgDiff*5;
  const gamesBonus=Math.min(games,30)*1;
  const ci=Math.round(1000+wrScore+diffScore+gamesBonus);

  const wrPct=Math.round(wr*100);
  const confPct=Math.round(confidence*100);
  const adjustedPct=Math.round(adjustedWR*100);

  const bar=(val,max,color)=>{
    const pct=Math.min(100,Math.max(0,Math.round(val/max*100)));
    return `<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-top:6px;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .6s;"></div>
    </div>`;
  };

  const row=(label,value,sub,barHtml,valueColor='var(--text)')=>`
    <div style="padding:11px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-size:.86rem;color:var(--text);font-weight:500;">${label}</span>
        <span style="font-size:1.05rem;font-weight:700;color:${valueColor};flex-shrink:0;">${value}</span>
      </div>
      ${sub?`<div style="font-size:.75rem;color:var(--text-muted);margin-top:3px;line-height:1.5;">${sub}</div>`:''}
      ${barHtml||''}
    </div>`;

  const signColor=(v)=>v>0?'#5BA4F5':v<0?'var(--danger)':'var(--text-muted)';
  const diffScoreStr=`${diffScore>=0?'+':''}${Math.round(diffScore)}점`;
  const totalDiffStr=`누적 득실 ${diff>0?'+':''}${diff}점 ÷ ${games}경기 = ${avgDiff>=0?'+':''}${avgDiff.toFixed(1)} / 경기`;

  document.getElementById('my-type-stats').innerHTML=`
    <div style="border-radius:12px;padding:4px 0;margin-bottom:4px;">
      <div style="font-size:.8rem;color:var(--text-muted);font-weight:600;letter-spacing:.3px;margin-bottom:4px;">📐 종합점수 산정 내역</div>

      ${row('① 기본점수','1,000점','모든 선수의 공통 시작값','')}

      ${row('② 승률',`${wrPct}%`,
        `${wins}승 ${d.losses}패 · ${games}경기`,
        bar(wrPct,100,'#5BA4F5'),'#5BA4F5'
      )}

      ${row('③ 신뢰도 보정',`×${confidence.toFixed(2)}`,
        `${games} ÷ (${games}+15) = ${confidence.toFixed(2)} — 경기가 적을수록 승률을 보수적으로 반영`,
        bar(confPct,100,'#9C6FE4'),'#9C6FE4'
      )}

      ${row('④ 보정 승률',`+${Math.round(wrScore)}점`,
        `${wrPct}% × ${confidence.toFixed(2)} = ${adjustedPct}% → ×200`,
        bar(adjustedPct,100,'var(--primary)'),'var(--primary)'
      )}

      ${row('⑤ 평균 득실차',`${diffScoreStr}`,
        `${totalDiffStr}<br>평균득실 × 5점 (5경기 기준 환산)`,
        '',signColor(avgDiff)
      )}

      ${row('⑥ 참가 경기 가산점',`+${gamesBonus}점`,
        `${games}경기 × 1점${games>=30?' (30경기 상한 적용)':' (최대 30점)'}`,
        bar(gamesBonus,30,'#F5A623'),'#F5A623'
      )}

      <div style="margin-top:10px;padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.9rem;font-weight:700;color:var(--text);">종합점수</span>
          <span style="font-family:'Black Han Sans',sans-serif;font-size:1.8rem;color:#5BA4F5;">${ci}</span>
        </div>
        <div style="font-size:.76rem;color:var(--text-muted);margin-top:4px;">
          1000 + ${Math.round(wrScore)} + ${Math.round(diffScore)} + ${gamesBonus} = <strong style="color:#5BA4F5;">${ci}</strong>
        </div>
      </div>
    </div>

    ${games<5?`<div style="font-size:.78rem;color:var(--text-muted);text-align:center;padding:8px 0;">⚠️ 5경기 이상부터 랭킹에 반영 (현재 ${games}/5경기)</div>`:''}
  `;
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

/* ── 선수 프로필 카드 ── */
function showPlayerCard(userId, userName){
  const profile=window._profilesCache?.find(u=>u.id===userId)||null;
  const allM=window._allMatchesCache||[];

  // 해당 유저 경기 목록 (날짜 내림차순)
  const userMatches=allM.filter(m=>
    [m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(userId)
  ).map(m=>{
    const onA=[m.a1_id,m.a2_id].includes(userId);
    const won=(m.score_a>m.score_b)===onA;
    return{...m,won};
  }).sort((a,b)=>{
    const dd=new Date(b.match_date)-new Date(a.match_date);
    return dd!==0?dd:new Date(b.created_at||0)-new Date(a.created_at||0);
  });

  // 통계
  const g=userMatches.length;
  const w=userMatches.filter(m=>m.won).length;
  const l=g-w;
  let scored=0,conceded=0,closeWins=0;
  userMatches.forEach(m=>{
    const onA=[m.a1_id,m.a2_id].includes(userId);
    scored+=onA?m.score_a:m.score_b;
    conceded+=onA?m.score_b:m.score_a;
    if(m.won&&Math.abs(m.score_a-m.score_b)<=3) closeWins++;
  });
  const wr=g>0?Math.round(w/g*100):0;
  const diff=scored-conceded;
  // CI 세부 계산
  const _wr=g>0?w/g:0;
  const _conf=g>0?g/(g+15):0;
  const _adjWR=_wr*_conf;
  const _wrScore=_adjWR*200;
  const _avgDiff=g>0?diff/g:0;
  const _diffScore=_avgDiff*5;
  const _gamesBonus=Math.min(g,30);
  const _closeBonus=closeWins;
  const ci=Math.round(1000+_wrScore+_diffScore+_gamesBonus+_closeBonus);
  const avgDiff=g>0?((diff/g)>=0?'+':'')+((diff/g).toFixed(1)):'-';

  // 최근 5경기 도트
  const recent5=[...userMatches].slice(0,5).reverse();
  const dotHTML=recent5.map(m=>
    m.won
      ?`<span style="width:28px;height:28px;border-radius:50%;background:rgba(41,121,255,.2);border:2px solid var(--primary);color:var(--primary);font-size:.72rem;font-weight:900;display:inline-flex;align-items:center;justify-content:center;">승</span>`
      :`<span style="width:28px;height:28px;border-radius:50%;background:rgba(255,82,82,.12);border:2px solid var(--danger);color:var(--danger);font-size:.72rem;font-weight:900;display:inline-flex;align-items:center;justify-content:center;">패</span>`
  ).join('');

  // 현재 연승/연패 계산
  let streakCount=0, streakType='';
  if(userMatches.length>0){
    const first=userMatches[0].won;
    streakType=first?'연승':'연패';
    for(const m of userMatches){
      if(m.won===first) streakCount++;
      else break;
    }
  }
  // 최고 연승 계산
  let maxWinStreak=0, cur=0;
  [...userMatches].reverse().forEach(m=>{
    if(m.won){ cur++; if(cur>maxWinStreak) maxWinStreak=cur; }
    else cur=0;
  });
  const streakBadge=streakCount>=2
    ?`<span style="margin-left:8px;font-size:.78rem;font-weight:700;padding:2px 10px;border-radius:20px;background:${streakType==='연승'?'rgba(41,121,255,.15)':'rgba(255,82,82,.12)'};color:${streakType==='연승'?'var(--primary)':'var(--danger)'};border:1px solid ${streakType==='연승'?'rgba(41,121,255,.3)':'rgba(255,82,82,.3)'}">${streakCount}${streakType}</span>`
    :'';

  const avatarUrl=profile?.avatar_url||'';
  const initials=(userName||'?')[0];
  const avatarHTML=avatarUrl
    ?`<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;cursor:pointer;" onclick="event.stopPropagation();showAvatarFull('${avatarUrl}')">`
    :`<span style="font-size:2rem;font-weight:700;color:var(--primary);">${initials}</span>`;

  const overlay=document.createElement('div');
  overlay.id='player-card-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:500;display:flex;align-items:flex-end;justify-content:center;padding:0;';
  overlay.onclick=()=>overlay.remove();
  overlay.innerHTML=`
    <div onclick="event.stopPropagation()" style="background:var(--surface);border-radius:24px 24px 0 0;width:100%;max-width:480px;padding:24px 20px 36px;box-shadow:0 -4px 32px rgba(0,0,0,.3);animation:slideUp .28s cubic-bezier(.4,0,.2,1);">
      <div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px;"></div>
      <!-- 프로필 헤더 -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--bg3);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
          ${avatarHTML}
        </div>
        <div>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
            <span style="font-family:'Black Han Sans',sans-serif;font-size:1.4rem;color:var(--text);">${userName}</span>
            ${streakBadge}
          </div>
          ${g>=5?`<div style="font-size:.78rem;color:var(--primary);font-weight:700;margin-top:3px;">종합 ${ci}점</div>`:`<div style="font-size:.76rem;color:var(--text-muted);margin-top:3px;">5경기 미만</div>`}
        </div>
      </div>
      <!-- 스탯 그리드 -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
        ${[['경기',g],['승',w],['패',l],['승률',wr+'%']].map(([lb,vl])=>`
          <div style="background:var(--bg2);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:4px;">${lb}</div>
            <div style="font-size:1rem;font-weight:700;color:var(--text);">${vl}</div>
          </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        ${[['득실차',diff>0?'+'+diff:diff,''],['평균득실',avgDiff,''],['최고연승',maxWinStreak>0?maxWinStreak+'연승':'-','var(--primary)']].map(([lb,vl,vc])=>`
          <div style="background:var(--bg2);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:4px;">${lb}</div>
            <div style="font-size:1rem;font-weight:700;color:${vc||(String(vl).startsWith('-')?'var(--danger)':'var(--primary)')};"> ${vl}</div>
          </div>`).join('')}
      </div>
      <!-- 최근 5경기 -->
      ${recent5.length>0?`
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:8px;">최근 ${recent5.length}경기</div>
        <div style="display:flex;gap:6px;align-items:center;">${dotHTML}</div>
      </div>`:''}
      <!-- CI 산정 내역 (토글) -->
      ${g>=1?`
      <div style="margin-bottom:14px;">
        <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.ci-toggle-icon').textContent=this.nextElementSibling.style.display==='none'?'▼':'▲';"
          style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;cursor:pointer;font-family:inherit;color:var(--text);">
          <span style="font-size:.82rem;font-weight:600;">📐 종합점수 산정 내역</span>
          <span style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:1rem;font-weight:700;color:#5BA4F5;">${ci}점</span>
            <span class="ci-toggle-icon" style="font-size:.72rem;color:var(--text-muted);">▼</span>
          </span>
        </button>
        <div style="display:none;background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:10px 14px;">
          ${[
            ['① 기본점수','1,000점','모든 선수의 공통 시작값',''],
            ['② 보정승률점수',`+${Math.round(_wrScore)}점`,
              `승률 ${wr}% × 신뢰도 ${_conf.toFixed(2)} (${g}÷(${g}+15)) = ${Math.round(_adjWR*100)}% → ×200`,'#5BA4F5'],
            ['③ 평균 득실차',`${_diffScore>=0?'+':''}${Math.round(_diffScore)}점`,
              `누적 득실 ${diff>0?'+':''}${diff} ÷ ${g}경기 = ${_avgDiff>=0?'+':''}${_avgDiff.toFixed(1)} / 경기 × 5`,''],
            ['④ 참가 경기',`+${_gamesBonus}점`,
              `${g}경기 × 1점${g>=30?' (30경기 상한)':' (최대 30점)'}`,  '#F5A623'],
            ['⑤ 접전 클러치',`+${_closeBonus}점`,
              `${closeWins}회 접전 승리 × 1점 (점수차 3점 이내)`, '#E0634A'],
          ].map(([label,val,desc,color])=>`
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:.8rem;color:var(--text);font-weight:500;">${label}</div>
                <div style="font-size:.71rem;color:var(--text-muted);margin-top:2px;line-height:1.4;">${desc}</div>
              </div>
              <span style="font-size:.92rem;font-weight:700;color:${color||'var(--text)'};flex-shrink:0;margin-left:8px;">${val}</span>
            </div>`).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;">
            <span style="font-size:.8rem;color:var(--text-muted);">1000 + ${Math.round(_wrScore)} + ${Math.round(_diffScore)} + ${_gamesBonus} + ${_closeBonus}</span>
            <span style="font-family:'Black Han Sans',sans-serif;font-size:1.3rem;color:#5BA4F5;">${ci}</span>
          </div>
        </div>
      </div>`:''}
      <!-- 기록 보기 버튼 -->
      <button onclick="goToFeedByName('${userName.replace(/'/g,"\\'")}');document.getElementById('player-card-overlay')?.remove();"
        style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;color:var(--text-muted);font-family:inherit;font-size:.88rem;cursor:pointer;">
        📋 ${userName} 경기 기록 보기
      </button>
    </div>`;
  document.getElementById('player-card-overlay')?.remove();
  document.body.appendChild(overlay);
}

function showAvatarFull(url){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:600;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  ov.onclick=()=>ov.remove();
  ov.innerHTML=`<img src="${url}" style="max-width:90vw;max-height:85vh;border-radius:16px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.5);">`;
  document.body.appendChild(ov);
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
  const diffColor=d=>d>0?'color:#1a6fc4':d<0?'color:var(--danger)':'color:var(--text-muted)';
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
    const ciVal=`<span style="font-weight:700;color:var(--text);">${Math.round(u.ci)}</span>`;
    const guestBadge='';
    const nameOnclick=u.isGuest
      ?`goToFeedByName('${u.name.replace(/'/g,"\\'")}')`
      :`showPlayerCard('${u.id}','${u.name.replace(/'/g,"\\'")}')`;
    return `<tr class="${u.id===ME.id?'me':''}" ${!isRanked?'style="opacity:0.55;"':''}>
    <td>${rankCell}</td>
    <td><span class="rank-name" onclick="${nameOnclick}">${u.name}</span>${guestBadge}</td>
    <td style="text-align:center;">${u.games}</td>
    <td style="text-align:center;">${u.wins}</td>
    <td style="text-align:center;">${u.losses}</td>
    <td style="text-align:center;" class="rank-wr">${wr}</td>
    <td style="text-align:center;font-weight:700;">${diff}</td>
    <td style="text-align:center;font-size:.85rem;">${ciVal}</td>
  </tr>`;}).join('');
  const moreRow=(!isExpanded&&allDisplay.length>LIMIT)
    ?`<tr><td colspan="8" style="text-align:center;padding:10px;"><button onclick="document.getElementById('rank-table-wrap').dataset.expanded='true';renderRankTable(window._allMatchesCache)" style="background:var(--bg2);border:1px solid var(--border);color:var(--primary);border-radius:8px;padding:6px 18px;font-family:inherit;font-size:.82rem;cursor:pointer;">더보기 (${allDisplay.length-LIMIT}명 더)</button></td></tr>`
    :(isExpanded&&allDisplay.length>LIMIT
      ?`<tr><td colspan="8" style="text-align:center;padding:10px;"><button onclick="document.getElementById('rank-table-wrap').dataset.expanded='false';renderRankTable(window._allMatchesCache)" style="background:var(--bg2);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:6px 18px;font-family:inherit;font-size:.82rem;cursor:pointer;">접기</button></td></tr>`
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
    ctx.fillStyle=isHL?'#1a6fc4':isMe?'#2979ff':'rgba(26,111,196,0.45)';
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
