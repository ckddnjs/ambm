/* ══════════════════════════════════════════
   🏸 셔틀콕 제작소 — 증권거래소 제작 탭
   결제 수단: 증권 현금 (stock_wallets)
══════════════════════════════════════════ */

// ── 아이템 정의 ──
const MARKET_ITEMS = [
  {id:'feather_bundle',icon:'🪶',name:'깃털 번들',desc:'셔틀콕 제작용 깃털 4개 묶음. 총 4회 구매 시 16개 완성.',price:400,unit:'4개입',category:'craft',craftItem:'feather',craftQty:4},
  {id:'cork',icon:'🔘',name:'코르크',desc:'셔틀콕의 기초가 되는 코르크 헤드. 깃털 16개를 일정한 각도로 박아 고정.',price:400,unit:'1개',category:'craft',craftItem:'cork',craftQty:1},
  {id:'thread',icon:'🧵',name:'실',desc:'깃털을 일정한 간격과 각도로 고정하기 위해 상/하 두 줄로 엮는 실.',price:200,unit:'1묶음',category:'craft',craftItem:'thread',craftQty:1},
  {id:'tape',icon:'🩹',name:'띠지',desc:'깃털이 코르크에 박힌 부분에 접착제를 바른 뒤 감싸 깃털이 빠지지 않도록 단단히 고정.',price:200,unit:'1장',category:'craft',craftItem:'tape',craftQty:1},
  {id:'artisan_craft',icon:'✨',name:'장인의 손길',desc:'셔틀콕 제작 시 사용하면 비행 테스트를 100% 통과합니다.',price:4000,unit:'1장',category:'special',craftItem:'artisan',craftQty:1},
  {id:'recycle',icon:'♻️',name:'재활용의 손길',desc:'불량 셔틀콕 1개를 완성된 셔틀콕으로 복구합니다.',price:6000,unit:'1개',category:'special',craftItem:'recycle',craftQty:1},
];

const SHUTTLECOCK_RECIPE = [
  {item:'feather',name:'깃털',icon:'🪶',need:16,desc:'깃털 16개 — 코르크에 일정한 각도로 박아 고정'},
  {item:'cork',name:'코르크',icon:'🔘',need:1,desc:'코르크 1개 — 셔틀콕의 기초 헤드'},
  {item:'thread',name:'실',icon:'🧵',need:1,desc:'실 1묶음 — 깃털을 상/하 두 줄로 엮어 고정'},
  {item:'tape',name:'띠지',icon:'🩹',need:1,desc:'띠지 1장 — 접착제 도포 후 감싸 깃털 이탈 방지'},
];

/* ── DB 헬퍼 ── */
async function _getMarketInv(uid){
  const {data}=await sb.from('market_inventory').select('*').eq('user_id',uid).maybeSingle();
  if(data) return {...data};
  const row={user_id:uid,feather:0,cork:0,thread:0,tape:0,artisan:0,recycle:0,shuttles:0,defective:0};
  await sb.from('market_inventory').upsert(row,{onConflict:'user_id'});
  return row;
}

async function _saveMarketInv(uid,inv){
  const {error}=await sb.from('market_inventory').upsert({
    user_id:uid,feather:inv.feather||0,cork:inv.cork||0,thread:inv.thread||0,tape:inv.tape||0,
    artisan:inv.artisan||0,recycle:inv.recycle||0,shuttles:inv.shuttles||0,defective:inv.defective||0,
  },{onConflict:'user_id'});
  return {error};
}

/* ── 메인 렌더러 (stockmarket.js의 제작 탭에서 호출) ── */
// stockCash: 이미 로드된 증권 현금 (stock_wallets.cash)
async function _smRenderCraftTab(stockCash){
  const subTab=window._smCraftTab||'market';

  const [priceCfgRes,flightCfgRes]=await Promise.all([
    sb.from('app_settings').select('value').eq('key','market_prices').maybeSingle(),
    sb.from('app_settings').select('value').eq('key','market_config').maybeSingle(),
  ]);
  let _marketPrices={};
  let _flightRate=40;
  if(priceCfgRes.data?.value){try{_marketPrices=JSON.parse(priceCfgRes.data.value);}catch(e){}}
  if(flightCfgRes.data?.value){try{_flightRate=JSON.parse(flightCfgRes.data.value).flight_rate??40;}catch(e){}}
  window._marketFlightRate=_flightRate;
  const _items=MARKET_ITEMS.map(i=>({...i,price:Number(_marketPrices[i.id]??i.price)}));
  window._cachedMarketItems=_items;

  const inv=await _getMarketInv(ME?.id);
  const myShuttles=inv.shuttles||0;
  const myDefective=inv.defective||0;
  const cash=stockCash;

  return (
    // 서브탭 + 잔액 한 줄
    '<div style="display:flex;align-items:flex-end;border-bottom:1px solid var(--border);margin-bottom:14px;">'+
      '<button onclick="window._smCraftTab=\'market\';renderStockMarketPage();" style="flex:1;padding:9px 4px 8px;border:none;border-bottom:2px solid '+(subTab==='market'?'var(--primary)':'transparent')+';margin-bottom:-1px;background:none;font-family:inherit;font-size:.78rem;font-weight:'+(subTab==='market'?'700':'500')+';color:'+(subTab==='market'?'var(--primary)':'var(--text-muted)')+';cursor:pointer;transition:color .15s;">🪶 재료</button>'+
      '<button onclick="window._smCraftTab=\'workshop\';renderStockMarketPage();" style="flex:1;padding:9px 4px 8px;border:none;border-bottom:2px solid '+(subTab==='workshop'?'var(--primary)':'transparent')+';margin-bottom:-1px;background:none;font-family:inherit;font-size:.78rem;font-weight:'+(subTab==='workshop'?'700':'500')+';color:'+(subTab==='workshop'?'var(--primary)':'var(--text-muted)')+';cursor:pointer;transition:color .15s;">🔨 공방</button>'+
      '<button onclick="window._smCraftTab=\'inventory\';renderStockMarketPage();" style="flex:1;padding:9px 4px 8px;border:none;border-bottom:2px solid '+(subTab==='inventory'?'var(--primary)':'transparent')+';margin-bottom:-1px;background:none;font-family:inherit;font-size:.78rem;font-weight:'+(subTab==='inventory'?'700':'500')+';color:'+(subTab==='inventory'?'var(--primary)':'var(--text-muted)')+';cursor:pointer;transition:color .15s;">🎒 인벤토리</button>'+
      '<div style="padding:0 0 10px 8px;white-space:nowrap;font-size:.72rem;color:var(--text-muted);">💵 <b style="color:#FFD600;">'+cash.toLocaleString()+'p</b></div>'+
    '</div>'+
    (subTab==='market'?_renderMarketShop(inv,cash,_items):
     subTab==='workshop'?_renderWorkshop(inv,myShuttles,myDefective):
     _renderInventory(inv,myShuttles,myDefective))
  );
}

/* ── 재료 상점 ── */
function _renderMarketShop(inv,cash,items){
  const craftItems=items.filter(i=>i.category==='craft');
  const specialItems=items.filter(i=>i.category==='special');
  function itemCard(item){
    const owned=inv[item.craftItem]||0;
    return '<div class="card" style="padding:12px;margin-bottom:6px;">'+
      '<div style="display:flex;align-items:center;gap:10px;">'+
        '<div style="width:44px;height:44px;border-radius:12px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">'+item.icon+'</div>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-size:.87rem;font-weight:700;">'+item.name+'</div>'+
          '<div style="font-size:.68rem;color:var(--text-muted);line-height:1.3;">'+item.desc+'</div>'+
        '</div>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">'+
          '<span style="font-weight:800;font-size:.88rem;color:#FFD600;">'+item.price.toLocaleString()+'p</span>'+
          '<button onclick="smShopBuy(\''+item.id+'\')" style="padding:4px 10px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-family:inherit;font-size:.72rem;font-weight:700;cursor:pointer;white-space:nowrap;">구매</button>'+
          (owned?'<span style="font-size:.65rem;color:var(--primary);">보유 '+owned+'개</span>':'<span style="font-size:.65rem;color:var(--text-dim);">미보유</span>')+
        '</div>'+
      '</div>'+
    '</div>';
  }
  return (
    '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:10px;padding:8px 10px;background:rgba(255,214,0,.06);border:1px solid rgba(255,214,0,.2);border-radius:10px;">'+
      '💵 증권 현금으로 구매합니다. 증권 계좌에 현금이 있어야 합니다.'+
    '</div>'+
    '<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">🏸 제작 재료</div>'+
    craftItems.map(itemCard).join('')+
    '<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);margin:14px 0 8px;">✨ 특별 아이템</div>'+
    specialItems.map(itemCard).join('')
  );
}

/* ── 공방 ── */
function _renderWorkshop(inv,myShuttles,myDefective){
  const feathers=inv['feather']||0;
  const hasCork=(inv['cork']||0)>=1;
  const hasThread=(inv['thread']||0)>=1;
  const hasTape=(inv['tape']||0)>=1;

  function getCraftImage(){
    if(feathers>=16&&hasCork&&hasThread&&hasTape) return '/images/craft/feather_cork_thread_tape.png';
    if(feathers>=16&&hasCork&&hasThread) return '/images/craft/feather_cork_thread.png';
    if(feathers>=16&&hasCork) return '/images/craft/feather_cork.png';
    if(feathers>=16) return '/images/craft/feather_16.png';
    if(feathers>=12) return '/images/craft/feather_12.png';
    if(feathers>=8)  return '/images/craft/feather_8.png';
    if(feathers>=4)  return '/images/craft/feather_4.png';
    return null;
  }
  const craftImg=getCraftImage();

  const recipeRows=SHUTTLECOCK_RECIPE.map(r=>{
    const have=r.item==='feather'?feathers:(inv[r.item]||0);
    const ok=have>=r.need;
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">'+
      '<span style="font-size:1.3rem;">'+r.icon+'</span>'+
      '<div style="flex:1;">'+
        '<div style="font-size:.82rem;font-weight:600;">'+r.name+'</div>'+
        '<div style="font-size:.68rem;color:var(--text-muted);">'+r.desc+'</div>'+
      '</div>'+
      '<div style="text-align:right;">'+
        '<div style="font-size:.85rem;font-weight:700;color:'+(ok?'var(--primary)':'#FF7070')+';">'+have+' / '+r.need+'</div>'+
        '<div style="font-size:.65rem;color:'+(ok?'var(--primary)':'var(--text-dim)')+';"> '+(ok?'✓ 준비 완료':'부족')+'</div>'+
      '</div>'+
    '</div>';
  }).join('');

  const totalCost=MARKET_ITEMS.filter(i=>i.category==='craft').reduce((s,i)=>s+i.price*(i.craftItem==='feather'?4:1),0);

  return '<div class="card" style="padding:14px;margin-bottom:12px;background:linear-gradient(135deg,rgba(0,200,150,.08),rgba(0,200,150,.02));border:1px solid rgba(0,200,150,.2);">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'+
      (craftImg
        ?'<img src="'+craftImg+'" alt="셔틀콕" style="width:64px;height:64px;object-fit:contain;border-radius:10px;background:var(--bg3);padding:4px;">'
        :'<div style="width:64px;height:64px;border-radius:10px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:2rem;">🏸</div>')+
      '<div>'+
        '<div style="font-size:.92rem;font-weight:700;">셔틀콕 제작</div>'+
        '<div style="font-size:.7rem;color:var(--text-muted);">총 제작 비용 약 '+totalCost.toLocaleString()+'p</div>'+
      '</div>'+
      '<div style="margin-left:auto;text-align:right;">'+
        '<div style="font-size:.65rem;color:var(--text-muted);">완성품</div>'+
        '<div style="font-family:Black Han Sans,sans-serif;font-size:1.1rem;color:var(--primary);">'+myShuttles+'개</div>'+
        '<div style="font-size:.62rem;color:#FF7070;">불량 '+myDefective+'개</div>'+
      '</div>'+
    '</div>'+
    recipeRows+
    '<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg2);border:1px solid '+(((inv['artisan']||0)>0)?'rgba(255,214,0,.4)':'var(--border)')+';display:flex;align-items:center;gap:10px;">'+
      '<input type="checkbox" id="use-artisan" '+(((inv['artisan']||0)>0)?'':'disabled')+' style="width:16px;height:16px;accent-color:#FFD600;cursor:'+(((inv['artisan']||0)>0)?'pointer':'not-allowed')+';flex-shrink:0;">'+
      '<label for="use-artisan" style="flex:1;cursor:'+(((inv['artisan']||0)>0)?'pointer':'not-allowed')+';opacity:'+(((inv['artisan']||0)>0)?1:.45)+';">'+
        '<div style="font-size:.82rem;font-weight:700;color:#FFD600;">✨ 장인의 손길 사용</div>'+
        '<div style="font-size:.68rem;color:var(--text-muted);">'+(((inv['artisan']||0)>0)?'보유 '+inv['artisan']+'개 · 비행 테스트 100% 통과':'보유 없음 — 재료 탭에서 구매하세요')+'</div>'+
      '</label>'+
    '</div>'+
    '<button onclick="startCraft()" style="width:100%;margin-top:8px;padding:12px;border-radius:10px;border:none;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer;background:var(--primary);color:#fff;">🏸 제작 시작 → 비행 테스트</button>'+
    '<button onclick="previewCraftImages()" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid rgba(255,179,0,.4);background:rgba(255,179,0,.08);color:#FFB300;font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;">🔍 제작 과정 미리보기</button>'+
  '</div>'+
  '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px;">'+
    '<div style="font-size:.78rem;font-weight:700;margin-bottom:8px;">📋 제작 안내</div>'+
    '<div style="font-size:.72rem;color:var(--text-muted);line-height:1.8;">'+
      '1. 재료 탭에서 증권 현금으로 재료를 구매하세요<br>'+
      '2. 재료가 모이면 이미지로 진행 상황이 표시됩니다<br>'+
      '3. 제작 시작 후 비행 테스트를 통과하면 완성됩니다<br>'+
      '4. 완성된 셔틀콕은 실물로 교환 가능합니다 (관리자 문의)'+
    '</div>'+
  '</div>';
}

/* ── 인벤토리 ── */
function _renderInventory(inv,myShuttles,myDefective){
  const hasAnything=MARKET_ITEMS.some(i=>(inv[i.craftItem]||0)>0)||myShuttles>0||myDefective>0;
  if(!hasAnything){
    return '<div style="text-align:center;padding:40px 0;color:var(--text-muted);">'+
      '<div style="font-size:2.5rem;margin-bottom:10px;">🎒</div>'+
      '<div style="font-size:.88rem;font-weight:600;margin-bottom:4px;">인벤토리가 비어있어요</div>'+
      '<div style="font-size:.75rem;">재료 탭에서 증권 현금으로 구매해보세요</div>'+
    '</div>';
  }
  let html='';
  if(myShuttles>0){
    html+='<div class="card" style="padding:12px;margin-bottom:8px;border:1px solid rgba(0,200,150,.3);background:rgba(0,200,150,.05);">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'+
        '<span style="font-size:2rem;">🏸</span>'+
        '<div style="flex:1;"><div style="font-size:.88rem;font-weight:700;">완성된 셔틀콕</div><div style="font-size:.72rem;color:var(--text-muted);">실물 교환 가능</div></div>'+
        '<div style="font-family:Black Han Sans,sans-serif;font-size:1.3rem;color:var(--primary);">'+myShuttles+'개</div>'+
      '</div>'+
      '<button onclick="openExchangeRequest('+myShuttles+')" style="width:100%;padding:9px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;">🔄 교환 요청</button>'+
    '</div>';
  }
  if(myDefective>0){
    const hasRecycle=(inv['recycle']||0)>0;
    html+='<div class="card" style="padding:12px;margin-bottom:8px;border:1px solid rgba(255,82,82,.3);background:rgba(255,82,82,.05);">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'+
        '<span style="font-size:1.8rem;">💔</span>'+
        '<div style="flex:1;"><div style="font-size:.88rem;font-weight:700;">불량 셔틀콕</div><div style="font-size:.72rem;color:#FF7070;">비행 테스트 실패</div></div>'+
        '<div style="font-family:Black Han Sans,sans-serif;font-size:1.3rem;color:#FF7070;">'+myDefective+'개</div>'+
      '</div>'+
      '<button onclick="doFlightTest(true)" '+(hasRecycle?'':'disabled')+' style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(0,200,150,.4);background:rgba(0,200,150,.1);color:var(--primary);font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;'+(hasRecycle?'':'opacity:.4;cursor:not-allowed;')+'">♻️ 재활용의 손길 (불량 복구)</button>'+
      (hasRecycle?'':'<div style="font-size:.68rem;color:var(--text-dim);margin-top:4px;text-align:center;">재활용의 손길이 필요합니다</div>')+
    '</div>';
  }
  MARKET_ITEMS.forEach(item=>{
    const qty=inv[item.craftItem]||0;
    if(!qty) return;
    html+='<div class="card" style="padding:12px;margin-bottom:8px;">'+
      '<div style="display:flex;align-items:center;gap:10px;">'+
        '<span style="font-size:1.5rem;">'+item.icon+'</span>'+
        '<div style="flex:1;"><div style="font-size:.85rem;font-weight:700;">'+item.name+'</div><div style="font-size:.7rem;color:var(--text-muted);">'+item.unit+'</div></div>'+
        '<div style="font-family:Black Han Sans,sans-serif;font-size:1.1rem;">'+qty+'개</div>'+
      '</div>'+
    '</div>';
  });
  return html;
}

/* ── 재료 구매 — 증권 현금(stock_wallets) 사용 ── */
async function smShopBuy(itemId){
  if(window._smTxBusy){toast('처리 중입니다','warning');return;}
  const _itemPool=window._cachedMarketItems||MARKET_ITEMS;
  const item=_itemPool.find(i=>i.id===itemId);
  if(!item) return;
  const uid=ME?.id; if(!uid) return;

  // 증권 현금 조회
  const {data:w}=await sb.from('stock_wallets').select('cash').eq('user_id',uid).maybeSingle();
  const cash=Math.floor(Number(w?.cash??0));
  if(cash<item.price){toast('증권 현금이 부족합니다 (보유 '+cash.toLocaleString()+'p)','error');return;}
  const maxQty=Math.floor(cash/item.price)||1;

  showConfirm({
    icon:item.icon,title:item.name+' 구매',msg:'',okLabel:'구매',okClass:'btn-primary',
    onOk:async()=>{
      if(window._smTxBusy) return;
      window._smTxBusy=true;
      try{
        const qty=Math.max(1,Math.min(maxQty,parseInt(document.getElementById('shop-qty')?.value||'1')));
        const total=item.price*qty;
        // 최신 잔액 재조회 + 조건부 차감
        const {data:ww}=await sb.from('stock_wallets').select('cash').eq('user_id',uid).maybeSingle();
        const latestCash=Math.floor(Number(ww?.cash??0));
        if(latestCash<total){toast('증권 현금이 부족합니다','error');return;}
        const {data:deducted}=await sb.from('stock_wallets')
          .update({cash:latestCash-total})
          .eq('user_id',uid)
          .gte('cash',total)
          .select('cash');
        if(!deducted?.length){toast('잔액 부족 또는 처리 오류','error');return;}
        try{await sb.from('shop_purchases').insert({user_id:uid,item:item.name,price:total,qty});}catch(e){}
        const inv=await _getMarketInv(uid);
        inv[item.craftItem]=(inv[item.craftItem]||0)+(item.craftQty*qty);
        const {error:invErr}=await _saveMarketInv(uid,inv);
        if(invErr){
          await sb.from('stock_wallets').update({cash:latestCash}).eq('user_id',uid);
          toast('인벤토리 저장 실패 — 환불됐습니다','error');
          return;
        }
        toast('✅ '+item.name+' '+qty+'개 구매 완료!','success');
        window._smTab='craft'; window._smCraftTab='market';
        renderStockMarketPage();
      }finally{window._smTxBusy=false;}
    }
  });
  setTimeout(()=>{
    const m=document.getElementById('confirm-msg');
    if(!m) return;
    m.innerHTML='<div style="margin:10px 0;">'+
      '<div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-muted);margin-bottom:6px;">'+
        '<span>단가 <b style="color:var(--primary);">'+item.price.toLocaleString()+'p</b></span>'+
        '<span>최대 <b>'+maxQty+'개</b> 구매 가능</span>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+
        '<button onclick="const el=document.getElementById(\'shop-qty\');el.value=Math.max(1,parseInt(el.value||1)-1);document.getElementById(\'shop-total\').textContent=(parseInt(el.value)*'+item.price+').toLocaleString()+\'p\'" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:1.1rem;cursor:pointer;">−</button>'+
        '<input id="shop-qty" type="number" min="1" max="'+maxQty+'" value="1" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;font-size:.95rem;text-align:center;" oninput="document.getElementById(\'shop-total\').textContent=(parseInt(this.value||1)*'+item.price+').toLocaleString()+\'p\'">'+
        '<button onclick="const el=document.getElementById(\'shop-qty\');el.value=Math.min('+maxQty+',parseInt(el.value||1)+1);document.getElementById(\'shop-total\').textContent=(parseInt(el.value)*'+item.price+').toLocaleString()+\'p\'" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:1.1rem;cursor:pointer;">+</button>'+
        '<button onclick="document.getElementById(\'shop-qty\').value='+maxQty+';document.getElementById(\'shop-total\').textContent=('+maxQty+'*'+item.price+').toLocaleString()+\'p\'" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text-muted);font-family:inherit;font-size:.72rem;cursor:pointer;">최대</button>'+
      '</div>'+
      '<div style="font-size:.85rem;color:var(--text-muted);">합계: <b id="shop-total" style="color:var(--primary);">'+item.price.toLocaleString()+'p</b></div>'+
    '</div>';
  },30);
}

/* ── 제작 과정 미리보기 ── */
function previewCraftImages(){
  const steps=[
    {img:'/images/craft/feather_4.png',label:'깃털 4개'},
    {img:'/images/craft/feather_8.png',label:'깃털 8개'},
    {img:'/images/craft/feather_12.png',label:'깃털 12개'},
    {img:'/images/craft/feather_16.png',label:'깃털 16개'},
    {img:'/images/craft/feather_cork.png',label:'깃털+코르크'},
    {img:'/images/craft/feather_cork_thread.png',label:'+실'},
    {img:'/images/craft/feather_cork_thread_tape.png',label:'+띠지(완성)'},
  ];
  document.getElementById('modal-craft-preview')?.remove();
  const modal=document.createElement('div');
  modal.id='modal-craft-preview';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick=e=>{if(e.target===modal)modal.remove();};
  const grid=steps.map((s,i)=>
    '<div style="text-align:center;">'+
      '<div style="font-size:.62rem;color:var(--text-muted);margin-bottom:3px;font-weight:700;">STEP '+(i+1)+'</div>'+
      '<img src="'+s.img+'" alt="'+s.label+'" style="width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:var(--bg3);padding:4px;" onerror="this.style.display=\'none\'">'+
      '<div style="font-size:.65rem;color:var(--text-muted);margin-top:3px;">'+s.label+'</div>'+
    '</div>'
  ).join('');
  modal.innerHTML=
    '<div style="background:var(--surface);border-radius:16px;width:100%;max-width:360px;overflow:hidden;">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;">'+
        '<div style="font-size:.95rem;font-weight:700;">🔍 제작 과정 미리보기</div>'+
        '<button onclick="document.getElementById(\'modal-craft-preview\').remove()" style="background:none;border:none;color:var(--text-muted);font-size:1.3rem;cursor:pointer;line-height:1;">×</button>'+
      '</div>'+
      '<div style="padding:0 16px 16px;">'+
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">'+grid+'</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

/* ── 제작 시작 ── */
async function startCraft(){
  const uid=ME?.id; if(!uid) return;
  const inv=await _getMarketInv(uid);
  const missing=SHUTTLECOCK_RECIPE.filter(r=>{
    const have=r.item==='feather'?(inv['feather']||0):(inv[r.item]||0);
    return have<r.need;
  });
  if(missing.length>0){toast('재료가 부족합니다: '+missing.map(r=>r.name).join(', '),'error');return;}
  const useArtisan=document.getElementById('use-artisan')?.checked&&(inv['artisan']||0)>0;
  SHUTTLECOCK_RECIPE.forEach(r=>{
    if(r.item==='feather') inv['feather']=(inv['feather']||0)-r.need;
    else inv[r.item]=(inv[r.item]||0)-1;
  });
  if(useArtisan){inv['artisan']=(inv['artisan']||1)-1;if(inv['artisan']<=0)delete inv['artisan'];}
  Object.keys(inv).forEach(k=>{if(typeof inv[k]==='number'&&inv[k]<=0&&k!=='shuttles'&&k!=='defective'&&k!=='user_id')inv[k]=0;});
  await _saveMarketInv(uid,inv);
  window._craftPendingInv=inv;
  const _rate=(window._marketFlightRate??40)/100;
  const success=useArtisan||Math.random()<_rate;
  showFlightTestAnimation(useArtisan,success);
}

/* ── 비행 테스트 애니메이션 ── */
function showFlightTestAnimation(useArtisan,success){
  document.getElementById('modal-flight-test')?.remove();
  const modal=document.createElement('div');
  modal.id='modal-flight-test';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:700;display:flex;align-items:center;justify-content:center;';
  const failTypes=['too_far','drop','explode'];
  const lastIdx=failTypes.indexOf(window._lastFailType||'explode');
  window._lastFailType=failTypes[(lastIdx+1)%3];
  const resultType=success?'success':window._lastFailType;
  const stars=Array.from({length:12},()=>'<div style="position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;top:'+Math.random()*40+'%;left:'+Math.random()*100+'%;opacity:'+(0.3+Math.random()*0.7)+';"></div>').join('');
  modal.innerHTML=
    '<div style="width:100%;max-width:360px;padding:20px;text-align:center;">'+
      '<div style="font-size:.85rem;color:rgba(255,255,255,.5);margin-bottom:20px;">🏸 비행 테스트'+(useArtisan?' (장인의 손길)':'')+'</div>'+
      '<div id="ft-sky" style="position:relative;height:200px;background:linear-gradient(180deg,#0a1628 0%,#1a2a4a 60%,#2d4a2d 100%);border-radius:16px;overflow:hidden;margin-bottom:20px;">'+
        '<div style="position:absolute;inset:0;">'+stars+'</div>'+
        '<div style="position:absolute;bottom:0;left:0;right:0;height:30px;background:linear-gradient(180deg,#2a5a2a,#1a3a1a);"></div>'+
        '<div style="position:absolute;bottom:28px;left:30px;width:8px;height:24px;background:#666;border-radius:2px;"></div>'+
        '<div id="ft-shuttle" style="position:absolute;bottom:50px;left:20px;font-size:2.2rem;transform:rotate(-90deg);transition:none;line-height:1;">🏸</div>'+
        '<div id="ft-msg" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1rem;font-weight:700;color:#fff;opacity:0;text-shadow:0 2px 8px rgba(0,0,0,.8);white-space:nowrap;"></div>'+
      '</div>'+
      '<div id="ft-status" style="font-size:.85rem;color:rgba(255,255,255,.6);margin-bottom:16px;">발사 준비 중...</div>'+
      '<div id="ft-btn" style="display:none;"><button onclick="document.getElementById(\'modal-flight-test\').remove()" style="padding:12px 32px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer;">확인</button></div>'+
    '</div>';
  document.body.appendChild(modal);
  const shuttle=modal.querySelector('#ft-shuttle');
  const msg=modal.querySelector('#ft-msg');
  const status=modal.querySelector('#ft-status');
  const btn=modal.querySelector('#ft-btn');
  setTimeout(()=>{status.textContent='발사!';},400);
  setTimeout(()=>{shuttle.style.transition='all 0.8s cubic-bezier(0.2,0.8,0.4,1)';shuttle.style.bottom='120px';shuttle.style.left='80px';shuttle.style.transform='rotate(-45deg)';},700);
  if(resultType==='success'){
    setTimeout(()=>{shuttle.style.transition='all 1.2s cubic-bezier(0.25,0.46,0.45,0.94)';shuttle.style.bottom='140px';shuttle.style.left='180px';shuttle.style.transform='rotate(-20deg)';},1500);
    setTimeout(()=>{shuttle.style.transition='all 0.8s ease-in';shuttle.style.bottom='32px';shuttle.style.left='260px';shuttle.style.transform='rotate(10deg)';},2700);
    setTimeout(()=>{
      msg.textContent='✅ 완벽한 비행!';msg.style.transition='opacity .4s';msg.style.opacity='1';msg.style.color='#00C896';
      status.textContent=useArtisan?'✨ 장인의 손길 덕분에 완벽한 비행!':'비행 테스트 성공! 셔틀콕이 완성됐습니다 🏸';
      status.style.color='var(--primary)';btn.style.display='block';
      _applyFlightResult(success,window._craftPendingInv);window._craftPendingInv=null;
    },3600);
  } else if(resultType==='drop'){
    setTimeout(()=>{status.textContent='어... 힘이 없네요';},800);
    setTimeout(()=>{shuttle.style.transition='all 0.4s ease-out';shuttle.style.bottom='110px';shuttle.style.left='90px';shuttle.style.transform='rotate(-20deg)';},1500);
    setTimeout(()=>{shuttle.style.transition='all 1s cubic-bezier(0.55,0,1,0.45)';shuttle.style.bottom='30px';shuttle.style.left='95px';shuttle.style.transform='rotate(160deg)';},1900);
    setTimeout(()=>{shuttle.style.transition='all 0.15s ease-out';shuttle.style.bottom='42px';},2950);
    setTimeout(()=>{shuttle.style.transition='all 0.2s ease-in';shuttle.style.bottom='30px';},3100);
    setTimeout(()=>{
      msg.textContent='💔 툭...';msg.style.transition='opacity .4s';msg.style.opacity='1';msg.style.color='#FF7070';
      status.textContent='힘없이 바로 앞에 떨어졌어요. 불량 셔틀콕으로 분류됩니다';status.style.color='#FF7070';
      btn.style.display='block';_applyFlightResult(success,window._craftPendingInv);window._craftPendingInv=null;
    },3400);
  } else if(resultType==='too_far'){
    setTimeout(()=>{status.textContent='엄청난 속도로...!';},800);
    setTimeout(()=>{shuttle.style.transition='all 0.5s ease-in';shuttle.style.bottom='170px';shuttle.style.left='190px';shuttle.style.transform='rotate(-70deg)';},1500);
    setTimeout(()=>{shuttle.style.transition='all 0.4s ease-in';shuttle.style.bottom='210px';shuttle.style.left='320px';shuttle.style.opacity='0.2';},2000);
    setTimeout(()=>{shuttle.style.opacity='0';},2400);
    setTimeout(()=>{
      msg.textContent='🚀 너무 멀리!';msg.style.transition='opacity .4s';msg.style.opacity='1';msg.style.color='#FFB300';
      status.textContent='너무 세게 날아가 사라졌어요. 불량 셔틀콕으로 분류됩니다';status.style.color='#FF7070';
      btn.style.display='block';_applyFlightResult(success,window._craftPendingInv);window._craftPendingInv=null;
    },2800);
  } else {
    setTimeout(()=>{status.textContent='날아가는 중...';},800);
    setTimeout(()=>{shuttle.style.transition='all 0.8s cubic-bezier(0.2,0.8,0.4,1)';shuttle.style.bottom='130px';shuttle.style.left='160px';shuttle.style.transform='rotate(-45deg)';},1200);
    setTimeout(()=>{shuttle.style.transition='all 0.06s';shuttle.style.transform='rotate(-55deg) scale(1.2)';},2100);
    setTimeout(()=>{shuttle.style.transform='rotate(-35deg) scale(0.9)';},2160);
    setTimeout(()=>{shuttle.style.transform='rotate(-60deg) scale(1.3)';},2220);
    setTimeout(()=>{shuttle.style.transform='rotate(-30deg) scale(0.8)';},2280);
    setTimeout(()=>{
      shuttle.style.transition='all 0.1s';shuttle.style.opacity='0';shuttle.style.transform='scale(0)';
      const sky=modal.querySelector('#ft-sky');
      ['💥','✨','🔥','💫','⚡','💥','✨','🔥'].forEach((p,i)=>{
        const pt=document.createElement('div');
        pt.textContent=p;
        const angle=(i/8)*Math.PI*2;
        const dist=40+Math.random()*30;
        pt.style.cssText='position:absolute;font-size:'+(0.8+Math.random()*0.8)+'rem;left:calc(45% + '+Math.cos(angle)*dist+'px);top:calc(40% + '+Math.sin(angle)*dist+'px);opacity:1;transition:all 0.6s ease-out;';
        sky.appendChild(pt);
        setTimeout(()=>{pt.style.opacity='0';pt.style.transform='translate('+Math.cos(angle)*60+'px,'+Math.sin(angle)*60+'px)';},50);
      });
      msg.textContent='💥 폭발!';msg.style.transition='opacity .1s';msg.style.opacity='1';msg.style.color='#FF7070';msg.style.fontSize='1.4rem';
    },2340);
    setTimeout(()=>{
      msg.style.fontSize='1rem';
      status.textContent='비행 중 폭발했어요! 불량 셔틀콕으로 분류됩니다 💔';status.style.color='#FF7070';
      btn.style.display='block';_applyFlightResult(success,window._craftPendingInv);window._craftPendingInv=null;
    },3000);
  }
}

/* ── 비행 테스트 결과 저장 ── */
async function _applyFlightResult(success,inv=null){
  const uid=ME?.id; if(!uid) return;
  const _inv=inv||await _getMarketInv(uid);
  if(success) _inv.shuttles=(_inv.shuttles||0)+1;
  else _inv.defective=(_inv.defective||0)+1;
  if(_inv.artisan===undefined) _inv.artisan=0;
  if(_inv.recycle===undefined) _inv.recycle=0;
  await _saveMarketInv(uid,_inv);
  window._smTab='craft';window._smCraftTab='inventory';
  renderStockMarketPage();
}

/* ── 재활용의 손길 (불량 → 완성) ── */
async function doFlightTest(isArtisanForce=false){
  const uid=ME?.id; if(!uid) return;
  if(!isArtisanForce) return;
  const inv=await _getMarketInv(uid);
  if((inv.defective||0)<=0){toast('불량 셔틀콕이 없습니다','error');return;}
  if((inv['recycle']||0)<=0){toast('재활용의 손길이 없습니다','error');return;}
  inv['recycle']=Math.max(0,(inv['recycle']||1)-1);
  inv.defective=Math.max(0,(inv.defective||1)-1);
  inv.shuttles=(inv.shuttles||0)+1;
  await _saveMarketInv(uid,inv);
  toast('♻️ 재활용의 손길로 복구! 셔틀콕이 완성됐습니다 🏸','success');
  window._smTab='craft';window._smCraftTab='inventory';
  renderStockMarketPage();
}

/* ── 셔틀콕 교환 요청 ── */
async function openExchangeRequest(maxQty){
  try{
    showConfirm({
      icon:'🔄',title:'셔틀콕 교환 요청',msg:'',okLabel:'요청 보내기',okClass:'btn-primary',
      onOk:async()=>{
        const qty=parseInt(document.getElementById('exchange-qty')?.value||'1');
        const memo=document.getElementById('exchange-memo')?.value||'';
        if(!qty||qty<1||qty>maxQty){toast('수량을 확인해주세요 (최대 '+maxQty+'개)','error');return;}
        const uid=ME?.id; if(!uid) return;
        await sb.from('logs').insert({user_id:uid,action:'shuttle_exchange_request',note:JSON.stringify({qty,memo,status:'pending',userName:ME.name||''}),created_at:new Date().toISOString()});
        if(typeof addLog==='function') addLog('shuttle_exchange_request',uid,JSON.stringify({qty,memo,status:'pending'}));
        const _inv=await _getMarketInv(uid);
        _inv.shuttles=Math.max(0,(_inv.shuttles||0)-qty);
        await _saveMarketInv(uid,_inv);
        toast('✅ 교환 요청이 전송됐습니다. 관리자 승인 후 실물로 교환됩니다.','success');
        window._smTab='craft';window._smCraftTab='inventory';
        renderStockMarketPage();
      }
    });
    setTimeout(()=>{
      const el=document.getElementById('confirm-msg');
      if(!el) return;
      el.innerHTML=
        '<div style="margin:10px 0;display:flex;flex-direction:column;gap:10px;">'+
          '<div>'+
            '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:5px;">교환 수량 (최대 '+maxQty+'개)</div>'+
            '<input id="exchange-qty" type="number" min="1" max="'+maxQty+'" value="1" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;font-size:.9rem;text-align:center;">'+
          '</div>'+
          '<div>'+
            '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:5px;">메모 (선택)</div>'+
            '<input id="exchange-memo" type="text" placeholder="예: 다음 모임 때 수령 희망" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;font-size:.85rem;box-sizing:border-box;">'+
          '</div>'+
          '<div style="font-size:.72rem;color:var(--text-muted);line-height:1.5;background:var(--bg3);border-radius:8px;padding:8px;">'+
            '📌 요청 후 관리자 승인 시 셔틀콕이 차감됩니다.<br>'+
            '승인 전에는 인벤토리에서 임시 차감 표시됩니다.'+
          '</div>'+
        '</div>';
    },30);
  }catch(e){if(typeof toast==='function')toast('불러오기 실패','error');}
}
