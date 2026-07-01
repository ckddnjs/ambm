/* ══════════════════════════════════════════
   📈 새벽민턴 증권거래소
   주가 = 종합점수(CI) - 900 (최소 10) · calcCI와 동일한 기준
   종목 노출 = 승인 경기 5경기 이상 (전체 랭킹과 동일)
   초기자금 = 2000P
══════════════════════════════════════════ */

async function renderStockMarketPage(){
  const el=document.getElementById('stockmarket-content');
  if(!el) return;
  el.innerHTML='<div style="text-align:center;padding:40px 0;"><div class="spinner" style="margin:0 auto;"></div></div>';

  await ensureSeasonStart(); // 시즌 컷오프 보장 (주가 집계에 사용)

  const tab=window._smTab||'market';

  // ── 1. 캐시 보장 — matches & profiles 병렬 로드 (없을 때만) ──
  {
    const toFetch=[];
    if(!window._allMatchesCache?.length)
      toFetch.push(sb.from('matches').select('id,match_type,match_date,a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name,score_a,score_b,status,created_at').eq('status','approved').then(({data:m})=>{window._allMatchesCache=m||[];}));
    if(!window._profilesCache?.length)
      toFetch.push(sb.from('profiles').select('*').eq('status','approved').then(({data:u})=>{window._profilesCache=u||[];}));
    if(toFetch.length) await Promise.all(toFetch);
  }

  const allM=window._allMatchesCache||[];
  const users=(window._profilesCache||[]).filter(u=>u.status==='approved'&&!u.exclude_stats);

  // ── 2. 내 기본 데이터 (항상 필요) ──
  const [portfolioRes,walletRes]=await Promise.all([
    sb.from('stock_portfolio').select('*').eq('user_id',ME.id),
    sb.from('stock_wallets').select('*').eq('user_id',ME.id).maybeSingle(),
  ]);
  const portfolio=portfolioRes.data||[];
  const walletRow=walletRes.data;
  const cash=walletRow?.cash??2000;
  if(!walletRow) await sb.from('stock_wallets').insert({user_id:ME.id,cash:2000});

  // ── 3. stocks 계산 — allPortfolio 30초 캐시 ──
  const _now=Date.now();
  if(!window._smAllPortfolioCache||(_now-(window._smAllPortfolioCacheTime||0))>30000){
    const{data:ap}=await sb.from('stock_portfolio').select('stock_user_id,user_id');
    window._smAllPortfolioCache=ap||[];
    window._smAllPortfolioCacheTime=_now;
  }
  const stocks=_smCalcStocks(users,allM,window._smAllPortfolioCache);
  window._smStocksCache=stocks;

  const totalStock=portfolio.reduce((s,p)=>{
    const st=stocks.find(x=>x.id===p.stock_user_id);
    return s+(st?st.price*p.shares:0);
  },0);
  const totalAsset=cash+totalStock;

  // ── 4. 탭별 필요한 데이터만 로드 ──
  let tabContent='';
  if(tab==='market'){
    tabContent=_smRenderMarket(stocks,portfolio,cash);
  } else if(tab==='portfolio'){
    const [tradeLogsRes,sellPnlRes]=await Promise.all([
      sb.from('stock_trades').select('action,name,qty,price,total,cost,pnl,created_at').eq('user_id',ME.id).order('created_at',{ascending:false}).limit(100),
      sb.from('stock_trades').select('pnl').eq('user_id',ME.id).eq('action','sell'),
    ]);
    const tradeLogs=tradeLogsRes.data||[];
    const allRealizedPnl=(sellPnlRes.data||[]).reduce((s,r)=>s+(r.pnl||0),0);
    tabContent=_smRenderPortfolio(stocks,portfolio,cash,totalAsset,0,tradeLogs,allRealizedPnl);
  } else if(tab==='ranking'){
    tabContent=await _smRenderRanking(stocks);
  } else if(tab==='news'){
    tabContent=await _smRenderNews(stocks);
  } else if(tab==='craft'){
    // 이미 로드된 증권 현금(cash)을 그대로 전달
    tabContent=await _smRenderCraftTab(cash);
  }

  el.innerHTML=
    '<div style="padding:0 0 16px;">'+
      '<div style="position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--border);">'+
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px 10px;">'+
          '<button onclick="navigateTo(\'dashboard\')" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;padding:0;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;margin-right:2px;">‹</button>'+
          '<div style="flex:1;">'+
            '<div style="font-size:.95rem;font-weight:700;">📈 새벽민턴 증권거래소</div>'+
            '<div style="font-size:.65rem;color:var(--text-muted);">새벽민턴 증권거래소 · 초기자금 2,000P</div>'+
          '</div>'+
          '<div style="text-align:right;">'+
            '<div style="font-size:.6rem;color:var(--text-muted);">총 자산</div>'+
            '<div style="font-weight:800;font-size:.95rem;color:var(--warn);">'+totalAsset.toLocaleString()+'p</div>'+
          '</div>'+
        '</div>'+
        '<div style="display:flex;padding:0 14px 8px;gap:0;">'+
          '<button onclick="window._smTab=\'market\';window._smSelected=null;renderStockMarketPage();" style="flex:1;padding:7px 4px;border-radius:10px 0 0 10px;border:1px solid var(--border);font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;'+(tab==='market'?'background:var(--primary);color:#fff;border-color:var(--primary);':'background:var(--bg3);color:var(--text-muted);')+'">종목</button>'+
          '<button onclick="window._smTab=\'portfolio\';renderStockMarketPage();" style="flex:1;padding:7px 4px;border:1px solid var(--border);border-left:none;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;'+(tab==='portfolio'?'background:var(--primary);color:#fff;border-color:var(--primary);':'background:var(--bg3);color:var(--text-muted);')+'">잔고</button>'+
          '<button onclick="window._smTab=\'news\';renderStockMarketPage();" style="flex:1;padding:7px 4px;border:1px solid var(--border);border-left:none;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;'+(tab==='news'?'background:var(--primary);color:#fff;border-color:var(--primary);':'background:var(--bg3);color:var(--text-muted);')+'">뉴스</button>'+
          '<button onclick="window._smTab=\'ranking\';renderStockMarketPage();" style="flex:1;padding:7px 4px;border:1px solid var(--border);border-left:none;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;'+(tab==='ranking'?'background:var(--primary);color:#fff;border-color:var(--primary);':'background:var(--bg3);color:var(--text-muted);')+'">랭킹</button>'+
          '<button onclick="window._smTab=\'craft\';window._smCraftTab=window._smCraftTab||\'market\';renderStockMarketPage();" style="flex:1;padding:7px 4px;border-radius:0 10px 10px 0;border:1px solid var(--border);border-left:none;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;'+(tab==='craft'?'background:var(--primary);color:#fff;border-color:var(--primary);':'background:var(--bg3);color:var(--text-muted);')+'">제작</button>'+
        '</div>'+
      '</div>'+
      '<div style="padding:10px 14px 0;">'+tabContent+'</div>'+
    '</div>';
  // async 렌더 후 스크롤 위치 초기화
  document.querySelector('.app-body')?.scrollTo(0,0);
}

function _smCalcStocks(users,allM,allPortfolio){
  const approved=allM.filter(m=>m.status==='approved'&&inSeason(m)); // 시즌 경기만
  return users.map(u=>{
    const uM=approved.filter(m=>[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(u.id));
    const games=uM.length;
    let wins=0,diff=0,closeWins=0;
    uM.forEach(m=>{
      const onA=[m.a1_id,m.a2_id].includes(u.id);
      const win=onA?(m.score_a>m.score_b):(m.score_b>m.score_a);
      if(win)wins++;
      if(win&&Math.abs(m.score_a-m.score_b)<=3)closeWins++;
      diff+=onA?(m.score_a-m.score_b):(m.score_b-m.score_a);
    });
    const ci=calcCI(wins,games,diff,closeWins);
    const wr=games>0?wins/games:0;
    const recent=[...uM].sort((a,b)=>(b.match_date||'').localeCompare(a.match_date||'')).slice(0,5);
    let recentW=0;
    recent.forEach(m=>{
      const onA=[m.a1_id,m.a2_id].includes(u.id);
      if(onA?(m.score_a>m.score_b):(m.score_b>m.score_a)) recentW++;
    });
    const recentWR=recent.length>0?recentW/recent.length:0;
    // 주가 = 종합점수(ci) - 900 (최소 10)
    const price=Math.max(10,Math.round(ci-900));

    // 종목 분류
    let type='일반주',typeColor='var(--text-muted)',typeBg='rgba(255,255,255,.05)',typeIcon='⬜';
    if(ci>=1070&&wr>=0.65&&games>=10){type='우량주';typeColor='var(--warn)';typeBg='rgba(217,119,6,.12)';typeIcon='🛡';}
    else if(recentWR>=0.6&&(recentWR-wr)>=0.15&&games>=3){type='성장주';typeColor='var(--accent)';typeBg='rgba(0,168,130,.12)';typeIcon='🔥';}
    else if(games>=3&&games<=8){type='위험주';typeColor='var(--danger)';typeBg='rgba(220,53,69,.10)';typeIcon='⚠️';}

    const {spark,change:sparkDelta}=_smSparklineCI(u.id,approved);
    const holders=(allPortfolio||[]).filter(p=>p.stock_user_id===u.id).length;

    return {id:u.id,name:u.name,avatar:u.avatar_url||'',
      bs:Math.round(ci),rp:Math.round(ci),price,games,wins,losses:games-wins,wr,recentWR,recentW,recentGames:recent.length,change:sparkDelta,
      type,typeColor,typeBg,typeIcon,spark,holders};
  }).filter(s=>s.games>=5).sort((a,b)=>b.price-a.price);
}

/** 경기일 누적 구간마다 CI를 구해 주가( CI-900 ) 추이 */
function _smSparklineCI(uid,allApproved){
  const approvedSorted=[...allApproved].filter(inSeason).sort((a,b)=>{ // 시즌 경기만
    const d=String(a.match_date||'').localeCompare(String(b.match_date||''));
    if(d!==0) return d;
    return String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
  const dates=[...new Set(approvedSorted.map(m=>(m.match_date||'').slice(0,10)).filter(Boolean))].sort();
  const pts=[];
  dates.forEach(dk=>{
    const subU=approvedSorted.filter(m=>(m.match_date||'').slice(0,10)<=dk&&[m.a1_id,m.a2_id,m.b1_id,m.b2_id].includes(uid));
    if(!subU.length) return;
    let wins=0,games=0,diff=0,closeWins=0;
    subU.forEach(m=>{
      const onA=[m.a1_id,m.a2_id].includes(uid);
      const win=onA?(m.score_a>m.score_b):(m.score_b>m.score_a);
      if(win)wins++;
      if(win&&Math.abs(m.score_a-m.score_b)<=3)closeWins++;
      games++;
      diff+=onA?(m.score_a-m.score_b):(m.score_b-m.score_a);
    });
    const pci=calcCI(wins,games,diff,closeWins);
    pts.push(Math.max(10,Math.round(pci-900)));
  });
  if(pts.length<2){
    const one=pts.length?pts[0]:100;
    return { spark:[one,one,one,one,one,one], change:0 };
  }
  const spark=pts.slice(-6);
  while(spark.length<6) spark.unshift(spark[0]);
  const change=pts.length>=2?pts[pts.length-1]-pts[pts.length-2]:0;
  return { spark, change };
}

function _smDrawSparkSVG(pts,rising){
  if(!pts||!pts.length) return '';
  const mn=Math.min(...pts),mx=Math.max(...pts);
  const range=mx-mn||1;
  const w=70,h=28;
  const coords=pts.map((v,i)=>{
    const x=i*(w/(pts.length-1));
    const y=h-((v-mn)/range)*(h-4)-2;
    return x.toFixed(1)+','+y.toFixed(1);
  });
  const color=rising?'#00C896':'#FF7070';
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="overflow:visible;">'+
    '<polyline points="'+coords.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'+
    '</svg>';
}

function _smRenderMarket(stocks,portfolio,cash){
  const myHoldings={};
  portfolio.forEach(p=>{myHoldings[p.stock_user_id]=p.shares;});
  const selected=window._smSelected||null;

  // 선수 선택되면 상세 페이지
  if(selected){
    const s=stocks.find(x=>x.id===selected);
    const held=myHoldings[selected]||0;
    if(!s) return _smListHtml(stocks,myHoldings);
    const changeColor=s.change>0?'#00C896':s.change<0?'#FF7070':'var(--text-muted)';
    const changeSign=s.change>0?'+':'';
    const typeDesc={'우량주':'꾸준한 고승률 우량 선수. 안전하지만 상승폭은 제한적.','성장주':'최근 폼 급상승 중. 리스크 있지만 대박 가능성 있음.','위험주':'경기수 적어 변동성 큼. 고위험 고수익 투자처.','일반주':'안정적인 흐름. 적당한 리스크와 수익.'};
    const av=s.avatar?'<img src="'+s.avatar+'" onclick="showAvatarFull(\''+s.avatar+'\',\''+s.name+'\')" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);cursor:pointer;">'
      :'<div style="width:60px;height:60px;border-radius:50%;background:var(--bg3);border:2px solid var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;">'+s.name[0]+'</div>';
    return '<div>'+
      '<button onclick="window._smSelected=null;renderStockMarketPage();" style="display:flex;align-items:center;gap:4px;background:none;border:none;color:var(--text-muted);font-family:inherit;font-size:.82rem;cursor:pointer;margin-bottom:12px;padding:0;">'+
        '<span style="font-size:1.1rem;">‹</span> 종목 목록으로'+
      '</button>'+
      '<div class="card" style="padding:16px;">'+
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">'+av+
          '<div>'+
            '<div style="font-size:1rem;font-weight:700;margin-bottom:4px;">'+s.name+'</div>'+
            '<span style="font-size:.7rem;padding:3px 9px;border-radius:10px;background:'+s.typeBg+';color:'+s.typeColor+';font-weight:700;">'+s.typeIcon+' '+s.type+'</span>'+
          '</div>'+
        '</div>'+
          '<div style="margin-bottom:12px;">'+
          '<div style="font-weight:800;font-size:2rem;color:var(--text);line-height:1;">'+s.price.toLocaleString()+'<span style="font-size:.95rem;color:var(--text-muted);">p</span></div>'+
          '<div style="font-size:.82rem;color:'+changeColor+';font-weight:700;margin-top:3px;">'+(s.change>0?'+':'')+s.change.toLocaleString()+'p ('+((s.price>Math.abs(s.change))?(s.change>0?'+':s.change<0?'-':'')+Math.abs(Math.round(s.change/(s.price-s.change)*100)):0)+'%) · 전경기 대비</div>'+
        '</div>'+
        '<div style="background:rgba(0,0,0,.15);border-radius:10px;padding:10px 12px;margin-bottom:14px;">'+
          _smDrawSparkSVGLarge(s.spark,s.change>=0)+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:.75rem;">'+
          '<div style="background:var(--bg3);border-radius:10px;padding:9px;"><div style="color:var(--text-muted);margin-bottom:3px;">승률</div><div style="font-weight:700;font-size:.85rem;">'+Math.round(s.wr*100)+'%</div><div style="font-size:.68rem;color:var(--text-dim);margin-top:2px;">'+s.games+'경기 '+s.wins+'승 '+s.losses+'패</div></div>'+
          '<div style="background:var(--bg3);border-radius:10px;padding:9px;"><div style="color:var(--text-muted);margin-bottom:3px;">최근 5경기</div><div style="font-weight:700;font-size:.85rem;color:'+(s.recentWR>=0.5?'var(--primary)':'#FF7070')+';">'+s.recentW+'승 '+(s.recentGames-s.recentW)+'패</div><div style="font-size:.68rem;color:var(--text-dim);margin-top:2px;">'+Math.round(s.recentWR*100)+'% 성공률</div></div>'+
          '<div style="background:var(--bg3);border-radius:10px;padding:9px;"><div style="color:var(--text-muted);margin-bottom:3px;">보유자 수</div><div style="font-weight:700;font-size:.85rem;">'+s.holders+'명</div></div>'+
          '<div style="background:var(--bg3);border-radius:10px;padding:9px;"><div style="color:var(--text-muted);margin-bottom:3px;">종합점수</div><div style="font-weight:700;font-size:.85rem;color:var(--primary);">'+s.rp+'</div><div style="font-size:.62rem;color:var(--text-dim);margin-top:3px;">기본 '+s.bs+'</div></div>'+
        '</div>'+
        (held?'<div style="font-size:.78rem;color:var(--primary);text-align:center;margin-bottom:10px;font-weight:700;">현재 '+held+'주 보유 중</div>':'')+
        '<div style="display:flex;gap:8px;">'+
          '<button onclick="smBuy(\''+s.id+'\',\''+s.name+'\','+s.price+')" style="flex:1;padding:13px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-family:inherit;font-size:.92rem;font-weight:700;cursor:pointer;">📈 매수</button>'+
          (held?'<button onclick="smSell(\''+s.id+'\',\''+s.name+'\','+s.price+','+held+')" style="flex:1;padding:13px;border-radius:10px;border:1px solid rgba(255,82,82,.5);background:rgba(255,82,82,.1);color:#FF7070;font-family:inherit;font-size:.92rem;font-weight:700;cursor:pointer;">📉 매도</button>':'<button disabled style="flex:1;padding:13px;border-radius:10px;border:1px solid var(--border);background:var(--bg3);color:var(--text-dim);font-family:inherit;font-size:.92rem;cursor:default;">매도</button>')+
        '</div>'+
      '</div>'+
    '</div>';
  }

  return _smListHtml(stocks,myHoldings);
}

function _smListHtml(stocks,myHoldings){
  return stocks.map(s=>{
    const held=myHoldings[s.id]||0;
    const changeColor=s.change>0?'#00C896':s.change<0?'#FF7070':'var(--text-muted)';
    const changeSign=s.change>0?'+':'';
    const av=s.avatar?'<img src="'+s.avatar+'" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">'
      :'<div style="width:42px;height:42px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.95rem;font-weight:700;">'+s.name[0]+'</div>';
    return '<div onclick="window._smSelected=\''+s.id+'\';renderStockMarketPage();" '+
      'style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;margin-bottom:6px;cursor:pointer;background:var(--surface);border:1px solid var(--border);">'+
      av+
      '<div style="flex:1;min-width:0;">'+
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'+
          '<span style="font-size:.88rem;font-weight:700;">'+s.name+'</span>'+
          '<span style="font-size:.6rem;padding:1px 5px;border-radius:6px;background:'+s.typeBg+';color:'+s.typeColor+';font-weight:700;flex-shrink:0;">'+s.typeIcon+' '+s.type+'</span>'+
          (held?'<span style="font-size:.62rem;background:rgba(92,124,250,.15);color:var(--primary);border:1px solid rgba(92,124,250,.3);padding:1px 6px;border-radius:6px;font-weight:700;flex-shrink:0;">보유 '+held+'</span>':'')+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px;">'+
          '<span style="font-weight:800;font-size:.9rem;">'+s.price.toLocaleString()+'p</span>'+
          '<span style="font-size:.72rem;color:'+changeColor+';font-weight:700;">'+(s.change>0?'+':'')+s.change.toLocaleString()+'p ('+((s.price>Math.abs(s.change))?(s.change>0?'+':s.change<0?'-':'')+Math.abs(Math.round(s.change/(s.price-s.change)*100)):0)+'%)</span>'+
        '</div>'+
      '</div>'+
      '<div style="flex-shrink:0;margin-right:4px;">'+_smDrawSparkSVG(s.spark,s.change>=0)+'</div>'+
      '<span style="color:var(--text-dim);font-size:.9rem;">›</span>'+
    '</div>';
  }).join('')+
  '<div style="margin-top:14px;padding:11px 12px;border-radius:12px;background:rgba(0,200,150,.06);border:1px solid rgba(0,200,150,.18);font-size:.7rem;color:var(--text-muted);line-height:1.55;text-align:center;">'+
    '승인 경기 <span style="color:var(--text);font-weight:700;">5경기 이상</span>인 회원만 종목에 상장됩니다. 전체 랭킹과 동일한 기준입니다.'+
  '</div>';
}

function _smDrawSparkSVGLarge(pts,rising){
  if(!pts||!pts.length) return '';
  const mn=Math.min(...pts),mx=Math.max(...pts);
  const range=mx-mn||1;
  const w=160,h=50;
  const coords=pts.map((v,i)=>{
    const x=i*(w/(pts.length-1));
    const y=h-((v-mn)/range)*(h-6)-3;
    return x.toFixed(1)+','+y.toFixed(1);
  });
  const color=rising?'#00C896':'#FF7070';
  const first=coords[0].split(',');
  const last=coords[coords.length-1].split(',');
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="width:100%;overflow:visible;">'+
    '<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity="0.3"/><stop offset="100%" stop-color="'+color+'" stop-opacity="0.02"/></linearGradient></defs>'+
    '<polygon points="'+coords.join(' ')+' '+w+','+h+' 0,'+h+'" fill="url(#sg)"/>'+
    '<polyline points="'+coords.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+
    '<circle cx="'+last[0]+'" cy="'+last[1]+'" r="3" fill="'+color+'"/>'+
    '</svg>';
}

function _smRenderPortfolio(stocks,portfolio,cash,totalAsset,netTransferIn=0,tradeLogs=[],allRealizedPnl=null){
  // ① 실현손익 - allRealizedPnl이 있으면 사용(전체), 없으면 tradeLogs에서 계산(폴백)
  const realizedTotal=allRealizedPnl!==null?allRealizedPnl:(tradeLogs||[]).filter(r=>r.action==='sell').reduce((s,r)=>s+(r.pnl||0),0);
  // tradingProfit = 보유종목 미실현손익 + 매도 실현손익 (루프 후 stockPnlTotal 사용)
  // 일단 임시값, 루프 후 재계산
  let tradingProfit=0;
  let tradingColor='var(--primary)';

  // ② 보유 주식 미실현 손익 집계
  let stockPnlTotal=0, stockCostTotal=0;
  let holdingsHtml='';

  if(!portfolio.length){
    holdingsHtml='<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:.85rem;">보유 종목 없음<br><span style="font-size:.75rem;">종목 탭에서 매수해보세요</span></div>';
  } else {
    [...portfolio].sort((a,b)=>{
      const sa=stocks.find(x=>x.id===a.stock_user_id);
      const sb2=stocks.find(x=>x.id===b.stock_user_id);
      return ((sb2?.price||0)*b.shares)-((sa?.price||0)*a.shares);
    }).forEach(p=>{
      const st=stocks.find(x=>x.id===p.stock_user_id);
      if(!st) return;
      const curVal=st.price*p.shares;
      const buyVal=p.avg_price*p.shares;
      const pnl=curVal-buyVal;
      const pnlPct=p.avg_price>0?Math.round((st.price-p.avg_price)/p.avg_price*100):0;
      const pnlColor=pnl>=0?'var(--primary)':'#FF7070';
      const pnlPctStr=(pnlPct>=0?'+':'')+pnlPct+'%';
      stockPnlTotal+=pnl;
      stockCostTotal+=buyVal;
      const av=st.avatar
        ?'<img src="'+st.avatar+'" onclick="showAvatarFull(\''+st.avatar+'\',\''+st.name+'\')" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--border);cursor:pointer;">'
        :'<div style="width:38px;height:38px;border-radius:50%;background:var(--bg3);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;">'+st.name[0]+'</div>';
      holdingsHtml+=
        '<div onclick="window._smTab=\'market\';window._smSelected=\''+st.id+'\';renderStockMarketPage();"'
        +' style="padding:12px 14px;border-radius:14px;margin-bottom:8px;background:var(--surface);border:1px solid '+(pnl>=0?'rgba(0,200,150,.2)':'rgba(255,112,112,.15)')+';cursor:pointer;display:flex;align-items:center;gap:12px;">'
          +av
          +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:.9rem;font-weight:700;margin-bottom:3px;">'+st.name
              +' <span style="font-size:.58rem;background:'+st.typeBg+';color:'+st.typeColor+';padding:1px 6px;border-radius:5px;">'+st.typeIcon+' '+st.type+'</span></div>'
            +'<div style="font-size:.7rem;color:var(--text-muted);">평균 '+p.avg_price.toLocaleString()+'p · 보유 '+p.shares+'주</div>'
          +'</div>'
          +'<div style="text-align:right;flex-shrink:0;">'
            +'<div style="font-weight:800;font-size:1rem;color:var(--text);line-height:1.2;">'+curVal.toLocaleString()+'p</div>'
            +'<div style="font-size:.75rem;color:'+pnlColor+';font-weight:700;margin-top:2px;">'+(pnl>=0?'+':'')+pnl.toLocaleString()+'p</div>'
            +'<div style="font-size:.68rem;color:'+pnlColor+';">('+pnlPctStr+')</div>'
          +'</div>'
        +'</div>';
    });
  }

  // 보유 종목 합산 수익률
  // 보유종목 미실현손익 + 매도 실현손익 = 트레이딩 수익
  tradingProfit=stockPnlTotal+realizedTotal;
  tradingColor=tradingProfit>=0?'var(--primary)':'#FF7070';

  const holdingsPct=stockCostTotal>0?Math.round(stockPnlTotal/stockCostTotal*100):0;
  const holdingsPctStr=(holdingsPct>=0?'+':'')+holdingsPct+'%';
  const holdingsColor=stockPnlTotal>=0?'var(--primary)':'#FF7070';

  return '<div style="background:linear-gradient(135deg,rgba(255,214,0,.1),rgba(255,214,0,.03));border:1px solid rgba(255,214,0,.25);border-radius:14px;padding:14px;margin-bottom:14px;">'
    // 총자산 + 트레이딩 수익 한 줄
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">'
      +'<div>'
        +'<div style="font-size:.65rem;color:var(--text-muted);margin-bottom:2px;">총 자산</div>'
        +'<div style="font-weight:800;font-size:1.5rem;color:var(--warn);line-height:1.1;">'+totalAsset.toLocaleString()+'p</div>'
      +'</div>'
      +'<div style="text-align:right;">'
        +'<div style="font-size:.65rem;color:var(--text-muted);margin-bottom:2px;">📈 트레이딩 수익</div>'
        +'<div style="font-weight:800;font-size:1.1rem;color:'+tradingColor+';">'+(tradingProfit>=0?'+':'')+tradingProfit.toLocaleString()+'p</div>'
      +'</div>'
    +'</div>'
    // 현금/주식
    +'<div style="display:flex;gap:10px;font-size:.7rem;color:var(--text-muted);">'
      +'<span>💵 현금 '+cash.toLocaleString()+'p</span><span>📊 보유주식 '+(totalAsset-cash).toLocaleString()+'p</span>'
    +'</div>'
  +'</div>'
  // 보유 종목 헤더
  +(portfolio.length
    ?'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      +'<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);">보유 종목</div>'
      +'<div style="font-size:.88rem;text-align:right;">'
        +'<span style="color:'+holdingsColor+';font-weight:800;">'+(stockPnlTotal>=0?'+':'')+stockPnlTotal.toLocaleString()+'p</span>'
        +'<span style="color:'+holdingsColor+';font-weight:700;margin-left:5px;">('+holdingsPctStr+')</span>'
      +'</div>'
    +'</div>'
    :'<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">보유 종목</div>')
  +holdingsHtml
  // ③ 매매내역 (3.23. 이후)
  +_smTradeHistoryHtml(tradeLogs);
}

function _smTradeHistoryHtml(tradeLogs){
  const tradeItems=[];
  (tradeLogs||[]).forEach(r=>{
    const dt=new Date(r.created_at);
    const dateStr=(dt.getMonth()+1)+'/'+dt.getDate()+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
    tradeItems.push({...r, dateStr});
  });

  const PAGE=5;
  const renderTradeList=(items,limit)=>items.slice(0,limit).map(t=>{
    const isBuy=t.action==='buy';
    const pnlStr=!isBuy&&t.pnl!=null?((t.pnl>=0?'+':'')+t.pnl.toLocaleString()+'p'):'';
    const pnlColor=t.pnl>=0?'var(--primary)':'#FF7070';
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">'+
      '<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.82rem;flex-shrink:0;background:'+(isBuy?'rgba(0,200,150,.12)':'rgba(255,112,112,.12)')+';border:1px solid '+(isBuy?'rgba(0,200,150,.3)':'rgba(255,112,112,.3)')+';">'+
        (isBuy?'📈':'📉')+
      '</div>'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="font-size:.82rem;font-weight:700;">'+(isBuy?'매수 ':'매도 ')+escHtml(t.name||'')+'</div>'+
        '<div style="font-size:.68rem;color:var(--text-muted);">'+(t.qty||0)+'주 @'+(t.price||0).toLocaleString()+'p · '+t.dateStr+'</div>'+
      '</div>'+
      '<div style="text-align:right;flex-shrink:0;">'+
        '<div style="font-size:.82rem;font-weight:700;color:'+(isBuy?'#FF7070':'var(--primary)')+';">'+(isBuy?'-':'+')+(t.total||0).toLocaleString()+'p</div>'+
        (pnlStr?'<div style="font-size:.68rem;color:'+pnlColor+';font-weight:700;">손익 '+pnlStr+'</div>':'')+
      '</div>'+
    '</div>';
  }).join('');

  if(!tradeItems.length)
    return '<div style="margin-top:20px;"><div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">매매내역</div><div style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:.8rem;">매매 내역 없음</div></div>';

  window._smTradeLimit = window._smTradeLimit || PAGE;
  const limit = window._smTradeLimit;
  const listHtml = renderTradeList(tradeItems, limit);
  const remaining = tradeItems.length - limit;
  const moreBtn = remaining > 0
    ? '<button onclick="window._smTradeLimit+=' + PAGE + ';_smRefreshTradeList();" id="trade-more-btn" style="width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text-muted);font-family:inherit;font-size:.78rem;cursor:pointer;">더보기 (' + Math.min(PAGE, remaining) + '건 더)</button>'
    : '';

  // 전역에 tradeItems 저장 (더보기 버튼이 접근 가능하도록)
  window._smTradeItems = tradeItems;

  return '<div style="margin-top:20px;">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'+
      '<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);">매매내역</div>'+
      '<div style="font-size:.65rem;color:var(--text-dim);">최근 '+Math.min(limit,tradeItems.length)+'/'+tradeItems.length+'건</div>'+
    '</div>'+
    '<div id="trade-list-wrap">'+listHtml+'</div>'+
    '<div id="trade-more-wrap">'+moreBtn+'</div>'+
  '</div>';
}


function _smRefreshTradeList(){
  const items = window._smTradeItems||[];
  const limit = window._smTradeLimit||5;
  const listEl = document.getElementById('trade-list-wrap');
  const moreEl = document.getElementById('trade-more-wrap');
  if(!listEl) return;
  const renderItem = t => {
    const isBuy=t.action==='buy';
    const pnlStr=!isBuy&&t.pnl!=null?((t.pnl>=0?'+':'')+t.pnl.toLocaleString()+'p'):'';
    const pnlColor=t.pnl>=0?'var(--primary)':'#FF7070';
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">'+
      '<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.82rem;flex-shrink:0;background:'+(isBuy?'rgba(0,200,150,.12)':'rgba(255,112,112,.12)')+';border:1px solid '+(isBuy?'rgba(0,200,150,.3)':'rgba(255,112,112,.3)')+';">'+
        (isBuy?'📈':'📉')+'</div>'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="font-size:.82rem;font-weight:700;">'+(isBuy?'매수 ':'매도 ')+escHtml(t.name||'')+'</div>'+
        '<div style="font-size:.68rem;color:var(--text-muted);">'+(t.qty||0)+'주 @'+(t.price||0).toLocaleString()+'p · '+t.dateStr+'</div>'+
      '</div>'+
      '<div style="text-align:right;flex-shrink:0;">'+
        '<div style="font-size:.82rem;font-weight:700;color:'+(isBuy?'#FF7070':'var(--primary)')+';">'+(isBuy?'-':'+')+(t.total||0).toLocaleString()+'p</div>'+
        (pnlStr?'<div style="font-size:.68rem;color:'+pnlColor+';font-weight:700;">손익 '+pnlStr+'</div>':'')+
      '</div></div>';
  };
  listEl.innerHTML = items.slice(0,limit).map(renderItem).join('');
  const remaining = items.length - limit;
  if(moreEl) moreEl.innerHTML = remaining>0
    ? '<button onclick="window._smTradeLimit+=5;_smRefreshTradeList();" style="width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text-muted);font-family:inherit;font-size:.78rem;cursor:pointer;">더보기 ('+Math.min(5,remaining)+'건 더)</button>'
    : '';
  // 건수 업데이트
  const cntEl = listEl.previousElementSibling?.querySelector('div:last-child');
  if(cntEl) cntEl.textContent='최근 '+Math.min(limit,items.length)+'/'+items.length+'건';
}

async function _smRenderRanking(stocks){
  // allPortfolio는 캐시 활용 (renderStockMarketPage에서 30초 캐시)
  const [{data:trades},{data:ports}]=await Promise.all([
    sb.from('stock_trades').select('user_id,pnl').eq('action','sell'),
    sb.from('stock_portfolio').select('*'),
  ]);
  const allUsers=window._profilesCache||[];

  // 유저별 실현수익(pnl) 합산
  const pnlMap={};
  (trades||[]).forEach(t=>{
    if(!pnlMap[t.user_id]) pnlMap[t.user_id]=0;
    pnlMap[t.user_id]+=(t.pnl||0);
  });

  // 유저별 보유주식 시가
  const stockValMap={};
  (ports||[]).forEach(p=>{
    const st=stocks.find(x=>x.id===p.stock_user_id);
    const val=st?st.price*p.shares:0;
    stockValMap[p.user_id]=(stockValMap[p.user_id]||0)+val;
  });

  // 유저별 미실현 손익 계산
  const unrealizedMap={};
  (ports||[]).forEach(p=>{
    const st=stocks.find(x=>x.id===p.stock_user_id);
    if(!st) return;
    const pnl=(st.price-p.avg_price)*p.shares;
    unrealizedMap[p.user_id]=(unrealizedMap[p.user_id]||0)+pnl;
  });

  // 트레이딩 수익 = 실현손익(매도pnl합산) + 미실현손익(보유평가손익)
  // → cash 기반이 아니라 순수 매매 성과 기반
  const allUids=new Set([...Object.keys(pnlMap),...Object.keys(stockValMap)]);
  const ranked=[...allUids]
    .map(uid=>{
      const u=allUsers.find(x=>x.id===uid);
      if(!u) return null;
      const realized=pnlMap[uid]||0;
      const unrealized=unrealizedMap[uid]||0;
      const profit=realized+unrealized;
      const stockVal=stockValMap[uid]||0;
      return{uid,name:u.name,avatar:u?.avatar_url||'',profit,stockVal,realized,unrealized};
    })
    .filter(r=>r)
    .sort((a,b)=>b.profit-a.profit)
    .slice(0,20);

  if(!ranked.length) return '<div style="text-align:center;padding:40px 0;color:var(--text-muted);">아직 참여자가 없어요</div>';

  const notice='<div style="font-size:.72rem;color:var(--text-muted);background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">'+
    '<span style="font-size:.85rem;">📊</span> 실현손익 + 미실현손익 합산 기준'+
  '</div>';

  // 공통 row 렌더 함수
  const renderRow=(r,i,scoreHtml,subTxt)=>{
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
    const isMine=r.uid===ME?.id;
    const av=r.avatar?'<img src="'+r.avatar+'" onclick="showAvatarFull(\''+r.avatar+'\',\''+r.name+'\')" style="width:28px;height:28px;border-radius:50%;object-fit:cover;cursor:pointer;">'      :'<div style="width:28px;height:28px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;">'+r.name[0]+'</div>';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px '+(isMine?'10px':'2px')+';border-bottom:1px solid var(--border);border-radius:'+(isMine?8:0)+'px;'+(isMine?'background:rgba(0,200,150,.05);':'')+'margin-bottom:2px;">'+
      '<span style="width:22px;text-align:center;font-size:.85rem;">'+medal+'</span>'+
      av+
      '<div style="flex:1;min-width:0;"><div style="font-size:.83rem;font-weight:'+(isMine?700:500)+';">'+r.name+(isMine?' 👈':'')+'</div>'+
      '<div style="font-size:.65rem;color:var(--text-muted);">'+subTxt+'</div></div>'+
      scoreHtml+
    '</div>';
  };

  // ── 트레이딩 수익 랭킹 ──
  const tradingRows=ranked.map((r,i)=>{
    const pColor=r.profit>=0?'var(--primary)':'#FF7070';
    const scoreHtml='<div style="font-weight:800;font-size:.9rem;color:'+pColor+';">'+(r.profit>=0?'+':'')+r.profit.toLocaleString()+'p</div>';
    const subTxt='보유주식 '+r.stockVal.toLocaleString()+'p';
    return renderRow(r,i,scoreHtml,subTxt);
  }).join('');

  return notice+tradingRows;
}
async function smBuy(stockUserId,stockName,price){
  if(window._smTxBusy){toast('처리 중입니다. 잠시 후 다시 시도하세요','warning');return;}
  if(typeof checkTradingHalt==='function'){
    const halted=await checkTradingHalt();
    if(halted){toast('⏸ 현재 거래 정지 시간입니다. 매수가 불가합니다.','error');return;}
  }
  showConfirm({icon:'📈',title:stockName+' 매수',msg:'',okLabel:'매수',okClass:'btn-primary',
    onOk:async function(){
      if(window._smTxBusy) return;
      window._smTxBusy=true;
      try{
        const qty=parseInt(document.getElementById('sm-qty')?.value||'1');
        if(!qty||qty<1){toast('수량을 입력해주세요','error');return;}
        const total=price*qty;
        // 최신 잔액 재조회 (다이얼로그 열린 사이 변경 반영)
        const {data:w}=await sb.from('stock_wallets').select('cash').eq('user_id',ME.id).maybeSingle();
        const cash=w?.cash??0;
        if(total>cash){toast('현금 부족 (필요 '+total.toLocaleString()+'P, 보유 '+cash.toLocaleString()+'P)','error');return;}
        // 잔액 차감 — cash >= total 조건부 업데이트 (동시 요청 이중 차감 방지)
        const {data:deducted}=await sb.from('stock_wallets')
          .update({cash:cash-total})
          .eq('user_id',ME.id)
          .gte('cash',total)
          .select('cash');
        if(!deducted||!deducted.length){toast('현금이 부족합니다 (잔액 변동)','error');return;}
        // 포트폴리오 업데이트
        const {data:ex}=await sb.from('stock_portfolio').select('*').eq('user_id',ME.id).eq('stock_user_id',stockUserId).maybeSingle();
        if(ex){
          const ns=ex.shares+qty;
          await sb.from('stock_portfolio').update({shares:ns,avg_price:Math.round((ex.avg_price*ex.shares+price*qty)/ns)}).eq('id',ex.id);
        } else {
          await sb.from('stock_portfolio').insert({user_id:ME.id,stock_user_id:stockUserId,shares:qty,avg_price:price});
        }
        await sb.from('stock_trades').insert({user_id:ME.id,action:'buy',name:stockName,qty,price,total});
        if(typeof _walletCache!=='undefined') _walletCache=null;
        toast(stockName+' '+qty+'주 매수! -'+total.toLocaleString()+'P','success');
        renderStockMarketPage();
      }finally{
        window._smTxBusy=false;
      }
    }
  });
  setTimeout(function(){
    const m=document.getElementById('confirm-msg');
    if(!m) return;
    sb.from('stock_wallets').select('cash').eq('user_id',ME.id).maybeSingle().then(({data:w})=>{
      const avail=w?.cash??2000;
      const maxQty=Math.floor(avail/price)||0;
      m.innerHTML='<div style="margin:12px 0;">'+
        '<div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-muted);margin-bottom:8px;">'+
          '<span>주가 <b style="color:var(--primary);">'+price.toLocaleString()+'p</b></span>'+
          '<span>최대 <b style="color:var(--primary);">'+maxQty+'주</b> 구매 가능</span>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px;">'+
          '<label style="font-size:.82rem;color:var(--text-muted);">수량</label>'+
          '<input id="sm-qty" type="number" min="1" max="'+maxQty+'" value="1" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;font-size:.9rem;text-align:center;" oninput="document.getElementById(\'sm-total\').textContent=(parseInt(this.value||1)*'+price+').toLocaleString()+\'p\'">'+
          '<button onclick="document.getElementById(\'sm-qty\').value='+maxQty+';document.getElementById(\'sm-total\').textContent=('+maxQty+'*'+price+').toLocaleString()+\'p\'" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text-muted);font-family:inherit;font-size:.76rem;cursor:pointer;">최대</button>'+
        '</div>'+
        '<div style="font-size:.8rem;color:var(--text-muted);margin-top:6px;">합계: <b id="sm-total" style="color:var(--primary);">'+price.toLocaleString()+'p</b></div>'+
      '</div>';
    });
  },30);
}

async function smSell(stockUserId,stockName,price,held){
  if(window._smTxBusy){toast('처리 중입니다. 잠시 후 다시 시도하세요','warning');return;}
  if(typeof checkTradingHalt==='function'){
    const halted=await checkTradingHalt();
    if(halted){toast('⏸ 현재 거래 정지 시간입니다. 매도가 불가합니다.','error');return;}
  }
  showConfirm({icon:'📉',title:stockName+' 매도',msg:'',okLabel:'매도',okClass:'btn-danger',
    onOk:async function(){
      if(window._smTxBusy) return;
      window._smTxBusy=true;
      try{
        const qty=parseInt(document.getElementById('sm-sell-qty')?.value||'1');
        if(!qty||qty<1||qty>held){toast('수량이 올바르지 않습니다','error');return;}
        const total=price*qty;
        // 최신 보유 수량 재조회 (중복 매도 방지)
        const {data:ex}=await sb.from('stock_portfolio').select('*').eq('user_id',ME.id).eq('stock_user_id',stockUserId).maybeSingle();
        if(!ex||ex.shares<qty){toast('보유 수량이 부족합니다','error');return;}
        const {data:w}=await sb.from('stock_wallets').select('cash').eq('user_id',ME.id).maybeSingle();
        // 포트폴리오 차감 — shares >= qty 조건부 업데이트 (중복 매도 방지)
        if(qty>=ex.shares){
          const {data:del}=await sb.from('stock_portfolio').delete().eq('id',ex.id).eq('user_id',ME.id).select('id');
          if(!del||!del.length){toast('매도 처리 중 오류 (중복 요청 가능성)','error');return;}
        } else {
          const {data:upd}=await sb.from('stock_portfolio')
            .update({shares:ex.shares-qty})
            .eq('id',ex.id)
            .gte('shares',qty)
            .select('shares');
          if(!upd||!upd.length){toast('매도 처리 중 오류 (중복 요청 가능성)','error');return;}
        }
        await sb.from('stock_wallets').update({cash:(w?.cash||0)+total}).eq('user_id',ME.id);
        const costBasis=(ex.avg_price||0)*qty;
        const realizedPnl=total-costBasis;
        await sb.from('stock_trades').insert({user_id:ME.id,action:'sell',name:stockName,qty,price,total,cost:costBasis,pnl:realizedPnl});
        if(typeof _walletCache!=='undefined') _walletCache=null;
        toast(stockName+' '+qty+'주 매도! +'+total.toLocaleString()+'P','success');
        renderStockMarketPage();
      }finally{
        window._smTxBusy=false;
      }
    }
  });
  setTimeout(function(){
    const m=document.getElementById('confirm-msg');
    if(!m) return;
    m.innerHTML='<div style="margin:12px 0;"><div style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px;">주가 <b style="color:var(--primary);">'+price.toLocaleString()+'p</b> · 보유 <b>'+held+'주</b></div>'+
      '<div style="display:flex;align-items:center;gap:8px;"><label style="font-size:.82rem;color:var(--text-muted);">수량</label>'+
      '<input id="sm-sell-qty" type="number" min="1" max="'+held+'" value="'+held+'" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;font-size:.9rem;text-align:center;" oninput="document.getElementById(\'sm-sell-total\').textContent=(parseInt(this.value||1)*'+price+').toLocaleString()+\'p\'"></div>'+
      '<div style="font-size:.8rem;color:var(--text-muted);margin-top:6px;">수령액: <b id="sm-sell-total" style="color:var(--primary);">'+(price*held).toLocaleString()+'p</b></div></div>';
  },30);
}

/* ── 증권통장 포트폴리오 상세 페이지 (내 포인트에서 진입) ── */
async function renderStockDetailPage(){
  const el=document.getElementById('stockdetail-content');
  if(!el) return;
  el.innerHTML='<div style="text-align:center;padding:40px 0;"><div class="spinner" style="margin:0 auto;"></div></div>';

  await ensureSeasonStart(); // 시즌 컷오프 보장

  // 매치 캐시 보장
  if(!window._allMatchesCache||!window._allMatchesCache.length){
    const {data:m,error:_e0}=await sb.from('matches').select('id,match_type,match_date,a1_id,a2_id,b1_id,b2_id,score_a,score_b,status,created_at').eq('status','approved');
    window._allMatchesCache=m||[];
  }
  if(!window._profilesCache||!window._profilesCache.length){
    const {data:u,error:_e0}=await sb.from('profiles').select('id,name,gender,role,status,exclude_stats,avatar_url,player_tag').eq('status','approved');
    window._profilesCache=u||[];
  }

  const allM=window._allMatchesCache||[];
  const users=(window._profilesCache||[]).filter(u=>u.status==='approved'&&!u.exclude_stats);
  const [portRes, walletRes, allPortRes]=await Promise.all([
    sb.from('stock_portfolio').select('*').eq('user_id',ME.id),
    sb.from('stock_wallets').select('cash').eq('user_id',ME.id).maybeSingle(),
    sb.from('stock_portfolio').select('stock_user_id,user_id'),
  ]);

  const stocks=_smCalcStocks(users,allM,allPortRes.data||[]);
  const portfolio=portRes.data||[];
  const cash=walletRes.data?.cash??2000;

  const totalStock=portfolio.reduce((s,p)=>{
    const st=stocks.find(x=>x.id===p.stock_user_id);
    return s+(st?st.price*p.shares:0);
  },0);
  const totalAsset=cash+totalStock;

  const portfolioRows=portfolio.length
    ?portfolio.map(p=>{
      const st=stocks.find(x=>x.id===p.stock_user_id);
      if(!st) return '';
      const val=st.price*p.shares;
      const cost=p.avg_price*p.shares;
      const profit=val-cost;
      const pColor=profit>=0?'var(--primary)':'#FF7070';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;flex-shrink:0;">'+st.name[0]+'</div>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-size:.85rem;font-weight:700;">'+st.name+'</div>'+
          '<div style="font-size:.7rem;color:var(--text-muted);">'+p.shares+'주 · 평균 '+p.avg_price.toLocaleString()+'p</div>'+
        '</div>'+
        '<div style="text-align:right;">'+
          '<div style="font-size:.88rem;font-weight:700;">'+val.toLocaleString()+'p</div>'+
          '<div style="font-size:.7rem;color:'+pColor+';">'+(profit>=0?'+':'')+profit.toLocaleString()+'p</div>'+
        '</div>'+
      '</div>';
    }).join('')
    :'<div style="text-align:center;padding:30px 0;color:var(--text-muted);font-size:.85rem;">보유 주식이 없습니다</div>';

  el.innerHTML=
    '<div style="padding:0 0 16px;">'+
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px 11px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:10;">'+
        '<button onclick="navigateTo(\'balance\')" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;padding:0;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;margin-right:2px;">‹</button>'+
        '<div style="flex:1;"><div style="font-size:.95rem;font-weight:700;">📈 증권통장</div></div>'+
      '</div>'+
      '<div style="padding:12px 14px 0;">'+
        // 자산 요약
        '<div style="background:linear-gradient(135deg,rgba(255,179,0,.1),rgba(255,179,0,.03));border:1px solid rgba(255,179,0,.25);border-radius:14px;padding:14px;margin-bottom:14px;">'+
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">'+
            '<div><div style="font-size:.65rem;color:var(--text-muted);margin-bottom:3px;">총 자산</div><div style="font-weight:800;font-size:1rem;color:var(--warn);">'+totalAsset.toLocaleString()+'p</div></div>'+
            '<div><div style="font-size:.65rem;color:var(--text-muted);margin-bottom:3px;">현금</div><div style="font-weight:800;font-size:1rem;">'+cash.toLocaleString()+'p</div></div>'+
            '<div><div style="font-size:.65rem;color:var(--text-muted);margin-bottom:3px;">주식평가</div><div style="font-weight:800;font-size:1rem;color:var(--primary);">'+totalStock.toLocaleString()+'p</div></div>'+
          '</div>'+
        '</div>'+
        // 보유 주식 목록
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">보유 주식</div>'+
        '<div>'+portfolioRows+'</div>'+
        '<button onclick="navigateTo(\'stockmarket\')" style="width:100%;margin-top:14px;padding:11px;border-radius:10px;border:1px solid var(--border);background:var(--bg3);color:var(--text-muted);font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer;">증권거래소로 이동 →</button>'+
      '</div>'+
    '</div>';
}


// ── 증권 뉴스 탭 (자체 로직) ──
function _smRenderNews(stocks){
  const articles = _smBuildNews(stocks);
  const slotLabel = window._smNewsSlotLabel||'';

  const html = articles.map(a =>
    '<div style="background:'+a.bg+';border:1px solid '+a.border+';border-radius:12px;padding:12px 14px;margin-bottom:10px;">'+
      '<div style="font-size:.67rem;font-weight:700;color:'+a.tagColor+';margin-bottom:5px;letter-spacing:.3px;">'+a.tag+'</div>'+
      '<div style="font-size:.88rem;font-weight:700;margin-bottom:6px;line-height:1.4;">'+escHtml(a.title)+'</div>'+
      '<div style="font-size:.78rem;color:var(--text-muted);line-height:1.65;">'+escHtml(a.body)+'</div>'+
    '</div>'
  ).join('');

  return '<div style="padding:8px 0;">'+
    '<div style="font-size:.67rem;color:var(--text-muted);margin-bottom:12px;text-align:right;">📅 '+slotLabel+' 기준 업데이트 · 14:00 / 22:00 갱신</div>'+
    html+
  '</div>';
}

function _smBuildNews(stocks){
  if(!stocks||!stocks.length) return [{tag:'📰 시황',tagColor:'#A0A0A0',bg:'var(--bg2)',border:'var(--border)',title:'데이터 로딩 중',body:'잠시 후 다시 확인해주세요.'}];

  // 시간 기반 고정 시드 (14시/22시 기준, 모든 회원 동일 내용)
  const now = new Date();
  const kst = new Date(now.getTime() + 9*60*60*1000);
  const h = kst.getUTCHours();
  const slot = h < 14 ? 0 : h < 22 ? 1 : 2;
  const dateKey = kst.getUTCFullYear()*10000 + (kst.getUTCMonth()+1)*100 + kst.getUTCDate();
  let _seed = dateKey * 10 + slot;
  const seededRand = () => { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return ((_seed>>>0)/0xffffffff); };
  const pick = arr => arr[Math.floor(seededRand()*arr.length)];
  const seededPickIdx = n => Math.floor(seededRand()*n);
  const slotNames = ['전일 22:00', '14:00', '22:00'];
  window._smNewsSlotLabel = `${kst.getUTCMonth()+1}월 ${kst.getUTCDate()}일 ${slotNames[slot]}`;

  const TOTAL_MEMBERS = 30;
  const BASE_PRICE = 100;
  const priceGrade = (p) => p >= 130 ? '고가주' : p >= 100 ? '중가주' : '저가주';
  const articles = [];

  // 기본 정렬
  const byChange  = [...stocks].sort((a,b)=>b.change-a.change);
  const byPrice   = [...stocks].sort((a,b)=>b.price-a.price);
  const byHolders = [...stocks].sort((a,b)=>b.holders-a.holders);
  const rising    = byChange.filter(s=>s.change>0);
  const falling   = byChange.filter(s=>s.change<0);
  const cheap     = [...stocks].sort((a,b)=>a.price-b.price).filter(s=>s.price<50);
  const bluechips = stocks.filter(s=>s.type==='우량주');
  const growth    = stocks.filter(s=>s.type==='성장주');
  const avgPrice  = Math.round(stocks.reduce((s,x)=>s+x.price,0)/stocks.length);
  const totalStocks = stocks.length;

  // 보유자 비율 표현 (30명 기준)
  const holdersLabel = (n) => {
    const pct = Math.round(n/TOTAL_MEMBERS*100);
    if(pct>=40) return `회원 중 ${pct}%가 보유한 인기 종목`;
    if(pct>=20) return `${n}명(${pct}%)의 투자자가 보유 중`;
    return `아직 ${n}명만 보유한 틈새 종목`;
  };

  // 비활성 선수 감지 (recentGames=0 or 최근 경기 없음)
  const inactive = stocks.filter(s=>s.recentGames===0&&s.games>0);
  // 연승 중인 선수
  const streaking = stocks.filter(s=>s.recentW>=3&&s.recentGames>=3);
  // 연패 중인 선수
  const slumping  = stocks.filter(s=>(s.recentGames-s.recentW)>=3&&s.recentGames>=3);
  // 고가 미보유 (비싸지만 아무도 안 산)
  const expensiveUnheld = [...byPrice].filter(s=>s.holders===0).slice(0,3);

  // 후보 뉴스 풀 (랜덤으로 4개 선택)
  const pool = [];

  // ── 상승 ──
  if(rising.length>0){
    const s=rising[0];
    const pct=s.price>Math.abs(s.change)?Math.abs(Math.round(s.change/(s.price-s.change)*100)):0;
    pool.push({tag:'📈 상승',tagColor:'#00C896',bg:'rgba(0,200,150,.06)',border:'rgba(0,200,150,.25)',
      title:pick([`${s.name} 강세, 전 경기 대비 +${s.change}P`,`상승 1위 ${s.name}, 투자자 환호`,`${s.name} 반등 성공… 주가 ${s.price}P 돌파`]),
      body:pick([
        `최근 승률 ${Math.round(s.recentWR*100)}%로 전체 승률(${Math.round(s.wr*100)}%)을 웃돌았다. ${holdersLabel(s.holders)}으로 매수 경쟁이 치열하다.`,
        `${s.games}경기 ${s.wins}승을 기록 중인 ${s.name}. 최근 ${s.recentW}승 행진이 주가를 끌어올리고 있다. 전 경기 대비 ${pct}% 상승.`,
        `${s.name}이 현재 ${s.price}P를 기록하며 상승세를 이어가고 있다. ${holdersLabel(s.holders)}이며 관심이 집중되고 있다.`,
      ])});
  }

  // ── 하락 ──
  if(falling.length>0){
    const s=falling[falling.length-1];
    pool.push({tag:'📉 하락',tagColor:'#FF7070',bg:'rgba(255,82,82,.06)',border:'rgba(255,82,82,.25)',
      title:pick([`${s.name} 급락, ${s.change}P 하락`,`${s.name} 부진 지속… 투자자 불안`,`${s.name} 주가 약세, 손절 vs 존버 기로`]),
      body:pick([
        `최근 승률 ${Math.round(s.recentWR*100)}%로 전체 평균(${Math.round(s.wr*100)}%)을 하회했다. 현재 주가 ${s.price}P에서 반등 신호를 기다리는 투자자들이 늘고 있다.`,
        `${s.losses}패를 기록하며 하락세가 지속되는 ${s.name}. ${holdersLabel(s.holders)}이며 일부 투자자들은 저가 매수 기회로 보고 있다.`,
        `${s.name}의 최근 흐름이 심상치 않다. 승률이 ${Math.round(s.wr*100)}%까지 떨어지며 주가 지지선 붕괴 우려가 제기된다.`,
      ])});
  }

  // ── 거래 없는 선수 (자본잠식/거래 공백) ──
  if(inactive.length>0){
    const s=inactive[seededPickIdx(Math.min(inactive.length,3))];
    pool.push({tag:'😴 거래 공백',tagColor:'#9E9E9E',bg:'rgba(150,150,150,.06)',border:'rgba(150,150,150,.25)',
      title:pick([`${s.name}, 최근 경기 이력 없음… 사실상 거래 정지`,`${s.name} 코트 실종 사태, 주가에 먹구름`,`${s.name} 거래량 0… 투자자들 "언제 돌아오나"`]),
      body:pick([
        `${s.name}은 보유 종목 수 ${s.holders}명을 유지하고 있지만 최근 경기 참여 이력이 없다. 거래소 관계자는 "경기 복귀가 주가 회복의 열쇠"라고 밝혔다.`,
        `전체 ${s.games}경기 전적을 보유한 ${s.name}이지만 최근 활동이 끊기며 주가 ${s.price}P에서 거래가 얼어붙었다. 사실상 자본잠식 우려가 나오는 상황.`,
        `"${s.name} 언제 나와요?" 투자자들의 궁금증이 커지고 있다. 최근 경기 부재로 신뢰지수가 하락 중이며 보유자들의 인내심도 바닥을 보이고 있다.`,
      ])});
  }

  // ── 연승 중인 선수 ──
  if(streaking.length>0){
    const s=streaking[seededPickIdx(streaking.length)];
    pool.push({tag:'🔥 연승 행진',tagColor:'#FF6B35',bg:'rgba(255,107,53,.06)',border:'rgba(255,107,53,.25)',
      title:pick([`${s.name} 최근 ${s.recentW}연승! 폼 절정`,`뜨거운 ${s.name}, 연승 행진에 주가 고공 행진`,`${s.name} 지금 담아야 하나? 연승 모멘텀 주목`]),
      body:pick([
        `최근 ${s.recentGames}경기에서 ${s.recentW}승을 거두며 코트를 지배하고 있는 ${s.name}. ${holdersLabel(s.holders)}으로 지금이 매수 타이밍이라는 분석이 나온다.`,
        `현재 주가 ${s.price}P인 ${s.name}이 연승 행진을 이어가고 있다. 전체 승률 ${Math.round(s.wr*100)}%에 최근 폼까지 더해지며 프리미엄이 붙는 모양새다.`,
      ])});
  }

  // ── 슬럼프 ──
  if(slumping.length>0){
    const s=slumping[seededPickIdx(slumping.length)];
    pool.push({tag:'😰 슬럼프',tagColor:'#AB47BC',bg:'rgba(171,71,188,.06)',border:'rgba(171,71,188,.25)',
      title:pick([`${s.name} 최근 ${s.recentGames-s.recentW}연패… 슬럼프 탈출 언제?`,`${s.name} 극심한 부진, 보유자들 발만 동동`,`${s.name} 주가 위협하는 연속 패배`]),
      body:pick([
        `최근 ${s.recentGames}경기에서 ${s.recentGames-s.recentW}패를 기록 중인 ${s.name}. 주가 ${s.price}P를 방어하고 있지만 추가 하락 압력이 거세다. 투자자들은 슬럼프 탈출 여부에 주목하고 있다.`,
        `${holdersLabel(s.holders)}이지만 연속 패배로 주가 전망이 흐려진 ${s.name}. 일부 보유자들은 손절을 검토 중이라는 소식이 들린다.`,
      ])});
  }

  // ── 인기 종목 ──
  const topHolder = byHolders[0];
  if(topHolder&&topHolder.holders>0){
    const pct=Math.round(topHolder.holders/TOTAL_MEMBERS*100);
    pool.push({tag:'👥 인기 종목',tagColor:'#42A5F5',bg:'rgba(66,165,245,.06)',border:'rgba(66,165,245,.25)',
      title:pick([`새벽민턴 최다 보유 종목은 ${topHolder.name}`,`회원 ${pct}%가 선택한 ${topHolder.name}, 왜?`,`${topHolder.name} 포트폴리오 필수템 등극`]),
      body:pick([
        `전체 회원의 약 ${pct}%인 ${topHolder.holders}명이 ${topHolder.name}을 보유 중이다. 승률 ${Math.round(topHolder.wr*100)}%와 안정적인 경기 스타일이 투자자들의 마음을 사로잡은 것으로 분석된다.`,
        `${topHolder.name}이 ${topHolder.holders}명의 투자자를 끌어모으며 새벽민턴에서 가장 인기 있는 종목이 됐다. 현재 주가 ${topHolder.price}P로 거래 중이다.`,
      ])});
  }

  // ── 무보유 고가 종목 (아무도 안 산 비싼 종목) ──
  if(expensiveUnheld.length>0){
    const s=expensiveUnheld[0];
    pool.push({tag:'🏔 미개척 종목',tagColor:'#26A69A',bg:'rgba(38,166,154,.06)',border:'rgba(38,166,154,.25)',
      title:pick([`${priceGrade(s.price)} ${s.name}, 보유자 0명… 왜?`,`${s.name}(${s.price}P), 투자자에게 외면당한 종목`,`아무도 안 사는 ${s.name}… 진짜 기회일까`]),
      body:pick([
        `${s.name}은 ${priceGrade(s.price)}(${s.price}P)이지만 보유자가 아무도 없다. 승률 ${Math.round(s.wr*100)}%의 실력파인데 투자자 발굴이 안 된 인목 종목.`,
        `${s.name}(${s.price}P)은 투자자 관심을 받지 못하고 있다. 분산 투자 차원에서 소량 편입을 노려볼 만하다는 의견이 나온다.`,
      ])});
  }

  // ── 추천 (저가/성장주) ──
  const recTarget = cheap.length>0 ? cheap[seededPickIdx(Math.min(cheap.length,3))] : growth[0];
  if(recTarget){
    pool.push({tag:'💡 매수 추천',tagColor:'#4B9EFF',bg:'rgba(75,158,255,.06)',border:'rgba(75,158,255,.25)',
      title:pick([`지금이 기회? ${recTarget.name} 저점 매수 타이밍`,`${recTarget.name} ${recTarget.type==='성장주'?'성장주 등극,':''} 현재 ${recTarget.price}P`,`분석가 추천: ${recTarget.name} 포트폴리오에 담아라`]),
      body:pick([
        `${priceGrade(recTarget.price)}(${recTarget.price}P)인 ${recTarget.name}. 승률 ${Math.round(recTarget.wr*100)}%, ${recTarget.games}경기 노하우를 보유한 실력파다. ${holdersLabel(recTarget.holders)}.`,
        `분석가들은 ${recTarget.name}의 현 주가(${recTarget.price}P)가 실력 대비 저평가됐다고 입을 모은다. 포트폴리오 다각화 차원에서 소량 편입을 고려해볼 만하다.`,
      ])});
  }

  // ── 시황 총평 ──
  const topPrice = byPrice[0];
  pool.push({tag:'📰 시황 총평',tagColor:'#FFB700',bg:'rgba(255,183,0,.06)',border:'rgba(255,183,0,.25)',
    title:pick([`새벽민턴 증권거래소 마감 브리핑`,`이번 주 시장 총평: 평균 주가 ${avgPrice}P`,`상승 ${rising.length}종목 vs 하락 ${falling.length}종목`]),
    body:pick([
      `최고가 ${topPrice.name}(${topPrice.price}P), ${holdersLabel(topHolder?.holders||0).replace('으로','인')} ${topHolder?.name||''}이 시장을 이끌었다. 전체 ${totalStocks}종목 평균 ${avgPrice}P 기록.`,
      `${bluechips.length>0?`우량주 ${bluechips.map(b=>b.name).join('·')}이 시장을 견인했다.`:`이번 장엔 우량주 기준 충족 종목이 없어 변동성이 컸다.`} 상승 ${rising.length}·하락 ${falling.length}·보합 ${totalStocks-rising.length-falling.length}종목으로 장이 마감됐다.`,
      `${rising.length>falling.length?'강세장':'약세장'} 분위기 속 ${inactive.length>0?inactive.map(s=>s.name).join('·')+'은 경기 공백으로 주가 동결 중.':'전 종목이 경기에 참여하며 활발한 거래가 이뤄졌다.'}`,
    ])});

  // 풀에서 랜덤 4개 선택 (순서 섞기)
  for(let i=pool.length-1;i>0;i--){const j=seededPickIdx(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,4);
}

/* ── 예금↔증권 이체 ── */
async function smTransfer(dir){
  // dir: 'sav2sm' (예금→증권) | 'sm2sav' (증권→예금)
  const label=dir==='sav2sm'?'예금 → 증권':'증권 → 예금';
  const icon=dir==='sav2sm'?'🏦':'📤';

  // 현재 잔액 조회
  const [{data:wallet},{data:savRow}]=await Promise.all([
    sb.from('stock_wallets').select('cash').eq('user_id',ME.id).maybeSingle(),
    sb.from('wallets').select('balance').eq('user_id',ME.id).maybeSingle(),
  ]);
  const smCash=wallet?.cash??2000;
  const savBalance=savRow?.balance??0;
  const maxAmt=dir==='sav2sm'?savBalance:smCash;

  showConfirm({icon,title:label,msg:'',okLabel:'이체',okClass:'btn-primary',
    onOk:async function(){
      const amt=parseInt(document.getElementById('sm-transfer-amt')?.value||'0');
      if(!amt||amt<1){toast('금액을 입력해주세요','error');return;}
      if(amt>maxAmt){toast('잔액 부족','error');return;}
      if(dir==='sav2sm'){
        await sb.from('wallets').update({balance:savBalance-amt}).eq('user_id',ME.id);
        await sb.from('stock_wallets').upsert({user_id:ME.id,cash:smCash+amt});
      } else {
        await sb.from('stock_wallets').update({cash:smCash-amt}).eq('user_id',ME.id);
        await sb.from('wallets').upsert({user_id:ME.id,balance:savBalance+amt});
      }
      await sb.from('wallet_transfers').insert({user_id:ME.id,dir,amt});
      if(typeof _walletCache!=='undefined') _walletCache=null;
      toast(label+' '+amt.toLocaleString()+'P 완료','success');
      renderStockMarketPage();
    }
  });
  setTimeout(()=>{
    const m=document.getElementById('confirm-msg');
    if(!m) return;
    m.innerHTML=
      '<div style="margin:12px 0;">'+
        '<div style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px;">'+
          (dir==='sav2sm'?'예금 잔액':'증권 현금')+
          ' <b style="color:var(--primary);">'+maxAmt.toLocaleString()+'P</b> 이체 가능'+
        '</div>'+
        '<input id="sm-transfer-amt" type="number" min="1" max="'+maxAmt+'" placeholder="이체 금액 입력"'+
          ' style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;font-size:.9rem;box-sizing:border-box;">'+
      '</div>';
  },30);
}