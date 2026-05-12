# Phase 05: User-Facing RPC Migration

## Goal

사용자 화면에서 사용하는 모든 Supabase RPC 및 쿼리를 `expected_payment_date`와 `payment_year`에서 `expected_payment_year`, `expected_payment_month`, `fiscal_month` 기반으로 마이그레이션한다.

## Prerequisites

- Phase 03 Approval Pipeline and Server Logic Completion Criteria are met.
- Phase 01 Database Schema Migration Completion Criteria are met.

## Implementation Scope

- `supabase/migrations/` 내 사용자 facing RPC 함수 수정
- `src/features/*/queries.ts` 수정
- `src/lib/supabase/` 내 관련 쿼리 수정
- `src/app/app/**/page.tsx` 내 서버 사이드 데이터 페칭 수정

## Core Tasks

1. **홈 화면 RPC 마이그레이션**
   - `get_home_summary()` 또는 동등한 RPC에서 `expected_payment_date` 참조 제거
   - `payment_year` 참조를 `expected_payment_year`로 변경
   - `expected_payment_month` 기반 집계 유지
   - 다음 배당 조회 시 `expected_payment_date >= current_date` → `expected_payment_year > extract(year from current_date) or (expected_payment_year = extract(year from current_date) and expected_payment_month >= extract(month from current_date))` 또는 유사 로직으로 변경
   - 날짜 비교가 복잡해지므로, `make_date(expected_payment_year, expected_payment_month, 1)`을 사용하여 비교하거나, 연도-월 별도 비교
   - 정렬: `expected_payment_year asc, expected_payment_month asc nulls last`

2. **캘린더 화면 RPC 마이그레이션**
   - `get_calendar_month()` 또는 동등한 RPC에서 `expected_payment_date` 기반 월 필터를 `expected_payment_month` 기반으로 변경
   - `payment_year` 기반 연도 필터를 `expected_payment_year` 기반으로 변경
   - 날짜 포맷팅(`to_char(expected_payment_date, ... )`) → `expected_payment_year`와 `expected_payment_month`를 문자열로 조합
   - `expected_payment_date`가 `null`일 때의 폼백 로직을 `expected_payment_month`만 있는 경우로 변경

3. **포트폴리오/종목 상세 RPC 마이그레이션**
   - 종목 상세에서 `expected_payment_date` 기반 정렬/필터를 `expected_payment_year`, `expected_payment_month` 기반으로 변경
   - `payment_year` 집계 키를 `expected_payment_year`로 변경
   - `get_stock_detail()` 또는 동등한 함수 수정

4. **src/features/queries.ts 마이그레이션**
   - `src/features/holdings/queries.ts`, `src/features/stocks/queries.ts`, `src/features/dividends/queries.ts` 등에서 `expected_payment_date`를 참조하는 select/update/insert 쿼리 수정
   - `payment_year`를 참조하는 쿼리 수정

5. **기타 사용자 facing 함수**
   - `evaluate_notification_rules` Edge Function이나 RPC에서 `expected_payment_date`를 사용하면 `expected_payment_year/month`로 변경
   - `notification` 생성 시 payload에 포함된 `expectedPaymentDate`를 `expectedPaymentYear/Month`로 변경 (단, 기존 알림과의 호환성은 고려할 필요 없음. 새 알림부터 적용)

## Test Plan

- `npm run lint`
- `npm run typecheck`
- `npx supabase db push` 후 RPC 함수가 오류 없이 생성되는지 확인
- Supabase Studio에서 `get_home_summary`, `get_calendar_month` 등 주요 RPC를 직접 호출하여 결과가 정상인지 확인
- 수동 검증: 로컬 dev 서버에서 홈, 캘린더, 포트폴리오 페이지가 데이터를 정상적으로 불러오는지 확인

## Completion Criteria

- 모든 사용자 facing RPC에서 `expected_payment_date`와 `payment_year` 참조가 제거된다.
- 홈, 캘린더, 포트폴리오, 종목 상세 데이터가 `expected_payment_year/month` 기반으로 정상 조회된다.
- `npm run build`가 성공한다.

## Excluded From This Phase

- Admin UI 수정 (Phase 04)
- 사용자 facing React 컴포넌트의 날짜 표시 로직 (Phase 06)
- Supabase 타입 재생성 (Phase 07)
