-- 홈런레이스 랭킹 테이블 + 팀 순위 뷰
-- 새로 설치할 때 Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요. (이 파일 하나면 끝)
-- 이미 운영 중인 DB라면 이 파일 대신 002 → 003 → 004 → 005 를 순서대로 실행합니다.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 12),
  score       integer     not null check (score between 0 and 50000000),
  homers      smallint    not null check (homers between 0 and 1000),
  longest     real        not null default 0 check (longest between 0 and 200),
  mode        text        not null default 'easy' check (mode in ('easy', 'hard', 'extreme', 'endless')),
  team        text        check (team in ('kt','samsung','kia','lg','doosan','ssg','lotte','nc','hanwha','kiwoom')),
  created_at  timestamptz not null default now()
);

create index if not exists scores_mode_score_idx on public.scores (mode, score desc, created_at asc);
create index if not exists scores_mode_longest_idx on public.scores (mode, longest desc, created_at asc);
create index if not exists scores_mode_homers_idx on public.scores (mode, homers desc, longest desc, created_at asc);

-- RLS를 켜고 정책은 만들지 않습니다.
-- → 브라우저(anon 키)로는 읽기·쓰기 불가, Vercel API(service_role 키)만 접근 가능.
alter table public.scores enable row level security;

-- 팀별 순위표: 모드·팀별 기록 수, 총점, 총 홈런, 최장 비거리, 평균 점수
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
