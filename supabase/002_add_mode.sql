-- 난이도(이지/하드)별 랭킹을 위한 컬럼 추가
-- 이미 scores 테이블을 만든 경우, Supabase SQL Editor에서 이 파일을 한 번 실행하세요.
-- 기존 기록은 모두 '이지' 모드로 들어갑니다.

alter table public.scores
  add column if not exists mode text not null default 'easy'
  check (mode in ('easy', 'hard'));

drop index if exists scores_score_idx;
create index if not exists scores_mode_score_idx on public.scores (mode, score desc, created_at asc);
