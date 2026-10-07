import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  const name = String(req.body?.name || '').trim();
  if (!email || !password || !name) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }
  // 이름은 관리자 승인 화면 등에 그려진다 — HTML 특수문자 거부 (DB 제약 profiles_name_safe와 같은 규칙)
  if (name.length > 20 || /[<>"'`&\\]/.test(name)) {
    return res.status(400).json({ error: '이름은 20자 이내로, 특수문자 없이 입력해 주세요' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호 4자 이상' });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Server config error: SUPABASE_SERVICE_KEY missing' });
  }

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await sbAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  const uid = data?.user?.id;
  if (!uid) {
    return res.status(500).json({ error: 'ID 생성 실패' });
  }

  const { error: pe } = await sbAdmin.from('profiles').upsert({
    id: uid, email, name,
    role: 'user',
    status: 'pending',
    provider: 'email',
    wins: 0, losses: 0, games: 0
  });
  if (pe) {
    return res.status(500).json({ error: '프로필 저장 실패: ' + pe.message });
  }

  return res.status(200).json({ uid });
}
