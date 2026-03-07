// api/admin/delete-user.js
// 새벽민턴 AM BADMINTON — 관리자용 계정 삭제 (fetch 기반, SDK 불필요)
// Vercel 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });

  try {
    // 호출자 확인
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${token}` },
    });
    const meData = await meRes.json();
    if (!meRes.ok || !meData?.id) return res.status(401).json({ error: '유효하지 않은 토큰' });

    const profCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${meData.id}&select=role`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    const [callerProf] = await profCheckRes.json();
    if (callerProf?.role !== 'admin')
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });

    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid가 필요합니다.' });
    if (uid === meData.id) return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });

    // auth 계정 삭제
    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    });

    if (!delRes.ok) {
      const delData = await delRes.json().catch(() => ({}));
      console.error('[delete-user] error:', delData);
      return res.status(500).json({ error: delData.message || '삭제 실패' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[delete-user] unexpected:', e);
    return res.status(500).json({ error: e.message });
  }
};
