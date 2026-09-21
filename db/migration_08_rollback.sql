-- 긴급 되돌리기: migration_08(공개 키 차단)을 취소하고 예전처럼 공개 키로 읽기/쓰기 가능하게 함.
-- 관리자 로그인에 문제가 생겨 당장 업무가 막혔을 때만 임시로 사용하세요. (보안이 다시 약해짐)
-- 출퇴근 기록 실제 삭제 금지(migration_06)는 그대로 유지됩니다.

do $$
declare t text;
begin
  foreach t in array array[
    'stores', 'sales_royalty', 'issues', 'weekly_reports', 'monthly_narrative', 'new_store_openings',
    'manager_tasks', 'franchise_inquiries', 'supply_margin', 'alert_settings', 'dropdown_options', 'staff',
    'store_pnl', 'store_pnl_items', 'store_pnl_presets'
  ] loop
    execute format('grant select, insert, update, delete on %I to anon', t);
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('create policy "anon full access" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

grant select, insert, update on attendance_logs to anon;
drop policy if exists "anon select" on attendance_logs;
drop policy if exists "anon insert" on attendance_logs;
drop policy if exists "anon update" on attendance_logs;
create policy "anon select" on attendance_logs for select using (true);
create policy "anon insert" on attendance_logs for insert with check (true);
create policy "anon update" on attendance_logs for update using (true) with check (true);

grant select on data_history to anon;
drop policy if exists "anon read" on data_history;
create policy "anon read" on data_history for select using (true);
