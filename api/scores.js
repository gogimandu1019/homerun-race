// Vercel 서버리스 함수: GET /api/scores (랭킹 조회), POST /api/scores (점수 저장)
// Supabase service_role 키는 서버에만 두고, 브라우저에는 절대 노출하지 않습니다.

const MAX_SCORE = 320000;   // 15구 · 최대 비거리 · 2배 이벤트 5개를 감안한 이론상 상한
const TOTAL_PITCHES = 15;

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return { url: url.replace(/\/$/, ''), key };
}

async function supabase(path, init = {}) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return name.length ? name : null;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const rows = await supabase(`scores?select=id,name,score,homers,longest,created_at&order=score.desc,created_at.asc&limit=${limit}`);
      return res.status(200).json({ scores: rows });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = cleanName(body.name);
      const score = Number(body.score), homers = Number(body.homers), longest = Number(body.longest);
      if (!name) return res.status(400).json({ error: '이름을 1~12자로 입력해 주세요.' });
      if (!isInt(score, 0, MAX_SCORE)) return res.status(400).json({ error: '점수가 올바르지 않습니다.' });
      if (!isInt(homers, 0, TOTAL_PITCHES)) return res.status(400).json({ error: '홈런 수가 올바르지 않습니다.' });
      if (!(longest >= 0 && longest <= 200)) return res.status(400).json({ error: '비거리가 올바르지 않습니다.' });
      if (homers === 0 && score > 0) return res.status(400).json({ error: '점수가 올바르지 않습니다.' });

      const [row] = await supabase('scores', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, score, homers, longest: Math.round(longest * 10) / 10 }),
      });
      // 이번 점수의 순위 (나보다 높은 점수 수 + 1)
      const rank = await countAbove(score);
      return res.status(201).json({ saved: row, rank });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '랭킹 서버 오류가 발생했습니다.' });
  }
};

async function countAbove(score) {
  const { url, key } = env();
  const r = await fetch(`${url}/rest/v1/scores?select=id&score=gt.${score}`, {
    method: 'HEAD',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  const range = r.headers.get('content-range') || '*/0';   // 예: "0-4/5" 또는 "*/0"
  return (parseInt(range.split('/')[1], 10) || 0) + 1;
}
