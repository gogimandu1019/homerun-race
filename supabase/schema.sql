-- 홈런레이스 랭킹 테이블 + 팀 순위 뷰
-- 새로 설치할 때 Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요. (이 파일 하나면 끝)
-- 이미 운영 중인 DB라면 이 파일 대신 002 → 003 → 004 → 005 → 006 을 순서대로 실행합니다.

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

-- ===== AI 채팅 사용량 제한 (006_chat_usage.sql 과 같은 내용) =====
create table if not exists public.chat_usage (
  key    text    not null,   -- 'ip:<해시>' 또는 'global'
  day    date    not null,
  count  integer not null default 0,
  primary key (key, day)
);

-- RLS 켜고 정책 없음 → 브라우저에서는 접근 불가, 서버(비밀 키)만 사용
alter table public.chat_usage enable row level security;

-- 오늘 사용 횟수를 1 올리고 올린 뒤의 횟수를 돌려줌 (동시에 여러 요청이 와도 정확하게 셈)
create or replace function public.chat_take(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.chat_usage where day < current_date - 1;
  insert into public.chat_usage (key, day, count) values (p_key, current_date, 1)
    on conflict (key, day) do update set count = public.chat_usage.count + 1
    returning count into n;
  return n;
end $$;

-- 브라우저용 키(anon, authenticated)로는 실행 못 하게 막음
revoke all on function public.chat_take(text) from public, anon, authenticated;
grant execute on function public.chat_take(text) to service_role;
