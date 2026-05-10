---
status: open
type: bug
created: 2026-05-10
priority: high
labels: [ui, mvp-scope, notifications, product-consistency]
---

# 목표수익률 알림 기준 UI가 MVP 예상 배당수익률 단일 기준 정책과 충돌

## 개요 (Overview)

MVP 제품 정책은 종목당 활성 목표수익률 알림 룰을 1개만 허용하고, 기준도 **예상 배당수익률(세전, `before_tax_yield`)**만 사용하는 것입니다. 그러나 현재 구현은 알림 설정 화면에서 `税引前配当利回り`와 `税引後配当利回り` 기준을 모두 선택지로 노출하고, 저장 액션도 `after_tax_yield`를 유효한 값으로 검증합니다. 이로 인해 MVP에서 제외하기로 한 세후 수익률 기준 알림이 사용자에게 노출될 수 있습니다.

## 재현 방법 (Reproduction Steps)

1. 로그인한 사용자로 앱에 접속한다.
2. `/app/stocks/<stockId>/notification-rule`로 이동한다.
3. `基準` 선택 필드를 확인한다.
4. `税引前配当利回り` 외에 `税引後配当利回り`가 선택 가능한지 확인한다.
5. `税引後配当利回り`를 선택해 저장하면 `basis = after_tax_yield` 룰이 저장 가능한지 확인한다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| MVP 정책 | 종목당 active 알림 룰 최대 1개, 기준은 예상 배당수익률(`before_tax_yield`)만 사용 |
| 현재 UI 기준 옵션 | `税引前配当利回り`, `税引後配当利回り` |
| 현재 저장 검증 기준 | `before_tax_yield`, `after_tax_yield` |
| 현재 active 룰 처리 | active 룰이 있으면 첫 번째 active 룰을 수정 대상으로 사용 |

### Root Data Comparison

| Table / Column | Value A | Value B | Notes |
|----------------|---------|---------|-------|
| `notification_rules.basis` | `before_tax_yield` | `after_tax_yield` | MVP에서는 `before_tax_yield`만 사용자 생성 허용 |
| `notification_rules.status` | `active` | `disabled` | MVP에서는 종목당 active 룰 최대 1개 정책 필요 |
| `stocks.expected_dividend_yield` / current price derived yield | 예상 배당수익률 | — | MVP 알림 기준 |

## 기술적 원인 분석 (Technical Root Cause)

- `src/features/notifications/constants.ts`의 `NOTIFICATION_RULE_BASES`는 `before_tax_yield`와 `after_tax_yield`를 모두 포함합니다.
- 같은 파일의 `NOTIFICATION_RULE_BASIS_OPTIONS`도 `税引前配当利回り`, `税引後配当利回り` 두 UI 옵션을 모두 정의합니다.
- `src/app/app/stocks/[stockId]/notification-rule/page.tsx`는 `NOTIFICATION_RULE_BASIS_OPTIONS`를 `Select`에 그대로 전달해 두 기준을 모두 사용자에게 노출합니다.
- `src/features/notifications/actions.ts`의 `ruleSchema`는 `z.enum(NOTIFICATION_RULE_BASES)`를 사용하므로 `after_tax_yield`도 서버 액션에서 유효한 값으로 통과합니다.
- 같은 페이지는 `rules.find((rule) => rule.status === "active")`로 첫 active 룰을 수정 대상으로 잡고 있어, “종목당 active 룰 1개” UX에 가깝지만 DB/액션 레벨의 유일성 보장은 별도 확인이 필요합니다.

## 영향 범위 (Impact)

- **User experience**: 사용자가 MVP 범위 밖인 세후 수익률 알림을 설정할 수 있어, 세금 계산 오차/예상값 고지와 알림 신뢰도 문제가 커질 수 있습니다.
- **Affected screens**: `/app/stocks/[stockId]/notification-rule`, 알림 룰 설정 폼, 설정된 룰 목록, 이메일/앱 내 알림 문구.
- **Tests**: `after_tax_yield`를 전제로 한 constants/evaluation/email-template 테스트는 MVP UI 정책에 맞춰 유지 범위를 재검토해야 합니다. 내부 계산 유틸 테스트는 Phase 2 대비로 남길 수 있지만, 사용자 생성 UI/E2E는 `before_tax_yield`만 기대해야 합니다.
- **Data integrity**: 기존 DB에 `after_tax_yield` 룰이 있으면 MVP 정책과 어긋납니다. 마이그레이션 또는 운영 정리 정책이 필요할 수 있습니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 방안 A: 사용자 UI와 저장 액션에서 `before_tax_yield`만 허용 (권장)

1. **Description**: 알림 설정 화면에서 기준 선택 필드를 제거하거나 읽기 전용 “予想配当利回り”로 고정합니다. 서버 액션은 사용자 입력 `basis`를 받지 않고 `before_tax_yield`로 저장합니다. 기존 active 룰이 있으면 해당 룰을 수정하고, 신규 active 룰 생성 전에 같은 user/stock의 active 룰을 비활성화하거나 upsert 정책을 적용합니다.
2. **Pros**: MVP 정책과 UI가 가장 명확하게 일치합니다. 세후 수익률 계산/세금 오차에 따른 알림 혼란을 줄입니다.
3. **Cons / Risks**: 기존 `after_tax_yield` UI와 관련 테스트를 수정해야 합니다. 기존 데이터에 `after_tax_yield` active 룰이 있다면 정리 정책이 필요합니다.
4. **Recommended?**: 예.

### 방안 B: 내부 타입은 유지하되 UI에서만 `after_tax_yield`를 숨김

1. **Description**: `NOTIFICATION_RULE_BASES`와 평가 로직은 Phase 2 대비로 유지하되, `NOTIFICATION_RULE_BASIS_OPTIONS` 또는 페이지 레벨에서 `before_tax_yield`만 렌더링합니다. 서버 액션은 임시로 `after_tax_yield`를 거부하거나 관리자/테스트 전용으로만 허용합니다.
2. **Pros**: Phase 2 확장 여지를 남기면서 MVP UI는 단순화할 수 있습니다.
3. **Cons / Risks**: 서버 액션에서 차단하지 않으면 클라이언트 우회로 `after_tax_yield`가 저장될 수 있습니다.
4. **Recommended?**: 서버 차단까지 함께 한다면 대안으로 가능.

### 방안 C: 현재 세전/세후 기준 선택을 유지하고 문구만 보강

1. **Description**: 현재 UI를 유지하되 세후 수익률은 예상 세금 기반이며 실제와 다를 수 있다는 안내를 추가합니다.
2. **Pros**: 코드 변경이 작습니다.
3. **Cons / Risks**: 사용자가 요청한 MVP 정책과 다릅니다. 알림 설정 화면이 복잡해지고 세후 계산 책임이 커집니다.
4. **Recommended?**: 아니오.

## 관련 파일 (Related Files)

- `docs/dividend_calendar_mvp_plan.md` — 목표수익률 알림 MVP 정책.
- `docs/dividend_app_wireframe.md` — 목표 배당수익률 알림 설정 화면 와이어프레임.
- `docs/dividend_app_mvp_backend_spec.md` — `notification_rules.basis` 설명.
- `src/features/notifications/constants.ts` — 알림 룰 기준 enum 및 UI 옵션.
- `src/app/app/stocks/[stockId]/notification-rule/page.tsx` — 알림 룰 설정 폼과 active 룰 선택.
- `src/features/notifications/actions.ts` — 알림 룰 저장 검증 및 insert/update.
- `src/features/notifications/evaluation.ts` — 세전/세후 수익률 평가 로직.
- `src/features/notifications/constants.test.ts` — 알림 룰 기준 옵션 테스트.
- `src/features/notifications/evaluation.test.ts` — 세전/세후 수익률 계산 테스트.

## 라벨 제안 (Suggested Labels)

`ui`, `mvp-scope`, `notifications`, `product-consistency`, `high-priority`
