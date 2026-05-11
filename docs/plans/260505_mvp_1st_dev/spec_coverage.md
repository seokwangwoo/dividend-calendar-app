# MVP 1st Spec Coverage

이 문서는 `docs/plans/260505_mvp_1st_dev/`가 아래 사양서의 어느 부분을 구현 대상으로 삼는지 정리한다.

- `docs/dividend_app_wireframe.md`
- `docs/dividend_calendar_mvp_plan.md`
- `docs/dividend_app_mvp_backend_spec.md`

상태 기준:

| 상태 | 의미 |
|---|---|
| 포함 | MVP 1st phase에서 구현 또는 검증 대상으로 명시 |
| 부분 | 핵심은 포함하지만 사양 전체 수준은 아니거나 운영/고도화가 후속으로 밀림 |
| 제외 | MVP 1st에서 명시적으로 제외되었거나 후속 후보 |

## Overall Scope

MVP 1st는 일본 국내 배당 투자자가 이메일 계정으로 로그인해 보유 종목을 등록하고, 계좌 종류별 세후 배당과 월별 배당 흐름을 확인하며, 목표 배당수익률 및 승인된 배당 변경 알림을 받는 범위까지 구현한다. 데이터 품질은 Supabase Studio 기반 관리자 검수와 최소한의 TDnet/파서 파이프라인으로 시작한다.

| 영역 | 상태 | 관련 phase | 비고 |
|---|---|---|---|
| Next.js App Router, TypeScript, Tailwind 기반 웹앱 | 포함 | 01 | 네이티브 앱은 제외 |
| 이메일/비밀번호 인증, 로그아웃, 비밀번호 재설정 | 포함 | 02 | Supabase Auth 기준 |
| 인증된 앱 shell과 하단 탭 | 포함 | 01 | 홈, 포트폴리오, 캘린더, 알림, 설정 |
| 일본 주식 검색과 지원/미지원 표시 | 포함 | 02, 03 | `/app/stocks/search`로 종목 상세 진입, 35개 seed, unsupported row 포함 |
| 보유 종목 CRUD와 동일 종목 복수 계좌 등록 | 포함 | 03 | soft delete 기준 |
| NISA/特定口座/一般口座 세전/세후 계산 | 포함 | 03, 07 | `nisa`, `tokutei`, `general`, 세율 0%/20.315% |
| 홈 요약, 월별 캘린더, 종목 상세 | 포함 | 04 | 승인된 배당 데이터만 사용자 화면에 사용 |
| 목표 배당수익률 알림 규칙과 앱 내 알림 | 포함 | 05 | `gte`/`lte`, 예상 배당수익률(세전) 기준, 종목당 active 룰 1개 |
| 설정 화면 | 포함 | 05 | 알림, 표시 기준, 연간 세후 배당 목표, 세금 고지 |
| 배당 변경 알림 | 포함 | 06 | 승인된 review에서만 생성 |
| 관리자 검수 | 부분 | 06 | 커스텀 관리자 화면이 아니라 Supabase Studio 운영 |
| TDnet 공시 수집 | 부분 | 06 | 후보 메타데이터 수집과 job foundation, 완전 자동 커버리지는 제외 |
| XBRL/PDF 파싱 | 부분 | 06 | 최소 parser function shape와 raw evidence 저장, 고정밀 production parser는 제외 |
| 이메일 알림 | 부분 | 05 | 설정과 job/email-channel foundation은 가능, Resend production delivery는 후속 |
| PWA 설치성 | 제외 | - | 웹앱은 포함하지만 manifest/service worker 등 PWA 요구는 phase에 없음 |
| CSV import | 제외 | - | Phase 2 후보 |
| Web Push | 제외 | - | 후속 후보 |
| 권리락일/권리확정일 기준 캘린더 | 제외 | - | MVP 1st는 payment month/date 기준 |
| 증권사 API 연동, 자동 세금 신고, 매수/매도 추천 | 제외 | - | MVP 1st 명시 제외 |
| 미국 주식/ETF, 외국세 처리, 전체 일본주 실시간 커버리지 | 제외 | - | 일본 지원 종목 seed 중심 |

## Wireframe Coverage

Source: `docs/dividend_app_wireframe.md`

| 사양 항목 | 상태 | 관련 phase | 정리 |
|---|---|---|---|
| 전체 앱 구조와 하단 5탭 | 포함 | 01 | app shell과 bottom navigation에 반영 |
| 홈 화면 | 포함 | 04 | 올해 세후 배당, 세전/세금, 이번 달, 다음 배당, 목표 달성률, 최근 변경 |
| 포트폴리오 화면 | 포함 | 03 | 요약, 계좌 필터, 정렬, holding card |
| 종목 추가 화면 | 포함 | 03 | 검색, 지원/미지원 표시, 지원 종목 선택 |
| 보유 종목 등록/편집 화면 | 포함 | 03 | 수량, 평균 취득가, 계좌 종류, live calculation |
| 등록 완료 화면 | 포함 | 03 | 추가 완료, 예상 연간 세후 배당, 캘린더/추가 링크 |
| 배당 캘린더 화면 | 포함 | 04 | 연도, 세전/세후 기준, 계좌 필터, 월별 요약, 월 상세 |
| 상태 배지 | 포함 | 01, 04 | estimated/confirmed/paid/unknown/reviewed 계열 표시 |
| 종목 상세 화면 | 포함 | 04 | 현재 정보, 내 보유 정보, 배당 일정, 출처/검수 상태 |
| 목표 배당수익률 알림 설정 | 포함 | 05 | 예상 배당수익률(세전) 기준, 종목당 active 룰 1개, 이상/이하, 채널 선택, 투자 판단 고지 |
| 알림 목록 화면 | 포함 | 05 | 필터, 그룹, unread/read, mark read |
| 설정 화면 | 포함 | 05 | 계정, 알림, 표시 기준, JPY, 세금 고지, 로그아웃 |
| 관리자 검수 화면 | 부분 | 01, 06 | `/admin` placeholder는 두지만 MVP 운영은 Supabase Studio 중심 |
| 신규 사용자 온보딩 | 제외 | - | route suggestion에는 있으나 phase scope에는 없음 |
| `/app/stocks/search` 별도 검색 화면 | 포함 | 후속 이슈 | 종목 상세/알림 설정 진입점으로 MVP에 추가 필요 |
| `/admin/disclosures`, `/admin/parse-jobs` 커스텀 화면 | 부분 | 01, 06 | placeholder/foundation 수준, 실제 검수는 Supabase Studio |
| 디자인 톤과 금지 방향 | 포함 | 01, 07 | 차분한 금융 서비스, 매수/매도 추천 표현 금지 |

## Product Plan Coverage

Source: `docs/dividend_calendar_mvp_plan.md`

| 사양 항목 | 상태 | 관련 phase | 정리 |
|---|---|---|---|
| 일본 배당 투자자 대상 세후 배당 캘린더 | 포함 | 03, 04 | 핵심 가치로 구현 |
| 일본 국내 상장 주식 중심 | 포함 | 02, 03 | 지원 종목 seed와 unsupported 표시 |
| 회원가입/로그인 | 포함 | 02 | email/password, logout, reset |
| 종목 검색/등록 | 포함 | 03 | 지원 종목만 holding 등록 가능 |
| 보유 수량, 평균 취득가, 계좌 구분 입력 | 포함 | 03 | validation 포함 |
| 세전/세후 배당 계산 | 포함 | 03 | NISA 0%, 과세계좌 20.315% |
| 월별 배당 캘린더 | 포함 | 04 | payment month/date 기준 |
| 목표 배당수익률 알림 | 포함 | 05 | in-app notification 우선 |
| 배당 변경 알림 | 포함 | 06 | approved review 기반 increase/decrease/no dividend/special 등 |
| 관리자용 배당 데이터 관리 | 부분 | 06 | custom dashboard가 아니라 Supabase Studio operating flow |
| 이메일 알림 | 부분 | 05 | 설정과 email job/channel foundation, production delivery는 후속 |
| TDnet 공시 후보 수집 | 부분 | 06 | idempotent metadata collection foundation |
| XBRL/PDF 파싱 | 부분 | 06 | candidate extraction shape, confidence, raw payload; 고정밀 자동화는 후속 |
| 자동 승인 제외 조건 | 포함 | 06, 07 | `未定`, `無配`, 특수배당, 큰 변화 등 수동 검수 |
| 알림 중복 방지 | 포함 | 05, 07 | 24시간 dedupe window |
| 법적/표현 요구사항 | 포함 | 03, 05, 07 | 세금 고지, 투자 추천 아님, 금지 표현 검증 |
| 비기능 성능 목표 | 포함 | 07 | acceptance criteria로 검증 |
| 보안 요구사항 | 포함 | 02, 06, 07 | RLS, admin role, service role key 보호 |
| 데이터 오류 신고 기능 | 제외 | - | Should 항목이나 MVP 1st phase에 없음 |
| 실시간 주가 초단위 반영 | 제외 | - | MVP 검증 필수 아님 |
| CSV import | 제외 | - | Phase 2 후보 |
| Web Push | 제외 | - | Phase 2 후보 |
| 권리락일/권리확정일 기준 캘린더 | 제외 | - | Phase 2 후보 |
| NISA 배당 시뮬레이션 | 제외 | - | Could/후속 후보 |
| 미국 ETF/해외 종목 | 제외 | - | 초기 범위 제외 |
| 비즈니스 플랜, 수익화, 성공 지표 | 제외 | - | 제품 전략 문서로 유지, 구현 phase scope 아님 |

## Backend Spec Coverage

Source: `docs/dividend_app_mvp_backend_spec.md`

| 사양 항목 | 상태 | 관련 phase | 정리 |
|---|---|---|---|
| Next.js + Tailwind + TypeScript | 포함 | 01 | 고정 MVP stack |
| Supabase Auth/PostgreSQL/RLS/RPC/Edge Functions/Storage | 포함 | 01, 02, 03, 04, 06 | Supabase 중심 구조 |
| GitHub Actions Cron | 포함 | 06 | collection/parser/evaluation schedule foundation |
| Resend | 부분 | 05 | production email delivery는 follow-up |
| Sentry | 포함 | 01 | env/template stack에 포함 |
| profiles, user_settings, stocks, holdings | 포함 | 02 | auth trigger와 RLS 포함 |
| dividend_events | 포함 | 02, 04 | approved data only 규칙 포함 |
| notification_rules, notifications | 포함 | 02, 05 | user-owned RLS와 evaluation |
| disclosures, dividend_reviews, jobs | 포함 | 02 또는 06, 06 | Phase 06에서 사용, 조기 migration 허용 |
| RLS 기본 원칙과 admin helper | 포함 | 02, 06, 07 | user-owned data 격리와 admin/service role 구분 |
| Supabase Client CRUD | 포함 | 03, 05 | holdings, settings, rules, notifications |
| RPC 목록 | 포함 | 03, 04 | `calculate_holding_dividend`, `get_portfolio_summary`, home/calendar/month/detail |
| Edge Function 목록 | 부분 | 05, 06 | approve/reject/collect/parse/evaluate 포함, send-email은 foundation, refresh-stock-prices는 없음 |
| 홈 요약 API | 포함 | 04 | Supabase RPC |
| 배당 캘린더 API | 포함 | 04 | Supabase RPC |
| 보유 종목 등록 API | 포함 | 03 | Supabase Client insert/update |
| 목표수익률 알림 조건 생성 | 포함 | 05 | Supabase Client CRUD |
| 관리자 검수 승인 | 포함 | 06 | Edge Function |
| 세후 배당 계산 로직 | 포함 | 03 | shared TS utility + RPC |
| `tax_policies` 테이블 | 제외 | 03 | Phase 03에서 명시적으로 만들지 않고 상수 사용 |
| 앱 내 알림 | 포함 | 05 | notifications table insert/list/read |
| 이메일 발송 함수 | 부분 | 05 | email job/channel 생성 가능, Resend production readiness 후속 |
| 외부 데이터 수집 | 부분 | 06 | metadata collection foundation, paid/full TDnet API 제외 |
| 관리자 검수 도구 | 부분 | 06 | Supabase Studio 우선, custom `/admin` dashboard 후속 |
| Supabase Storage `disclosures` bucket | 포함 | 06 | private bucket, signed URL admin access |
| `exports` bucket | 제외 | - | 관리자 CSV export는 MVP 1st scope 아님 |
| Frontend 폴더 구조 | 포함 | 01 | phase 01 recommended structure |
| 환경 변수와 service role key 보호 | 포함 | 01, 06, 07 | browser 노출 금지 검증 |
| 성능/인덱스 설계 | 포함 | 02, 07 | indexes와 acceptance targets |
| Materialized View, Redis, 별도 backend server | 제외 | - | 후속 최적화 또는 명시 제외 |
| Cloudflare Workers/Queues 중심 아키텍처 | 제외 | - | 최종 MVP 1st는 Supabase Edge Functions + GitHub Actions Cron |

## Important Scope Differences

아래 항목은 원 사양서에는 MVP 또는 Must로 표현되어 있지만, MVP 1st 계획에서는 축소되거나 후속으로 분리되었다.

| 항목 | MVP 1st 결정 |
|---|---|
| 관리자 검수 UI | 커스텀 관리자 대시보드 대신 Supabase Studio 운영 흐름을 구현한다. `/admin` route는 placeholder/foundation 수준이다. |
| 이메일 알림 | 사용자 설정과 job/email-channel 기반은 둘 수 있지만, Resend production delivery는 MVP 1st 완료 조건이 아니다. |
| TDnet/XBRL/PDF | 수집/파싱 파이프라인의 최소 구조와 검수 큐를 만든다. 고정밀 자동 파서, paid TDnet API, 넓은 커버리지는 제외한다. |
| `tax_policies` | 테이블화하지 않고 Phase 03 MVP 상수로 세율을 관리한다. |
| REST `/api/*` 엔드포인트 | 별도 REST 서버 대신 Supabase Client, RPC, Edge Functions로 구현한다. |
| PWA | 웹앱은 구현하지만 설치 가능한 PWA 요건은 phase scope에 없다. |
| CSV/Web Push/권리락일/권리확정일 | 후속 phase 후보로 둔다. |

## Phase Mapping

| Phase | 사양 커버리지 |
|---|---|
| 01 Project Foundation | 앱 scaffold, route shell, UI primitives, formatting, constants, Supabase helpers |
| 02 Database, Auth, and RLS | Auth, core schema, RLS, admin helper, seed stocks, protected routes |
| 03 Portfolio and Dividend Calculation | stock search, holding CRUD, same-stock multi-account, tax/dividend formulas, portfolio summary |
| 04 Home and Calendar Core UI | home, calendar, month detail, stock detail, approved-data-only display, source/review status |
| 05 Notifications and Settings | yield rules, rule evaluation, in-app notifications, settings, tax/investment notices |
| 06 Admin Review and Data Pipeline | disclosures, reviews, jobs, approve/reject functions, minimal collection/parser foundation, dividend change notifications |
| 07 MVP Acceptance Testing | auth, RLS, portfolio, calculation, home, calendar, notification, admin, data pipeline, performance, copy/compliance verification |
