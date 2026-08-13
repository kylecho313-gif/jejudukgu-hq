# 제주덕구 본사 통합관리 웹앱

엑셀 `제주덕구_본부운영_통합관리파일_v3` 의 10개 시트(운영대시보드/매장현황/매출로열티/이슈관리/주간보고/월간요약/신규오픈/본부장업무/알림설정/설정값)를
그대로 옮긴 웹앱입니다. Node.js/Python 없이 정적 HTML/CSS/JS로만 만들어졌고, 데이터는 Supabase(무료 클라우드 DB)에 저장되어
등록된 직원이 각자 PC/폰에서 접속해 같은 데이터를 실시간으로 함께 수정합니다.

## 1. Supabase 설정 (최초 1회)

1. https://supabase.com 가입 → New Project 생성 (Region: Northeast Asia Seoul 권장)
2. 왼쪽 메뉴 **SQL Editor** → New query → `db/schema.sql` 파일 내용 전체 복사/붙여넣기 → Run
   - 매장 10개(하남 본점 등)와 드롭다운 기본값이 자동으로 들어갑니다.
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
| 설정 | `alert_settings`, `dropdown_options` |

## 5. 향후 개선 아이디어 (필요시 요청)

- 직원별 개별 로그인 계정 (현재는 공유 비밀번호 + 이름 표기)
- 엑셀 내보내기/가져오기
- 매출 입력 시 알림 (카카오톡/문자 연동)
