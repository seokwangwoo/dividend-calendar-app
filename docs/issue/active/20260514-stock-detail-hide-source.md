---
status: open
type: bug
created: 2026-05-14
resolved:
priority: medium
labels: [ui, stock-detail, data-source]
---

# 종목 상세 데이터 소스 미표시 필요

## 개요 (Overview)

현재 종목 상세 화면(`/app/stocks/[stockId]`)은 승인된 배당 이벤트의 데이터 소스 메타데이터를 화면 하단에 표시합니다. 화면에는 `データソース`, 검수 상태, 소스 종류, 소스 URL, 공표일이 그대로 렌더링됩니다. 데이터 소스 정보는 종목 상세 사용자 경험에 필요하지 않은 운영/검수용 메타데이터이므로, 종목 상세 화면에서는 역할과 무관하게 표시하지 않아야 합니다.

## 재현 방법 (Reproduction Steps)

1. 일반 사용자 계정으로 로그인합니다.
2. 승인된 배당 이벤트와 `source_type`, `source_url`, `source_published_at`이 있는 종목 상세 경로(`/app/stocks/[stockId]`)로 이동합니다.
3. [`tests/e2e/verify-stock-detail-values.spec.ts`](/home/seo/projects/dividend-calendar-app/tests/e2e/verify-stock-detail-values.spec.ts:156)의 현재 E2E 흐름처럼 `データソース` 섹션을 찾습니다.
4. 일반 사용자 화면에서 `検収済`, `tdnet`, `https://example.com/disclosure/kddi`, `公表日時`가 표시되는 것을 확인합니다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| 일반 사용자 route | `/app/stocks/[stockId]` |
| 현재 표시 섹션 | `データソース` |
| 현재 표시 필드 | `reviewStatus`, `sourceType`, `sourceUrl`, `sourcePublishedAt` |
| 현재 E2E 기대값 | 일반 사용자 로그인 후 `データソース`, `検収済`, `tdnet`, `https://example.com/disclosure/kddi`, `公表日時` 표시 |
| 요구 동작 | 종목 상세 화면에서 데이터 소스 섹션 미표시 |

### Root Data Comparison

| Table / Column | Current Behavior | Expected Behavior | Notes |
|----------------|------------------|-------------------|-------|
| `dividend_events.review_status` | `get_stock_detail` RPC가 `source.reviewStatus`로 반환하고 UI가 표시 | 종목 상세 UI에는 표시하지 않음 | 검수 상태는 운영 메타데이터 |
| `dividend_events.source_type` | `get_stock_detail` RPC가 `source.sourceType`으로 반환하고 UI가 표시 | 종목 상세 UI에는 표시하지 않음 | 예: `tdnet` |
| `dividend_events.source_url` | `get_stock_detail` RPC가 `source.sourceUrl`로 반환하고 UI가 링크 표시 | 종목 상세 UI에는 표시하지 않음 | 예: `https://example.com/disclosure/kddi` |
| `dividend_events.source_published_at` | `get_stock_detail` RPC가 `source.sourcePublishedAt`으로 반환하고 UI가 표시 | 종목 상세 UI에는 표시하지 않음 | 공표일도 소스 메타데이터 |

## 기술적 원인 분석 (Technical Root Cause)

- [`getStockDetail()`](/home/seo/projects/dividend-calendar-app/src/features/dividends/queries.ts:85)는 `get_stock_detail` RPC 결과를 그대로 `StockDetail`로 반환합니다.
- 최신 `get_stock_detail` RPC 정의는 승인된 이벤트 중 `source_type is not null`인 행을 찾아 `sourceType`, `sourceUrl`, `sourcePublishedAt`, `reviewStatus`를 `source` 객체로 반환합니다. 해당 함수는 `authenticated`에게 실행 권한이 있습니다.
- [`StockDetailPage`](/home/seo/projects/dividend-calendar-app/src/app/app/stocks/[stockId]/page.tsx:21)는 `const { stock, userHoldings, dividendSchedule, source } = detail`을 사용합니다.
- 같은 파일의 데이터 소스 렌더링 조건은 `source !== null`뿐입니다. 이 조건을 만족하면 종목 상세 화면에 `データソース` 섹션과 소스 URL 링크가 표시됩니다.
- [`tests/e2e/verify-stock-detail-values.spec.ts`](/home/seo/projects/dividend-calendar-app/tests/e2e/verify-stock-detail-values.spec.ts:156)는 데이터 소스 메타데이터가 보이는 것을 명시적으로 기대하므로, 요구사항 변경에 맞춰 테스트 기대값도 수정해야 합니다.

## 영향 범위 (Impact)

- **User experience**: 종목 상세 화면이 배당/보유 정보 외 운영자용 소스 메타데이터까지 포함해 화면 목적이 흐려집니다.
- **Affected screens**: `/app/stocks/[stockId]` 종목 상세 화면.
- **Tests**: `tests/e2e/verify-stock-detail-values.spec.ts`의 “stock detail shows source metadata” 케이스는 데이터 소스를 기대하므로 삭제하거나 비노출 검증으로 수정해야 합니다.
- **Data integrity**: 저장 데이터 자체는 잘못되지 않았습니다. 문제는 승인 이벤트 소스 메타데이터의 종목 상세 화면 표시입니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 1. 종목 상세 UI에서 데이터 소스 섹션 제거 (권장)

**Description**: `/app/stocks/[stockId]` 서버 컴포넌트에서 `source` 구조 분해와 `データソース` 섹션 렌더링 블록을 제거합니다. `get_stock_detail` RPC가 `source`를 반환하더라도 종목 상세 화면에서는 사용하지 않습니다.

**Pros**: 변경 범위가 작고 요구사항인 “종목 상세 화면에서 표시 안함”과 직접 일치합니다. role 조회가 필요 없고 기존 `get_stock_detail` RPC 응답 구조를 유지해 다른 호출부 영향이 작습니다.

**Cons / Risks**: RPC 응답에는 여전히 `source`가 포함됩니다. 화면 노출은 제거하지만, RPC 반환 데이터의 최소화까지 해결하는 방식은 아닙니다.

**Recommended?**: 예. 화면 요구사항을 가장 단순하게 만족합니다.

### 2. `get_stock_detail` RPC에서 `source` 반환 제거

**Description**: `get_stock_detail` RPC의 반환 JSON에서 `source` 필드를 제거하거나 항상 `null`로 반환합니다. `StockDetail` 타입과 관련 테스트를 함께 수정합니다.

**Pros**: 종목 상세 기능이 사용하는 데이터 계약에서 소스 메타데이터를 제거해 API/RPC 레벨에서도 불필요한 데이터 전달을 줄입니다.

**Cons / Risks**: 마이그레이션, Supabase 타입, `StockDetail` 타입, 통합 테스트 수정이 필요합니다. 다른 호출부가 `source`를 사용하고 있다면 영향 범위가 커질 수 있습니다.

**Recommended?**: 데이터 최소화까지 함께 처리할 때 선택할 수 있습니다.

### 3. 종목 상세에서는 제거하고 admin 검수 화면에서만 유지

**Description**: `/app/stocks/[stockId]`에서는 데이터 소스 섹션을 완전히 제거하고, 소스 메타데이터는 `/admin/dividend-reviews` 또는 별도 admin 상세 화면에서만 확인하도록 합니다.

**Pros**: 사용자 화면과 운영 화면의 책임이 명확히 분리됩니다.

**Cons / Risks**: 운영자가 종목 중심으로 소스 정보를 확인하는 워크플로가 있다면 admin 화면에 동일한 접근성을 보완해야 합니다.

**Recommended?**: admin 운영 화면의 소스 확인 UX를 함께 정리할 때 적합합니다.

## 구현 수용 기준 (Acceptance Criteria)

1. `/app/stocks/[stockId]`에 접근했을 때 `データソース` 섹션이 렌더링되지 않습니다.
2. 종목 상세 화면에는 `検収済`, `ソース種別`, `ソースURL`, `公表日時`가 표시되지 않습니다.
3. 데이터 소스 정보는 종목 상세가 아닌 admin 검수/운영 화면에서만 다룹니다.
4. E2E 또는 컴포넌트/서버 로직 테스트가 종목 상세 데이터 소스 비노출을 검증합니다.
5. 기존 배당 스케줄, 보유 정보, 목표利回り 링크 동작은 변경되지 않습니다.

## 관련 파일 (Related Files)

- [`src/app/app/stocks/[stockId]/page.tsx`](/home/seo/projects/dividend-calendar-app/src/app/app/stocks/[stockId]/page.tsx) — 종목 상세 화면과 데이터 소스 섹션 렌더링
- [`src/features/dividends/queries.ts`](/home/seo/projects/dividend-calendar-app/src/features/dividends/queries.ts) — `getStockDetail()` RPC 호출
- [`src/features/dividends/types.ts`](/home/seo/projects/dividend-calendar-app/src/features/dividends/types.ts) — `StockDetailSource` 타입
- [`supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql`](/home/seo/projects/dividend-calendar-app/supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql) — 최신 `get_stock_detail` RPC 정의
- [`tests/e2e/verify-stock-detail-values.spec.ts`](/home/seo/projects/dividend-calendar-app/tests/e2e/verify-stock-detail-values.spec.ts) — 현재 데이터 소스 노출 기대값
- [`tests/integration/stocks/stock-detail.test.ts`](/home/seo/projects/dividend-calendar-app/tests/integration/stocks/stock-detail.test.ts) — `get_stock_detail` source 반환 통합 테스트

## 라벨 제안 (Suggested Labels)

- `bug`
- `ui`
- `stock-detail`
- `data-source`
