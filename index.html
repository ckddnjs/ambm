<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>새벽민턴 AM BADMINTON</title>

<!-- OG 메타데이터 -->
<meta property="og:url" content="https://ambm.vercel.app/">
<meta property="og:title" content="새벽민턴 AM BADMINTON">
<meta property="og:type" content="website">
<meta property="og:image" content="https://ambm.vercel.app/og.png">
<meta property="og:description" content="새벽을 깨우는 배드민턴 클럽">
<meta name="description" content="새벽을 깨우는 배드민턴 클럽">

<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Black+Han+Sans&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <link rel="stylesheet" href="app.css?v=1772860537">
</head>
<body>

<div id="loading-screen">
  <div class="ld-icon">🏸</div>
  <div class="ld-title">AM BADMINTON 🏸</div>
  <div class="ld-sub">AM BADMINTON</div>
  <div class="spinner"></div>
</div>

<div id="login-page">
  <div style="position:fixed;top:12px;right:16px;z-index:999;">
    <button onclick="toggleDarkMode()" id="btn-darkmode"
      style="background:rgba(0,0,0,.25);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:20px;padding:6px 14px;font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:inherit;">
      <span id="dm-icon">🌙</span><span id="dm-label">다크</span>
    </button>
  </div>
  <div class="login-container">
    <div class="login-hero">
      <span class="login-emoji">🏸</span>
      <div class="login-title">AM BADMINTON</div>
      <div class="login-subtitle">AM BADMINTON</div>
    </div>
    <div class="login-card">
      <div class="login-tab-row">
        <button class="login-tab active" onclick="switchTab('login')">로그인</button>
        <button class="login-tab" onclick="switchTab('signup')">회원가입</button>
      </div>
      <div class="login-panel active" id="panel-login">
        <button class="btn-kakao" onclick="kakaoLoginDirect()">
          <svg class="kakao-icon" viewBox="0 0 24 24"><path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.568 5.077 3.938 6.538L4.8 21l4.2-2.1c.96.18 1.97.27 3 .27 5.523 0 10-3.477 10-7.77C22 6.477 17.523 3 12 3z" fill="#191919"/></svg>
          카카오로 로그인
        </button>
        <div class="form-divider"><span>이메일 로그인</span></div>
        <div class="fl-input"><input type="email" id="login-email" placeholder=" " autocomplete="email"><label>이메일</label></div>
        <div class="fl-input"><input type="password" id="login-pw" placeholder=" " autocomplete="current-password" onkeydown="if(event.key==='Enter')doEmailLogin()"><label>비밀번호</label></div>
        <button class="btn btn-primary btn-full" onclick="doEmailLogin()">로그인</button>
      </div>
      <div class="login-panel" id="panel-signup">
        <div style="text-align:center;font-size:.86rem;color:var(--text-muted);margin-bottom:14px;">가입 후 관리자 승인 후 이용 가능합니다</div>
        <button class="btn-kakao" onclick="kakaoSignup()">
          <svg class="kakao-icon" viewBox="0 0 24 24"><path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.568 5.077 3.938 6.538L4.8 21l4.2-2.1c.96.18 1.97.27 3 .27 5.523 0 10-3.477 10-7.77C22 6.477 17.523 3 12 3z" fill="#191919"/></svg>
          카카오로 가입
        </button>
        <div class="form-divider"><span>이메일로 가입</span></div>
        <div class="fl-input"><input type="text" id="signup-name" placeholder=" " oninput="this.value=this.value.replace(/[0-9]/g,'')"><label>이름</label></div>
        <div class="fl-input"><input type="email" id="signup-email" placeholder=" "><label>이메일</label></div>
        <div class="fl-input"><input type="password" id="signup-pw" placeholder=" "><label>비밀번호</label></div>
        <!-- 개인정보 동의 -->
        <div style="margin-top:12px;padding:12px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <input type="checkbox" id="privacy-agree" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;accent-color:var(--primary);">
            <label for="privacy-agree" style="font-size:.8rem;color:var(--text-muted);line-height:1.5;cursor:pointer;">
              <b style="color:var(--text);">[필수] 개인정보 수집·이용 및 처리 위탁 동의</b>
              <span id="privacy-text-toggle" onclick="event.stopPropagation();document.getElementById('privacy-full').style.display=document.getElementById('privacy-full').style.display==='none'?'block':'none';" style="color:var(--primary);cursor:pointer;margin-left:4px;">[내용 보기 ▼]</span>
            </label>
          </div>
          <div id="privacy-full" style="display:none;margin-top:8px;font-size:.75rem;color:var(--text-muted);line-height:1.7;max-height:180px;overflow-y:auto;padding-right:4px;">
            <b style="color:var(--text);">1. 개인정보 처리자 및 수집 근거</b><br>
            · 처리자: AM BADMINTON 운영자<br>
            · 근거: 「개인정보 보호법」 제15조 제1항 제1호<br><br>
            <b style="color:var(--text);">2. 수집 및 이용 목적</b><br>
            · 회원 가입 및 본인 식별<br>
            · 경기 매칭 및 스코어 내역 기록·보관<br>
            · 부정 이용 방지 및 시스템 운영<br><br>
            <b style="color:var(--text);">3. 수집 항목</b><br>
            · 필수: 이름(닉네임), 이메일, 성별<br><br>
            <b style="color:var(--text);">4. 보유·이용 기간 및 파기</b><br>
            · 회원 탈퇴 시 또는 서비스 종료 시까지 보관<br>
            · 법정 보관 사유 있을 시 해당 기간 보관 후 영구 삭제<br><br>
            <b style="color:var(--text);">5. 개인정보 처리 위탁</b><br>
            · 수탁자: Supabase (서울 리전, 대한민국)<br>
            · 위탁업무: DB 저장 및 클라우드 서버 운영
          </div>
        </div>
        <button class="btn btn-primary btn-full" style="margin-top:12px;" onclick="doEmailSignup()">가입 신청</button>
      </div>
    </div>
  </div>
</div>

<div id="app">
  <header class="app-header">
    <div class="app-header-logo" onclick="goHome()">🏸 AM BADMINTON</div>
    <div class="header-right">
      <button onclick="toggleDarkMode()" id="btn-darkmode-app"
        style="background:var(--bg3);border:1px solid var(--border);color:var(--text-muted);border-radius:16px;padding:4px 10px;font-size:.75rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:inherit;">
        <span id="dm-icon-app">🌙</span><span id="dm-label-app">다크</span>
      </button>
      <div class="header-chip">
        <span id="hdr-name">-</span>
      </div>
      <button class="btn-icon" onclick="doLogout()">↩</button>
    </div>
  </header>
  <div class="app-body">

    <!-- 대시보드 -->
    <div class="page active" id="page-dashboard">
      <div class="flex-between mb-2">
        <div><div class="page-title" id="dash-hello">안녕하세요 👋</div><div class="page-sub">나의 경기 통계</div></div>
        <button class="btn btn-ghost btn-sm" onclick="renderDashboard()">↻</button>
      </div>
      <div class="card green-glow" id="my-overview-card"></div>
      <div class="card">
        <div class="card-title">📈 변동 추이</div>
        <div class="sub-tabs" style="margin-bottom:10px;">
          <button class="sub-tab active" onclick="switchTrendTab('ci')" id="trend-tab-ci">종합</button>
          <button class="sub-tab" onclick="switchTrendTab('winrate')" id="trend-tab-winrate">승률</button>
          <button class="sub-tab" onclick="switchTrendTab('diff')" id="trend-tab-diff">득실</button>
        </div>
        <div style="position:relative;width:100%;"><canvas id="wr-trend-canvas" style="width:100%;display:block;"></canvas></div>
        <div id="wr-trend-empty" style="display:none;text-align:center;padding:20px;color:var(--text-muted);font-size:.85rem;">경기 기록이 없습니다</div>
      </div>
      <div class="card">
        <div class="card-title">🤝 베스트 파트너</div>
        <div id="partner-list"></div>
      </div>
      <div class="card">
        <div class="card-title">🏆 전체 랭킹 <span style="font-size:.68rem;font-weight:400;color:var(--text-muted);">5경기 이상 반영</span></div>
        <div class="sort-row">
          <button class="sort-pill active" onclick="setSort('ci')">종합</button>
          <button class="sort-pill" onclick="setSort('winrate')">승률</button>
          <button class="sort-pill" onclick="setSort('wins')">승수</button>
          <button class="sort-pill" onclick="setSort('diff')">득실</button>
          <button class="sort-pill" onclick="setSort('games')">경기수</button>
        </div>
        <div style="overflow-x:auto"><div id="rank-table-wrap"></div></div>
      </div>
      <div class="card">
        <div class="card-title">📈 산점도(승률-득실차)</div>
        <div style="margin-bottom:8px;">
          <select class="form-select" id="scatter-highlight" onchange="renderScatter()" style="font-size:.82rem;">
            <option value="">▼ 다른 회원 비교</option>
          </select>
        </div>
        <div style="position:relative;width:100%;"><canvas id="scatter-canvas" style="width:100%;display:block;"></canvas></div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-top:6px;text-align:center;">X축: 승률(%) · Y축: 평균 득실차 · 전체 경기 기준</div>
      </div>
    </div>

    <!-- 경기내역 -->
    <div class="page" id="page-feed">
      <div class="flex-between mb-2">
        <div><div class="page-title">📋 경기 내역</div><div class="page-sub">최근 경기 결과</div></div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-ghost btn-sm" onclick="renderFeed()" style="color:var(--text-muted);">↻</button>
          <button id="btn-batch-register" class="btn btn-ghost btn-sm" onclick="toggleBatchPanel()" style="display:none;border:1px solid var(--border);color:var(--text-muted);font-size:.78rem;">📋 일괄등록</button>
          <button class="btn btn-ghost btn-sm" onclick="openScoreboard()" style="border:1px solid var(--border);color:var(--text-muted);font-size:.78rem;">🏸 점수판</button>
          <button class="btn btn-primary btn-sm" onclick="openRegisterModal()" style="font-size:.82rem;">✍️ 경기등록</button>
        </div>
      </div>
      <div class="filter-row">
        <select class="form-select" id="feed-date-filter" onchange="renderFeed()" style="flex:1.4;">
          <option value="">전체 날짜</option>
        </select>
        <select class="form-select" id="feed-status-filter" onchange="renderFeed()">
          <option value="approved">승인 경기</option>
          <option value="">전체</option>
          <option value="pending">대기중</option>
        </select>
        <select class="form-select" id="feed-sort-filter" onchange="renderFeed()">
          <option value="desc">최신순</option>
          <option value="asc">오래된순</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center;">
        <div style="position:relative;flex:1;">
          <input class="form-input" type="search" id="feed-name-search" placeholder="🔍 선수 이름 검색..." oninput="renderFeed()" style="padding-right:36px;">
          <button id="feed-search-clear" onclick="clearFeedSearch()" style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);font-size:1.1rem;cursor:pointer;line-height:1;">✕</button>
        </div>
        <button onclick="feedMyMatches()" style="white-space:nowrap;background:var(--bg3);border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:0 12px;height:44px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0;">내 경기</button>
      </div>
      <!-- 일괄등록 패널 (관리자) -->
      <div id="batch-panel" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">
        <div style="font-size:.85rem;font-weight:700;margin-bottom:6px;">📋 경기 일괄 등록</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;line-height:1.7;background:var(--bg2);padding:8px 10px;border-radius:8px;">
          <b>형식:</b> 날짜 A1 A2 점수:점수 B1 B2 (한 줄=1경기, 날짜 생략 가능)<br>
          예) <code>26-03-08 김민수 강민지 25:23 김민철 감민처</code>
        </div>
        <textarea id="batch-input" placeholder="경기 데이터를 붙여넣으세요..."
          style="width:100%;min-height:120px;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:.82rem;font-family:monospace;resize:vertical;"></textarea>
        <button onclick="batchParsePreview()" class="btn btn-primary" style="width:100%;margin-top:8px;">🔍 파싱 미리보기</button>
        <div id="batch-preview" style="margin-top:8px;"></div>
      </div>
      <div id="feed-list"></div>
    </div>

    <!-- 경기등록 (더미 페이지 - 모달로 대체됨) -->
    <div class="page" id="page-register" style="display:none !important;"></div>

    <!-- 관리자 -->
    <div class="page" id="page-compare"></div>
    <div class="page" id="page-admin">
      <div class="flex-between mb-2">
        <div><div class="page-title">🛡️ 관리자</div><div class="page-sub">전체 관리</div></div>
        <span class="admin-tag">ADMIN</span>
      </div>
      <div class="sub-tabs">
        <button class="sub-tab active" onclick="switchAdminTab('pending')">승인대기</button>
        <button class="sub-tab" onclick="switchAdminTab('members')">회원</button>
        <button class="sub-tab" onclick="switchAdminTab('logs')">로그</button>
      </div>
      <div id="admin-content"></div>
    </div>

    <!-- 대회 -->
    <div class="page" id="page-tournament">
      <div class="flex-between mb-2">
        <div><div class="page-title">🏆 자체대회</div><div class="page-sub">조별리그 · 본선토너먼트</div></div>
        <button id="btn-add-bracket" class="btn btn-primary btn-sm" onclick="toggleBracketForm()" style="display:none;">+ 대회 만들기</button>
      </div>

      <!-- ── STEP 폼 (인라인) ── -->
      <div id="bracket-form-inline" style="display:none;" class="card mb-3">

        <!-- 스텝 인디케이터 -->
        <div id="bf-step-indicator" style="display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:16px;">
          <div class="bf-step-dot active" id="bf-dot-1">1<span>참석자</span></div>
          <div class="bf-step-line" id="bf-line-1"></div>
          <div class="bf-step-dot" id="bf-dot-2">2<span>배분</span></div>
          <div class="bf-step-line" id="bf-line-2"></div>
          <div class="bf-step-dot" id="bf-dot-3">3<span>확정</span></div>
        </div>

        <!-- STEP 1: 기본정보 + 참석자 -->
        <div id="bf-step1">
          <div class="card-title" style="margin-bottom:12px;">📋 기본 정보 & 참석자</div>

          <div class="form-group mb-2">
            <label class="form-label">대회 종목 <span class="req">*</span></label>
            <div style="display:flex;gap:6px;">
              <button id="bf-type-individual" class="btn btn-primary btn-sm" onclick="bfSetType('individual')" style="flex:1;">👤 개인전</button>
              <button id="bf-type-duo" class="btn btn-ghost btn-sm" onclick="bfSetType('duo')" style="flex:1;">👥 듀오전</button>
              <button id="bf-type-team" class="btn btn-ghost btn-sm" onclick="bfSetType('team')" style="flex:1;">🚩 팀장전</button>
            </div>
            <div id="bf-type-desc" style="font-size:.75rem;color:var(--text-muted);margin-top:6px;padding:6px 10px;background:var(--bg2);border-radius:8px;">
              조별 풀리그 후 각 조 1·2위가 본선 토너먼트에 진출합니다.
            </div>
          </div>

          <div class="form-group mb-2">
            <label class="form-label">대회명 <span class="req">*</span></label>
            <input class="form-input" id="bf-auto-name" placeholder="예) 4월 자체대회">
          </div>
          <div class="form-group mb-2">
            <label class="form-label">날짜 <span class="req">*</span></label>
            <input class="form-input" type="date" id="bf-auto-date">
          </div>

          <!-- 팀전: 팀장 지정 -->
          <div id="bf-team-captain-section" style="display:none;" class="form-group mb-2">
            <label class="form-label">팀장 지정</label>
            <div style="display:flex;gap:8px;">
              <div style="flex:1;">
                <div style="font-size:.78rem;color:var(--info);margin-bottom:4px;">🔵 A팀 팀장</div>
                <select class="form-select" id="bf-captain-a"><option value="">선택</option></select>
              </div>
              <div style="flex:1;">
                <div style="font-size:.78rem;color:var(--danger);margin-bottom:4px;">🔴 B팀 팀장</div>
                <select class="form-select" id="bf-captain-b"><option value="">선택</option></select>
              </div>
            </div>
          </div>

          <div class="form-group mb-3">
            <label class="form-label">참석자 선택 <span class="req">*</span></label>
            <div id="bf-attendee-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:44px;background:var(--bg2);border-radius:10px;padding:10px;"></div>
            <div id="bf-attendee-count" style="font-size:.75rem;color:var(--text-muted);margin-top:6px;text-align:right;">0명 선택됨</div>
          </div>

          <div style="display:flex;gap:8px;">
            <button class="btn btn-ghost" style="flex:1;" onclick="toggleBracketForm()">취소</button>
            <button class="btn btn-primary" style="flex:1;" onclick="bfNextStep()">다음 →</button>
          </div>
        </div>

        <!-- STEP 2: 배분 & 수정 -->
        <div id="bf-step2" style="display:none;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div class="card-title" style="margin:0;">⚙️ 참석자 배분</div>
            <button onclick="bfRenderArrangement()" style="font-size:.75rem;padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--text-muted);">🔄 자동 재배분</button>
          </div>
          <div id="bf-arrange-wrap" style="margin-bottom:12px;"></div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-ghost" style="flex:1;" onclick="bfGoStep(1)">← 뒤로</button>
            <button class="btn btn-primary" style="flex:1;" onclick="bfConfirmArrangement()">✅ 구성 확정</button>
          </div>
        </div>

      </div>
      <!-- /bracket-form-inline -->

      <!-- 대회 목록 -->
      <div id="bracket-list"></div>
    </div>

    <!-- 토너먼트전 (레거시 - 더 이상 nav에 노출 안 함) -->
    <div class="page" id="page-bracket" style="display:none !important;"></div>

    <!-- 커뮤니티 -->
    <div class="page" id="page-community">
      <div class="flex-between mb-2">
        <div><div class="page-title">📢 공지사항</div><div class="page-sub">관리자 공지</div></div>
        <button id="btn-comm-write" class="btn btn-primary btn-sm" onclick="openPostForm()" style="display:none;">✍️ 글쓰기</button>
      </div>
      <div class="sub-tabs" id="comm-tabs">
        <button class="sub-tab active" onclick="switchCommTab('all')">전체</button>
        <button class="sub-tab" onclick="switchCommTab('general')">일반</button>
        <button class="sub-tab" onclick="switchCommTab('info')">정보</button>
        <button class="sub-tab" onclick="switchCommTab('rules')">규칙</button>
      </div>
      <div id="community-list"></div>
    </div>

  </div>
  <nav class="bottom-nav" id="bottom-nav"></nav>
</div>

<!-- 경기등록 모달 -->
<div class="modal-overlay" id="modal-register">
  <div class="modal" style="max-height:90vh;overflow-y:auto;">
    <div class="modal-handle"></div>
    <div class="modal-title">✍️ 경기 등록 요청</div>
    <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:14px;">관리자 승인 후 통계에 반영됩니다</div>
    <div class="form-group">
      <label class="form-label">경기 종목 <span class="req">*</span></label>
      <div class="sub-tabs" style="background:var(--bg2)"><button class="sub-tab active" id="rt-doubles" onclick="setMatchType('doubles')">🏸 복식</button></div>
    </div>
    <div class="form-group">
      <label class="form-label">경기 일자 <span class="req">*</span></label>
      <input class="form-input" type="date" id="reg-date">
    </div>
    <hr class="section-divider">
    <div style="font-size:.82rem;font-weight:700;color:#c0392b;margin-bottom:8px;">🔴 A팀</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 72px;gap:6px;align-items:end;margin-bottom:12px;">
      <div class="form-group" style="margin:0;"><label class="form-label" id="lbl-a1" style="font-size:.72rem;">선수1 <span class="req">*</span></label><select class="form-select" id="reg-a1" onchange="onSelectChange()"></select><input class="form-input" id="reg-a1-guest" placeholder="비회원 이름 입력" style="display:none;margin-top:4px;font-size:.82rem;" oninput="onGuestInput('reg-a1-guest')"></div>
      <div class="form-group" style="margin:0;"><label class="form-label" id="lbl-a2" style="font-size:.72rem;">선수2</label><select class="form-select" id="reg-a2" onchange="onSelectChange()"></select><input class="form-input" id="reg-a2-guest" placeholder="비회원 이름 입력" style="display:none;margin-top:4px;font-size:.82rem;" oninput="onGuestInput('reg-a2-guest')"></div>
      <div class="form-group" style="margin:0;"><label class="form-label" style="font-size:.72rem;color:#c0392b;">점수 <span class="req">*</span></label><input class="form-input" type="number" id="reg-sa" placeholder="0" min="0" max="30" inputmode="numeric" style="text-align:center;font-weight:700;"></div>
    </div>
    <hr class="section-divider">
    <div style="font-size:.82rem;font-weight:700;color:#27ae60;margin-bottom:8px;">🟢 B팀</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 72px;gap:6px;align-items:end;margin-bottom:12px;">
      <div class="form-group" style="margin:0;"><label class="form-label" id="lbl-b1" style="font-size:.72rem;">선수1 <span class="req">*</span></label><select class="form-select" id="reg-b1" onchange="onSelectChange()"></select><input class="form-input" id="reg-b1-guest" placeholder="비회원 이름 입력" style="display:none;margin-top:4px;font-size:.82rem;" oninput="onGuestInput('reg-b1-guest')"></div>
      <div class="form-group" style="margin:0;"><label class="form-label" id="lbl-b2" style="font-size:.72rem;">선수2</label><select class="form-select" id="reg-b2" onchange="onSelectChange()"></select><input class="form-input" id="reg-b2-guest" placeholder="비회원 이름 입력" style="display:none;margin-top:4px;font-size:.82rem;" oninput="onGuestInput('reg-b2-guest')"></div>
      <div class="form-group" style="margin:0;"><label class="form-label" style="font-size:.72rem;color:#27ae60;">점수 <span class="req">*</span></label><input class="form-input" type="number" id="reg-sb" placeholder="0" min="0" max="30" inputmode="numeric" style="text-align:center;font-weight:700;"></div>
    </div>
    <div class="form-group mt-3"><label class="form-label">메모 (선택)</label><input class="form-input" type="text" id="reg-note" placeholder="특이사항 등"></div>
    <div style="display:flex;gap:8px;margin-top:6px;">
      <button class="btn btn-ghost" onclick="closeModal('modal-register')">취소</button>
      <button class="btn btn-primary" style="flex:1;" onclick="submitMatch()">📨 등록 요청</button>
    </div>
  </div>
</div>

<!-- 토너먼트 생성 모달 -->


<!-- 토너먼트 상세 모달 -->
<div class="modal-overlay" id="modal-bracket-detail">
  <div class="modal" style="max-height:90vh;overflow-y:auto;">
    <div class="modal-handle"></div>
    <div class="modal-title" id="bd-title">🎯 대회</div>
    <div id="bd-content"></div>
    <div class="modal-actions" id="bd-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-bracket-detail')">닫기</button>
    </div>
  </div>
</div>

<!-- 대회 등록 모달 -->
<div class="modal-overlay" id="modal-tournament-form">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">🏆 대회 등록</div>
    <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0 8px;">
      <div class="form-group"><label class="form-label">대회명 <span class="req">*</span></label><input class="form-input" id="tf-name" placeholder="예) AM BADMINTON 오픈"></div>
      <div class="form-row-2">
        <div class="form-group"><label class="form-label">시작일 <span class="req">*</span></label><input class="form-input" type="date" id="tf-date-start"></div>
        <div class="form-group"><label class="form-label">종료일</label><input class="form-input" type="date" id="tf-date-end"></div>
      </div>
      <div class="form-group"><label class="form-label">장소</label><input class="form-input" id="tf-place" placeholder="예) 새벽민턴 체육관"></div>
      <div class="form-group"><label class="form-label">URL</label><input class="form-input" id="tf-url" placeholder="https://" type="url"></div>
      <div class="form-group"><label class="form-label">특이사항</label><textarea class="form-input" id="tf-note" rows="3" placeholder="기타 안내사항" style="resize:vertical;min-height:72px;"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-tournament-form')">취소</button>
      <button class="btn btn-primary" onclick="submitTournament()">등록</button>
    </div>
  </div>
</div>

<!-- 경기 상세 모달 -->
<div class="modal-overlay" id="modal-match">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title" id="modal-match-title">경기 상세</div>
    <div id="modal-match-body"></div>
    <div class="modal-actions" id="modal-match-actions"></div>
  </div>
</div>

<!-- 경기 수정 모달 -->
<div class="modal-overlay center" id="modal-edit-match">
  <div class="modal center-modal">
    <div class="modal-title">✏️ 경기 수정</div>
    <div id="modal-edit-body"></div>
    <div class="modal-actions" id="modal-edit-actions"></div>
  </div>
</div>

<!-- 계정 생성 모달 -->
<div class="modal-overlay center" id="modal-create-user">
  <div class="modal center-modal">
    <div class="modal-title">➕ 계정 생성</div>
    <div class="form-group"><label class="form-label">이름</label><input class="form-input" type="text" id="nu-name"></div>
    <div class="form-group"><label class="form-label">이메일</label><input class="form-input" type="email" id="nu-email"></div>
    <div class="form-group"><label class="form-label">비밀번호</label><input class="form-input" type="password" id="nu-pw" value="4321"></div>
    <div class="form-group"><label class="form-label">역할</label><select class="form-select" id="nu-role"><option value="user">일반</option><option value="writer">작성자</option><option value="admin">관리자</option></select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-create-user')">취소</button>
      <button class="btn btn-primary" onclick="createUser()">생성</button>
    </div>
  </div>
</div>

<!-- 회원 정보 수정 모달 -->
<div class="modal-overlay center" id="modal-edit-user">
  <div class="modal center-modal">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="modal-title" style="margin-bottom:0;">✏️ 회원 정보 수정</div>
      <button class="btn btn-danger btn-sm" id="eu-reject-btn" onclick="confirmRejectUserFromModal()">🚫 강퇴</button>
    </div>
    <input type="hidden" id="eu-id">
    <div class="form-group"><label class="form-label">이름</label><input class="form-input" type="text" id="eu-name"></div>
    <div class="form-group"><label class="form-label">상태</label>
      <select class="form-select" id="eu-status">
        <option value="approved">승인</option>
        <option value="pending">대기</option>
        <option value="rejected">정지</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">역할</label>
      <select class="form-select" id="eu-role">
        <option value="user">일반</option>
        <option value="writer">작성자</option>
        <option value="admin">관리자</option>
      </select>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
        <input type="checkbox" id="eu-exclude-stats" style="width:16px;height:16px;accent-color:var(--warn);">
        <span class="form-label" style="margin:0;">통계 제외 <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;">(순위·랭킹에서 제외)</span></span>
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-edit-user')">취소</button>
      <button class="btn btn-primary" onclick="saveEditUser()">저장</button>
    </div>
  </div>
</div>

<!-- 커뮤니티 글쓰기 모달 -->
<div class="modal-overlay" id="modal-post-form">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title" id="post-form-title">✍️ 글쓰기</div>
    <input type="hidden" id="post-edit-id">
    <div class="form-group">
      <label class="form-label">유형 <span class="req">*</span></label>
      <div class="sub-tabs" style="background:var(--bg2);">
        <button class="sub-tab active" id="pcat-general" onclick="selectPostCat('general')">일반</button>
        <button class="sub-tab" id="pcat-info" onclick="selectPostCat('info')">정보</button>
        <button class="sub-tab" id="pcat-rules" onclick="selectPostCat('rules')">규칙</button>
      </div>
    </div>
    <div class="form-group"><label class="form-label">제목 <span class="req">*</span></label><input class="form-input" type="text" id="post-title" placeholder="제목을 입력하세요"></div>
    <div class="form-group"><label class="form-label">내용 <span class="req">*</span></label><textarea class="form-input" id="post-body" rows="5" placeholder="내용을 입력하세요" style="resize:vertical;min-height:100px;"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-post-form')">취소</button>
      <button class="btn btn-primary" onclick="submitPost()">등록</button>
    </div>
  </div>
</div>

<!-- 확인 다이얼로그 -->
<div class="modal-overlay center" id="modal-confirm">
  <div class="modal confirm-modal">
    <div class="confirm-icon" id="confirm-icon">⚠️</div>
    <div class="confirm-title" id="confirm-title">확인</div>
    <div class="confirm-msg" id="confirm-msg"></div>
    <div class="confirm-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-confirm')">취소</button>
      <button class="btn btn-danger" id="confirm-ok-btn">확인</button>
    </div>
  </div>
</div>

<div id="toast-container"></div>

<script src="app.js?v=1772860537" defer></script>

<!-- 점수판 모달 -->
<div id="modal-scoreboard" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:9000;flex-direction:column;font-family:inherit;user-select:none;">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4vw;background:#111;height:12vmin;min-height:44px;max-height:60px;flex-shrink:0;">
    <div style="color:#888;font-size:max(11px,1.8vw);font-weight:600;letter-spacing:.3px;">🏸 점수판</div>
    <div style="display:flex;gap:10px;">
      <button onclick="sbReset()" style="background:#333;color:#ccc;border:1px solid #555;padding:6px 3vw;font-size:max(12px,1.8vw);font-weight:700;border-radius:8px;cursor:pointer;">RESET</button>
      <button onclick="sbCourtChange()" style="background:#e67e22;color:#fff;border:none;padding:6px 3vw;font-size:max(12px,1.8vw);font-weight:700;border-radius:8px;cursor:pointer;">⇄ 체인지</button>
      <button onclick="sbFinish()" id="sb-finish-btn" style="background:#00c896;color:#000;border:none;padding:6px 3vw;font-size:max(12px,1.8vw);font-weight:700;border-radius:8px;cursor:pointer;">완료 ▼</button>
    </div>
  </div>
  <div style="display:flex;flex:1;overflow:hidden;">
    <div style="flex:1;display:flex;flex-direction:column;position:relative;">
      <div id="sb-top-a" onclick="sbChange('a',1)" style="flex:1;background:#0D47A1;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.12);"></div>
      <div id="sb-bot-a" onclick="sbChange('a',-1)" style="flex:1;background:#0D47A1;cursor:pointer;border-top:1px solid rgba(255,255,255,.12);"></div>
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
        <div id="sb-score-a" style="font-size:32vw;font-family:'Noto Sans KR','Apple Gothic',sans-serif;color:#fff;line-height:1;font-weight:900;">0</div>
      </div>
      <div id="sb-hint-a" style="position:absolute;left:6px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:space-around;align-items:center;pointer-events:none;gap:0;">
        <span style="font-size:max(10px,1.6vw);color:rgba(255,255,255,.45);font-weight:700;writing-mode:vertical-rl;letter-spacing:2px;">▲ +1</span>
        <span style="font-size:max(10px,1.6vw);color:rgba(255,255,255,.3);font-weight:700;writing-mode:vertical-rl;letter-spacing:2px;">▼ −1</span>
      </div>
    </div>
    <div style="width:1px;background:rgba(255,255,255,.15);flex-shrink:0;"></div>
    <div style="flex:1;display:flex;flex-direction:column;position:relative;">
      <div id="sb-top-b" onclick="sbChange('b',1)" style="flex:1;background:#B71C1C;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.12);"></div>
      <div id="sb-bot-b" onclick="sbChange('b',-1)" style="flex:1;background:#B71C1C;cursor:pointer;border-top:1px solid rgba(255,255,255,.12);"></div>
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
        <div id="sb-score-b" style="font-size:32vw;font-family:'Noto Sans KR','Apple Gothic',sans-serif;color:#fff;line-height:1;font-weight:900;">0</div>
      </div>
      <div id="sb-hint-b" style="position:absolute;right:6px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:space-around;align-items:center;pointer-events:none;">
        <span style="font-size:max(10px,1.6vw);color:rgba(255,255,255,.45);font-weight:700;writing-mode:vertical-rl;letter-spacing:2px;">▲ +1</span>
        <span style="font-size:max(10px,1.6vw);color:rgba(255,255,255,.3);font-weight:700;writing-mode:vertical-rl;letter-spacing:2px;">▼ −1</span>
      </div>
    </div>
  </div>
</div>

<!-- 경기결과 등록 패널 -->
<div id="sb-finish-panel" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:#111;z-index:9500;overflow-y:scroll;font-family:inherit;">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #2a2a2a;position:sticky;top:0;background:#111;z-index:10;">
    <span style="font-weight:700;color:#00c896;font-size:1rem;">🏸 경기 결과 등록</span>
    <button ontouchend="event.preventDefault();sbBackToBoard();" onclick="sbBackToBoard();" style="background:#2a2a2a;border:1px solid #444;color:#aaa;padding:5px 12px;border-radius:8px;font-size:.82rem;cursor:pointer;">← 점수판으로</button>
  </div>
  <div style="padding:16px;">
    <div style="margin-bottom:20px;">
      <div style="font-size:.72rem;color:#888;margin-bottom:6px;font-weight:600;">최종 점수 (수정 가능)</div>
      <div style="display:grid;grid-template-columns:1fr 32px 1fr;gap:6px;align-items:center;">
        <div><div style="font-size:.68rem;color:#c0392b;margin-bottom:3px;font-weight:700;">🔴 A팀</div><input id="sb-input-a" type="number" min="0" max="99" inputmode="numeric" style="width:100%;box-sizing:border-box;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:8px;padding:10px 6px;font-size:1.6rem;font-weight:700;text-align:center;"></div>
        <div style="text-align:center;color:#555;font-size:1.4rem;font-weight:700;padding-top:18px;">:</div>
        <div><div style="font-size:.68rem;color:#27ae60;margin-bottom:3px;font-weight:700;">🟢 B팀</div><input id="sb-input-b" type="number" min="0" max="99" inputmode="numeric" style="width:100%;box-sizing:border-box;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:8px;padding:10px 6px;font-size:1.6rem;font-weight:700;text-align:center;"></div>
      </div>
    </div>
    <div style="display:flex;gap:8px;padding-bottom:30px;">
      <button ontouchend="event.preventDefault();closeSbPanel();" onclick="closeSbPanel();" style="flex:1;padding:13px;background:#2a2a2a;color:#aaa;border:1px solid #444;border-radius:10px;font-size:.9rem;cursor:pointer;font-weight:600;">나가기</button>
      <button ontouchend="event.preventDefault();sbSubmit();" onclick="sbSubmit();" style="flex:2;padding:13px;background:#00c896;color:#000;border:none;border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer;">점수이관 →</button>
    </div>
  </div>
</div>
</body>
</html>
