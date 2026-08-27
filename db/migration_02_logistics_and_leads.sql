-- 제주덕구 본사 통합관리 웹앱 - 추가 마이그레이션 (2026-08-27)
-- 1) 물류/식자재 마진관리, 2) 가맹문의 후속조치 알림 기준
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- (재실행해도 안전하도록 if not exists / add column if not exists 사용)

-- 물류/식자재 마진관리 (매장 x 월 단위, sales_royalty와 동일한 구조)
create table if not exists supply_margin (
  id uuid primary key default gen_random_uuid(),
  month text not null,       -- 'YYYY-MM'
  store_id uuid references stores(id) on delete cascade,
  supply_amount numeric default 0,   -- 매장에 청구한 물류/식자재 공급액
  cost_amount numeric default 0,     -- 본사 매입원가
  confirmer text,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(month, store_id)
);
alter table supply_margin enable row level security;
drop policy if exists "anon full access" on supply_margin;
create policy "anon full access" on supply_margin for all using (true) with check (true);

-- 가맹문의 후속조치(next_action_date) 임박 알림 기준일수
alter table alert_settings add column if not exists lead_followup_due_days int default 3;
