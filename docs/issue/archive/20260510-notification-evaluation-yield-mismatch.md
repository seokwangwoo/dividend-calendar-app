---
status: resolved
resolved: 2026-05-12
type: bug
created: 2026-05-10
priority: medium
labels: [test-failure, data-consistency]
---

# 통합 테스트 실패: 알림 평가 시 `matched: 0` 반환

## 개요 (Overview)

`tests/integration/notifications/notifications-settings.test.ts`의 통합 테스트가 지속적으로 실패하고 있습니다. `evaluate_notification_rules` RPC를 호출했을 때, 배당 수익률 조건을 만족해야 하는 규칙이 `matched: 0`으로 평가되어 알림이 생성되지 않습니다. 이는 Phase 01/02 마이그레이션 적용 이후 `npm run test:integration`을 실행할 때 70개 통과 테스트 중 유일하게 실패하는 케이스입니다.

## 재현 방법 (Reproduction Steps)

1. 환경 변수를 설정한 뒤 통합 테스트를 실행합니다.
   ```bash
   RUN_REMOTE_TESTS=1 npm run test:integration
   ```
2. `tests/integration/notifications/notifications-settings.test.ts`의 다음 테스트가 실패합니다.
   - `notification rules, notifications, and settings > runs evaluation, creates an in-app notification, excludes disabled rules, and blocks duplicates`
3. 동일한 실패는 `npm run test:integration tests/integration/notifications/notifications-settings.test.ts`로 개별 실행핼 때도 재현됩니다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| `evaluate_notification_rules` 첫 번째 호출 (dry_run=false) | **예상**: `{ evaluated: 1, matched: 1, inserted: 1, deduplicated: 0 }` |
| | **실제**: `{ evaluated: 1, matched: 0, inserted: 0, deduplicated: 0 }` |

### Root Data Comparison

| Table / Column | 테스트 설정 값 | RPC 평가 시 사용 값 | Notes |
|----------------|---------------|---------------------|-------|
| `notification_rules.basis` | `before_tax_yield` | `before_tax_yield` | 테스트에서 직접 INSERT |
| `notification_rules.operator` | `gte` | `gte` | 테스트에서 직접 INSERT |
| `notification_rules.target_yield` | `3.5` | `3.5` | 테스트에서 직접 INSERT |
| `notification_rules.status` | `active` | `active` | 기본값 |
| `notification_rules.last_condition_met` | `false` (DEFAULT) | `false` | Phase 03 마이그레이션에서 추가된 컬럼 |
| `stocks.price_updated_at` | `new Date().toISOString()` | `stocks.price_updated_at` | 테스트 `beforeAll`에서 업데이트 |
| `stocks.current_price` | 시드 데이터 의존 | `v_rule.current_price` | `getTestStocks()`가 반환하는 시드 종목 |
| `stocks.expected_annual_dividend_per_share` | 시드 데이터 의존 | `v_rule.expected_annual_dividend_per_share` | `getTestStocks()`가 반환하는 시드 종목 |
| `holdings.account_type` | `nisa` | `v_account_type` | 테스트 `beforeAll`에서 INSERT. NISA는 세율 0% |

> 테스트는 `getTestStocks()`로 시드 데이터의 supported 종목을 가져와 사용합니다. 해당 종목의 `current_price`와 `expected_annual_dividend_per_share` 값에 따라 yield 계산 결과가 결정됩니다.

## 기술적 원인 분석 (Technical Root Cause)

### 1. RPC 평가 로직

`evaluate_notification_rules` (`supabase/migrations/20260507003000_phase_03_price_refresh_and_alert_reliability.sql`)의 핵심 평가 흐름:

```sql
-- Stale price suppression
if v_rule.price_updated_at is null
   or v_rule.price_updated_at < v_now - make_interval(hours => v_stale_threshold_hours)
then
  v_skipped_stale := v_skipped_stale + 1;
  continue;
end if;

-- Missing yield data suppression
if v_rule.expected_annual_dividend_per_share is null
  or v_rule.current_price is null
  or v_rule.current_price <= 0
then
  continue;
end if;

-- Yield calculation
v_before_tax_yield :=
  (v_rule.expected_annual_dividend_per_share / v_rule.current_price) * 100;

-- State-transition deduplication (Phase 03 추가)
if v_rule.last_condition_met and v_condition_met then
  v_deduplicated := v_deduplicated + 1;
  continue;
end if;
```

### 2. 관찰된 현상

- `evaluated: 1` → 규칙은 조회되었고 평가 루프에 들어갔음
- `matched: 0` → yield 조건이 충족되지 않았거나, `skipped_stale`/`skipped_missing_yield`로 `continue`됨
- `deduplicated: 0` → Phase 03의 `last_condition_met` deduplication은 아님

### 3. 가능한 원인

**원인 A: 시드 종목의 yield가 3.5% 미만**
- `getTestStocks()`는 `expected_annual_dividend_per_share is not null`인 첫 번째 supported 종목을 반환합니다.
- 만약 해당 종목의 `current_price`가 높거나 `expected_annual_dividend_per_share`가 낮아 `yield < 3.5%`이면, `v_condition_met`이 `false`가 되어 `not_matched`로 분류됩니다.
- 예: `expected_annual_dividend_per_share = 100`, `current_price = 3000` → yield = 3.33% (< 3.5%)

**원인 B: `current_price` 또는 `expected_annual_dividend_per_share`가 유효하지 않음**
- `current_price <= 0`이거나 `expected_annual_dividend_per_share is null`이면 평가가 `skipped_missing_yield`로 걸러집니다.
- `getTestStocks()`는 `expected_annual_dividend_per_share`가 null이 아닌 종목만 찾지만, `current_price`는 null이나 0일 수 있습니다.

**원인 C: `price_updated_at`이 실제로 업데이트되지 않았거나 stale로 판정**
- 테스트 `beforeAll`에서 `price_updated_at`을 업데이트하지만, `getTestStocks()`의 캐싱(`_supported`)이나 DB 트랜잭션 타이밍 문제로 인해 RPC가 이전 값을 볼 수 있습니다.
- 이 경우 `skipped_stale`이 증가합니다. (결과 JSON의 `skippedStale` 값을 확인하면 확실히 알 수 있습니다.)

> 정확한 root cause는 `getTestStocks()`가 반환하는 종목의 실제 DB 값과 `evaluate_notification_rules`의 상세 결과(`results[]` 배열)를 확인해야 합니다.

## 영향 범위 (Impact)

- **User experience**: 직접적인 사용자 영향은 없음. 테스트 환경의 문제입니다.
- **Affected screens**: CI/CD 파이프라인에서 통합 테스트가 실패합니다.
- **Tests**: `npm run test:integration`이 1건 실패하여 전체 성공 여부를 깨뜨립니다.
- **Data integrity**: 시드 데이터와 테스트 기대값 간 불일치, 또는 Phase 03 마이그레이션 이후 `last_condition_met` 기본값이 기존 데이터에 영향을 준 가능성.

## 제안하는 해결 방향 (Proposed Solutions)

### 해결 방안 1: 테스트 종목의 값을 명시적으로 설정 (권장)

**설명**: 테스트 `beforeAll`에서 `getTestStocks()`로 가져온 종목의 `current_price`와 `expected_annual_dividend_per_share`를 명시적으로 설정하여, 테스트 규칙(`gte 3.5%`)이 반드시 만족되도록 보장합니다.

```ts
await admin.from("stocks").update({
  current_price: 2000,
  expected_annual_dividend_per_share: 100,
  price_updated_at: new Date().toISOString()
}).eq("id", stockId);
```

**장점**:
- 테스트가 시드 데이터에 의존하지 않고 독립적으로 실행됩니다.
- 다른 환경(로컬, 스테이징, CI)에서도 항상 동일한 결과를 보장합니다.

**단점 / 리스크**:
- 기존 시드 데이터를 덮어쓰므로, 해당 종목을 사용하는 다른 테스트에 영향을 줄 수 있습니다. (현재는 다른 통합 테스트가 모두 통과하므로 즉각적인 영향은 없음)

### 해결 방안 2: 테스트 규칙의 target_yield를 동적으로 계산

**설명**: 테스트 실행 시점의 종목 데이터를 조회하여, 실제 yield보다 낮은 `target_yield`를 설정합니다.

```ts
const { data: stock } = await admin.from("stocks")
  .select("current_price, expected_annual_dividend_per_share")
  .eq("id", stockId)
  .single();
const actualYield = (stock.expected_annual_dividend_per_share / stock.current_price) * 100;
// target_yield를 actualYield보다 낮게 설정
```

**장점**:
- 시드 데이터가 변경되어도 테스트가 깨지지 않습니다.

**단점 / 리스크**:
- 테스트가 복잡해지고, 테스트 목적("3.5% 이상 시 알림 생성")이 모호해집니다.
- `current_price`가 0이나 null이면 여전히 실패할 수 있습니다.

### 해결 방안 3: Phase 03 마이그레이션의 `last_condition_met` 기본값 영향 점검

**설명**: Phase 03 마이그레이션(`20260507003000_phase_03_price_refresh_and_alert_reliability.sql`)에서 `notification_rules.last_condition_met boolean not null default false`를 추가했습니다. 하지만 만약 마이그레이션이 `default false` 없이 추가되었거나, 기존 데이터에 이상한 값이 남아있다면 state transition 로직이 예상과 다르게 작동할 수 있습니다.

**장점**:
- 데이터베이스 스키마 문제라면 근본적으로 해결합니다.

**단점 / 리스크**:
- 실제로는 `matched: 0`이 `not_matched`이거나 `skipped_stale`일 가능성이 더 높아보입니다. (`deduplicated: 0`이므로)

## 관련 파일 (Related Files)

- `tests/integration/notifications/notifications-settings.test.ts` — 실패하는 통합 테스트
- `tests/fixtures/test-stock.ts` — `getTestStocks()` 헬퍼, 시드 데이터 의존
- `tests/helpers/test-users.ts` — 테스트 사용자 생성
- `supabase/migrations/20260507003000_phase_03_price_refresh_and_alert_reliability.sql` — `evaluate_notification_rules` RPC 정의
- `src/features/notifications/evaluation.test.ts` — 관련 단위 테스트 (통과 중)
- `src/types/supabase.ts` — `notification_rules`, `stocks`, `notifications` 타입 정의

## 라벨 제안 (Suggested Labels)

- `bug`
- `test-failure`
- `data-consistency`
- `medium-priority`
