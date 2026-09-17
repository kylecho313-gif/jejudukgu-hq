-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 06: 알바 데이터 변경이력 + 출퇴근 기록 삭제 금지
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 1) data_history: staff / attendance_logs 에 추가·수정·삭제가 일어날 때마다 변경 전/후 값을
--    DB가 자동으로 남김(트리거). 웹/anon 키로는 이 이력을 수정하거나 지울 수 없음.
--    → 백업 사이에 생긴 기록도, 잘못 덮어쓴 값도 언제든 되살릴 수 있음.
-- 2) attendance_logs 는 실제 삭제(DELETE) 자체를 금지. 화면의 "삭제"는 deleted_at 을 채우는
--    숨김 처리로 바뀌고, 숨긴 기록은 관리자 화면에서 다시 복원할 수 있음.

-- ---------- 1) 변경 이력 ----------
create table if not exists data_history (
  id bigserial primary key,
  table_name text not null,
  row_id uuid,
  action text not null,          -- INSERT / UPDATE / DELETE
  old_row jsonb,
  new_row jsonb,
  changed_at timestamptz not null default now()
);
create index if not exists idx_history_row on data_history(table_name, row_id);
create index if not exists idx_history_time on data_history(changed_at);

alter table data_history enable row level security;
drop policy if exists "anon read" on data_history;
create policy "anon read" on data_history for select using (true);
revoke insert, update, delete, truncate on data_history from anon, authenticated;

create or replace function log_data_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into data_history(table_name, row_id, action, new_row)
    values (tg_table_name, new.id, tg_op, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into data_history(table_name, row_id, action, old_row, new_row)
    values (tg_table_name, new.id, tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into data_history(table_name, row_id, action, old_row)
    values (tg_table_name, old.id, tg_op, to_jsonb(old));
    return old;
  end if;
end $$;
revoke execute on function log_data_history() from public, anon, authenticated;

drop trigger if exists trg_history_staff on staff;
create trigger trg_history_staff after insert or update or delete on staff
  for each row execute function log_data_history();
drop trigger if exists trg_history_attendance on attendance_logs;
create trigger trg_history_attendance after insert or update or delete on attendance_logs
  for each row execute function log_data_history();

-- 지금 있는 데이터를 이력의 출발점으로 한 번 기록 (재실행 시 중복 방지)
insert into data_history(table_name, row_id, action, new_row)
select 'staff', s.id, 'SNAPSHOT', to_jsonb(s) from staff s
where not exists (select 1 from data_history h where h.table_name = 'staff' and h.action = 'SNAPSHOT');
insert into data_history(table_name, row_id, action, new_row)
select 'attendance_logs', l.id, 'SNAPSHOT', to_jsonb(l) from attendance_logs l
where not exists (select 1 from data_history h where h.table_name = 'attendance_logs' and h.action = 'SNAPSHOT');

-- ---------- 2) 출퇴근 기록 삭제 금지 (숨김 처리로 대체) ----------
alter table attendance_logs add column if not exists deleted_at timestamptz;
alter table attendance_logs add column if not exists deleted_by text;

drop policy if exists "anon full access" on attendance_logs;
drop policy if exists "anon select" on attendance_logs;
drop policy if exists "anon insert" on attendance_logs;
drop policy if exists "anon update" on attendance_logs;
create policy "anon select" on attendance_logs for select using (true);
create policy "anon insert" on attendance_logs for insert with check (true);
create policy "anon update" on attendance_logs for update using (true) with check (true);
revoke delete, truncate on attendance_logs from anon, authenticated;

-- staff 는 기록 없는 알바만 삭제 가능(migration_05의 on delete restrict)하게 유지
revoke truncate on staff from anon, authenticated;
