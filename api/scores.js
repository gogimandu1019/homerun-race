// Vercel 서버리스 함수: GET /api/scores (랭킹 조회), POST /api/scores (점수 저장)
// Supabase 비밀 키(service_role 또는 sb_secret_…)는 서버에만 두고, 브라우저에는 절대 노출하지 않습니다.

const MAX_SCORE = 320000;   // 15구 · 최대 비거리 · 2배 이벤트 5개를 감안한 이론상 상한
const TOTAL_PITCHES = 15;
const EVENT_PITCHES = 5;     // 점수 2배 이벤트 공 수
const MIN_HR_DIST = 95;      // 홈런 최소 비거리(파울라인 펜스 100m)에 여유를 둔 값
const SAVE_GAP_SEC = 15;     // 같은 이름·모드로 연달아 저장할 수 있는 최소 간격(초)
const MODES = ['easy', 'hard'];
const pickMode = m => (MODES.includes(m) ? m : null);
const TEAMS = ['kt', 'samsung', 'kia', 'lg', 'doosan', 'ssg', 'lotte', 'nc', 'hanwha', 'kiwoom'];
const SORTS = { score: 'score.desc,created_at.asc', longest: 'longest.desc,created_at.asc' };

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

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return name.length ? name : null;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// 점수·홈런 수·최장 비거리가 실제 게임에서 나올 수 있는 조합인지 확인
// 게임 점수 = 홈런마다 round(비거리×100), 이벤트 공(최대 5개)은 2배. 비거리는 0.1m 단위.
function consistent(score, homers, longest) {
  if (homers === 0) return score === 0 && longest === 0;
  if (longest < MIN_HR_DIST) return false;
  const top = Math.round(longest * 100);                       // 가장 긴 홈런 1개의 점수
  const max = top * (homers + Math.min(homers, EVENT_PITCHES)); // 모든 홈런이 최장거리 + 이벤트 최대
  const min = top + (homers - 1) * MIN_HR_DIST * 100;           // 최장 홈런 1개 + 나머지는 최소 거리
  return score >= min && score <= max;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const mode = pickMode(req.query.mode) || 'easy';
      if (req.query.view === 'teams') {
        const { data } = await supabase(`team_standings?select=team,games,total,homers,longest,average&mode=eq.${mode}&order=total.desc`);
        return res.status(200).json({ teams: data || [] });
      }
      const sort = SORTS[req.query.sort] ? req.query.sort : 'score';
      const extra = sort === 'longest' ? '&longest=gt.0' : '';
      const { data } = await supabase(`scores?select=id,name,score,homers,longest,mode,team,created_at&mode=eq.${mode}${extra}&order=${SORTS[sort]}&limit=${limit}`);
      return res.status(200).json({ scores: data || [] });
    }

    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
      const name = cleanName(body.name);
      const score = Number(body.score), homers = Number(body.homers), longest = Number(body.longest);
      const mode = pickMode(body.mode);
      const team = TEAMS.includes(body.team) ? body.team : null;
      if (!name) return res.status(400).json({ error: '이름을 1~12자로 입력해 주세요.' });
      if (!mode) return res.status(400).json({ error: '난이도 값이 올바르지 않습니다.' });
      if (!isInt(score, 0, MAX_SCORE)) return res.status(400).json({ error: '점수가 올바르지 않습니다.' });
      if (!isInt(homers, 0, TOTAL_PITCHES)) return res.status(400).json({ error: '홈런 수가 올바르지 않습니다.' });
      if (!(longest >= 0 && longest <= 200)) return res.status(400).json({ error: '비거리가 올바르지 않습니다.' });
      if (!consistent(score, homers, longest)) return res.status(400).json({ error: '점수와 홈런 기록이 맞지 않습니다.' });

      // 같은 이름으로 너무 빨리 연달아 저장하는 것 막기 (한 경기는 이보다 오래 걸림)
      const since = new Date(Date.now() - SAVE_GAP_SEC * 1000).toISOString();
      const recent = await supabase(`scores?select=id&mode=eq.${mode}&name=eq.${encodeURIComponent(name)}&created_at=gt.${encodeURIComponent(since)}&limit=1`);
      if (Array.isArray(recent.data) && recent.data.length) return res.status(429).json({ error: '방금 저장했어요. 잠시 후 다시 시도해 주세요.' });

      const { data } = await supabase('scores', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, score, homers, mode, team, longest: Math.round(longest * 10) / 10 }),
      });
      const row = Array.isArray(data) ? data[0] : data;

      // 이번 점수의 순위 = 랭킹표와 같은 기준(점수 높은 순, 동점이면 먼저 저장한 순)으로 내 앞에 있는 기록 수 + 1
      // (실패해도 저장은 성공으로 처리)
      let rank = null;
      try {
        const ahead = row && row.created_at
          ? `or=${encodeURIComponent(`(score.gt.${score},and(score.eq.${score},created_at.lt."${row.created_at}"))`)}`
          : `score=gt.${score}`;
        const { headers } = await supabase(`scores?select=id&mode=eq.${mode}&${ahead}&limit=1`, { headers: { Prefer: 'count=exact' } });
        const total = parseInt((headers.get('content-range') || '*/0').split('/')[1], 10) || 0;
        rank = total + 1;
      } catch (e) { console.error('rank 계산 실패', e); }

      return res.status(201).json({ saved: row, rank });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    const message = err instanceof ConfigError ? err.message : '랭킹 서버 오류가 발생했습니다.';
    return res.status(500).json({ error: message });
  }
};
