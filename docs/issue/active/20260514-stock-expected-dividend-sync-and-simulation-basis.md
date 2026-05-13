---
status: open
type: bug
created: 2026-05-14
resolved:
priority: high
labels: [data-consistency, dividends, ui, notification]
---

# 승인 배당 이벤트 기반 종목 예상 배당 동기화 및 산식 근거 표시 필요

## 개요 (Overview)

`dividend_events`에 승인된 배당 이벤트가 있어도 `stocks.expected_annual_dividend_per_share`와 `stocks.expected_dividend_yield`가 NULL로 남아 종목 상세, 종목 검색, 포트폴리오 보유 추가/수정 시뮬레이션, 목표 수익률 알림 설정에서 배당 데이터가 없는 것처럼 표시된다. `dividend_events`를 원본 데이터로 유지하되 `stocks`의 예상 배당/수익률 컬럼을 최신 승인 이벤트 기준 캐시로 동기화하고, UI에는 시뮬레이션 산식 근거(예: `2026/중간 + 2026/기말`)를 함께 표시해야 한다.

## 재현 방법 (Reproduction Steps)

1. Supabase 연결 DB에서 `4307` 종목을 조회한다.
2. `dividend_events`에서 `stock_id`가 `4307`인 승인 이벤트를 확인한다.
3. `stocks`의 `expected_annual_dividend_per_share`, `expected_dividend_yield` 값을 확인한다.
4. `/app/stocks/search`에서 `4307`을 검색하고 예상 수익률 표시를 확인한다.
5. `/app/stocks/<4307 stock id>` 종목 상세에서 `予想年間配当/株`, `予想配当利回り`, 알림 설정 링크 상태를 확인한다.
6. `/app/portfolio/new?stockId=<4307 stock id>`에서 보유 추가 시뮬레이션이 표시되는지 확인한다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| `4307 野村総合研究所` approved dividend events | FY2026 interim `35.00`, FY2026 year_end `42.00` |
| Expected annual dividend from approved events | `77.00` |
| `stocks.expected_annual_dividend_per_share` | `NULL` |
| `stocks.expected_dividend_yield` | `NULL` |
| `stocks.current_price` | `4340.00` |
| Expected yield if synchronized | `77 / 4340 * 100 = 1.7742%` |

### Root Data Comparison

| Table / Column | Value | Notes |
|----------------|-------|-------|
| `stocks.ticker` | `4307` | 野村総合研究所 |
| `stocks.support_status` | `supported` | `auto_promote_stock_on_approval()`로 supported 전환됨 |
| `stocks.expected_annual_dividend_per_share` | `NULL` | 종목 상세/검색/알림 설정/시뮬레이션에서 참조 |
| `stocks.expected_dividend_yield` | `NULL` | 종목 검색 예상 수익률 표시에서 참조 |
| `dividend_events.review_status` | `approved` | 승인 이벤트 존재 |
| `dividend_events.fiscal_year = 2026, event_type = interim` | `35.00` | 지급 연월 `2025-12` |
| `dividend_events.fiscal_year = 2026, event_type = year_end` | `42.00` | 지급 연월 `2026-06` |

연결 DB 집계 결과, 승인 이벤트가 있는 종목은 `16`개이고 그중 `stocks.expected_annual_dividend_per_share IS NULL`인 종목은 `6`개다. 해당 `6`개는 모두 NULL이지만 승인된 배당 금액 합계가 존재한다.

## 기술적 원인 분석 (Technical Root Cause)

- 승인 Edge Function은 `approve_dividend_review_for_reviewer` RPC를 호출한다.
- `approve_dividend_review_for_reviewer`는 `dividend_events`를 insert/update하고 `dividend_reviews` 상태를 `approved`로 갱신하지만, `stocks.expected_annual_dividend_per_share` 또는 `stocks.expected_dividend_yield`를 재계산하지 않는다.
- `dividend_events`에 연결된 현재 트리거는 다음 두 종류다.
  - `auto_promote_stock_trigger`: 승인 이벤트가 생기면 `stocks.support_status`를 `supported`로 승격
  - `set_dividend_events_updated_at`: `updated_at` 갱신
- `auto_promote_stock_on_approval()`는 `support_status`만 갱신한다.

```sql
if new.review_status = 'approved' then
  update public.stocks
  set support_status = 'supported'
  where id = new.stock_id
    and support_status = 'unsupported';
end if;
```

남아 있는 `stocks` 참조 경로는 다음과 같이 NULL을 그대로 “배당 데이터 없음”으로 해석한다.

- 종목 상세: `stock.expectedAnnualDividendPerShare`와 `stock.expectedDividendYield`를 표시한다.
- 종목 검색: `stock.expected_dividend_yield == null`이면 `配当データ確保中`을 표시한다.
- 알림 설정 페이지: `stock.expected_annual_dividend_per_share != null`일 때만 입력 컨트롤과 저장 버튼을 활성화한다.
- 알림 저장 액션: `expected_annual_dividend_per_share == null`이면 저장을 거부한다.
- 보유 추가/수정 시뮬레이션: `expected_annual_dividend_per_share == null`이면 배당 금액/수익률을 계산하지 않는다.

## 영향 범위 (Impact)

- **User experience**: 승인된 배당 데이터가 있음에도 종목 상세와 보유 추가 화면에서 배당 데이터가 없는 것처럼 보인다.
- **Affected screens**:
  - `/app/stocks/search`
  - `/app/stocks/[stockId]`
  - `/app/stocks/[stockId]/notification-rule`
  - `/app/portfolio/new`
  - `/app/portfolio/[holdingId]/edit`
- **Notifications**: 목표 수익률 알림을 새로 설정할 수 없고, 기존 active rule 평가도 `skipped_missing_yield`로 빠질 수 있다.
- **Data integrity**: 원본 `dividend_events` 데이터는 존재하지만 `stocks`의 요약/캐시 컬럼이 동기화되지 않아 read model이 stale 상태가 된다.
- **Tests**: `stocks.expected_annual_dividend_per_share`가 seed/import 상태에 의존하면 승인 파이프라인 테스트와 UI 값 검증 테스트가 실제 승인 이벤트와 다른 값을 보게 된다.

## 제안하는 해결 방향 (Proposed Solutions)

### 1. `stocks` 예상 배당/수익률을 승인 이벤트 기반 캐시로 동기화 (권장)

**Description**: `recalculate_stock_expected_dividend(p_stock_id uuid)` DB 함수를 추가하고, `dividend_events` insert/update/delete 후 해당 종목의 `stocks.expected_annual_dividend_per_share`와 `stocks.expected_dividend_yield`를 재계산한다. 기존 데이터에는 backfill을 실행한다.

계산 규칙:

1. `review_status = 'approved'`인 이벤트만 사용한다.
2. 기본 기준은 해당 종목의 최신 `fiscal_year`다.
3. 최신 `fiscal_year`에 `annual_total` 승인 이벤트가 있고 `dividend_per_share`가 NULL이 아니면 그 값을 우선 사용한다.
4. `annual_total`이 없으면 `interim + year_end`를 합산한다.
5. 최신 `fiscal_year`에 `interim`만 있고 `year_end`가 없으면, 직전 `fiscal_year`의 최신 approved `year_end`를 보완값으로 합산한다.
6. 최신 `fiscal_year`에 `year_end`만 있으면 해당 `year_end` 값을 사용한다.
7. `special`, `commemorative`, `other`는 기본 예상 연간 배당 계산에서 제외한다.
8. `dividend_per_share = 0`은 NULL이 아니라 `0`으로 저장한다.
9. 계산 가능한 승인 금액이 없으면 `expected_annual_dividend_per_share`는 NULL로 둔다.
10. `current_price > 0`이면 `expected_dividend_yield = expected_annual_dividend_per_share / current_price * 100`으로 저장하고, 아니면 NULL로 둔다.

UI 근거 표시:

- `interim + year_end`: `2026/중간 + 2026/기말`
- 최신 FY interim + 직전 FY year_end 보완: `2026/중간 + 2025/기말(전기말 대체)`
- annual_total 우선 사용: `2026/年間合計`
- year_end 단독: `2026/기말`

**Pros**:

- `dividend_events`를 원본으로 유지하면서 검색/상세/알림/시뮬레이션에 필요한 빠른 read model을 제공한다.
- 알림 평가와 UI disabled 조건을 크게 바꾸지 않아도 된다.
- 기존 NULL 데이터는 backfill로 즉시 회복할 수 있다.
- 산식 근거를 UI에 노출해 “왜 이 연간 배당으로 계산했는지”를 사용자가 확인할 수 있다.

**Cons / Risks**:

- `annual_total`, `interim`, `year_end`, 직전 FY 보완 규칙을 DB 함수와 UI 타입에 명확히 반영해야 한다.
- `expected_dividend_yield`의 단위가 현재 코드에서 혼재되어 있으므로 `% 값` 저장인지 `ratio` 저장인지 정리해야 한다.
- 가격 갱신 시 `expected_dividend_yield`도 재계산되어야 하므로 가격 refresh 경로와의 연결이 필요하다.

**Recommended?**: Yes.

### 2. 남은 UI/알림 경로를 모두 `dividend_events` 직접 조회로 변경

**Description**: `stocks.expected_annual_dividend_per_share`와 `stocks.expected_dividend_yield`를 사용하지 않고, 종목 상세/검색/알림 설정/보유 시뮬레이션에서 최신 승인 이벤트를 직접 집계한다. 동일한 집계 규칙을 RPC 또는 view로 제공한다.

**Pros**:

- stale cache 문제가 사라진다.
- 원본 데이터와 표시 데이터가 항상 같은 쿼리에서 계산된다.

**Cons / Risks**:

- 검색 결과와 알림 평가처럼 많은 종목을 빠르게 조회하는 경로의 쿼리가 복잡해진다.
- 클라이언트/서버 여러 경로에서 같은 계산 규칙을 중복 구현할 위험이 있다.
- 현재 `stocks` 기반 타입과 UI 분기가 많이 남아 있어 변경 범위가 크다.

**Recommended?**: No. 장기적으로는 view/RPC로 통합할 수 있지만, 현재 수정 범위 대비 위험이 크다.

### 3. Backfill만 수행

**Description**: 현재 NULL인 종목에 대해 일회성 SQL로 `stocks.expected_annual_dividend_per_share`와 `stocks.expected_dividend_yield`를 채운다.

**Pros**:

- 즉시 4307, 3648 등 현재 NULL 사례를 회복할 수 있다.
- 구현이 가장 작다.

**Cons / Risks**:

- 다음 승인 이벤트 insert/update/delete 후 다시 stale 상태가 된다.
- 직전 FY year_end 보완 규칙과 UI 근거 표시 요구사항을 해결하지 못한다.

**Recommended?**: No. 트리거/함수 배포 전 임시 운영 조치로만 적합하다.

## 관련 파일 (Related Files)

- `supabase/migrations/20260513030000_ai_schema_payment_month_phase_03.sql` — `approve_dividend_review_for_reviewer`가 `dividend_events`만 갱신하는 승인 RPC
- `supabase/migrations/20260511000400_phase_05_support_policy_and_notification_expansion.sql` — `auto_promote_stock_on_approval()`와 `calculate_holding_dividend`
- `supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql` — `get_stock_detail`, `get_portfolio_summary`
- `src/app/app/stocks/search/page.tsx` — 검색 결과 예상 수익률 표시
- `src/app/app/stocks/[stockId]/page.tsx` — 종목 상세 예상 연간 배당/수익률 및 알림 링크
- `src/app/app/stocks/[stockId]/notification-rule/page.tsx` — 알림 설정 UI disabled 조건
- `src/features/notifications/actions.ts` — 알림 저장 시 배당 데이터 존재 여부 검증
- `src/features/notifications/evaluation.ts` — 목표 수익률 평가
- `src/features/holdings/components/new-holding-form.tsx` — 보유 추가 시뮬레이션
- `src/features/holdings/components/edit-holding-form.tsx` — 보유 수정 시뮬레이션
- `src/lib/dividends/calculations.ts` — 클라이언트 예상 배당/수익률 계산
- `tests/integration/admin/phase-05-approval-pipeline.test.ts` — 승인 파이프라인 관련 테스트
- `tests/e2e/verify-stock-detail-values.spec.ts` — 종목 상세 값 검증

## 라벨 제안 (Suggested Labels)

- `bug`
- `data-consistency`
- `dividends`
- `ui`
- `notification`
- `high-priority`
