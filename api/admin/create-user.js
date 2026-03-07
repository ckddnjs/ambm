import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.replace('Bearer ', '');

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });
  }

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: { user }, error: authErr } = await sbAdmin.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid token: ' + (authErr?.message || 'no user') });
  }

  const { data: profile, error: profileErr } = await sbAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return res.status(403).json({ error: 'Profile not found: ' + (profileErr?.message || '') });
  }
  if (profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only (role: ' + profile.role + ')' });
  }

  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }

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
    role: role || 'user',
    status: 'approved',
    provider: 'email',
    wins: 0, losses: 0, games: 0
  });
  if (pe) {
    return res.status(500).json({ error: '프로필 저장 실패: ' + pe.message });
  }

  return res.status(200).json({ uid, name, email });
}
