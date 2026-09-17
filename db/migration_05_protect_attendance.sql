-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 05: 출퇴근 기록 보호
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 기존에는 알바(staff)를 삭제하면 그 알바의 출퇴근 기록(attendance_logs)도 같이 지워졌음(on delete cascade).
-- 2026-09-17 실수 삭제로 기록이 전부 사라진 사고 이후, 기록이 있는 알바는 DB 차원에서도 삭제되지 않도록 변경.
-- 그만둔 알바는 삭제 대신 "재직중" 체크를 해제하면 됨.

alter table attendance_logs drop constraint if exists attendance_logs_staff_id_fkey;
alter table attendance_logs
  add constraint attendance_logs_staff_id_fkey
  foreign key (staff_id) references staff(id) on delete restrict;
