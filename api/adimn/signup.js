// api/admin/signup.js
// 새벽민턴 AM BADMINTON — 이메일 회원가입 (fetch 기반, SDK 불필요)
// Vercel 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  if (password.length < 4)
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // 1) Supabase Auth Admin API로 유저 생성 (이메일 확인 없이 즉시)
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      }),
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
      console.error('[signup] auth error:', authData);
      return res.status(400).json({ error: authData.msg || authData.message || 'auth 생성 실패' });
    }

    const uid = authData?.id;
    if (!uid) return res.status(500).json({ error: '유저 ID를 받지 못했습니다.' });

    // 2) profiles 테이블에 pending 상태로 삽입
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: uid, email, name,
        role: 'user', status: 'pending',
        provider: 'email', wins: 0, losses: 0, games: 0,
      }),
    });

    if (!profRes.ok) {
      const profData = await profRes.json().catch(() => ({}));
      console.error('[signup] profile error:', profData);
      return res.status(500).json({ error: profData.message || '프로필 생성 실패' });
    }

    return res.status(200).json({ ok: true, uid });
  } catch (e) {
    console.error('[signup] unexpected:', e);
    return res.status(500).json({ error: e.message });
  }
};
