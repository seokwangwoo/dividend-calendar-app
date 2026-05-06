# MVP 2nd Spec Coverage

이 문서는 `docs/plans/260506_mvp_2nd_dev/`가 기존 MVP 사양과 `docs/issue/` 결정/버그 중 어느 부분을 구현 대상으로 삼는지 정리한다.

상태 기준:

| 상태 | 의미 |
|---|---|
| 포함 | MVP 2nd phase에서 구현 또는 검증 대상으로 명시 |
| 부분 | 핵심은 포함하지만 운영/고도화 전체는 후속으로 밀림 |
| 제외 | MVP 2nd에서 명시적으로 제외되었거나 후속 후보 |

## Overall Scope

MVP 2nd는 MVP 1st에서 구현된 앱의 데이터 신뢰성, 운영성, 알림 신뢰성, 설치성, 가져오기 흐름을 강화한다. 특히 `home-portfolio-dividend-mismatch`는 MVP 1st 구현 후 코드 수정이 필요한 실제 이슈로 분류해 Phase 01에 포함한다.

| 영역 | 상태 | 관련 phase | 비고 |
|---|---|---|---|
| 홈/포트폴리오 배당 금액 불일치 수정 | 포함 | 01 | `home-portfolio-dividend-mismatch` |
| `payment_year` 기준 연간/월간 집계 | 포함 | 01, 02, 06 | `fiscal_year`는 관리자 참고용 |
| 연간 배당 목표 | 포함 | 01, 05 | `user_settings`에 저장 |
| 기본 표시 기준 유지 | 포함 | 01 | `default_amount_basis`를 현재 schema 명칭으로 유지 |
| 포트폴리오 세후 수익률 공식 | 포함 | 01 | 세후 배당 총액 / 총 투자원금 |
| 다음 배당 예정 로직 | 포함 | 01 | 가장 가까운 1건, 다계좌 합산 |
| 배당 상태 배지 정리 | 포함 | 01, 02 | 사용자 화면은 approved만, 배지는 dividend status 기준 |
| 최소 관리자 검수 UI | 포함 | 02 | `/admin`, event list, form, status update |
| 데이터 파이프라인 수동 보완 | 부분 | 02 | 자동화 장애 fallback은 운영 보완 수준 |
| Stooq daily price refresh | 포함 | 03 | daily close cache |
| stale price alert suppression | 포함 | 03 | 48시간 초과 yield alert 스킵 |
| 알림 중복 방지 state machine | 포함 | 03 | `last_condition_met` |
| 배당 변경 알림 대상 보유자 제한 | 포함 | 03 | holding users only |
| Resend email delivery | 포함 | 04 | opt-in, idempotent delivery |
| 홈 기반 온보딩/빈 상태 | 포함 | 05 | 별도 onboarding slide 없음 |
| PWA install basics | 포함 | 05 | manifest/service worker |
| CSV import | 포함 | 06 | preview/validation/commit |
| 캘린더 권리락일/권리확정일 보기 | 포함 | 06 | 기본은 payment month |
| Web Push | 제외 | - | 후속 |
| 계정 삭제 | 제외 | - | 법무/정책 선행 |
| watchlist alerts | 제외 | - | 후속 |

## Issue Coverage

| Issue | 상태 | 관련 phase | 정리 |
|---|---|---|---|
| `home-portfolio-dividend-mismatch.md` | 포함 | 01 | MVP 1st 코드 수정 필요 이슈 |
| `decision-dividend-year-basis.md` | 포함 | 01, 02, 06 | `payment_year` 추가 및 RPC 전환 |
| `decision-calendar-aggregation.md` | 포함 | 01, 06 | 월 집계는 `estimated_payment_month`; 확장 view는 Phase 06 |
| `decision-annual-dividend-goal.md` | 포함 | 01, 05 | 연간 목표로 UX/DB 정리 |
| `decision-settings-scope.md` | 부분 | 01, 05 | 설정 최소 범위 유지, 계정 삭제 제외 |
| `decision-admin-review-ui.md` | 포함 | 02 | MVP 1st에서 축소된 custom admin UI 보강 |
| `decision-stock-price-source.md` | 포함 | 03 | Stooq free CSV daily close |
| `decision-stale-price-alert-policy.md` | 포함 | 03 | 48시간 stale rule |
| `decision-notification-deduplication.md` | 포함 | 03, 04 | state transition, email delivery timestamp |
| `decision-notification-target-scope.md` | 포함 | 03 | 보유 사용자만 배당 변경 알림 |
| `decision-onboarding-empty-state.md` | 포함 | 05 | home-as-onboarding, empty states |
| `decision-portfolio-yield-calculation.md` | 포함 | 01 | portfolio after-tax yield formula |
| `decision-next-dividend-logic.md` | 포함 | 01 | sorting and aggregation logic |
| `decision-dividend-status-badge.md` | 포함 | 01, 02 | user badge vs admin review status separation |
| `decision-data-pipeline-spof.md` | 부분 | 02 | custom admin input is practical exception path |

## Scope Differences From MVP 1st

| 항목 | MVP 1st | MVP 2nd 결정 |
|---|---|---|
| 관리자 검수 UI | Supabase Studio 중심 | 최소 custom `/admin` UI 포함 |
| 이메일 알림 | foundation | Resend production delivery 포함 |
| 주가 갱신 | stock cache fields existed | daily Stooq refresh and failure policy 포함 |
| 알림 중복 방지 | 제한적 dedupe | state-transition 기반 dedupe |
| 캘린더 | payment month only | payment month default + record/ex-date alternate views |
| CSV import | 제외 | 포함 |
| PWA | 제외 | 기본 설치성 포함 |

## Phase Mapping

| Phase | 사양 커버리지 |
|---|---|
| 01 MVP 1st Consistency Fixes | dividend source of truth, `payment_year`, annual goal, portfolio yield, next dividend, status badges |
| 02 Minimal Admin Review UI | custom admin routes, event form, review workflow, admin access |
| 03 Price Refresh and Alert Reliability | Stooq refresh, stale policy, alert state transitions, holder-only change alerts |
| 04 Email Notification Delivery | Resend delivery, idempotent email state, email templates and jobs |
| 05 PWA and Empty State UX | manifest, service worker, home onboarding, empty states, UX polish |
| 06 CSV Import and Calendar Expansion | CSV preview/import, calendar basis switch, record/ex-date views |
