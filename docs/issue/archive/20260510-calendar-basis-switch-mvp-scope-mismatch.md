---
status: resolved
resolved: 2026-05-12
type: bug
created: 2026-05-10
priority: high
labels: [ui, mvp-scope, product-consistency, calendar]
---

# 캘린더 기준 전환 UI가 MVP 입금월 기준 정책과 충돌

## 개요 (Overview)

MVP 제품 정책은 배당 캘린더를 `payment_year` + `estimated_payment_month` 기반의 **입금월 중심 월별 현금흐름 화면**으로 제공하는 것입니다. 그러나 현재 구현은 `/app/calendar`에서 `支払月`, `権利確定日`, `除権日` 기준 전환 버튼을 모두 노출합니다. 이로 인해 사용자는 홈의 올해/이번 달 배당 금액과 다른 기준의 월별 금액을 같은 MVP 캘린더 안에서 보게 될 수 있으며, 초보자 친화적인 “실제 입금액/입금월” 중심 UX가 흐려집니다.

## 재현 방법 (Reproduction Steps)

1. 로그인한 사용자로 앱에 접속한다.
2. `/app/calendar`로 이동한다.
3. 캘린더 상단의 기준 전환 버튼 영역을 확인한다.
4. `支払月` 외에 `権利確定日`, `除権日` 버튼이 함께 노출되는지 확인한다.
5. `権利確定日` 또는 `除権日`을 클릭하면 캘린더 RPC가 해당 기준으로 다시 조회되는지 확인한다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| MVP 문서 정책 | 캘린더 MVP 기준은 `payment_year` + `estimated_payment_month` 입금월 집계 |
| Phase 2 문서 정책 | 권리락일 기준, 권리확정일 기준은 Phase 2 보기 기준 |
| 현재 캘린더 기본값 | `payment_month` |
| 현재 캘린더 기준 옵션 | `payment_month`, `record_date`, `ex_dividend_date` |
| 현재 사용자 노출 라벨 | `支払月`, `権利確定日`, `除権日` |

### Root Data Comparison

| Table / Column | Value A | Value B | Notes |
|----------------|---------|---------|-------|
| `dividend_events.payment_year` + `estimated_payment_month` | MVP 기본 집계 기준 | — | 사용자가 실제 입금월 흐름을 확인하는 기준 |
| `dividend_events.record_date` | — | 권리확정일 기준 | 기획서상 Phase 2 보기 기준 |
| `dividend_events.ex_dividend_date` | — | 권리락일 기준 | 기획서상 Phase 2 보기 기준 |

## 기술적 원인 분석 (Technical Root Cause)

- `src/app/app/calendar/page.tsx`는 초기 캘린더 기준을 `payment_month`로 설정합니다.
- `src/features/calendar/basis.ts`는 `CALENDAR_BASIS_OPTIONS`에 `payment_month`, `record_date`, `ex_dividend_date` 세 값을 모두 포함합니다.
- `src/features/calendar/components/calendar-client.tsx`는 `CALENDAR_BASIS_OPTIONS.map(...)`으로 모든 기준 옵션을 버튼으로 렌더링합니다.
- 같은 컴포넌트의 `handleCalendarBasisChange`는 선택된 기준을 `get_dividend_calendar`와 `get_dividend_month_detail` RPC 호출의 `p_calendar_basis`로 전달합니다.
- 따라서 현재 UI는 MVP 정책상 숨겨야 할 권리확정일/권리락일 기준을 사용자에게 직접 노출합니다.

## 영향 범위 (Impact)

- **User experience**: 사용자는 “입금월 기준 현금흐름 앱”에서 권리확정일/권리락일 기준 월별 금액을 보게 되어, 홈의 올해/이번 달 배당 금액과 캘린더 숫자의 의미를 혼동할 수 있습니다.
- **Affected screens**: `/app/calendar`, `CalendarClient`의 기준 선택 UI, 월 상세 조회 흐름.
- **Tests**: 기존 통합 테스트는 `record_date`와 `ex_dividend_date` 기준 RPC 동작을 검증할 수 있으나, MVP UI에서는 해당 기준을 숨기는 방향으로 E2E 기대값을 조정해야 합니다.
- **Data integrity**: 데이터 자체 오류는 아닙니다. 문제는 Phase 2 기준이 MVP 사용자 UI에 노출되는 제품 범위/UX 불일치입니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 방안 A: MVP UI에서 기준 전환 버튼을 숨기고 `payment_month`만 사용 (권장)

1. **Description**: `/app/calendar` UI에서는 `payment_month`만 사용하고 기준 전환 버튼 영역을 제거합니다. 내부 RPC와 타입은 유지할 수 있지만, 사용자 UI에서 `record_date`, `ex_dividend_date`를 선택할 수 없게 합니다.
2. **Pros**: MVP 핵심 가치인 입금월 기준 현금흐름에 집중할 수 있습니다. 홈/캘린더 숫자 기준도 일관됩니다. 구현 변경 범위가 비교적 작습니다.
3. **Cons / Risks**: 이미 구현된 기준 전환 UI와 E2E/테스트 기대값을 조정해야 할 수 있습니다.
4. **Recommended?**: 예.

### 방안 B: 기준 전환은 유지하되 “고급 보기 / Beta” 접힘 영역으로 숨김

1. **Description**: 기본 화면에는 입금월만 보여주고, 고급 보기 접힘 영역을 열 때만 권리확정일/권리락일 기준을 제공합니다.
2. **Pros**: 고급 사용자 기능을 완전히 제거하지 않으면서 초보자 혼란을 줄일 수 있습니다.
3. **Cons / Risks**: MVP 화면 복잡도가 올라갑니다. 권리확정일/권리락일 기준 숫자가 홈과 다를 때 추가 설명 문구가 필요합니다.
4. **Recommended?**: MVP 이후 또는 실험 기능으로만 권장합니다.

### 방안 C: 현재 UI를 유지하고 문구만 보강

1. **Description**: 세 기준 버튼을 유지하되 `支払月`, `権利確定日`, `除権日`의 차이를 설명하는 안내 문구를 추가합니다.
2. **Pros**: 코드 변경이 가장 작고 기존 구현을 유지할 수 있습니다.
3. **Cons / Risks**: MVP에서 피하려는 복잡한 투자 캘린더 느낌이 강해지고, 초보자 혼란이 충분히 해소되지 않습니다.
4. **Recommended?**: 아니오.

## 관련 파일 (Related Files)

- `docs/dividend_calendar_mvp_plan.md` — MVP/Phase 2 캘린더 기준 정책.
- `docs/dividend_app_wireframe.md` — 배당 캘린더 보기 옵션 및 월별 집계 기준.
- `src/app/app/calendar/page.tsx` — 캘린더 초기 기준을 `payment_month`로 설정.
- `src/features/calendar/basis.ts` — 캘린더 기준 enum과 사용자 라벨 정의.
- `src/features/calendar/components/calendar-client.tsx` — 기준 전환 버튼 렌더링 및 RPC 재조회.
- `tests/integration/calendar/dividend-calendar.test.ts` — `record_date`, `ex_dividend_date` 기준 RPC 동작 검증.
- `src/features/calendar/basis.test.ts` — 기준 옵션 enum/라벨 테스트.

## 라벨 제안 (Suggested Labels)

`ui`, `mvp-scope`, `product-consistency`, `calendar`, `high-priority`
