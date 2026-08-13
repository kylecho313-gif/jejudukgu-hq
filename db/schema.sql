-- 제주덕구 본사 통합관리 웹앱 - Supabase 스키마
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run

create extension if not exists "pgcrypto";

-- 01_매장현황
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  store_code text,
  name text not null,
  type text,               -- 직영 / 가맹 / 해외
  status text,              -- 오픈 / 진행중 / 준비중 / 휴점 / 종료
  owner_name text,
  phone text,
  address text,
  open_date date,
  contract_start date,
  contract_end date,
  royalty_rate numeric default 3.0,
  hq_manager text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 02_가맹점매출_로열티관리 (매장 x 월 단위 입력)
create table if not exists sales_royalty (
  id uuid primary key default gen_random_uuid(),
  month text not null,      -- 'YYYY-MM'
  store_id uuid references stores(id) on delete cascade,
  sales numeric default 0,
  payment_amount numeric default 0,
  payment_status text default '미입금',  -- 입금완료 / 일부입금 / 미입금 / 해당없음
  payment_due_date date,
  confirmer text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(month, store_id)
);

-- 03_매장별이슈관리
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  reg_date date default current_date,
  type text,
  store_id uuid references stores(id) on delete set null,
  issue_text text,
  priority text,             -- 상 / 중 / 하
  assignee text,
  status text default '미처리', -- 미처리 / 진행중 / 완료 / 보류
  due_date date,
  complete_date date,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 04_주간보고
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_period text,          -- 예: 2026-08 3주차 / 08.11~08.17
  key_tasks text,
  store_issues text,
  franchise_requests text,
  completed text,
  next_week_plan text,
  ceo_check text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 05_월간요약 (수치는 app에서 자동집계, 서술형 항목만 저장)
create table if not exists monthly_narrative (
  id uuid primary key default gen_random_uuid(),
  month text unique not null, -- 'YYYY-MM'
  report_text text,
  next_month_focus text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 06_신규오픈관리
create table if not exists new_store_openings (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  type text,                 -- 직영 / 가맹 / 해외
  opening_stage text,        -- 계약/설계/공사/교육/가오픈/오픈완료
  expected_open_date date,
  construction_status text,
  training_status text,
  equipment_status text,
  menu_test_status text,
  assignee text,
  next_action text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 07_본부장업무관리
create table if not exists manager_tasks (
  id uuid primary key default gen_random_uuid(),
  reg_date date default current_date,
  task_type text,
  task_content text,
  target_store text,
  priority text,
  assignee text,
  deadline date,
  status text default '미처리',
  ceo_check text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 08_알림설정 (항상 단일 행, id=1)
create table if not exists alert_settings (
  id int primary key default 1,
  contract_expiry_days int default 60,
  issue_due_days int default 3,
  new_store_due_days int default 14,
  manager_task_due_days int default 3,
  unpaid_threshold numeric default 0,
  updated_by text,
  updated_at timestamptz default now(),
  constraint alert_settings_singleton check (id = 1)
);
insert into alert_settings (id) values (1) on conflict (id) do nothing;

-- 설정값 (드롭다운 옵션, 필요시 화면에서 추가/삭제)
create table if not exists dropdown_options (
  id uuid primary key default gen_random_uuid(),
  category text not null,   -- 매장구분/운영상태/입금상태/처리상태/우선순위/보고구분/오픈단계
  value text not null,
  sort_order int default 0
);
insert into dropdown_options (category, value, sort_order) values
 ('매장구분','직영',1), ('매장구분','가맹',2), ('매장구분','해외',3),
 ('운영상태','오픈',1), ('운영상태','진행중',2), ('운영상태','준비중',3), ('운영상태','휴점',4), ('운영상태','종료',5),
 ('입금상태','입금완료',1), ('입금상태','일부입금',2), ('입금상태','미입금',3), ('입금상태','해당없음',4),
 ('처리상태','미처리',1), ('처리상태','진행중',2), ('처리상태','완료',3), ('처리상태','보류',4),
 ('우선순위','상',1), ('우선순위','중',2), ('우선순위','하',3),
 ('오픈단계','계약',1), ('오픈단계','설계',2), ('오픈단계','공사',3), ('오픈단계','교육',4), ('오픈단계','가오픈',5), ('오픈단계','오픈완료',6)
on conflict do nothing;

-- 초기 매장 데이터 (기존 엑셀 01_매장현황 기준)
insert into stores (store_code, name, type, status, royalty_rate) values
 ('S001','하남 본점','직영','오픈',3.0),
 ('S002','상일동점','가맹','오픈',3.0),
 ('S003','위례점','가맹','오픈',3.0),
 ('S004','경기광주점','가맹','오픈',3.0),
 ('S005','삼성점','가맹','오픈',3.0),
 ('S006','구월점','가맹','오픈',3.0),
 ('S007','새솔점','가맹','오픈',3.0),
 ('S008','광주하남점','가맹','오픈',3.0),
 ('S009','제주점','가맹','오픈',3.0),
 ('S010','자카르타점','해외','진행중',3.0)
on conflict do nothing;

-- RLS: 이 앱은 개별 로그인 없이 "공유 비밀번호"를 앱 화면에서만 확인하는 방식이므로,
-- anon key로 전체 CRUD를 허용한다. (DB 자체를 잠그는 진짜 보안이 아니라
-- URL/anon key가 외부에 유출되지 않는다는 전제의 내부용 설정임 - 필요시 나중에 강화 가능)
alter table stores enable row level security;
alter table sales_royalty enable row level security;
alter table issues enable row level security;
alter table weekly_reports enable row level security;
alter table monthly_narrative enable row level security;
alter table new_store_openings enable row level security;
alter table manager_tasks enable row level security;
alter table alert_settings enable row level security;
alter table dropdown_options enable row level security;

create policy "anon full access" on stores for all using (true) with check (true);
create policy "anon full access" on sales_royalty for all using (true) with check (true);
create policy "anon full access" on issues for all using (true) with check (true);
create policy "anon full access" on weekly_reports for all using (true) with check (true);
create policy "anon full access" on monthly_narrative for all using (true) with check (true);
create policy "anon full access" on new_store_openings for all using (true) with check (true);
create policy "anon full access" on manager_tasks for all using (true) with check (true);
create policy "anon full access" on alert_settings for all using (true) with check (true);
create policy "anon full access" on dropdown_options for all using (true) with check (true);
