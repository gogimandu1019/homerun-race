// Supabase 연결 공용 코드 (api/scores.js, api/mcp.js 에서 함께 사용)
// 비밀 키는 서버 환경변수에만 있고 브라우저로 나가지 않습니다.

// 화면에 보여줄 수 있는 오류 (비밀 값은 담지 않음)
class ConfigError extends Error {}

function env() {
  const rawUrl = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!rawUrl) throw new ConfigError('서버 설정 오류: SUPABASE_URL 환경변수가 없습니다. (Vercel에 추가한 뒤 Redeploy 필요)');
  if (!key) throw new ConfigError('서버 설정 오류: SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. (Vercel에 추가한 뒤 Redeploy 필요)');
  if (key.startsWith('sb_publishable_')) throw new ConfigError('서버 설정 오류: publishable 키가 들어가 있습니다. secret 키(sb_secret_…) 또는 service_role 키를 넣어 주세요.');
  // "https://xxx.supabase.co/rest/v1/" 처럼 넣은 경우도 허용
  const url = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (!/^https?:\/\//.test(url)) throw new ConfigError('서버 설정 오류: SUPABASE_URL은 https://로 시작하는 Project URL이어야 합니다.');
  return { url, key };
}

// 예전 키(JWT, eyJ…)는 Authorization 헤더에도 넣고,
// 새 형식 키(sb_secret_…)는 JWT가 아니므로 apikey 헤더에만 넣습니다.
function authHeaders(key) {
  const h = { apikey: key };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

function explain(status, text) {
  let code = '';
  try { code = JSON.parse(text).code || ''; } catch (e) {}
  if (status === 401 || status === 403) return '서버 설정 오류: Supabase 키가 올바르지 않습니다. secret(service_role) 키인지 확인해 주세요.';
  if ((code === 'PGRST205' || code === '42P01') && /team_standings/.test(text)) return '서버 설정 오류: 팀 순위 뷰가 없습니다. Supabase SQL Editor에서 supabase/004_team_standings.sql을 실행해 주세요.';
  if (code === 'PGRST205' || code === '42P01' || status === 404) return '서버 설정 오류: scores 테이블이 없습니다. Supabase SQL Editor에서 schema.sql을 실행해 주세요.';
  if (code === '42703' || code === 'PGRST204') {
    if (/team/.test(text)) return '서버 설정 오류: scores 테이블에 team 컬럼이 없습니다. Supabase SQL Editor에서 supabase/003_add_team.sql을 실행해 주세요.';
    return '서버 설정 오류: scores 테이블에 mode 컬럼이 없습니다. Supabase SQL Editor에서 supabase/002_add_mode.sql을 실행해 주세요.';
  }
  return null;
}

async function supabase(path, init = {}) {
  const { url, key } = env();
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...authHeaders(key), 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  } catch (e) {
    throw new ConfigError('서버 설정 오류: Supabase에 연결할 수 없습니다. SUPABASE_URL을 확인해 주세요.');
  }
  const text = await res.text();
  if (!res.ok) {
    console.error(`Supabase ${res.status}: ${text}`);
    const msg = explain(res.status, text);
    throw msg ? new ConfigError(msg) : new Error(`Supabase ${res.status}`);
  }
  return { data: text ? JSON.parse(text) : null, headers: res.headers };
}

module.exports = { ConfigError, supabase };
