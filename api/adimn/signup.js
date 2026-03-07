// api/admin/signup.js
// 새벽민턴 AM BADMINTON — 이메일 회원가입 서버리스 함수
// Vercel 환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // 1) auth 계정 생성 (service role → 이메일 확인 없이 즉시 생성)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, name },
    });

    if (authErr) {
      console.error('[signup] auth error:', authErr);
      return res.status(400).json({ error: authErr.message });
    }

    const uid = authData?.user?.id;
    if (!uid) return res.status(500).json({ error: '유저 ID를 받지 못했습니다.' });

    // 2) profiles 생성 (status: pending — 관리자 승인 후 이용)
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: uid,
      email,
      name,
      role: 'user',
      status: 'pending',
      provider: 'email',
      wins: 0,
      losses: 0,
      games: 0,
    });

    if (profErr) {
      console.error('[signup] profile error:', profErr);
      return res.status(500).json({ error: profErr.message });
    }

    return res.status(200).json({ ok: true, uid });
  } catch (e) {
    console.error('[signup] unexpected error:', e);
    return res.status(500).json({ error: e.message });
  }
};
