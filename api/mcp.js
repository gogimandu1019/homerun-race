// 홈런레이스 MCP 서버 (읽기 전용): https://homerunracegame.com/api/mcp
// Claude 같은 AI 앱에 이 주소를 "커스텀 커넥터"로 추가하면, 대화 중에 랭킹·팀 순위·플레이어 기록·게임 규칙을 조회할 수 있습니다.
// 기록 저장이나 수정 기능은 없습니다. MCP Streamable HTTP를 상태 없이(JSON 응답만) 구현했습니다.

const { ConfigError, supabase } = require('../lib/supabase');

const { SITE, TOOLS, HANDLERS, INSTRUCTIONS, UserError } = require('../lib/game-tools');
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

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
