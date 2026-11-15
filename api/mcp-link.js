import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';
const KCW_PROFILE_ID = '0b8e3098-b0be-43ee-9729-07702141b005';
const MCP_URL = process.env.MCP_PUBLIC_URL || 'https://ambm.vercel.app/api/mcp';

const signingSecret = () => process.env.MCP_SIGNING_SECRET || process.env.SUPABASE_SERVICE_KEY;

function createAccessToken(profile) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    typ: 'ambm_mcp_access',
    sub: profile.id,
    name: profile.name,
  })).toString('base64url');
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `ambm1.${payload}.${signature}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (!signingSecret()) return res.status(500).json({ error: 'MCP 서명 설정이 없습니다.' });

  const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await sb.auth.getUser(bearer);
  if (authError || !user) return res.status(401).json({ error: '로그인 정보를 확인할 수 없습니다.' });
  if (user.id !== KCW_PROFILE_ID) return res.status(403).json({ error: '강창원 회원에게만 제공되는 연결입니다.' });

  const { data: profile, error: profileError } = await sb.from('profiles')
    .select('id,name,role,status').eq('id', user.id).single();
  if (profileError || !profile || profile.name !== '강창원' || profile.status !== 'approved') {
    return res.status(403).json({ error: '승인된 강창원 회원 프로필을 확인할 수 없습니다.' });
  }

  const token = createAccessToken(profile);
  return res.status(200).json({
    mcp_url: `${MCP_URL}?key=${encodeURIComponent(token)}`,
    member: profile.name,
    permissions: profile.role === 'admin'
      ? ['경기 조회', '점수지 내검', '승인 등록']
      : ['경기 조회', '점수지 내검', '승인 대기 등록'],
  });
}
