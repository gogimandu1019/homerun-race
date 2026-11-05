-- 홈런레이스 랭킹 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 12),
  score       integer     not null check (score between 0 and 320000),
  homers      smallint    not null check (homers between 0 and 15),
  longest     real        not null default 0 check (longest between 0 and 200),
  created_at  timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc, created_at asc);

-- RLS를 켜고 정책은 만들지 않습니다.
-- → 브라우저(anon 키)로는 읽기·쓰기 불가, Vercel API(service_role 키)만 접근 가능.
alter table public.scores enable row level security;
