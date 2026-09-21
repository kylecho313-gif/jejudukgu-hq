-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 09: 가맹점 월별 손익 입력
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 가맹점이 매장별로 월 매출과 지출(거래처별)을 입력하면 본사가 매장을 비교·분석할 수 있게 함.
-- 2025년 본점 결산표(제주덕구 2025년 결산표.xlsx)의 항목 구조를 그대로 옮긴 것:
--   지출 = 고정비 / 식자재 / 공과금·운영비 / 세금·4대보험 / 인건비  (연매출 탭의 분석 항목과 동일)
--   매출 = 현금 / 카드 / 배달

create table if not exists store_pnl (
  id uuid primary key default gen_random_uuid(),
  month text not null,                       -- 'YYYY-MM'
  store_id uuid references stores(id) on delete cascade,
  sales_cash numeric default 0,              -- 현금매출
  sales_card numeric default 0,              -- 카드매출
  sales_delivery numeric default 0,          -- 배달매출
  status text not null default '작성중',      -- 작성중 / 제출 / 확인완료
  submitted_at timestamptz,
  confirmed_by text,
  confirmed_at timestamptz,
  notes text,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(month, store_id)
);

create table if not exists store_pnl_items (
  id uuid primary key default gen_random_uuid(),
  pnl_id uuid not null references store_pnl(id) on delete cascade,
  category text not null,                    -- 고정비 / 식자재 / 공과금운영비 / 세금보험 / 인건비
  account text,                              -- 계정 (예: 가게 유지비, 렌탈)
  item text,                                 -- 항목 (예: 임대료, 정수기 렌탈)
  vendor text,                               -- 거래처 및 비고
  supply_amount numeric default 0,           -- 공급가
  tax_amount numeric default 0,              -- 세액
  amount numeric default 0,                  -- 합계금액 (분석은 이 값 기준)
  sort_order int default 0,
  updated_by text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists idx_pnl_items on store_pnl_items(pnl_id);

-- 입력 편의를 위한 자주 쓰는 항목 목록 (가맹점 화면에서 고르기 — 매장마다 다르게 적는 것을 막아 비교 가능하게)
create table if not exists store_pnl_presets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  account text,
  item text,
  vendor text,
  sort_order int default 0
);

alter table store_pnl enable row level security;
alter table store_pnl_items enable row level security;
alter table store_pnl_presets enable row level security;

-- 지금은 기존 탭들과 같은 방식(공개 키 접근). 관리자 개별 로그인(migration_07/08) 적용 시
-- 매장 계정은 자기 매장만 보이도록 정책을 다시 씌운다.
drop policy if exists "anon full access" on store_pnl;
create policy "anon full access" on store_pnl for all using (true) with check (true);
drop policy if exists "anon full access" on store_pnl_items;
create policy "anon full access" on store_pnl_items for all using (true) with check (true);
drop policy if exists "anon read" on store_pnl_presets;
create policy "anon read" on store_pnl_presets for select using (true);
drop policy if exists "anon write presets" on store_pnl_presets;
create policy "anon write presets" on store_pnl_presets for all using (true) with check (true);

-- 변경이력 기록 (migration_06의 트리거 재사용 — 누가 언제 얼마로 바꿨는지 남음)
drop trigger if exists trg_history_store_pnl on store_pnl;
create trigger trg_history_store_pnl after insert or update or delete on store_pnl
  for each row execute function log_data_history();
drop trigger if exists trg_history_store_pnl_items on store_pnl_items;
create trigger trg_history_store_pnl_items after insert or update or delete on store_pnl_items
  for each row execute function log_data_history();

-- ---------- 자주 쓰는 항목 초기 목록 (2025년 본점 결산표 기준) ----------
delete from store_pnl_presets;
insert into store_pnl_presets (category, account, item, vendor, sort_order) values
  ('고정비', '가게 유지비', '임대료', null, 1),
  ('고정비', '가게 유지비', '관리비', null, 2),
  ('고정비', '가게 유지비', '주차', null, 3),
  ('고정비', '회계', '세무 기장', null, 4),
  ('고정비', '노무', '근로계약서', null, 5),
  ('고정비', '렌탈', '정수기 렌탈', null, 6),
  ('고정비', '렌탈', '애니워터', null, 7),
  ('고정비', '렌탈', '캡스(에스케이쉴더스)', null, 8),
  ('고정비', '렌탈', '포스 사용료', null, 9),
  ('고정비', '통신', 'CCTV(SK브로드밴드)', null, 10),
  ('고정비', '보험료', '화재보험료', null, 11),
  ('고정비', '방역', '세스코', null, 12),
  ('고정비', '보장성 적립금', '노란우산공제', null, 13),
  ('고정비', '관리대행', '메뉴잇', null, 14),
  ('고정비', '관리대행', '카카오관리', null, 15),
  ('고정비', '관리대행', '오케이114', null, 16),

  ('식자재', '매장운영비', '식재료', '가온푸드', 1),
  ('식자재', '매장운영비', '식재료', '제주촌놈', 2),
  ('식자재', '매장운영비', '식재료', '대영주류', 3),
  ('식자재', '매장운영비', '식재료', '진명야채', 4),
  ('식자재', '매장운영비', '식재료', '수연음료', 5),
  ('식자재', '매장운영비', '식재료', '덕구에프엔비', 6),
  ('식자재', '매장운영비', '식재료', '꼬꼬상회(멸치)', 7),
  ('식자재', '매장운영비', '식재료', '단지에프앤비(멜젓,속젓)', 8),
  ('식자재', '매장운영비', '식재료', '우도땅콩막걸리', 9),
  ('식자재', '매장운영비', '식재료', '동남제면', 10),
  ('식자재', '매장운영비', '식재료', '천혜향쥬스', 11),
  ('식자재', '매장운영비', '식재료', '제주샘고소리술', 12),
  ('식자재', '매장운영비', '식재료', '제주미상주류', 13),
  ('식자재', '매장운영비', '식재료', '아임미트', 14),
  ('식자재', '매장운영비', '식재료', '고성전통주류', 15),
  ('식자재', '매장운영비', '식재료', '지알가락마트', 16),

  ('공과금운영비', '공과금', '상수도', null, 1),
  ('공과금운영비', '공과금', '도시가스', null, 2),
  ('공과금운영비', '공과금', '한국전력(전기)', null, 3),
  ('공과금운영비', '공과금', '통신비(전화)', null, 4),
  ('공과금운영비', '공과금', '통신비(인터넷)', null, 5),
  ('공과금운영비', '주방 부자재', '불판코팅', '동서코팅산업', 6),
  ('공과금운영비', '주방 부자재', '주방기물구매', '고려주방', 7),
  ('공과금운영비', '주방 부자재', '수리비', null, 8),
  ('공과금운영비', '홍보ㆍ마케팅비', '네이버광고', '네이버플레이스', 9),
  ('공과금운영비', '홍보ㆍ마케팅비', '키워드광고', null, 10),
  ('공과금운영비', '홍보ㆍ마케팅비', '카카오관리', '아이앤에이', 11),
  ('공과금운영비', '소모품 구입비', '소모품 구매', '쿠팡·다이소 등', 12),
  ('공과금운영비', '회식비', '회식비', '점심 및 회식', 13),
  ('공과금운영비', '기타구입비', '기타', null, 14),
  ('공과금운영비', '수수료', '카드수수료', null, 15),

  ('세금보험', '국세, 지방세 등', '4대 보험', '사회보험합산', 1),
  ('세금보험', '국세, 지방세 등', '사업소득세(알바 3.3%)', null, 2),
  ('세금보험', '국세, 지방세 등', '부가세', null, 3),
  ('세금보험', '국세, 지방세 등', '지방세', null, 4),
  ('세금보험', '국세, 지방세 등', '종합소득세', null, 5),

  ('인건비', '인건비', '직원 인건비', null, 1),
  ('인건비', '인건비', '알바 인건비', null, 2),
  ('인건비', '인건비', '성과급', null, 3),
  ('인건비', '인건비', '퇴직금', null, 4);
