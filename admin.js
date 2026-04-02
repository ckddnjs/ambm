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
    html+=`<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">`;
    results.forEach((r,i)=>{
      const aTeam=[r.a1_name,r.a2_name].filter(Boolean).join(' / ');
      const bTeam=[r.b1_name,r.b2_name].filter(Boolean).join(' / ');
      const aWin=r.score_a>r.score_b;
      html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:.8rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="color:var(--text-muted);font-size:.72rem;flex-shrink:0;">${r.match_date}</span>
        <span style="color:${aWin?'var(--text)':'var(--text-muted)'};">${aTeam}</span>
        <span style="font-weight:700;color:var(--primary);flex-shrink:0;">${r.score_a} : ${r.score_b}</span>
        <span style="color:${!aWin?'var(--text)':'var(--text-muted)'};">${bTeam}</span>
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

