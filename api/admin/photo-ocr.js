/* /api/admin/photo-ocr — 경기결과판 사진 판독 (관리자 전용, Gemini 3.5 Flash 무료티어)
   POST {b64, mime} → {ok, matches:[{r,c,a:[..],b:[..],sa,sb,unsure:[..]}], guests:[과거 게스트명]}
   회원 명단 + 과거 게스트 명부를 프롬프트에 넣어 손글씨 이름을 실명으로 보정한다. */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '');

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const GEMINI_KEY = process.env.GOOGLE_API || process.env.google_api || process.env.GOOGLE_API_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY missing' });
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GOOGLE_API missing (Vercel 환경변수 등록 후 재배포 필요)' });

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: { user }, error: authErr } = await sbAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
  const { data: profile } = await sbAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const b64 = req.body?.b64;
  if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'b64 필요' });
  const mime = String(req.body?.mime || 'image/jpeg');

  try {
    // 회원 명단 + 과거 게스트 명부 (matches에서 id 없이 이름만 남은 선수들)
    const [{ data: members }, { data: mRows }] = await Promise.all([
      sbAdmin.from('profiles').select('name').not('name', 'in', '("관리자","테스트")'),
      sbAdmin.from('matches').select('a1_id,a1_name,a2_id,a2_name,b1_id,b1_name,b2_id,b2_name').limit(2000),
    ]);
    const g = new Set();
    (mRows || []).forEach(r => {
      if (!r.a1_id && r.a1_name) g.add(r.a1_name);
      if (!r.a2_id && r.a2_name) g.add(r.a2_name);
      if (!r.b1_id && r.b1_name) g.add(r.b1_name);
      if (!r.b2_id && r.b2_name) g.add(r.b2_name);
    });
    const guests = [...g].filter(n => n && n.length >= 2);
    const roster = (members || []).map(m => m.name).filter(Boolean).sort().join(',');
    const guestList = guests.sort().join(',');

    const prompt = `배드민턴 동호회 경기결과판 사진이다. 라운드(Round)별로 코트 1~3의 경기가 기록되어 있다.
각 경기 행: 왼쪽 두 이름=A팀, 오른쪽 두 이름=B팀, 가운데 숫자 두 개(왼쪽=A팀 점수, 오른쪽=B팀 점수). 빨간 동그라미가 쳐진 점수가 승리팀 점수다.
손글씨 이름은 성(姓)을 뺀 2글자가 많다. 아래 명단에서 가장 가까운 이름으로 보정하라. 회원 명단을 우선하되, 없으면 게스트 명부에서 찾아라. 둘 다 없으면 읽힌 그대로 쓰고 unsure에 넣어라.
[회원] ${roster}
[게스트] ${guestList}
빈 경기(이름 없음)는 제외. 반드시 아래 형식의 압축 JSON만 출력(설명·마크다운 금지):
{"matches":[{"r":1,"c":1,"a":["이름","이름"],"b":["이름","이름"],"sa":21,"sb":15,"unsure":["판독이나 보정이 불확실한 이름들"]}]}`;

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [
        { inline_data: { mime_type: mime.split(';')[0], data: b64 } },
        { text: prompt },
      ] }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'Gemini 오류: ' + (j.error?.message || r.status).toString().slice(0, 200) });

    let text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    text = text.replace(/```json|```/gi, '').trim();
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return res.status(500).json({ error: '판독 결과 파싱 실패: ' + text.slice(0, 120) });
    let data;
    try { data = JSON.parse(text.slice(s, e + 1)); }
    catch (pe) { return res.status(500).json({ error: 'JSON 파싱 실패: ' + pe.message }); }
    const matches = (Array.isArray(data.matches) ? data.matches : []).filter(m =>
      Array.isArray(m.a) && Array.isArray(m.b) && m.a.length && m.b.length &&
      Number.isFinite(m.sa) && Number.isFinite(m.sb) && m.sa !== m.sb);

    return res.status(200).json({ ok: true, matches, guests, count: matches.length });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
