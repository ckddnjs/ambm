const MCP_RESOURCE = 'https://ambm.vercel.app/api/mcp';
const AUTH_SERVER = 'https://wkclmrbdsinvliaaqjol.supabase.co/auth/v1';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }
  return res.status(200).json({
    resource: MCP_RESOURCE,
    authorization_servers: [AUTH_SERVER],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    resource_name: '새벽민턴 경기 기록',
    resource_documentation: 'https://ambm.vercel.app/oauth/consent',
  });
}
