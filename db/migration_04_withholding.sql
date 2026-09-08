-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 04: 알바 급여 3.3% 원천징수 공제
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.

alter table staff add column if not exists withhold_3_3 boolean not null default true;

comment on column staff.withhold_3_3 is '사업소득(3.3%) 원천징수 적용 여부 - 알바관리 정산표에서 실지급액 계산에 사용';
