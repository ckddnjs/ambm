import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://wkclmrbdsinvliaaqjol.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2xtcmJkc2ludmxpYWFxam9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjA1MzcsImV4cCI6MjA4ODQzNjUzN30.442P3qAs4NahcXEqZ0tMAlco9bb6qnj2CsREIH21Ltc';
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

  // SERVICE 클라이언트로 토큰 검증 + 프로필 조회 (RLS 우회)
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 토큰으로 유저 확인
  const { data: { user }, error: authErr } = await sbAdmin.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid token: ' + (authErr?.message || 'no user') });
  }

  // SERVICE 클라이언트로 profiles 조회 (RLS 우회로 확실하게 읽음)
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

  // 신규 계정 생성
  const { email, password, name, gender, role } = req.body;
  if (!email || !password || !name || !gender) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }

  const { data, error } = await sbAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, gender }
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
    gender,
    wins: 0, losses: 0, games: 0
  });
  if (pe) {
    return res.status(500).json({ error: '프로필 저장 실패: ' + pe.message });
  }

  return res.status(200).json({ uid, name, email });
}
