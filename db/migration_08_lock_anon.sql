-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 08: 공개 키(anon) 접근 차단 (관리자 로그인 2단계)
-- ⚠ migration_07 실행 + 관리자 계정 로그인 확인 후에만 실행하세요.
--   실행하면 로그인하지 않은 접근은 데이터를 읽거나 쓸 수 없습니다.
--   알바 출퇴근 앱은 clock_* 함수로만 동작합니다.
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 되돌리기(긴급 시): migration_08_rollback.sql 실행

do $$
declare t text;
begin
  foreach t in array array[
    'stores', 'sales_royalty', 'issues', 'weekly_reports', 'monthly_narrative', 'new_store_openings',
    'manager_tasks', 'franchise_inquiries', 'supply_margin', 'alert_settings', 'dropdown_options',
    'staff', 'attendance_logs', 'data_history', 'store_pnl', 'store_pnl_items', 'store_pnl_presets'
  ] loop
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('revoke select, insert, update, delete, truncate on %I from anon', t);
  end loop;
end $$;

drop policy if exists "anon select" on attendance_logs;
drop policy if exists "anon insert" on attendance_logs;
drop policy if exists "anon update" on attendance_logs;
drop policy if exists "anon read" on data_history;
drop policy if exists "anon read" on store_pnl_presets;
drop policy if exists "anon write presets" on store_pnl_presets;
