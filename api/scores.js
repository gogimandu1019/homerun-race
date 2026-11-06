// Vercel 서버리스 함수: GET /api/scores (랭킹 조회), POST /api/scores (점수 저장)
// Supabase 비밀 키(service_role 또는 sb_secret_…)는 서버에만 두고, 브라우저에는 절대 노출하지 않습니다.

// 모드별 상한: 일반 모드는 15구 + 2배 이벤트 5개, 무한 모드는 아웃 3개까지 무제한(이벤트 없음)
const LIMITS = {
  easy:    { maxScore: 320000,   maxHomers: 15,   events: 5 },
  hard:    { maxScore: 320000,   maxHomers: 15,   events: 5 },
  extreme: { maxScore: 320000,   maxHomers: 15,   events: 5 },
  endless: { maxScore: 50000000, maxHomers: 1000, events: 0 },
};
const MIN_HR_DIST = 95;      // 홈런 최소 비거리(파울라인 펜스 100m)에 여유를 둔 값
const SAVE_GAP_SEC = 5;      // 같은 이름·모드로 연달아 저장할 수 있는 최소 간격(초). 무한 모드는 몇 초 만에 끝날 수 있음
const MODES = Object.keys(LIMITS);
const pickMode = m => (MODES.includes(m) ? m : null);
const TEAMS = ['kt', 'samsung', 'kia', 'lg', 'doosan', 'ssg', 'lotte', 'nc', 'hanwha', 'kiwoom'];
const SORTS = { score: 'score.desc,created_at.asc', longest: 'longest.desc,created_at.asc', homers: 'homers.desc,longest.desc,created_at.asc' };

const { ConfigError, supabase } = require('../lib/supabase');

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return name.length ? name : null;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// 점수·홈런 수·최장 비거리가 실제 게임에서 나올 수 있는 조합인지 확인
// 게임 점수 = 홈런마다 round(비거리×100), 이벤트 공(일반 모드 최대 5개)은 2배. 비거리는 0.1m 단위.
function consistent(score, homers, longest, events) {
  if (homers === 0) return score === 0 && longest === 0;
  if (longest < MIN_HR_DIST) return false;
  const top = Math.round(longest * 100);                       // 가장 긴 홈런 1개의 점수
  const max = top * (homers + Math.min(homers, events));        // 모든 홈런이 최장거리 + 이벤트 최대
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
        const order = mode === 'endless' ? 'homers.desc,longest.desc' : 'total.desc';
        const { data } = await supabase(`team_standings?select=team,games,total,homers,longest,average&mode=eq.${mode}&order=${order}`);
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
      const lim = LIMITS[mode];
      if (!isInt(score, 0, lim.maxScore)) return res.status(400).json({ error: '점수가 올바르지 않습니다.' });
      if (!isInt(homers, 0, lim.maxHomers)) return res.status(400).json({ error: '홈런 수가 올바르지 않습니다.' });
      if (!(longest >= 0 && longest <= 200)) return res.status(400).json({ error: '비거리가 올바르지 않습니다.' });
      if (!consistent(score, homers, longest, lim.events)) return res.status(400).json({ error: '점수와 홈런 기록이 맞지 않습니다.' });

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
        // 무한 모드는 홈런 수 → 최장 비거리 → 먼저 저장한 순
        let ahead;
        if (mode === 'endless' && row && row.created_at) {
          const H = row.homers, L = row.longest, T = `"${row.created_at}"`;
          ahead = `or=${encodeURIComponent(`(homers.gt.${H},and(homers.eq.${H},longest.gt.${L}),and(homers.eq.${H},longest.eq.${L},created_at.lt.${T}))`)}`;
        } else if (mode === 'endless') {
          ahead = `homers=gt.${homers}`;
        } else {
          ahead = row && row.created_at
            ? `or=${encodeURIComponent(`(score.gt.${score},and(score.eq.${score},created_at.lt."${row.created_at}"))`)}`
            : `score=gt.${score}`;
        }
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
