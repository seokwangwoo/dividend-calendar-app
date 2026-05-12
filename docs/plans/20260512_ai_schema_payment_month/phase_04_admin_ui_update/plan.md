# Phase 04: Admin UI Update

## Goal

Admin `/admin/dividend-reviews` 화면을 새 스키마에 맞춰 수정한다. AI抽出값에 `status`를 표시하고, `expected_payment_date`를 `expected_payment_year/month`로 대체하며, `fiscal_month`를 추가한다. 승인 폼도 동일하게 업데이트한다.

## Prerequisites

- Phase 03 Approval Pipeline and Server Logic Completion Criteria are met.
- `src/features/admin/actions.ts`의 서버 액션이 새 스키마를 따름

## Implementation Scope

- `src/app/admin/dividend-reviews/[eventId]/page.tsx` 수정
- `src/features/admin/review-queries.ts` 수정
- `src/features/admin/queries.ts` 수정 (dividend_events 목록/상세)
- `src/app/admin/dividend-reviews/page.tsx` 수정 (필요시)
- `src/app/admin/dividend-reviews/new/page.tsx` 수정 (필요시)

## Core Tasks

1. **리뷰 상세 페이지 (`[eventId]/page.tsx`)**
   - AI抽出값 섹션:
     - `field("支払予定日", review.extracted_payment_date)` 제거
     - `field("支払予定年", review.extracted_payment_year)` 추가
     - `field("支払予定月", review.extracted_payment_month ? \`${review.extracted_payment_month}月\` : null)` 유지
     - `field("決算月", review.extracted_fiscal_month ? \`${review.extracted_fiscal_month}月\` : null)` 추가
     - `field("状態", eventStatusLabel(review.status))` 추가 (AI抽出값에 status 표시)
     - `eventStatusLabel` 함수 추가: `estimated`→"予想", `confirmed`→"確定", `paid`→"支払済", `undecided`→"未定"
   - 승인 폼:
     - `expectedPaymentDate` input 제거
     - `expectedPaymentYear` number input 추가 (min=2000, max=2100, required={!review.extracted_payment_year})
     - `expectedPaymentMonth` input 유지
     - `fiscalMonth` number input 추가 (min=1, max=12)
     - `paymentYear` input 제거 (이미 Phase 03에서 제거됨)
     - `status` select 유지
   - `needsPaymentYear` 로직 변경: `!review.extracted_payment_year && review.event_type !== "annual_total"`일 때 "支払年は必須"

2. **리뷰 목록 쿼리 (`review-queries.ts`)**
   - `REVIEW_SELECT`에서 `extracted_payment_date` 제거, `extracted_payment_year`, `extracted_fiscal_month` 추가
   - `DividendReviewWithRelations` 타입 동기화

3. **dividend_events 관리 쿼리 (`queries.ts`)**
   - `DividendEventWithStock`에서 `expected_payment_date` 제거, `expected_payment_year`, `fiscal_month` 추가
   - `listDividendEvents`, `getDividendEventById`의 select 쿼리 수정
   - 필터에서 `paymentYear`를 `expected_payment_year`로 변경

4. **새 이벤트 생성 페이지 (`new/page.tsx`)**
   - `createDividendEvent` 호출 시 `paymentStartDate` 제거, `paymentYear`, `fiscalMonth` 추가
   - 폼 필드 동기화

## Test Plan

- `npm run lint`
- `npm run typecheck`
- Admin 리뷰 상세 페이지에서 AI抽出값에 `状態`(status)가 표시되는지 확인
- `支払予定年`, `支払予定月`, `決算月`이 정상 표시되는지 확인
- 승인 폼에서 `支払予定日` input이 없고, `支払予定年` input이 있는지 확인
- 승인 후 `/admin/dividend-reviews` 목록에서 새 필드가 반영되는지 확인

## Completion Criteria

- Admin 리뷰 상세 페이지의 AI抽出값에 `status`가 표시된다.
- `extracted_payment_date`가 UI에서 완전히 제거되고, `extracted_payment_year`, `extracted_fiscal_month`가 표시된다.
- 승인 폼이 새 스키마에 맞게 동작한다.
- `dividend_events` 관리 화면(목록, 상세)이 새 컬럼을 반영한다.

## Excluded From This Phase

- 사용자 facing 화면 수정 (Phase 06)
- 사용자 facing RPC 수정 (Phase 05)
- Supabase 타입 재생성 (Phase 07)
