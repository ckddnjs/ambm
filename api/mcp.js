import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

/* ══════════ 경기내역 원격 MCP (2026-11-06) ══════════
   커넥터 주소: https://ambm.vercel.app/api/mcp?key=<비밀키>
   공개 범위 = 관리자 '경기내역 엑셀 다운로드'와 동일 (승인된 경기 · 날짜·선수·점수·비고만).
   키 원문은 저장하지 않고 SHA-256 지문 → 받는 사람 이름만 둔다. 한 사람을 끊으려면 그 줄만 지운다.
   Streamable HTTP의 '요청마다 JSON 응답' 방식만 지원(세션·SSE 없음). */
const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';
const MCP_KEYS = {
  'bf416066227b0e4d40cb8dbb6a5dd3eaf659962ae0be43a760ac7ab39408c33f': '이영배',
  '64c4f9d58d487bf3d70cfd4e70a2bd7eb1f4109f273b7e5dc0800027e3fbd9d4': '강창원',
};
const MAX_ROWS = 3000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const TOOLS = [
  { name: 'list_matches',
    description: '새벽민턴 승인된 경기 내역을 날짜순으로 돌려준다(연번·경기일자·선수1·선수2·점수·선수3·선수4·승패·비고). 기간을 생략하면 처음부터 오늘까지 전체 기록. season=true면 이번 시즌만. player를 주면 그 선수가 뛴 경기만.',
    inputSchema: { type: 'object', properties: {
      from: { type: 'string', description: '시작일 YYYY-MM-DD. 생략하면 처음부터' },
      to: { type: 'string', description: '종료일 YYYY-MM-DD. 생략하면 오늘까지' },
      season: { type: 'boolean', description: 'true면 이번 시즌(시즌 시작일~)만. from을 주면 무시' },
      player: { type: 'string', description: '선수 이름(정확히 일치). 생략하면 모든 경기' } },
      additionalProperties: false } },
];

async function listMatches(sb, args) {
  let from = String(args.from || '').trim(), to = String(args.to || '').trim();
  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) return '날짜는 YYYY-MM-DD 형식으로 주세요.';
  if (!from && args.season) {
    const { data } = await sb.from('app_settings').select('value').eq('key', 'season_start').maybeSingle();
    from = data?.value || '';
  }
  if (from && to && from > to) return '시작일이 종료일보다 늦어요.';
  const player = String(args.player || '').trim().slice(0, 30);
  const rows = [];
  for (let off = 0; rows.length < MAX_ROWS; off += 1000) {
    let q = sb.from('matches').select('match_date,a1_name,a2_name,score_a,score_b,b1_name,b2_name,note')
      .eq('status', 'approved')
      .order('match_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(off, off + 999);
    if (from) q = q.gte('match_date', from);
    if (to) q = q.lte('match_date', to);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const list = player ? rows.filter(m => [m.a1_name, m.a2_name, m.b1_name, m.b2_name].includes(player)) : rows;
  const range = `${from || '처음'} ~ ${to || '오늘'}`;
  if (!list.length) return `${range} 기간에 ${player ? player + ' 선수의 ' : ''}승인된 경기가 없어요.`;
  const res = (a, b) => a > b ? '승' : a < b ? '패' : '무';
  const clean = s => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
  const lines = ['연번\t경기일자\t선수1\t선수2\t승패1\t점수1\t점수2\t승패2\t선수3\t선수4\t비고'];
  list.forEach((m, i) => lines.push([i + 1, m.match_date, clean(m.a1_name), clean(m.a2_name), res(m.score_a, m.score_b),
    m.score_a, m.score_b, res(m.score_b, m.score_a), clean(m.b1_name), clean(m.b2_name), clean(m.note)].join('\t')));
  const cut = rows.length >= MAX_ROWS ? `\n※ 최대 ${MAX_ROWS}경기까지만 불러왔어요. 기간을 좁혀 주세요.` : '';
  return `새벽민턴 경기내역 ${range}${player ? ' · ' + player : ''} · ${list.length}경기 (승인된 경기만, 승패는 선수1·2 / 선수3·4 팀 기준)\n` + lines.join('\n') + cut;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = String(req.query?.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const who = key && MCP_KEYS[createHash('sha256').update(key).digest('hex')];
  if (!who) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const one = async msg => {
    if (!msg || typeof msg !== 'object') return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } };
    const { id, method, params = {} } = msg;
    if (id === undefined || id === null) return null;   // 알림(notifications/*)은 응답 없음
    const ok = result => ({ jsonrpc: '2.0', id, result });
    if (method === 'initialize') return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'ambm-matches', version: '1.0.0' },
      instructions: '새벽민턴 배드민턴 클럽의 승인된 경기 내역 조회(읽기 전용).' });
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: TOOLS });
    if (method === 'tools/call') {
      if (params.name !== 'list_matches') return ok({ content: [{ type: 'text', text: '알 수 없는 도구: ' + params.name }], isError: true });
      try {
        console.log(`[mcp] ${who} list_matches ${JSON.stringify(params.arguments || {})}`);
        return ok({ content: [{ type: 'text', text: await listMatches(sb, params.arguments || {}) }] });
      } catch (e) { return ok({ content: [{ type: 'text', text: '조회 실패: ' + (e.message || e) }], isError: true }); }
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } };
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean);
    return out.length ? res.status(200).json(out) : res.status(202).end();
  }
  const r = await one(body);
  return r ? res.status(200).json(r) : res.status(202).end();
}
