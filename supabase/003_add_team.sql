-- 랭킹에 선택한 팀(유니폼)을 함께 보여주기 위한 컬럼 + 비거리 랭킹용 인덱스
-- Supabase SQL Editor에서 한 번 실행하세요. 기존 기록은 팀 없음(null)으로 남습니다.

alter table public.scores
  add column if not exists team text
  check (team in ('kt','samsung','kia','lg','doosan','ssg','lotte','nc','hanwha','kiwoom'));

create index if not exists scores_mode_longest_idx on public.scores (mode, longest desc, created_at asc);
