-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 03: 알바 출퇴근/급여 정산
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete set null,
  name text not null,
  pin text not null default '0000',   -- 출퇴근 앱에서 본인 확인용 4자리 PIN (강한 보안 아님)
  hourly_wage numeric not null default 0,
  active boolean default true,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  work_date date not null default current_date,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists idx_attendance_staff on attendance_logs(staff_id);
create index if not exists idx_attendance_workdate on attendance_logs(work_date);

alter table staff enable row level security;
alter table attendance_logs enable row level security;

drop policy if exists "anon full access" on staff;
create policy "anon full access" on staff for all using (true) with check (true);
drop policy if exists "anon full access" on attendance_logs;
create policy "anon full access" on attendance_logs for all using (true) with check (true);

-- 알바 초기 등록은 없음: 본사 통합관리 웹앱 > 알바관리 탭에서 이름/PIN/시급을 직접 등록합니다.
