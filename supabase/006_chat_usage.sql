-- AI 채팅 사용량 제한 (1인당 하루 N번 + 사이트 전체 하루 상한)
-- Supabase SQL Editor에서 한 번 실행하세요. (AI 채팅 코드를 push하기 전에 먼저!)
-- IP 주소는 저장하지 않고, 날짜·비밀값과 섞어 되돌릴 수 없게 만든 해시만 저장합니다. 이틀 지난 기록은 자동으로 지웁니다.

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
