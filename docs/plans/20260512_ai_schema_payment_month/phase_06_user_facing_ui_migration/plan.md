# Phase 06: User-Facing UI Migration

## Goal

사용자 화면의 React 컴포넌트에서 `expected_payment_date`를 참조하는 모든 날짜 표시, 정렬, 필터 로직을 `expected_payment_year/month` 기반으로 마이그레이션한다.

## Prerequisites

- Phase 05 User-Facing RPC Migration Completion Criteria are met.
- `npm run build`가 성공하여 타입 오류가 없음

## Implementation Scope

- `src/app/app/home/` 페이지 및 컴포넌트
- `src/app/app/calendar/` 페이지 및 컴포넌트
- `src/app/app/portfolio/` 페이지 및 컴포넌트
- `src/app/app/stocks/[id]/` 페이지 및 컴포넌트
- `src/components/` 내 배당 이벤트 카드, 리스트 아이템 등

## Core Tasks

1. **홈 화면 (`src/app/app/home/`)**
   - 다음 배당 섹션: `expected_payment_date`를 `expected_payment_year/month`로 변경하여 "2026年6月" 형태로 표시
   - 현재 월 배당 목록: 날짜 대신 "6月予定" 또는 "2026年6月予定" 형태로 표시
   - `expected_payment_date` 기준 D-day 계산이 있었다면, `make_date(expected_payment_year, expected_payment_month, 1)` 기준으로 월 단위 D-day로 변경 또는 제거

2. **캘린더 화면 (`src/app/app/calendar/`)**
   - 월별 배당 목록에서 날짜 표시를 `expected_payment_year/month` 기반으로 변경
   - "YYYY年MM月DD日" → "YYYY年MM月" 또는 "MM月予定"
   - `expected_payment_month`만 있고 `expected_payment_year`는 연도 필터와 동일한 경우 "MM月予定"
   - 연도 필터 변경 시 `payment_year` → `expected_payment_year` 연동 확인

3. **포트폴리오 화면 (`src/app/app/portfolio/`)**
   - 보유 종목별 배당 목록에서 날짜 표시 변경
   - 정렬 기준 변경

4. **종목 상세 화면 (`src/app/app/stocks/[id]/`)**
   - 배당 이력/예정 목록에서 날짜 표시 변경
   - `expected_payment_date` 기반 정렬을 `expected_payment_year`, `expected_payment_month` 기반으로 변경

5. **공통 컴포넌트**
   - `DividendEventCard`, `DividendListItem` 등 공통 컴포넌트가 `expected_payment_date` prop을 받으면 `expected_payment_year/month` prop으로 변경
   - 날짜 포맷 유틸리티 함수(`formatPaymentDate`)를 수정하거나, 새 유틸리티(`formatPaymentYearMonth`) 추가

## Test Plan

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- 수동 검증:
  - `/app/home`에서 다음 배당과 현재 월 배당이 정상 표시되는지 확인
  - `/app/calendar`에서 월별 배당이 정상 표시되고, 연도 필터가 동작하는지 확인
  - `/app/portfolio`에서 보유 종목 배당 정보가 정상 표시되는지 확인
  - `/app/stocks/[id]`에서 종목 상세 배당 정보가 정상 표시되는지 확인

## Completion Criteria

- 사용자 화면에서 `expected_payment_date`를 참조하는 코드가 완전히 제거된다.
- 홈, 캘린더, 포트폴리오, 종목 상세의 배당 지급 시기가 `expected_payment_year/month` 기반으로 정상 표시된다.
- `npm run build`가 성공한다.

## Excluded From This Phase

- Admin UI 수정 (Phase 04)
- Supabase 타입 재생성 (Phase 07)
- E2E 테스트 수정 (Phase 07)
