-- 익스트림 모드 + 무한 모드 추가
-- Supabase SQL Editor에서 한 번 실행하세요. (코드를 push하기 전에 먼저!)
-- 기존 기록은 그대로 남습니다.

-- 1) mode / score / homers 에 걸린 기존 검사 규칙을 찾아서 지운다 (이름이 달라도 찾아냄)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.scores'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\m(mode|score|homers)\M'
  loop
    execute format('alter table public.scores drop constraint %I', c.conname);
  end loop;
end $$;

-- 2) 새 규칙: 모드 4개, 무한 모드를 위해 홈런 수·점수 상한을 넉넉하게
alter table public.scores
  add constraint scores_mode_check   check (mode in ('easy', 'hard', 'extreme', 'endless')),
  add constraint scores_score_check  check (score between 0 and 50000000),
  add constraint scores_homers_check check (homers between 0 and 1000);

-- 3) 무한 모드 랭킹(홈런 수 → 비거리 순)용 인덱스
create index if not exists scores_mode_homers_idx on public.scores (mode, homers desc, longest desc, created_at asc);
