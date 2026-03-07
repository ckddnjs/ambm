// api/admin/delete-user.js
// 새벽민턴 AM BADMINTON — 관리자용 계정 삭제(강퇴) 서버리스 함수
// Vercel 환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  // 호출자 토큰 검증
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

  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid가 필요합니다.' });

  // 자기 자신은 삭제 불가
  if (uid === caller.id) {
    return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
  }

  try {
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(uid);
    if (deleteErr) {
      console.error('[delete-user] error:', deleteErr);
      return res.status(500).json({ error: deleteErr.message });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[delete-user] unexpected error:', e);
    return res.status(500).json({ error: e.message });
  }
};
