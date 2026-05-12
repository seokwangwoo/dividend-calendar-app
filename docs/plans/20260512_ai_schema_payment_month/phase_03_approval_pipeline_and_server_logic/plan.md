# Phase 03: Approval Pipeline and Server Logic

## Goal

Admin 리뷰 승인/거부 파이프라인을 새 스키마에 맞춰 수정한다. `expected_payment_date`와 `payment_year`를 참조하는 모든 SQL 함수와 서버 액션을 제거하거나 `expected_payment_year/month`로 대체한다.

## Prerequisites

- Phase 02 AI Parser Schema and Prompt Completion Criteria are met.
- `dividend_reviews`와 `dividend_events`의 스키마가 Phase 01 기준으로 마이그레이션 완료

## Implementation Scope

- `approve_dividend_review_for_reviewer` 및 `approve_dividend_review` SQL 함수 수정
- `derive_payment_year_from_review` SQL 함수 제거
- `reject_dividend_review_for_reviewer` 및 `reject_dividend_review` SQL 함수 확인/수정
- `src/features/admin/actions.ts` 수정
- `src/features/admin/validation.ts` 수정
- `src/features/admin/review-actions.ts` (있는 경우) 수정

## Core Tasks

1. **approve_dividend_review SQL 함수 수정**
   - `v_payment_date` 변수 제거
   - `v_payment_year` 변수 제거 (또는 `v_expected_payment_year`로 대체)
   - `v_expected_payment_year`와 `v_expected_payment_month`를 override 및 review 컬럼에서 해석
   - override JSON 키 변경: `expectedPaymentDate` 제거, `expectedPaymentYear` 추가
   - `dividend_events` insert/update 시 `expected_payment_date` 제거, `expected_payment_year`, `fiscal_month` 추가
   - `dividend_events` insert 시 `payment_year` 제거
   - `v_fiscal_month`를 review에서 가져오거나 override에서 해석하여 `dividend_events.fiscal_month`에 삽입
   - 승인 시 `expected_payment_year`가 `null`이면 오류 발생 (user-facing event는 연도가 필요)
   - `expected_payment_month`가 `null`이어도 승인 가능하나, UI에서 권장

2. **derive_payment_year_from_review 함수 제거**
   - 해당 함수를 호출하는 모든 곳 제거
   - 마이그레이션 파일에 `drop function if exists public.derive_payment_year_from_review(date, int);` 추가

3. **reject 관련 함수 확인**
   - `reject_dividend_review` 및 `reject_dividend_review_for_reviewer`는 payment_date를 직접 다루지 않으므로, 대부분 그대로 유지 가능
   - 다만 `batch_reject` 등 관련 Edge Function이 `payment_year`를 다루지 않는지 확인

4. **src/features/admin/actions.ts 수정**
   - `CreateDividendEventInput`에서 `paymentStartDate?: string | null` 제거, `paymentYear?: number | null`, `fiscalMonth?: number | null` 추가
   - `createDividendEvent`에서 `expected_payment_date` 제거, `expected_payment_year`, `fiscal_month` 매핑
   - `payment_year` 제거

5. **src/features/admin/validation.ts 수정**
   - `validatePaymentYear`는 `expected_payment_year` 용으로 이름만 변경하거나, 범위 검증(2000~2100) 유지
   - `validateMonth`는 그대로 유지 (1~12)
   - `validateFiscalMonth` 추가 (1~12)

6. **src/features/admin/review-actions.ts 확인**
   - `approveDividendReview`의 override 타입에서 `expectedPaymentDate` 제거, `expectedPaymentYear` 추가
   - `rejectDividendReview`는 그대로 유지

## Test Plan

- `npm run lint`
- `npm run typecheck` (타입 미생성 상태이면 수동 확인)
- Admin 화면에서 리뷰 승인 시 `dividend_events`에 `expected_payment_year`, `expected_payment_month`, `fiscal_month`가 정확히 기록되는지 DB에서 확인
- `expected_payment_year`가 `null`인 리뷰를 승인하려 할 때 오류가 발생하는지 확인
- 거부 시 기존과 동일하게 동작하는지 확인

## Completion Criteria

- `approve_dividend_review` 함수가 `expected_payment_date`와 `payment_year`를 참조하지 않는다.
- 승인 시 `dividend_events`에 `expected_payment_year`, `expected_payment_month`, `fiscal_month`가 삽입된다.
- `derive_payment_year_from_review` 함수가 제거된다.
- `src/features/admin/actions.ts`의 `createDividendEvent`가 새 스키마를 따른다.

## Excluded From This Phase

- Admin UI 컴포넌트 수정 (Phase 04)
- 사용자 facing RPC/UI 수정 (Phase 05~06)
- Supabase 타입 재생성
