// api/admin/create-user.js
// 새벽민턴 AM BADMINTON — 관리자용 계정 직접 생성 서버리스 함수
// Vercel 환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 호출자 토큰 검증 (관리자인지 확인)
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 토큰으로 호출자 확인
  const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(token);
  if (callerErr || !caller) return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (callerProfile?.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }

  const { email, password, name, role = 'user' } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  }

  try {
    // 1) auth 계정 생성 (이메일 확인 없이 즉시)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, name },
    });

    if (authErr) {
      console.error('[create-user] auth error:', authErr);
      return res.status(400).json({ error: authErr.message });
    }

    const uid = authData?.user?.id;
    if (!uid) return res.status(500).json({ error: '유저 ID를 받지 못했습니다.' });

    // 2) profiles 생성 (status: approved — 관리자가 직접 만드는 계정은 바로 승인)
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: uid,
      email,
      name,
      role,
      status: 'approved',
      provider: 'email',
      wins: 0,
      losses: 0,
      games: 0,
    });

    if (profErr) {
      console.error('[create-user] profile error:', profErr);
      return res.status(500).json({ error: profErr.message });
    }

    return res.status(200).json({ ok: true, uid });
  } catch (e) {
    console.error('[create-user] unexpected error:', e);
    return res.status(500).json({ error: e.message });
  }
};
