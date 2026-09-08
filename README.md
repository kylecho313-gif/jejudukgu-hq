# 제주덕구 본사 통합관리 웹앱

엑셀 `제주덕구_본부운영_통합관리파일_v3` 의 10개 시트(운영대시보드/매장현황/매출로열티/이슈관리/주간보고/월간요약/신규오픈/본부장업무/알림설정/설정값)를
그대로 옮긴 웹앱입니다. Node.js/Python 없이 정적 HTML/CSS/JS로만 만들어졌고, 데이터는 Supabase(무료 클라우드 DB)에 저장되어
등록된 직원이 각자 PC/폰에서 접속해 같은 데이터를 실시간으로 함께 수정합니다.

## 1. Supabase 설정 (최초 1회)

1. https://supabase.com 가입 → New Project 생성 (Region: Northeast Asia Seoul 권장)
2. 왼쪽 메뉴 **SQL Editor** → New query → `db/schema.sql` 파일 내용 전체 복사/붙여넣기 → Run
   - 매장 10개(하남 본점 등)와 드롭다운 기본값이 자동으로 들어갑니다.
   - 이미 운영 중인 프로젝트에 기능을 추가할 때는 `db/migration_NN_*.sql` 파일들을 번호 순서대로 같은 방식(SQL Editor에 붙여넣고 Run)으로 추가 실행하면 됩니다. 재실행해도 안전하게 작성되어 있습니다.
3. 왼쪽 메뉴 **Settings → API** → `Project URL` 과 `anon public` 키를 복사
4. `js/config.js` 열어서 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 값을 붙여넣고, `APP_PASSWORD`를 직원들과 공유할 비밀번호로 변경

## 2. 로컬에서 테스트

Node/Python이 없는 PC이므로 동봉된 `serve.ps1`(PowerShell 내장 기능만 사용)로 로컬 서버를 띄웁니다.

```powershell
powershell -ExecutionPolicy Bypass -File "serve.ps1"
```

브라우저에서 http://localhost:8899 접속 → 이름/비밀번호 입력 후 확인.

## 3. 배포 (GitHub Pages, 무료)

1. GitHub 계정으로 새 저장소 생성 (예: `jejudukgu-hq`), Public 또는 Private 모두 가능(Private도 Pages 무료 지원)
2. 이 폴더(`02_본사통합웹앱`) 전체를 저장소에 push
3. 저장소 **Settings → Pages** → Source를 `main` 브랜치 `/ (root)` 로 설정 → Save
4. 몇 분 후 `https://[아이디].github.io/jejudukgu-hq/` 주소로 접속 가능 → 이 주소를 직원들에게 공유

> `config.js`에 Supabase anon key가 그대로 노출됩니다. anon key는 "누구나 볼 수 있는 공개키"로 설계된 것이며
> DB 접근 자체는 Supabase RLS 정책으로 제어합니다(현재는 내부 소규모 운영 특성상 anon 전체 허용 정책).
> 저장소를 Private로 두면 코드 노출 위험은 줄어들지만, 배포된 웹앱 URL 자체는 비밀번호로만 보호됩니다.

## 4. 데이터 구조

| 화면 | Supabase 테이블 |
|---|---|
| 대시보드 | (다른 테이블에서 자동 집계, 별도 테이블 없음) |
| 매장현황 | `stores` |
| 매출·로열티 | `sales_royalty` |
| 이슈관리 | `issues` |
| 주간보고 | `weekly_reports` |
| 월간요약 | `monthly_narrative` (수치는 자동집계) |
| 신규오픈 | `new_store_openings` |
| 본부장업무 | `manager_tasks` |
| 가맹문의 | `franchise_inquiries` |
| 물류마진 | `supply_margin` |
| 설정 | `alert_settings`, `dropdown_options` |

`staff`, `attendance_logs` 테이블은 본사 통합관리 웹앱이 아니라 아래 5번 "하남본점 알바관리" 별도 페이지에서 사용합니다.

## 5. 하남본점 알바관리 (별도 프로그램)

본사 통합관리 웹앱(`index.html`)과는 별개로, 하남 본점 알바 출퇴근/급여정산 전용 페이지 2개가 같은 사이트에 함께 배포됩니다.
같은 Supabase 프로젝트를 공유하므로 별도 설정은 필요 없고, `db/migration_03_attendance.sql` 만 SQL Editor에서 한 번 실행하면 됩니다
(테이블: `staff` 알바 명단, `attendance_logs` 출퇴근 기록).

**① `attendance.html` — 알바용 출퇴근 체크**
- 배포 후 주소: `https://[아이디].github.io/jejudukgu-hq/attendance.html` — 매장 태블릿/폰에 바로가기로 등록해두고 사용
- 관리자 비밀번호 불필요. 이름 선택 → 개인 PIN 4자리 입력 → 출근하기/퇴근하기 버튼만 누르면 됨
- 이미 출근 중이면 자동으로 퇴근 화면으로 전환되고 경과 근무시간을 보여줌

**② `attendance-admin.html` — 관리자용 알바관리**
- 배포 후 주소: `https://[아이디].github.io/jejudukgu-hq/attendance-admin.html`
- 본사 통합관리 웹앱과 같은 공유 비밀번호(`config.js`의 `APP_PASSWORD`)로 접속
- 알바 이름/PIN/시급/3.3% 공제여부 등록·수정, 오늘 출퇴근 현황, 근태기록 직접 수정(퇴근 체크 누락 보정용), 월별 정산표(기본급+주휴수당 추정치+3.3% 공제 후 실지급액) 제공
- 주휴수당은 "해당 주 실근무시간 15시간 이상 시 (주 근무시간÷40, 최대1)×8×시급" 간이 계산이며 결근 여부는 반영하지 못함 — 정확한 지급액은 노무사 확인 권장
- 3.3% 공제(사업소득 원천징수)는 알바별로 켜고 끌 수 있음(알바 명단의 "3.3% 공제" 체크박스) — 정확한 세무 처리는 세무사 확인 권장
- 새 프로젝트라면 `db/migration_04_withholding.sql` 도 SQL Editor에서 실행해야 3.3% 공제 기능이 동작합니다 (기존 운영 중인 프로젝트는 이 파일만 추가 실행하면 됨)
- 현재 하남 본점 전용(다른 매장 확장은 필요시 요청)

## 6. 향후 개선 아이디어 (필요시 요청)

- 직원별 개별 로그인 계정 (현재는 공유 비밀번호 + 이름 표기)
- 엑셀 내보내기/가져오기
- 매출 입력 시 알림 (카카오톡/문자 연동)
