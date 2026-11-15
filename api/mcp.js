import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/* 새벽민턴 원격 MCP. 조회는 승인 경기만 공개하고, 쓰기는 프로필 권한을 서버에서 다시 확인한다. */
const SUPABASE_URL = 'https://wkclmrbdsinvliaaqjol.supabase.co';
const MCP_KEYS = {
  'bf416066227b0e4d40cb8dbb6a5dd3eaf659962ae0be43a760ac7ab39408c33f': '이영배',
  '64c4f9d58d487bf3d70cfd4e70a2bd7eb1f4109f273b7e5dc0800027e3fbd9d4': '강창원',
};
const MAX_ROWS = 3000, MAX_GAMES = 200, TOKEN_TTL = 30 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GAME_SCHEMA = { type: 'object', required: ['sequence', 'round', 'court', 'a1', 'a2', 'score_a', 'score_b', 'b1', 'b2'], properties: {
  sequence: { type: 'integer', minimum: 1 }, round: { type: 'integer', minimum: 1 }, court: { type: 'integer', minimum: 1 },
  a1: { type: 'string', minLength: 1, maxLength: 30 }, a2: { type: 'string', minLength: 1, maxLength: 30 },
  score_a: { type: 'integer', minimum: 0, maximum: 30 }, score_b: { type: 'integer', minimum: 0, maximum: 30 },
  b1: { type: 'string', minLength: 1, maxLength: 30 }, b2: { type: 'string', minLength: 1, maxLength: 30 },
  note: { type: 'string', maxLength: 200 },
}, additionalProperties: false };

const TOOLS = [
  { name: 'list_matches', description: '새벽민턴 승인 경기 내역을 날짜순으로 조회한다. structured=true면 점수지 묶음·순서·라운드·코트도 포함한다.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: 'object', properties: {
      from: { type: 'string' }, to: { type: 'string' }, season: { type: 'boolean' }, player: { type: 'string' },
      batch_id: { type: 'string' }, structured: { type: 'boolean' },
    }, additionalProperties: false } },
  { name: 'get_player_candidates', description: '선수 이름을 프로필과 대조해 미등록 선수와 동명이인을 확인한다.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: 'object', required: ['names'], properties: {
      names: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 30 } },
    }, additionalProperties: false } },
  { name: 'validate_scorecard', description: '사진에서 구조화한 경기표를 등록 전에 내검한다. 선수·점수·순서·라운드·코트·출전 횟수·중복을 검사하고 오류가 없을 때 30분짜리 preview_token을 발급한다.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: 'object', required: ['match_date', 'games'], properties: {
      match_date: { type: 'string' }, games: { type: 'array', minItems: 1, maxItems: MAX_GAMES, items: GAME_SCHEMA },
      expected_match_count: { type: 'integer', minimum: 1, maximum: MAX_GAMES }, expected_player_count: { type: 'integer', minimum: 4, maximum: 400 },
      expected_games_per_player: { type: 'integer', minimum: 1, maximum: 30 }, allow_unlinked_players: { type: 'boolean' },
      player_overrides: { type: 'object', additionalProperties: { type: 'string' } },
    }, additionalProperties: false } },
  { name: 'commit_scorecard', description: 'validate_scorecard의 preview_token에 서명된 경기만 일괄 등록하고 재검증한다. 일반 회원은 pending, admin은 approved 등록이 가능하다.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, inputSchema: { type: 'object', required: ['preview_token', 'status'], properties: {
      preview_token: { type: 'string', minLength: 20 }, status: { type: 'string', enum: ['pending', 'approved'] },
    }, additionalProperties: false } },
];

const clean = (v, max = 30) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim().slice(0, max);
function readMcpAccessToken(token) {
  const [prefix, encoded, supplied, extra] = String(token || '').split('.');
  if (prefix !== 'ambm1' || !encoded || !supplied || extra) return null;
  try {
    const expected = createHmac('sha256', secret()).update(encoded).digest();
    const actual = Buffer.from(supplied, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload?.v !== 1 || payload?.typ !== 'ambm_mcp_access' || !UUID.test(payload?.sub || '') || !clean(payload?.name)) return null;
    return payload;
  } catch { return null; }
}
const validDate = v => {
  if (!YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const teamKey = (p1, p2, score) => `${[p1, p2].sort((a, b) => a.localeCompare(b, 'ko')).join('+')}=${score}`;
const matchKey = m => [teamKey(m.a1_name ?? m.a1, m.a2_name ?? m.a2, Number(m.score_a)), teamKey(m.b1_name ?? m.b1, m.b2_name ?? m.b2, Number(m.score_b))].sort().join('|');
const normalizeGames = games => games.map(g => ({
  sequence: Number(g.sequence), round: Number(g.round), court: Number(g.court), a1: clean(g.a1), a2: clean(g.a2),
  score_a: Number(g.score_a), score_b: Number(g.score_b), b1: clean(g.b1), b2: clean(g.b2), note: clean(g.note, 200) || null,
})).sort((a, b) => a.sequence - b.sequence);

async function getActor(sb, name) {
  const { data, error } = await sb.from('profiles').select('id,name,role,status').eq('name', name);
  if (error) throw error;
  if (data.length !== 1) throw new Error(`MCP 사용자 '${name}'의 프로필을 하나로 확인할 수 없습니다.`);
  if (data[0].status !== 'approved') throw new Error('승인된 새벽민턴 회원만 사용할 수 있습니다.');
  return data[0];
}

async function playerCandidates(sb, names) {
  const unique = [...new Set(names.map(n => clean(n)).filter(Boolean))].slice(0, 100);
  if (!unique.length) return [];
  const { data: profiles, error } = await sb.from('profiles').select('id,name,role,status,created_at').in('name', unique);
  if (error) throw error;
  const { data: matches, error: matchError } = profiles?.length
    ? await sb.from('matches').select('a1_id,a2_id,b1_id,b2_id') : { data: [], error: null };
  if (matchError) throw matchError;
  const count = id => (matches || []).reduce((n, m) => n + [m.a1_id, m.a2_id, m.b1_id, m.b2_id].filter(x => x === id).length, 0);
  return unique.map(name => ({ name, candidates: (profiles || []).filter(p => p.name === name).map(p => ({
    id: p.id, status: p.status, role: p.role, appearances: count(p.id), created_at: p.created_at,
  })).sort((a, b) => b.appearances - a.appearances) }));
}

async function validatePayload(sb, args) {
  const errors = [], warnings = [], matchDate = clean(args.match_date, 10);
  if (!validDate(matchDate)) errors.push('경기일은 실제 존재하는 YYYY-MM-DD 날짜여야 합니다.');
  if (!Array.isArray(args.games) || !args.games.length || args.games.length > MAX_GAMES) return { errors: [`경기는 1~${MAX_GAMES}개여야 합니다.`], warnings, matchDate, games: [], profileMap: {}, stats: [] };
  const games = normalizeGames(args.games), seqs = new Set(), roundCourts = new Set(), roundPlayers = new Map(), allNames = [];
  for (const g of games) {
    const label = `${g.round}라운드 ${g.court}코트`, rc = `${g.round}:${g.court}`;
    if (!Number.isInteger(g.sequence) || g.sequence < 1) errors.push(`${label}: 순서가 올바르지 않습니다.`);
    if (seqs.has(g.sequence)) errors.push(`전체 순서 ${g.sequence}가 중복됐습니다.`); else seqs.add(g.sequence);
    if (!Number.isInteger(g.round) || g.round < 1 || !Number.isInteger(g.court) || g.court < 1) errors.push(`${label}: 라운드와 코트가 올바르지 않습니다.`);
    if (roundCourts.has(rc)) errors.push(`${label}가 중복됐습니다.`); else roundCourts.add(rc);
    const players = [g.a1, g.a2, g.b1, g.b2]; allNames.push(...players);
    if (players.some(n => !n)) errors.push(`${label}: 선수 이름이 비어 있습니다.`);
    if (new Set(players).size !== 4) errors.push(`${label}: 동일 선수가 두 번 들어갔습니다.`);
    if (![g.score_a, g.score_b].every(n => Number.isInteger(n) && n >= 0 && n <= 30)) errors.push(`${label}: 점수는 0~30 정수여야 합니다.`);
    if (g.score_a === g.score_b) errors.push(`${label}: 무승부는 등록할 수 없습니다.`);
    if (Math.max(g.score_a, g.score_b) < 21) warnings.push(`${label}: 승리 점수가 21점보다 작습니다.`);
    const used = roundPlayers.get(g.round) || new Set();
    for (const name of players) { if (used.has(name)) errors.push(`${g.round}라운드에 ${name} 선수가 중복 출전했습니다.`); used.add(name); }
    roundPlayers.set(g.round, used);
  }
  const sortedSeq = [...seqs].sort((a, b) => a - b);
  if (sortedSeq.some((n, i) => n !== i + 1)) errors.push('전체 경기 순서는 1부터 빠짐없이 이어져야 합니다.');
  if (args.expected_match_count && games.length !== Number(args.expected_match_count)) errors.push(`예정 경기 ${args.expected_match_count}개와 추출 경기 ${games.length}개가 다릅니다.`);

  const counts = new Map(), statsMap = new Map();
  for (const g of games) {
    const diff = g.score_a - g.score_b;
    for (const [name, d] of [[g.a1, diff], [g.a2, diff], [g.b1, -diff], [g.b2, -diff]]) {
      counts.set(name, (counts.get(name) || 0) + 1);
      const s = statsMap.get(name) || { name, games: 0, wins: 0, losses: 0, differential: 0 };
      s.games++; s.wins += d > 0 ? 1 : 0; s.losses += d < 0 ? 1 : 0; s.differential += d; statsMap.set(name, s);
    }
  }
  if (args.expected_player_count && counts.size !== Number(args.expected_player_count)) errors.push(`예정 선수 ${args.expected_player_count}명과 추출 선수 ${counts.size}명이 다릅니다.`);
  if (args.expected_games_per_player) for (const [name, count] of counts) if (count !== Number(args.expected_games_per_player)) errors.push(`${name}: 예정 ${args.expected_games_per_player}경기와 실제 ${count}경기가 다릅니다.`);
  const stats = [...statsMap.values()].sort((a, b) => b.wins - a.wins || b.differential - a.differential || a.name.localeCompare(b.name, 'ko'));
  if (stats.reduce((sum, s) => sum + s.differential, 0) !== 0) errors.push('전체 선수 득실 합계가 0이 아닙니다.');
  if (stats.reduce((sum, s) => sum + s.wins, 0) !== games.length * 2 || stats.reduce((sum, s) => sum + s.losses, 0) !== games.length * 2) errors.push('전체 개인 승·패 합계가 경기 수와 맞지 않습니다.');

  const candidates = await playerCandidates(sb, allNames), overrides = args.player_overrides && typeof args.player_overrides === 'object' ? args.player_overrides : {}, profileMap = {};
  for (const row of candidates) {
    const override = clean(overrides[row.name], 36);
    if (override) {
      if (!UUID.test(override) || !row.candidates.some(c => c.id === override)) errors.push(`${row.name}: 지정 프로필이 후보가 아닙니다.`); else profileMap[row.name] = override;
    } else if (row.candidates.length === 1) profileMap[row.name] = row.candidates[0].id;
    else if (!row.candidates.length) {
      const msg = `${row.name}: 프로필이 없어 이름으로만 등록됩니다.`;
      if (args.allow_unlinked_players === true) warnings.push(msg); else errors.push(`${msg} 허용하려면 allow_unlinked_players=true로 다시 내검하세요.`);
    } else errors.push(`${row.name}: 동명이인 프로필이 ${row.candidates.length}개입니다. get_player_candidates에서 골라 player_overrides에 넣으세요.`);
  }
  if (validDate(matchDate)) {
    const { data, error } = await sb.from('matches').select('a1_name,a2_name,score_a,score_b,b1_name,b2_name').eq('match_date', matchDate);
    if (error) throw error;
    const existing = new Set((data || []).map(matchKey));
    for (const g of games) if (existing.has(matchKey(g))) errors.push(`${g.round}라운드 ${g.court}코트 경기가 같은 날짜에 이미 있습니다.`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], matchDate, games, profileMap, stats };
}

const secret = () => process.env.MCP_SIGNING_SECRET || process.env.SUPABASE_SERVICE_KEY || (() => { throw new Error('서명 비밀값이 없습니다.'); })();
function signPreview(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret()).update(encoded).digest('base64url')}`;
}
function readPreview(token, keyHash) {
  const [encoded, supplied, extra] = String(token || '').split('.');
  if (!encoded || !supplied || extra) throw new Error('preview_token 형식이 올바르지 않습니다.');
  const expected = createHmac('sha256', secret()).update(encoded).digest(), actual = Buffer.from(supplied, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('preview_token 서명이 올바르지 않습니다.');
  let payload; try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw new Error('preview_token 내용을 읽을 수 없습니다.'); }
  if (payload.key_hash !== keyHash) throw new Error('다른 MCP 사용자에게 발급된 preview_token입니다.');
  if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) throw new Error('preview_token이 만료됐습니다. 다시 내검하세요.');
  return payload;
}

async function listMatches(sb, args) {
  let from = clean(args.from, 10), to = clean(args.to, 10);
  if ((from && !validDate(from)) || (to && !validDate(to))) return '날짜는 실제 존재하는 YYYY-MM-DD 형식으로 주세요.';
  if (!from && args.season) { const { data } = await sb.from('app_settings').select('value').eq('key', 'season_start').maybeSingle(); from = data?.value || ''; }
  if (from && to && from > to) return '시작일이 종료일보다 늦어요.';
  const player = clean(args.player), batchId = clean(args.batch_id, 36);
  if (batchId && !UUID.test(batchId)) return 'batch_id는 UUID 형식이어야 합니다.';
  const rows = [];
  for (let off = 0; rows.length < MAX_ROWS; off += 1000) {
    let q = sb.from('matches').select('match_date,a1_name,a2_name,score_a,score_b,b1_name,b2_name,note,import_batch_id,sequence_no,round_no,court_no')
      .eq('status', 'approved').order('match_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true }).range(off, off + 999);
    if (from) q = q.gte('match_date', from); if (to) q = q.lte('match_date', to); if (batchId) q = q.eq('import_batch_id', batchId);
    const { data, error } = await q; if (error) throw error; rows.push(...data); if (data.length < 1000) break;
  }
  const list = player ? rows.filter(m => [m.a1_name, m.a2_name, m.b1_name, m.b2_name].includes(player)) : rows;
  const range = `${from || '처음'} ~ ${to || '오늘'}`; if (!list.length) return `${range} 기간에 승인된 경기가 없어요.`;
  const result = (a, b) => a > b ? '승' : a < b ? '패' : '무', structured = args.structured === true;
  const lines = [structured ? '연번\t경기일자\t묶음ID\t순서\t라운드\t코트\t선수1\t선수2\t승패1\t점수1\t점수2\t승패2\t선수3\t선수4\t비고' : '연번\t경기일자\t선수1\t선수2\t승패1\t점수1\t점수2\t승패2\t선수3\t선수4\t비고'];
  list.forEach((m, i) => {
    const base = [clean(m.a1_name), clean(m.a2_name), result(m.score_a, m.score_b), m.score_a, m.score_b, result(m.score_b, m.score_a), clean(m.b1_name), clean(m.b2_name), clean(m.note, 200)];
    lines.push((structured ? [i + 1, m.match_date, m.import_batch_id || '', m.sequence_no || '', m.round_no || '', m.court_no || '', ...base] : [i + 1, m.match_date, ...base]).join('\t'));
  });
  return `새벽민턴 경기내역 ${range}${player ? ' · ' + player : ''} · ${list.length}경기 (승인된 경기만)\n${lines.join('\n')}${rows.length >= MAX_ROWS ? `\n※ 최대 ${MAX_ROWS}경기까지만 불러왔어요.` : ''}`;
}

function validationText(r, token = '') {
  const lines = [`내검 결과: 오류 ${r.errors.length}건 · 경고 ${r.warnings.length}건 · ${r.games.length}경기 · ${r.stats.length}명`];
  if (r.errors.length) lines.push('\n[오류]\n- ' + r.errors.join('\n- ')); if (r.warnings.length) lines.push('\n[경고]\n- ' + r.warnings.join('\n- '));
  lines.push('\n[개인 집계]\n선수\t경기\t승\t패\t총득실'); r.stats.forEach(s => lines.push(`${s.name}\t${s.games}\t${s.wins}\t${s.losses}\t${s.differential >= 0 ? '+' : ''}${s.differential}`));
  lines.push(token ? `\n등록 가능: 사용자에게 확인받은 뒤 commit_scorecard를 호출하세요.\npreview_token=${token}` : '\n등록 불가: 오류를 수정하고 다시 내검하세요.');
  return lines.join('\n');
}

async function commitScorecard(sb, actorName, keyHash, args) {
  const payload = readPreview(args.preview_token, keyHash), status = clean(args.status, 10), actor = await getActor(sb, actorName);
  if (!['pending', 'approved'].includes(status)) throw new Error('status는 pending 또는 approved여야 합니다.');
  if (status === 'approved' && actor.role !== 'admin') throw new Error('관리자만 승인 완료로 등록할 수 있습니다. pending으로 제출하세요.');
  const check = await validatePayload(sb, payload.input); if (check.errors.length) throw new Error(`등록 직전 내검 실패:\n- ${check.errors.join('\n- ')}`);
  const batchId = randomUUID(), baseTime = Date.now();
  const rows = check.games.map((g, i) => { const created = new Date(baseTime + i * 1000).toISOString(); return {
    match_type: 'doubles', match_date: check.matchDate, a1_id: check.profileMap[g.a1] || null, a1_name: g.a1, a2_id: check.profileMap[g.a2] || null, a2_name: g.a2,
    b1_id: check.profileMap[g.b1] || null, b1_name: g.b1, b2_id: check.profileMap[g.b2] || null, b2_name: g.b2, score_a: g.score_a, score_b: g.score_b,
    status, submitter_id: actor.id, submitter_name: actor.name, note: g.note, admin_note: null, approved_at: status === 'approved' ? created : null, approved_by: status === 'approved' ? actor.id : null,
    import_batch_id: batchId, sequence_no: g.sequence, round_no: g.round, court_no: g.court, created_at: created, updated_at: created,
  }; });
  const { data, error } = await sb.from('matches').insert(rows).select('match_date,a1_name,a2_name,score_a,score_b,b1_name,b2_name,status,import_batch_id,sequence_no,round_no,court_no,note');
  if (error) throw error; const inserted = (data || []).sort((a, b) => a.sequence_no - b.sequence_no);
  if (inserted.length !== rows.length) throw new Error(`재검증 실패: 요청 ${rows.length}경기, 저장 ${inserted.length}경기`);
  for (let i = 0; i < inserted.length; i++) { const a = inserted[i], b = check.games[i];
    if (a.match_date !== check.matchDate || a.sequence_no !== b.sequence || a.round_no !== b.round || a.court_no !== b.court || a.a1_name !== b.a1 || a.a2_name !== b.a2 || a.b1_name !== b.b1 || a.b2_name !== b.b2 || a.score_a !== b.score_a || a.score_b !== b.score_b || (a.note || null) !== (b.note || null) || a.status !== status) throw new Error(`재검증 실패: ${b.sequence}번 경기 불일치`);
  }
  return `새벽민턴 등록 완료\n묶음ID: ${batchId}\n경기일: ${check.matchDate}\n상태: ${status}\n등록자: ${actor.name}\n경기: ${inserted.length}개\n재검증: 모두 일치`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const key = String(req.query?.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')), keyHash = key ? createHash('sha256').update(key).digest('hex') : '';
  let actorName = keyHash && MCP_KEYS[keyHash];
  if (!actorName) {
    const access = readMcpAccessToken(key);
    if (access) {
      const { data: actor } = await sb.from('profiles').select('id,name,status').eq('id', access.sub).maybeSingle();
      if (actor?.status === 'approved' && actor.name === access.name) actorName = actor.name;
    }
  }
  if (!actorName) return res.status(401).json({ error: 'unauthorized' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const one = async msg => {
    if (!msg || typeof msg !== 'object') return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } };
    const { id, method, params = {} } = msg; if (id === undefined || id === null) return null; const ok = result => ({ jsonrpc: '2.0', id, result });
    if (method === 'initialize') return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ambm-matches', version: '1.1.0' }, instructions: '새벽민턴 경기 조회와 점수지 내검·등록. 일반 회원은 승인 대기, 관리자는 승인 완료 등록까지 가능하다.' });
    if (method === 'ping') return ok({}); if (method === 'tools/list') return ok({ tools: TOOLS });
    if (method === 'tools/call') { const args = params.arguments || {}; try {
      console.log(`[mcp] ${actorName} ${params.name} ${JSON.stringify(args).slice(0, 2000)}`); let text;
      if (params.name === 'list_matches') text = await listMatches(sb, args);
      else if (params.name === 'get_player_candidates') { const rows = await playerCandidates(sb, Array.isArray(args.names) ? args.names : []); text = rows.map(r => `${r.name}\t${r.candidates.length ? r.candidates.map(c => `${c.id} (${c.status}/${c.role}, 기존 ${c.appearances}경기)`).join(' | ') : '프로필 없음'}`).join('\n'); }
      else if (params.name === 'validate_scorecard') { await getActor(sb, actorName); const result = await validatePayload(sb, args); const token = result.errors.length ? '' : signPreview({ v: 1, exp: Date.now() + TOKEN_TTL, key_hash: keyHash, input: { match_date: result.matchDate, games: result.games, expected_match_count: args.expected_match_count || null, expected_player_count: args.expected_player_count || null, expected_games_per_player: args.expected_games_per_player || null, allow_unlinked_players: args.allow_unlinked_players === true, player_overrides: args.player_overrides || {} } }); text = validationText(result, token); }
      else if (params.name === 'commit_scorecard') text = await commitScorecard(sb, actorName, keyHash, args);
      else return ok({ content: [{ type: 'text', text: '알 수 없는 도구: ' + params.name }], isError: true });
      return ok({ content: [{ type: 'text', text }] });
    } catch (e) { return ok({ content: [{ type: 'text', text: `처리 실패: ${e.message || e}` }], isError: true }); } }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } };
  };
  if (Array.isArray(body)) { const out = (await Promise.all(body.map(one))).filter(Boolean); return out.length ? res.status(200).json(out) : res.status(202).end(); }
  const response = await one(body); return response ? res.status(200).json(response) : res.status(202).end();
}
