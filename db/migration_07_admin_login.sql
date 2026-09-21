-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 07: 관리자 개별 로그인 (1단계, 추가만 함 — 기존 접속 방식은 그대로 동작)
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 이 단계에서 하는 일
--   1) admin_users: 로그인 계정 중 "관리자로 허용된 계정" 명단 (여기 없는 계정은 로그인해도 데이터 접근 불가)
--   2) 모든 업무 테이블에 "로그인한 관리자만 읽기/쓰기" 정책 추가
--   3) 알바 출퇴근 앱 전용 함수(clock_*) — 알바 앱은 테이블을 직접 못 보고, 이름목록/PIN확인/출퇴근 처리만 가능
--      PIN은 서버에서만 확인하고(화면으로 내려보내지 않음), 10분에 5번 틀리면 잠깐 잠김
--   4) 변경 이력(data_history)에 "누가 바꿨는지(changed_by)" 추가
-- 공개 키(anon)로 들어오던 기존 접근을 막는 것은 migration_08 (2단계)에서 함.

-- ---------- 1) 관리자 명단 ----------
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'reader')),  -- reader: 조회만 (자동 백업용)
  created_at timestamptz default now()
);
alter table admin_users enable row level security;
revoke all on admin_users from anon;
revoke insert, update, delete, truncate on admin_users from authenticated;
grant select on admin_users to authenticated;
grant update (display_name) on admin_users to authenticated;   -- 본인 표시이름만 바꿀 수 있음 (권한 등급은 못 바꿈)
drop policy if exists "self read" on admin_users;
create policy "self read" on admin_users for select to authenticated using (user_id = auth.uid());
drop policy if exists "self rename" on admin_users;
create policy "self rename" on admin_users for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid() and role = 'admin');
$$;
create or replace function is_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid() and role in ('admin', 'reader'));
$$;
revoke execute on function is_admin() from public, anon;
revoke execute on function is_reader() from public, anon;
grant execute on function is_admin() to authenticated;
grant execute on function is_reader() to authenticated;

-- ---------- 2) 업무 테이블: 관리자 전체 / 백업계정 조회 ----------
do $$
declare t text;
begin
  foreach t in array array[
    'stores', 'sales_royalty', 'issues', 'weekly_reports', 'monthly_narrative', 'new_store_openings',
    'manager_tasks', 'franchise_inquiries', 'supply_margin', 'alert_settings', 'dropdown_options',
    'staff', 'attendance_logs', 'store_pnl', 'store_pnl_items', 'store_pnl_presets'
  ] loop
    execute format('drop policy if exists "admin all" on %I', t);
    execute format('create policy "admin all" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
    execute format('drop policy if exists "reader select" on %I', t);
    execute format('create policy "reader select" on %I for select to authenticated using (is_reader())', t);
  end loop;
end $$;

drop policy if exists "reader select" on data_history;
create policy "reader select" on data_history for select to authenticated using (is_reader());

-- ---------- 3) 변경 이력에 변경자 기록 ----------
alter table data_history add column if not exists changed_by text;

create or replace function log_data_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.jwt() ->> 'role', 'sql');
begin
  if tg_op = 'INSERT' then
    insert into data_history(table_name, row_id, action, new_row, changed_by)
    values (tg_table_name, new.id, tg_op, to_jsonb(new), who);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into data_history(table_name, row_id, action, old_row, new_row, changed_by)
    values (tg_table_name, new.id, tg_op, to_jsonb(old), to_jsonb(new), who);
    return new;
  else
    insert into data_history(table_name, row_id, action, old_row, changed_by)
    values (tg_table_name, old.id, tg_op, to_jsonb(old), who);
    return old;
  end if;
end $$;
revoke execute on function log_data_history() from public, anon, authenticated;

-- ---------- 4) 알바 출퇴근 앱 전용 함수 ----------
create table if not exists clock_pin_failures (
  id bigserial primary key,
  staff_id uuid,
  failed_at timestamptz not null default now()
);
create index if not exists idx_pin_fail on clock_pin_failures(staff_id, failed_at);
alter table clock_pin_failures enable row level security;
revoke all on clock_pin_failures from anon, authenticated;

-- 내부용: PIN 확인 ('OK' / 'PIN' 틀림 / 'LOCKED' 10분 내 5회 이상 틀림)
create or replace function clock_verify(p_staff_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from clock_pin_failures
      where staff_id = p_staff_id and failed_at > now() - interval '10 minutes') >= 5 then
    return 'LOCKED';
  end if;
  if exists (select 1 from staff where id = p_staff_id and pin = p_pin and active) then
    return 'OK';
  end if;
  insert into clock_pin_failures(staff_id) values (p_staff_id);
  delete from clock_pin_failures where failed_at < now() - interval '1 day';
  return 'PIN';
end $$;
revoke execute on function clock_verify(uuid, text) from public, anon, authenticated;

create or replace function clock_store_name(p_store_code text) returns text
language sql stable security definer set search_path = public as $$
  select name from stores where store_code = p_store_code;
$$;

create or replace function clock_staff_list(p_store_code text)
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name from staff s join stores st on st.id = s.store_id
  where st.store_code = p_store_code and s.active
  order by s.name;
$$;

-- PIN 확인 + 현재 출근 중인 기록(있으면) 반환
create or replace function clock_check(p_staff_id uuid, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare v text; l_id uuid; l_in timestamptz; l_out timestamptz;
begin
  v := clock_verify(p_staff_id, p_pin);
  if v <> 'OK' then return json_build_object('status', v); end if;
  select id, clock_in, clock_out into l_id, l_in, l_out from attendance_logs
    where staff_id = p_staff_id and deleted_at is null
    order by clock_in desc limit 1;
  if l_id is not null and l_out is null then
    return json_build_object('status', 'OK', 'open', true, 'clock_in', l_in);
  end if;
  return json_build_object('status', 'OK', 'open', false);
end $$;

-- 출근('in') / 퇴근('out') 처리 — 시각은 서버 시각 사용 (휴대폰 시계 조작 방지)
create or replace function clock_punch(p_staff_id uuid, p_pin text, p_mode text) returns json
language plpgsql security definer set search_path = public as $$
declare v text; l_id uuid; l_out timestamptz; t timestamptz := now();
begin
  v := clock_verify(p_staff_id, p_pin);
  if v <> 'OK' then return json_build_object('status', v); end if;
  select id, clock_out into l_id, l_out from attendance_logs
    where staff_id = p_staff_id and deleted_at is null
    order by clock_in desc limit 1;
  if p_mode = 'out' then
    if l_id is null or l_out is not null then return json_build_object('status', 'STATE'); end if;
    update attendance_logs set clock_out = t, updated_at = t where id = l_id;
  elsif p_mode = 'in' then
    if l_id is not null and l_out is null then return json_build_object('status', 'STATE'); end if;
    insert into attendance_logs(staff_id, work_date, clock_in)
    values (p_staff_id, (t at time zone 'Asia/Seoul')::date, t);
  else
    return json_build_object('status', 'MODE');
  end if;
  return json_build_object('status', 'OK', 'mode', p_mode, 'at', t);
end $$;

grant execute on function clock_store_name(text) to anon, authenticated;
grant execute on function clock_staff_list(text) to anon, authenticated;
grant execute on function clock_check(uuid, text) to anon, authenticated;
grant execute on function clock_punch(uuid, text, text) to anon, authenticated;
