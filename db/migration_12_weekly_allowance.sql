-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 12: 알바별 주휴수당 지급 여부
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 외국인 알바(안·민담·미영)는 주휴수당 없이, 3.3% 공제도 없이 "시급 × 근무시간"만 지급 (2026-09-21 사용자 확인)

alter table staff add column if not exists weekly_allowance boolean not null default true;

update staff set weekly_allowance = false, withhold_3_3 = false
where name in ('안', '민담', '미영')
  and store_id = (select id from stores where store_code = 'S001');

select name, hourly_wage, weekly_allowance as 주휴수당, withhold_3_3 as 공제33 from staff order by name;
