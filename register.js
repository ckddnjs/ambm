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
  navigateTo('feed');
}

