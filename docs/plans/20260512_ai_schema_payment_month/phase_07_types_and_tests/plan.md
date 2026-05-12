# Phase 07: Types and Tests

## Goal

Supabase TypeScript 타입을 재생성하고, 단위 테스트 및 E2E 테스트 픽스처를 새 스키마에 맞춰 수정한다. 전체 빌드와 테스트가 통과하도록 한다.

## Prerequisites

- Phase 06 User-Facing UI Migration Completion Criteria are met.
- 모든 DB 마이그레이션이 로컬/원격에 적용 완료

## Implementation Scope

- `src/types/supabase.ts` 재생성
- `tests/fixtures/test-dividend-events.ts` 수정
- `tests/e2e/` 내 배당 이벤트 생성 헬퍼 수정
- 단위 테스트 수정
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test` 통과

## Core Tasks

1. **Supabase 타입 재생성**
   - `npx supabase gen types typescript --local > src/types/supabase.ts` (또는 원격 환경에 맞춰)
   - `supabase.ts`에서 `dividend_reviews`와 `dividend_events` 관련 타입이 새 컬럼을 반영하는지 확인
   - `expected_payment_date`가 제거되고, `expected_payment_year`, `fiscal_month`가 추가되었는지 확인

2. **테스트 픽스처 수정**
   - `tests/fixtures/test-dividend-events.ts`에서 `expectedPaymentDate` 제거, `expectedPaymentYear`, `fiscalMonth` 추가
   - 기본값 설정: `expectedPaymentYear: params.expectedPaymentYear ?? CURRENT_YEAR`, `expectedPaymentMonth: params.expectedPaymentMonth ?? CURRENT_MONTH`
   - `tests/e2e/helpers.ts`의 배당 이벤트 생성 헬퍼 동일하게 수정

3. **단위 테스트 수정**
   - `src/features/admin/queries.test.ts`, `src/features/holdings/queries.test.ts` 등에서 `expected_payment_date`를 참조하는 테스트 케이스 수정
   - `src/features/admin/validation.test.ts`에서 `validatePaymentYear` 테스트 추가/수정
   - `src/lib/dividend-calculation.ts` 등의 계산 로직이 `expected_payment_date`를 참조하면 수정

4. **E2E 테스트 수정**
   - `tests/e2e/verify-home-values.spec.ts`에서 배당 이벤트 픽스처 수정
   - `tests/e2e/verify-calendar-values.spec.ts` 수정
   - `tests/e2e/verify-portfolio-values.spec.ts` 수정
   - `tests/e2e/verify-stock-detail-values.spec.ts` 수정
   - 날짜 표시 검증(assertion)을 "YYYY年MM月" 형태로 변경

5. **빌드 및 테스트 통과**
   - `npm run lint` (zero warnings)
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:unit`
   - `npm run test:e2e` (필요시)

## Test Plan

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:unit`
- `npm run test:e2e` (로컬 dev 서버 기동 후)
- Admin 리뷰 승인/거부 E2E 시나리오 수행

## Completion Criteria

- `src/types/supabase.ts`가 새 스키마를 정확히 반영한다.
- 모든 테스트 픽스처와 E2E 테스트가 새 스키마를 따른다.
- `npm run lint`, `npm run typecheck`, `npm run build`가 모두 통과한다.
- `npm run test:unit`이 통과한다.
- (선택) `npm run test:e2e`가 통과한다.

## Excluded From This Phase

- 새로운 기능 추가
- 성능 최적화
- 문서화 (README, wireframe 등은 skill workflow Step 9에서 별도 업데이트)
