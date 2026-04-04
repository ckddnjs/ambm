/* ── REGISTER (칩 선택 UI) ── */
let regMatchType='doubles';
let _usersCache=[];
// 4개 슬롯 선택 상태: {id, name} or null
let _regSlots={a1:null,a2:null,b1:null,b2:null};
let _activeSlot=null; // 현재 선택 중인 슬롯
let _chipFilter=''; // 초성/이름 필터

async function renderRegisterPage(){
  // chip-picker-wrap에 로딩 표시
  const wrap=document.getElementById('chip-picker-wrap');
  if(wrap) wrap.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.85rem;">선수 목록 불러오는 중...</div>';
  _usersCache=await _getApprovedUsers();
  _regSlots={a1:null,a2:null,b1:null,b2:null};
  _activeSlot=null;
  _chipFilter='';
  // 오늘 날짜 기본값
  const dateEl=document.getElementById('reg-date');
  if(dateEl&&!dateEl.value) dateEl.value=todayStr();
  _renderChipPicker();
}

function _renderChipPicker(){
  const wrap=document.getElementById('chip-picker-wrap');
  if(!wrap){ setTimeout(_renderChipPicker, 50); return; }

  const sorted=[..._usersCache].sort((a,b)=>a.name.localeCompare(b.name,'ko'));

  // 초성 필터 목록
  const CHOSUNG=['전체','ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const filterBar=CHOSUNG.map(c=>`<button onclick="_setChipFilter('${c}')" style="padding:4px 10px;border-radius:16px;border:1px solid var(--border);background:${_chipFilter===c?'var(--primary)':'var(--bg2)'};color:${_chipFilter===c?'#fff':'var(--text-muted)'};font-size:.78rem;font-family:inherit;cursor:pointer;flex-shrink:0;">${c}</button>`).join('');

  // 필터 적용
  const _cho=(ch)=>{const code=ch.charCodeAt(0);if(code<0xAC00||code>0xD7A3)return ch;return ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'][Math.floor((code-0xAC00)/28/21)];};
  const filtered=sorted.filter(u=>{
    if(!_chipFilter||_chipFilter==='전체') return true;
    return _cho(u.name[0])===_chipFilter;
  });

  // 선택된 ID 셋
  const selectedIds=new Set(Object.values(_regSlots).filter(s=>s&&s.id).map(s=>s.id));

  const chips=filtered.map(u=>{
    const isSel=selectedIds.has(u.id);
    const isActive=_activeSlot&&_regSlots[_activeSlot]?.id===u.id;
    return `<button onclick="_selectChip('${u.id}','${u.name.replace(/'/g,"\\'")}')"
      style="padding:6px 14px;border-radius:20px;border:1.5px solid ${isSel?'var(--primary)':'var(--border)'};background:${isSel?'rgba(41,121,255,.15)':'var(--bg2)'};color:${isSel?'var(--primary)':'var(--text)'};font-size:.85rem;font-family:inherit;cursor:pointer;font-weight:${isSel?'700':'400'};white-space:nowrap;transition:all .15s;">
      ${u.name}
    </button>`;
  }).join('');

  // 슬롯 표시
  const slotBtn=(key,label,req)=>{
    const s=_regSlots[key];
    const isActive=_activeSlot===key;
    return `<button onclick="_setActiveSlot('${key}')"
      style="flex:1;min-width:0;padding:8px 6px;border-radius:10px;border:2px solid ${isActive?'var(--primary)':s?'rgba(41,121,255,.4)':'var(--border)'};background:${isActive?'rgba(41,121,255,.08)':s?'rgba(41,121,255,.05)':'var(--bg2)'};cursor:pointer;font-family:inherit;text-align:center;transition:all .15s;">
      <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:2px;">${label}${req?'<span style="color:var(--danger);">*</span>':''}</div>
      <div style="font-size:.88rem;font-weight:700;color:${s?'var(--primary)':'var(--text-dim)'};">${s?s.name:'미선택'}</div>
    </button>`;
  };

  wrap.innerHTML=`
    <!-- 슬롯 현황 -->
    <div style="margin-bottom:14px;">
      <div style="font-size:.78rem;font-weight:700;color:#c0392b;margin-bottom:6px;">🔴 A팀</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        ${slotBtn('a1','선수1',true)}
        ${slotBtn('a2','선수2',false)}
      </div>
      <div style="font-size:.78rem;font-weight:700;color:#27ae60;margin-bottom:6px;">🟢 B팀</div>
      <div style="display:flex;gap:6px;">
        ${slotBtn('b1','선수1',true)}
        ${slotBtn('b2','선수2',false)}
      </div>
    </div>

    <!-- 선택 중 슬롯 안내 -->
    <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px;padding:6px 10px;background:var(--bg2);border-radius:8px;text-align:center;">
      ${_activeSlot
        ?`<span style="color:var(--primary);font-weight:700;">${{a1:'A팀 선수1',a2:'A팀 선수2',b1:'B팀 선수1',b2:'B팀 선수2'}[_activeSlot]}</span> 선택 중`
        :'슬롯을 눌러 선수를 선택하세요'}
    </div>

    <!-- 초성 필터 -->
    <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;margin-bottom:10px;scrollbar-width:none;">
      ${filterBar}
    </div>

    <!-- 선수 칩 -->
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;min-height:40px;">
      ${chips||'<span style="font-size:.8rem;color:var(--text-muted);">해당 초성의 선수가 없습니다</span>'}
    </div>

    <!-- 비회원 입력 -->
    <div style="border-top:1px solid var(--border);padding-top:10px;">
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px;">✏️ 비회원 직접 입력</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="guest-name-input" class="form-input" placeholder="비회원 이름" style="flex:1;font-size:.88rem;">
        <button onclick="_addGuestChip()" style="padding:9px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:.82rem;cursor:pointer;white-space:nowrap;font-weight:600;">추가</button>
      </div>
    </div>
  `;
}

function _setChipFilter(c){
  _chipFilter=c==='전체'?'':c;
  _renderChipPicker();
}

function _setActiveSlot(key){
  _activeSlot=key;
  _renderChipPicker();
}

function _selectChip(id,name){
  if(!_activeSlot){
    // 슬롯 미선택 시 빈 슬롯 자동 선택
    const emptySlot=['a1','a2','b1','b2'].find(k=>!_regSlots[k]);
    if(!emptySlot){toast('슬롯을 먼저 선택하세요','info');return;}
    _activeSlot=emptySlot;
  }
  // 중복 방지
  const already=Object.entries(_regSlots).find(([k,v])=>v&&v.id===id&&k!==_activeSlot);
  if(already){toast(`${name}은 이미 선택됨 (${already[0]})`, 'error');return;}
  _regSlots[_activeSlot]={id,name};
  // 다음 빈 슬롯으로 자동 이동
  const nextEmpty=['a1','a2','b1','b2'].filter(k=>k!==_activeSlot&&!_regSlots[k])[0]||null;
  _activeSlot=nextEmpty;
  _renderChipPicker();
}

function _addGuestChip(){
  const input=document.getElementById('guest-name-input');
  const name=(input?.value||'').trim();
  if(!name){toast('비회원 이름을 입력하세요','error');return;}
  if(!_activeSlot){
    const emptySlot=['a1','a2','b1','b2'].find(k=>!_regSlots[k]);
    if(!emptySlot){toast('슬롯을 먼저 선택하세요','info');return;}
    _activeSlot=emptySlot;
  }
  const already=Object.entries(_regSlots).find(([k,v])=>v&&v.name===name&&k!==_activeSlot);
  if(already){toast(`${name}은 이미 선택됨`,'error');return;}
  _regSlots[_activeSlot]={id:null,name};
  input.value='';
  const nextEmpty=['a1','a2','b1','b2'].filter(k=>k!==_activeSlot&&!_regSlots[k])[0]||null;
  _activeSlot=nextEmpty;
  _renderChipPicker();
}

// submitMatch는 _regSlots에서 직접 읽음
async function submitMatch(){
  if(window._submitLock){toast('처리 중입니다…','');return;}
  window._submitLock=true;
  const btn=document.querySelector('[onclick="submitMatch()"]');
  if(btn){btn.disabled=true;btn.textContent='등록 중…';}
  try{ await _doSubmitMatch(); }
  finally{
    window._submitLock=false;
    if(btn){btn.disabled=false;btn.textContent='📨 등록 요청';}
  }
}

async function _doSubmitMatch(){
  const matchDate=document.getElementById('reg-date').value;
  const sa=parseInt(document.getElementById('reg-sa').value)||0;
  const sbv=parseInt(document.getElementById('reg-sb').value)||0;

  const a1=_regSlots.a1, a2=_regSlots.a2, b1=_regSlots.b1, b2=_regSlots.b2;

  if(!matchDate){toast('경기 일자 선택','error');return;}
  if(!a1){toast('A팀 선수1을 선택하세요','error');return;}
  if(!b1){toast('B팀 선수1을 선택하세요','error');return;}
  if(sa===0&&sbv===0){toast('점수를 입력하세요','error');return;}
  if(sa===sbv){toast('동점은 등록 불가','error');return;}

  const ids=[a1.id,a2?.id,b1.id,b2?.id].filter(Boolean);
  if(new Set(ids).size!==ids.length){toast('중복 선수 확인','error');return;}

  const{error}=await sb.from('matches').insert({
    match_type:regMatchType, match_date:matchDate,
    a1_id:a1.id||null, a1_name:a1.name||null,
    a2_id:a2?.id||null, a2_name:a2?.name||null,
    b1_id:b1.id||null, b1_name:b1.name||null,
    b2_id:b2?.id||null, b2_name:b2?.name||null,
    score_a:sa, score_b:sbv, status:'pending',
    submitter_id:ME.id, submitter_name:ME.name,
    note:document.getElementById('reg-note').value||null,
    created_at:nowISO()
  });
  if(error){toast('등록 실패: '+error.message,'error');return;}
  addLog(`경기 등록 요청: ${a1.name} vs ${b1.name}`,ME.id);
  toast('✅ 등록 요청 완료! 관리자 승인 대기 중','success');
  // 초기화
  regMatchType='doubles';
  _regSlots={a1:null,a2:null,b1:null,b2:null};
  _activeSlot=null;
  document.getElementById('reg-sa').value='';
  document.getElementById('reg-sb').value='';
  document.getElementById('reg-note').value='';
  navigateTo('feed');
}

function setMatchType(t){ regMatchType=t; }
function onSelectChange(){}
function onGuestInput(){}
function updateRegisterSelects(){}
