// 관리자 전용: 회원 프로필 사진을 작게 줄인 JPEG로 교체 (2026-11-15)
// 브라우저(관리자 화면)가 원본을 받아 320px로 줄여 base64로 보내면, 서비스 키로 같은 경로에 덮어쓰고
// profiles.avatar_url의 ?t= 를 새로 붙여 캐시를 갱신한다. 회원은 자기 폴더만 쓸 수 있어 서버를 거친다.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authErr } = await sbAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
  const { data: me } = await sbAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const userId = String(req.body?.user_id || '');
  const b64 = String(req.body?.b64 || '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return res.status(400).json({ error: 'user_id 형식 오류' });
  const buf = Buffer.from(b64, 'base64');
  // JPEG 시그니처 + 크기 상한(작게 줄인 사진만 받는다)
  if (buf.length < 1000 || buf.length > 300 * 1024 || buf[0] !== 0xFF || buf[1] !== 0xD8) {
    return res.status(400).json({ error: 'JPEG(300KB 이하)만 가능' });
  }
  const { data: target } = await sbAdmin.from('profiles').select('id,avatar_url').eq('id', userId).single();
  if (!target?.avatar_url) return res.status(404).json({ error: '프로필 사진 없음' });

  const path = `${userId}/avatar.jpg`;
  const { error: upErr } = await sbAdmin.storage.from('avatars').upload(path, buf, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: true,
  });
  if (upErr) return res.status(500).json({ error: '업로드 실패: ' + upErr.message });

  const { data: pub } = sbAdmin.storage.from('avatars').getPublicUrl(path);
  const url = pub.publicUrl + '?t=' + Date.now();
  const { error: dbErr } = await sbAdmin.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (dbErr) return res.status(500).json({ error: 'DB 갱신 실패: ' + dbErr.message });
  return res.status(200).json({ ok: true, url, bytes: buf.length });
}
