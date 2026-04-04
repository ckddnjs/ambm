/* ── register.js — 경기 등록 (칩 선택 UI) ── */

let _chipSelected = {a1:null, a2:null, b1:null, b2:null};
const _CHIP_SLOTS  = ['a1','a2','b1','b2'];
let _csFilter  = 'ALL';
let _guestPool = []; // 비회원 칩 풀 (등록 완료 전까지 유지)

// 초성 변환 헬퍼 (쌍자음 → 기본 자음으로 통합)
const _CHO_IDX_TO_LABEL = ['ㄱ','ㄱ','ㄴ','ㄷ','ㄷ','ㄹ','ㅁ','ㅂ','ㅂ','ㅅ','ㅅ','ㅇ','ㅈ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const _CHO_BTN_ORDER   = {ㄱ:0,ㄴ:1,ㄷ:2,ㄹ:3,ㅁ:4,ㅂ:5,ㅅ:6,ㅇ:7,ㅈ:8,ㅊ:9,ㅋ:10,ㅌ:11,ㅍ:12,ㅎ:13};

function _regChosung(name){
  const c = name?.charCodeAt(0);
  if(!c || c < 44032 || c > 55203) return null;
  return _CHO_IDX_TO_LABEL[Math.floor((c - 44032) / 588)] ?? null;
}

function setRegisterCsFilter(cs){
  _csFilter = cs || 'ALL';
  _reRenderRegister();
}

function _nextEmptySlot(){
  return _CHIP_SLOTS.find(s => !_chipSelected[s]) || null;
}

/* ── 칩 탭 ── */
function chipTap(uid){
  const users = window._profilesCache || [];
  const p = users.find(u => u.id === uid)
         || _guestPool.find(g => g.id === uid)
         || Object.values(_chipSelected).find(v => v && v.id === uid);
  if(!p) return;

  const _sa   = document.getElementById('reg-sa')?.value   || '';
  const _sb   = document.getElementById('reg-sb')?.value   || '';
  const _date = document.getElementById('reg-date')?.value || '';
  const _note = document.getElementById('reg-note')?.value || '';

  const already = Object.entries(_chipSelected).find(([,v]) => v && v.id === uid);
  if(already){
    // 슬롯에서만 제거 — 비회원이어도 풀에는 남아 있음
    _chipSelected[already[0]] = null;
  } else {
    const slot = _nextEmptySlot();
    if(!slot){ toast('선수 슬롯이 가득 찼습니다', 'error'); return; }
    _chipSelected[slot] = p;
  }

  _reRenderRegister();
  requestAnimationFrame(()=>{
    const sa   = document.getElementById('reg-sa');   if(sa   && _sa)   sa.value   = _sa;
    const sb   = document.getElementById('reg-sb');   if(sb   && _sb)   sb.value   = _sb;
    const date = document.getElementById('reg-date'); if(date && _date) date.value = _date;
    const note = document.getElementById('reg-note'); if(note && _note) note.value = _note;
  });
}

/* ── 슬롯 탭 → 컨텍스트 메뉴 ── */
function clearChipSlot(slotId){
  if(!_chipSelected[slotId]) return;
  const p = _chipSelected[slotId];
  showChipMenu(p.id || slotId, p.name, slotId, !!p.isGuest);
}

function showChipMenu(uid, name, currentSlot, isGuest){
  document.getElementById('chip-ctx-menu')?.remove();
  const isA  = currentSlot.startsWith('a');
  const menu = document.createElement('div');
  menu.id    = 'chip-ctx-menu';
  menu.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;';
  menu.onclick = e => { if(e.target === menu) menu.remove(); };

  const opp      = isA ? ['b1','b2'] : ['a1','a2'];
  const oppEmpty  = opp.find(s => !_chipSelected[s]);
  const oppFilled = opp.filter(s => _chipSelected[s]);

  let moveHtml = '';
  if(oppEmpty && !isGuest){
    const lbl = isA ? 'B팀으로 이동' : 'A팀으로 이동';
    moveHtml += `<button onclick="chipMove('${currentSlot}','${oppEmpty}');document.getElementById('chip-ctx-menu').remove();" style="width:100%;padding:13px 16px;border:none;background:none;text-align:left;font-family:inherit;font-size:.9rem;cursor:pointer;color:var(--text);border-bottom:1px solid var(--border);">
      <span style="margin-right:8px;">${isA?'🟢':'🔴'}</span>${lbl}
    </button>`;
  }
  if(!isGuest){
    oppFilled.forEach(oppSlot => {
      const oppP = _chipSelected[oppSlot];
      moveHtml += `<button onclick="chipSwap('${currentSlot}','${oppSlot}');document.getElementById('chip-ctx-menu').remove();" style="width:100%;padding:13px 16px;border:none;background:none;text-align:left;font-family:inherit;font-size:.9rem;cursor:pointer;color:var(--text);border-bottom:1px solid var(--border);">
        <span style="margin-right:8px;">🔄</span>${oppP.name}과 교체
      </button>`;
    });
  }

  // 비회원: 슬롯에서만 제거 / 풀에서도 완전 삭제 두 가지 옵션
  const removeButtons = isGuest ? `
    <button onclick="_chipSelected['${currentSlot}']=null;document.getElementById('chip-ctx-menu').remove();_reRenderRegister();" style="width:100%;padding:13px 16px;border:none;background:none;text-align:left;font-family:inherit;font-size:.9rem;cursor:pointer;color:var(--text);border-bottom:1px solid var(--border);">
      <span style="margin-right:8px;">↩️</span>슬롯에서만 제거 (목록 유지)
    </button>
    <button onclick="_removeGuestFully('${uid}','${currentSlot}');document.getElementById('chip-ctx-menu').remove();" style="width:100%;padding:13px 16px;border:none;background:none;text-align:left;font-family:inherit;font-size:.9rem;cursor:pointer;color:#FF7070;">
      <span style="margin-right:8px;">✕</span>비회원 완전 삭제
    </button>` : `
    <button onclick="_chipSelected['${currentSlot}']=null;document.getElementById('chip-ctx-menu').remove();_reRenderRegister();" style="width:100%;padding:13px 16px;border:none;background:none;text-align:left;font-family:inherit;font-size:.9rem;cursor:pointer;color:#FF7070;">
      <span style="margin-right:8px;">✕</span>목록에서 제거
    </button>`;

  menu.innerHTML = `
    <div style="width:100%;background:var(--surface,var(--bg));border-radius:16px 16px 0 0;border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom,0);">
      <div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">
        <div style="font-size:.78rem;color:var(--text-muted);">${isGuest?'비회원':'선택된 선수'}</div>
        <div style="font-size:1rem;font-weight:700;">${name} <span style="font-size:.72rem;color:${isA?'#c0392b':'#1a6fc4'};font-weight:400;">${isA?'A팀':'B팀'}</span></div>
      </div>
      ${moveHtml}
      ${removeButtons}
      <button onclick="document.getElementById('chip-ctx-menu').remove();" style="width:100%;padding:13px 16px;border:none;background:none;text-align:center;font-family:inherit;font-size:.9rem;cursor:pointer;color:var(--text-muted);">취소</button>
    </div>`;
  document.body.appendChild(menu);
}

// 비회원 슬롯 + 풀 동시 삭제
function _removeGuestFully(uid, slot){
  _chipSelected[slot] = null;
  _guestPool = _guestPool.filter(g => g.id !== uid);
  _reRenderRegister();
}

function chipMove(fromSlot, toSlot){
  _chipSelected[toSlot]   = _chipSelected[fromSlot];
  _chipSelected[fromSlot] = null;
  _reRenderRegister();
}

function chipSwap(slotA, slotB){
  const tmp = _chipSelected[slotA];
  _chipSelected[slotA] = _chipSelected[slotB];
  _chipSelected[slotB] = tmp;
  _reRenderRegister();
}

/* ── 비회원 추가 → 풀에 추가 후 칩으로 표시 ── */
function _addGuestPlayer(){
  const input = document.getElementById('reg-guest-input');
  const name  = (input?.value || '').trim();
  if(!name){ toast('비회원 이름을 입력하세요', 'error'); return; }

  const inPool = _guestPool.find(g => g.name === name);
  const inSlot = Object.values(_chipSelected).find(v => v && v.name === name);
  if(inPool || inSlot){ toast(`${name}은 이미 추가됐습니다`, 'error'); return; }

  const _sa   = document.getElementById('reg-sa')?.value   || '';
  const _sb   = document.getElementById('reg-sb')?.value   || '';
  const _date = document.getElementById('reg-date')?.value || '';
  const _note = document.getElementById('reg-note')?.value || '';

  _guestPool.push({ id: '__guest__' + Date.now(), name, isGuest: true });
  if(input) input.value = '';

  _reRenderRegister();
  requestAnimationFrame(()=>{
    const sa   = document.getElementById('reg-sa');   if(sa   && _sa)   sa.value   = _sa;
    const sb   = document.getElementById('reg-sb');   if(sb   && _sb)   sb.value   = _sb;
    const date = document.getElementById('reg-date'); if(date && _date) date.value = _date;
    const note = document.getElementById('reg-note'); if(note && _note) note.value = _note;
    document.getElementById('reg-guest-input')?.focus();
  });
}

/* ── 점수 프리셋 ── */
function _rSetScore(a, b){
  const sa = document.getElementById('reg-sa');
  const sb = document.getElementById('reg-sb');
  if(!sa || !sb) return;
  if(a > 0){ sa.value = a; } else { sb.value = b; }
}

function _rSwapScores(){
  const sa = document.getElementById('reg-sa');
  const sb = document.getElementById('reg-sb');
  if(!sa || !sb) return;
  const tmp = sa.value; sa.value = sb.value; sb.value = tmp;
}

/* ── 렌더 ── */
async function renderRegisterPage(){
  const wrap = document.getElementById('register-inline-content');
  if(!wrap) return;

  if(!window._profilesCache || window._profilesCache.length === 0){
    window._profilesCache = await _getApprovedUsers(true);
  }
  _reRenderRegister();
}

function _reRenderRegister(){
  const wrap = document.getElementById('register-inline-content');
  if(!wrap) return;

  const today    = new Date().toISOString().slice(0, 10);
  const allUsers = (window._profilesCache || [])
    .filter(u => !u.exclude_stats)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 현재 회원에 존재하는 초성만 필터 버튼으로 생성
  const _usedCS = [...new Set(allUsers.map(u => _regChosung(u.name)).filter(Boolean))].sort(
    (a, b) => (_CHO_BTN_ORDER[a] ?? 99) - (_CHO_BTN_ORDER[b] ?? 99)
  );

  const btnBase = 'padding:3px 10px;border-radius:12px;border:1px solid var(--border);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit;';
  const csFilterBar = `
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
      <button type="button" onclick="setRegisterCsFilter('ALL')" style="${btnBase}background:${_csFilter==='ALL'?'var(--primary)':'var(--bg2)'};color:${_csFilter==='ALL'?'#fff':'var(--text-muted)'};">전체</button>
      ${_usedCS.map(cs => `<button type="button" onclick='setRegisterCsFilter(${JSON.stringify(cs)})' style="${btnBase}background:${_csFilter===cs?'var(--primary)':'var(--bg2)'};color:${_csFilter===cs?'#fff':'var(--text-muted)'};">${cs}</button>`).join('')}
    </div>`;

  const filtered = _csFilter === 'ALL' ? allUsers : allUsers.filter(u => _regChosung(u.name) === _csFilter);

  // 회원 칩
  function makeChip(p){
    const slot = Object.entries(_chipSelected).find(([, v]) => v && v.id === p.id);
    if(slot){
      const isA = slot[0].startsWith('a');
      const bc  = isA ? '#c0392b' : '#1a6fc4';
      return `<div onclick="chipTap('${p.id}')" style="padding:6px 13px;border-radius:20px;border:1.5px solid ${bc};font-size:.82rem;cursor:pointer;background:var(--bg2);color:${bc};font-weight:700;min-height:34px;display:flex;align-items:center;">${p.name}</div>`;
    }
    const isSelf = p.id === ME?.id;
    return `<div onclick="chipTap('${p.id}')" style="padding:6px 13px;border-radius:20px;border:1.5px solid var(--border);font-size:.82rem;cursor:pointer;background:var(--bg2);color:${isSelf?'#FFB300':'var(--text)'};font-weight:${isSelf?'700':'500'};min-height:34px;display:flex;align-items:center;">${p.name}</div>`;
  }

  // 비회원 칩 — 초성 필터 무시, 항상 맨 뒤에 표시
  function makeGuestChip(g){
    const slot = Object.entries(_chipSelected).find(([, v]) => v && v.id === g.id);
    if(slot){
      const isA = slot[0].startsWith('a');
      const bc  = isA ? '#c0392b' : '#1a6fc4';
      return `<div onclick="chipTap('${g.id}')" style="padding:6px 13px;border-radius:20px;border:1.5px solid ${bc};font-size:.82rem;cursor:pointer;background:var(--bg2);color:${bc};font-weight:700;min-height:34px;display:flex;align-items:center;gap:5px;">${g.name}<span style="font-size:.65rem;opacity:.75;">비회원</span></div>`;
    }
    return `<div onclick="chipTap('${g.id}')" style="padding:6px 13px;border-radius:20px;border:1.5px dashed var(--border);font-size:.82rem;cursor:pointer;background:var(--bg2);color:var(--text-muted);font-weight:500;min-height:34px;display:flex;align-items:center;gap:5px;">${g.name}<span style="font-size:.65rem;">비회원</span></div>`;
  }

  const memberChips = filtered.map(makeChip).join('');
  const guestChips  = _guestPool.map(makeGuestChip).join('');

  function slotHTML(s){
    const colorMap = {a1:'#c0392b', a2:'#c0392b', b1:'#1a6fc4', b2:'#1a6fc4'};
    const labelMap = {a1:'선수 1', a2:'선수 2', b1:'선수 1', b2:'선수 2'};
    const p      = _chipSelected[s];
    const c      = colorMap[s];
    const lbl    = labelMap[s];
    const border = p ? `1.5px solid ${c}` : '1.5px dashed var(--border)';
    const bg     = p ? (s.startsWith('a') ? 'rgba(192,57,43,.07)' : 'rgba(26,111,196,.07)') : 'transparent';
    const dot    = `width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;${p?'':'opacity:.4;'}`;
    const txt    = p ? `color:${c};font-weight:700` : 'color:var(--text-muted)';
    const guestBadge = (p && p.isGuest) ? `<span style="font-size:.65rem;background:rgba(100,100,100,.15);color:var(--text-muted);border-radius:4px;padding:1px 5px;margin-left:2px;">비회원</span>` : '';
    return `<div onclick="clearChipSlot('${s}')" style="min-height:38px;border:${border};border-radius:8px;padding:7px 10px;font-size:.82rem;cursor:pointer;background:${bg};display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <span style="${dot}"></span>
      <span style="${txt}">${p ? p.name : lbl}</span>${guestBadge}
    </div>`;
  }

  const nextSlot  = _nextEmptySlot();
  const hintMap   = {a1:'① A팀 첫번째 선수를 탭하세요', a2:'② A팀 두번째 선수를 탭하세요', b1:'③ B팀 첫번째 선수를 탭하세요', b2:'④ B팀 두번째 선수를 탭하세요'};
  const hintTxt   = nextSlot ? (hintMap[nextSlot] || '') : '✅ 선수 선택 완료';
  const hintColor = nextSlot ? 'var(--text-muted)' : 'var(--primary)';

  wrap.innerHTML = `
    <div class="card mb-2">
      <input class="form-input mb-2" type="date" id="reg-date" value="${today}">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:stretch;margin-bottom:10px;">
        <div>
          <div style="font-size:.72rem;font-weight:700;color:#c0392b;margin-bottom:5px;">● A팀</div>
          ${slotHTML('a1')}${slotHTML('a2')}
        </div>
        <div style="display:flex;align-items:center;justify-content:center;padding:0 6px;">
          <span style="font-size:.75rem;color:var(--text-muted);font-weight:700;">vs</span>
        </div>
        <div>
          <div style="font-size:.72rem;font-weight:700;color:#1a6fc4;margin-bottom:5px;">● B팀</div>
          ${slotHTML('b1')}${slotHTML('b2')}
        </div>
      </div>
      ${csFilterBar}
      <div style="font-size:.72rem;color:${hintColor};text-align:center;margin-bottom:8px;">${hintTxt}</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px;">${memberChips || ''}${guestChips ? (memberChips?'':'') + guestChips : (!memberChips?'<span style="font-size:.8rem;color:var(--text-muted);">해당 초성 없음</span>':'')}</div>
      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;">
        <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">✏️ 비회원 직접 입력</div>
        <div style="display:flex;gap:6px;">
          <input id="reg-guest-input" class="form-input" placeholder="비회원 이름" style="flex:1;font-size:.88rem;" onkeydown="if(event.key==='Enter')_addGuestPlayer()">
          <button onclick="_addGuestPlayer()" style="padding:9px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:.82rem;cursor:pointer;white-space:nowrap;font-weight:600;">추가</button>
        </div>
      </div>
    </div>
    <div class="card mb-2">
      <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">점수</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input class="form-input" type="number" id="reg-sa" placeholder="A" min="0" max="30" inputmode="numeric" style="flex:1;text-align:center;font-weight:700;font-size:1.1rem;">
        <span style="color:var(--text-muted);font-weight:700;">:</span>
        <input class="form-input" type="number" id="reg-sb" placeholder="B" min="0" max="30" inputmode="numeric" style="flex:1;text-align:center;font-weight:700;font-size:1.1rem;">
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button onclick="_rSetScore(25,0)" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid rgba(192,57,43,.3);background:rgba(192,57,43,.07);color:#c0392b;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;min-width:55px;">A 25</button>
        <button onclick="_rSetScore(21,0)" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid rgba(192,57,43,.3);background:rgba(192,57,43,.07);color:#c0392b;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;min-width:55px;">A 21</button>
        <button onclick="_rSwapScores()"  style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid var(--primary);background:rgba(77,159,255,.1);color:var(--primary);font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer;min-width:44px;">⇄</button>
        <button onclick="_rSetScore(0,25)" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid rgba(26,111,196,.3);background:rgba(26,111,196,.07);color:#1a6fc4;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;min-width:55px;">B 25</button>
        <button onclick="_rSetScore(0,21)" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid rgba(26,111,196,.3);background:rgba(26,111,196,.07);color:#1a6fc4;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;min-width:55px;">B 21</button>
      </div>
    </div>
    <input class="form-input mb-2" type="text" id="reg-note" placeholder="메모 (선택)">
    <button class="btn btn-primary" style="width:100%;padding:14px;font-size:.95rem;" onclick="submitMatch()">📨 등록 요청</button>
  `;
}

/* ── 제출 ── */
async function submitMatch(){
  if(window._submitLock){ toast('처리 중입니다…', ''); return; }
  window._submitLock = true;
  const btn = document.querySelector('#register-inline-content .btn-primary');
  if(btn){ btn.disabled = true; btn.textContent = '등록 중…'; }
  try { await _doSubmitMatch(); }
  finally {
    window._submitLock = false;
    if(btn){ btn.disabled = false; btn.textContent = '📨 등록 요청'; }
  }
}

async function _doSubmitMatch(){
  const matchDate = document.getElementById('reg-date')?.value;
  const sa  = parseInt(document.getElementById('reg-sa')?.value)  || 0;
  const sbv = parseInt(document.getElementById('reg-sb')?.value)  || 0;
  const note = document.getElementById('reg-note')?.value || null;

  if(!_chipSelected.a1){ toast('A팀 선수를 선택해주세요', 'error'); return; }
  if(!_chipSelected.b1){ toast('B팀 선수를 선택해주세요', 'error'); return; }
  if(!matchDate){ toast('경기 일자를 선택하세요', 'error'); return; }
  if(sa === 0 && sbv === 0){ toast('점수를 입력하세요', 'error'); return; }
  if(sa === sbv){ toast('동점은 등록할 수 없어요', 'error'); return; }
  const winScore = Math.max(sa, sbv);
  if(winScore !== 25 && winScore !== 21){ toast('승리 점수는 21점 또는 25점이어야 해요', 'error'); return; }

  const memberIds = [_chipSelected.a1?.id, _chipSelected.a2?.id, _chipSelected.b1?.id, _chipSelected.b2?.id]
    .filter(id => id && !String(id).startsWith('__guest__'));
  if(new Set(memberIds).size !== memberIds.length){ toast('중복 선수를 확인하세요', 'error'); return; }

  const {error} = await sb.from('matches').insert({
    match_type: regMatchType || 'doubles',
    match_date: matchDate,
    a1_id:   _chipSelected.a1?.isGuest ? null : (_chipSelected.a1?.id || null),
    a1_name: _chipSelected.a1?.name || null,
    a2_id:   _chipSelected.a2?.isGuest ? null : (_chipSelected.a2?.id || null),
    a2_name: _chipSelected.a2?.name || null,
    b1_id:   _chipSelected.b1?.isGuest ? null : (_chipSelected.b1?.id || null),
    b1_name: _chipSelected.b1?.name || null,
    b2_id:   _chipSelected.b2?.isGuest ? null : (_chipSelected.b2?.id || null),
    b2_name: _chipSelected.b2?.name || null,
    score_a: sa, score_b: sbv,
    status: 'pending',
    submitter_id:   ME.id,
    submitter_name: ME.name,
    note,
    created_at: nowISO(),
  });

  if(error){ toast('등록 실패: ' + error.message, 'error'); return; }

  addLog(`경기 등록 요청: ${_chipSelected.a1?.name} vs ${_chipSelected.b1?.name}`, ME.id);
  if(navigator.vibrate) navigator.vibrate([50, 30, 50]);
  toast('✅ 등록 요청 완료! 관리자 승인 대기 중', 'success');

  // 등록 완료 시에만 비회원 풀 초기화
  _chipSelected = {a1:null, a2:null, b1:null, b2:null};
  _guestPool    = [];
  _csFilter     = 'ALL';
  _reRenderRegister();
}

// 구 API 호환
function setMatchType(t){ regMatchType = t; }
function onSelectChange(){}
function onGuestInput(){}
function updateRegisterSelects(){}
