// api/admin/create-user.js
// 새벽민턴 AM BADMINTON — 관리자용 계정 생성 (fetch 기반, SDK 불필요)
// Vercel 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 호출자 토큰으로 관리자 여부 확인
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });

  try {
    // 토큰으로 호출자 정보 조회
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${token}` },
    });
    const meData = await meRes.json();
    if (!meRes.ok || !meData?.id) return res.status(401).json({ error: '유효하지 않은 토큰' });

    // profiles에서 role 확인
    const profCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${meData.id}&select=role`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    const [callerProf] = await profCheckRes.json();
    if (callerProf?.role !== 'admin')
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });

    const { email, password, name, role = 'user' } = req.body || {};
    if (!email || !password || !name)
      return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
    if (password.length < 4)
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

    // auth 계정 생성
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        email, password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      }),
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
      console.error('[create-user] auth error:', authData);
      return res.status(400).json({ error: authData.msg || authData.message || 'auth 생성 실패' });
    }

    const uid = authData?.id;
    if (!uid) return res.status(500).json({ error: '유저 ID를 받지 못했습니다.' });

    // profiles upsert (status: approved — 관리자가 직접 만드는 계정)
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
        role, status: 'approved',
        provider: 'email', wins: 0, losses: 0, games: 0,
      }),
    });

    if (!profRes.ok) {
      const profData = await profRes.json().catch(() => ({}));
      console.error('[create-user] profile error:', profData);
      return res.status(500).json({ error: profData.message || '프로필 생성 실패' });
    }

    return res.status(200).json({ ok: true, uid });
  } catch (e) {
    console.error('[create-user] unexpected:', e);
    return res.status(500).json({ error: e.message });
  }
};
