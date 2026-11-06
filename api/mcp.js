// 홈런레이스 MCP 서버 (읽기 전용): https://homerunracegame.com/api/mcp
// Claude 같은 AI 앱에 이 주소를 "커스텀 커넥터"로 추가하면, 대화 중에 랭킹·팀 순위·플레이어 기록·게임 규칙을 조회할 수 있습니다.
// 기록 저장이나 수정 기능은 없습니다. MCP Streamable HTTP를 상태 없이(JSON 응답만) 구현했습니다.

const { ConfigError, supabase } = require('../lib/supabase');

const SITE = 'https://homerunracegame.com';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MODES = { easy: '이지', hard: '하드', extreme: '익스트림', endless: '무한' };
const TEAMS = {
  kt: '수원 마법사', samsung: '대구 사자', kia: '광주 호랑이', lg: '서울 쌍둥이', doosan: '서울 곰돌이',
  ssg: '인천 강아지', lotte: '부산 갈매기', nc: '창원 공룡', hanwha: '대전 독수리', kiwoom: '서울 영웅',
};
const SORTS = {
  score: { order: 'score.desc,created_at.asc', label: '점수' },
  longest: { order: 'longest.desc,created_at.asc', label: '비거리', extra: '&longest=gt.0' },
  homers: { order: 'homers.desc,longest.desc,created_at.asc', label: '홈런 수' },
};
const COLS = 'name,score,homers,longest,mode,team,created_at';

const modeProp = { type: 'string', enum: Object.keys(MODES), description: '난이도: easy(이지), hard(하드), extreme(익스트림), endless(무한). 기본값 easy' };
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: 'get_leaderboard',
    title: '랭킹 조회',
    description: '홈런레이스 모드별 개인 랭킹을 조회합니다. 점수 순, 비거리 순, 홈런 수 순(무한 모드 기본) 중 고를 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: modeProp,
        sort: { type: 'string', enum: Object.keys(SORTS), description: 'score(점수), longest(최장 비거리), homers(홈런 수). 무한 모드 기본값은 homers, 나머지는 score' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: '가져올 순위 수 (1~20, 기본 10)' },
      },
      additionalProperties: false,
    },
    annotations: { title: '랭킹 조회', ...READ_ONLY },
  },
  {
    name: 'get_team_standings',
    title: '팀 순위 조회',
    description: '모드별 팀 순위를 조회합니다. 팀마다 저장된 기록 수, 총점, 총 홈런, 최장 비거리, 평균 점수를 돌려줍니다. 무한 모드는 홈런 합계 순입니다.',
    inputSchema: { type: 'object', properties: { mode: modeProp }, additionalProperties: false },
    annotations: { title: '팀 순위 조회', ...READ_ONLY },
  },
  {
    name: 'get_player_records',
    title: '플레이어 기록 조회',
    description: '닉네임(정확히 일치)으로 저장된 기록을 찾아 모드별 최고 기록을 보여줍니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 12, description: '찾을 닉네임 (정확히 일치)' },
        mode: { ...modeProp, description: '특정 모드만 볼 때 지정. 없으면 모든 모드' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { title: '플레이어 기록 조회', ...READ_ONLY },
  },
  {
    name: 'get_game_info',
    title: '게임 규칙 안내',
    description: '홈런레이스의 규칙, 점수 계산, 모드별 난이도, 팀 목록, 플레이 주소를 알려줍니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: '게임 규칙 안내', ...READ_ONLY },
  },
];

const INSTRUCTIONS = '홈런레이스(웹 야구 게임, ' + SITE + ')의 실제 랭킹과 기록을 조회하는 읽기 전용 서버입니다. '
  + '랭킹은 모드(easy/hard/extreme/endless)별로 따로 집계됩니다. 팀 이름은 게임용 창작이며 실제 구단과 관련이 없습니다.';

// ===== 도구 실행 =====
const pickMode = m => (MODES[m] ? m : 'easy');
const teamName = id => TEAMS[id] || '팀 없음';
const fmtDist = d => (d ? `${Number(d).toFixed(1)}m` : '-');
const fmtRow = (r, i) => `${i + 1}. ${r.name} (${teamName(r.team)}) · 홈런 ${r.homers} · 최장 ${fmtDist(r.longest)} · ${Number(r.score).toLocaleString('ko-KR')}점`;
const clean = r => ({ name: r.name, team: r.team, team_name: teamName(r.team), mode: r.mode, score: r.score, homers: r.homers, longest: Number(r.longest), saved_at: r.created_at });

async function getLeaderboard(args) {
  const mode = pickMode(args.mode);
  const sortKey = SORTS[args.sort] ? args.sort : (mode === 'endless' ? 'homers' : 'score');
  const limit = Math.min(20, Math.max(1, parseInt(args.limit, 10) || 10));
  const s = SORTS[sortKey];
  const { data } = await supabase(`scores?select=${COLS}&mode=eq.${mode}${s.extra || ''}&order=${s.order}&limit=${limit}`);
  const rows = data || [];
  const head = `🏆 홈런레이스 ${MODES[mode]} 모드 랭킹 (${s.label} 순, 상위 ${limit})`;
  const text = rows.length ? `${head}\n${rows.map(fmtRow).join('\n')}` : `${head}\n아직 기록이 없습니다.`;
  return { text, data: { mode, sort: sortKey, rankings: rows.map((r, i) => ({ rank: i + 1, ...clean(r) })) } };
}

async function getTeamStandings(args) {
  const mode = pickMode(args.mode);
  const order = mode === 'endless' ? 'homers.desc,longest.desc' : 'total.desc';
  const { data } = await supabase(`team_standings?select=team,games,total,homers,longest,average&mode=eq.${mode}&order=${order}`);
  const rows = data || [];
  const head = `⚾ 홈런레이스 ${MODES[mode]} 모드 팀 순위 (${mode === 'endless' ? '홈런 합계' : '총점'} 순)`;
  const text = rows.length
    ? `${head}\n${rows.map((t, i) => `${i + 1}. ${teamName(t.team)} · ${t.games}판 · 홈런 ${t.homers} · 총점 ${Number(t.total).toLocaleString('ko-KR')} · 평균 ${Number(t.average).toLocaleString('ko-KR')}`).join('\n')}`
    : `${head}\n아직 기록이 없습니다.`;
  return { text, data: { mode, teams: rows.map((t, i) => ({ rank: i + 1, team: t.team, team_name: teamName(t.team), games: t.games, total: Number(t.total), homers: t.homers, longest: Number(t.longest), average: t.average })) } };
}

async function getPlayerRecords(args) {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name || name.length > 24) throw new UserError('닉네임을 1~12자로 입력해 주세요.');
  const modes = MODES[args.mode] ? [args.mode] : Object.keys(MODES);
  const out = {};
  const lines = [`🔎 "${name}" 기록`];
  for (const mode of modes) {
    const order = mode === 'endless' ? SORTS.homers.order : SORTS.score.order;
    const { headers, data } = await supabase(
      `scores?select=${COLS}&mode=eq.${mode}&name=eq.${encodeURIComponent(name)}&order=${order}&limit=3`,
      { headers: { Prefer: 'count=exact' } });
    const games = parseInt((headers.get('content-range') || '*/0').split('/')[1], 10) || 0;
    if (!games) continue;
    const best = data || [];
    out[mode] = { games, best: best.map(clean) };
    lines.push(`\n[${MODES[mode]}] 저장 ${games}회`, ...best.map(fmtRow));
  }
  if (lines.length === 1) lines.push('저장된 기록이 없습니다. (닉네임은 정확히 일치해야 합니다)');
  return { text: lines.join('\n'), data: { name, records: out } };
}

function getGameInfo() {
  const text = `⚾ 홈런레이스 — 타이밍 맞춰 담장을 넘기는 웹 야구 게임
플레이: ${SITE} (설치·회원가입 없이 PC·모바일 브라우저에서 바로)

[기본 규칙 — 이지·하드·익스트림]
- 한 경기 15구, 그중 무작위 5구는 점수 2배 이벤트
- 공이 들어오는 순간 클릭/탭/스페이스바로 스윙
- 홈런이면 비거리(m) × 100점, 아니면 0점. PERFECT 판정은 무조건 홈런
- 일찍 치면 좌측, 늦게 치면 우측. 너무 빗나가면 파울
- 구장: 파울라인 100m, 가운데 122m 둥근 펜스(높이 3.6m)

[모드]
- 이지: 115~140km/h, PERFECT ±30ms / GOOD ±70ms
- 하드: 130~155km/h, PERFECT ±14ms / GOOD ±38ms
- 익스트림: 145~165km/h, PERFECT ±9ms / GOOD ±25ms
- 무한: 아웃 3개까지 계속(홈런이 아니면 아웃). 이지 수준에서 시작해 홈런 5개마다 빨라지고, 30개부터 익스트림 수준. 2배 이벤트 없음. 랭킹은 홈런 수 → 최장 비거리 순

[랭킹] 모드별로 점수·비거리·팀 순위 (무한 모드는 홈런 수 순)
[팀] ${Object.values(TEAMS).join(', ')} — 게임용 창작 이름이며 실제 구단과 관련 없음
[게임 방법 자세히] ${SITE}/guide.html`;
  return { text, data: { site: SITE, modes: MODES, teams: TEAMS } };
}

const HANDLERS = { get_leaderboard: getLeaderboard, get_team_standings: getTeamStandings, get_player_records: getPlayerRecords, get_game_info: getGameInfo };
class UserError extends Error {}

// ===== JSON-RPC / MCP =====
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;   // notifications/initialized 등: 응답 없음
  const { id, method, params = {} } = msg;

  switch (method) {
    case 'initialize': {
      const v = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return ok(id, {
        protocolVersion: v,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'homerun-race', title: '홈런레이스', version: '1.0.0', websiteUrl: SITE },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS });
    case 'tools/call': {
      const fn = HANDLERS[params.name];
      if (!fn) return fail(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const { text, data } = await fn(params.arguments || {});
        return ok(id, { content: [{ type: 'text', text }], structuredContent: data, isError: false });
      } catch (err) {
        console.error(err);
        const message = err instanceof UserError || err instanceof ConfigError ? err.message : '랭킹 서버에서 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
        return ok(id, { content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    // 상태 없는 서버라 SSE 스트림(GET)과 세션 종료(DELETE)는 지원하지 않음
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json(fail(null, -32000, 'Method not allowed. Send MCP JSON-RPC messages with POST.'));
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json(fail(null, -32700, 'Parse error')); } }
  if (body === undefined || body === null || (typeof body !== 'object')) return res.status(400).json(fail(null, -32700, 'Parse error'));

  if (Array.isArray(body)) {   // 예전 버전 클라이언트의 배치 요청
    const out = (await Promise.all(body.map(handleMessage))).filter(Boolean);
    return out.length ? res.status(200).json(out) : res.status(202).end();
  }
  const reply = await handleMessage(body);
  return reply ? res.status(200).json(reply) : res.status(202).end();
};
