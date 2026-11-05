-- 팀별 순위표
-- Supabase SQL Editor에서 한 번 실행하세요.

-- 1) 운영자 결정: 팀 정보가 없는 기존 기록은 모두 한화로 합산
update public.scores set team = 'hanwha' where team is null;

-- 2) 모드·팀별 집계 뷰 (기록 수, 총점, 총 홈런, 최장 비거리, 평균 점수)
create or replace view public.team_standings
with (security_invoker = true) as
select
  mode,
  team,
  count(*)::int               as games,
  sum(score)::bigint          as total,
  sum(homers)::int            as homers,
  max(longest)                as longest,
  round(avg(score))::int      as average
from public.scores
where team is not null
group by mode, team;
