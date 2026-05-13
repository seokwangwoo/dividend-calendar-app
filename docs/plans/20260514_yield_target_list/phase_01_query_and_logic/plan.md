# Phase 01: Query and Logic

## Goal

목표 수익률 목록 페이지에 필요한 데이터 조회 쿼리와 달성 여부 계산 로직을 구현합니다. 이 phase가 완료되면 UI를 붙일 수 있는 데이터 레이어가 준비됩니다.

## Prerequisites

- `notification_rules` 테이블과 `stocks` 테이블이 존재하고 RLS가 활성화되어 있다.
- `src/features/notifications/queries.ts`에 기존 쿼리 함수가 있다.
- Supabase 서버 클라이언트(`src/lib/supabase/server.ts`)가 존재한다.

## Implementation Scope

- `src/features/notifications/queries.ts`에 `getActiveYieldTargets` 함수 추가.
  - 현재 사용자의 `notification_rules` (status='active') 를 `stocks`와 조인하여 반환.
  - 반환 필드: `ruleId`, `stockId`, `stockName`, `ticker`, `operator`, `targetYield`, `expectedDividendYield`.
  - `expectedDividendYield`는 `stocks.expected_dividend_yield` (null 허용).
- `src/features/notifications/yield-target.ts` 신규 파일 생성.
  - `calculateAchieved(operator, targetYield, currentYield)` 순수 함수 구현.
  - `operator = 'gte'`: `currentYield !== null && currentYield >= targetYield` 이면 `true`.
  - `operator = 'lte'`: `currentYield !== null && currentYield <= targetYield` 이면 `true`.
  - `currentYield`가 `null`이면 항상 `false`.
- `src/features/notifications/yield-target.test.ts` 작성.
  - `gte` 달성 / 미달성 / null yield 케이스.
  - `lte` 달성 / 미달성 / null yield 케이스.

## Core Tasks

1. **`getActiveYieldTargets` 쿼리 추가**
   - `src/features/notifications/queries.ts`에 함수 추가.
   - `supabase.from('notification_rules').select('id, stock_id, operator, target_yield, stocks(id, name, ticker, expected_dividend_yield)').eq('status', 'active').order('created_at', { ascending: false })` 형태로 구현.
   - 반환 타입을 명시적으로 정의한다.

2. **`calculateAchieved` 순수 함수 작성**
   - `src/features/notifications/yield-target.ts` 신규 파일.
   - `operator: 'gte' | 'lte'`, `targetYield: number`, `currentYield: number | null` 입력.
   - `boolean` 반환.

3. **단위 테스트 작성**
   - `src/features/notifications/yield-target.test.ts` 신규 파일.
   - 6개 케이스: gte 달성, gte 미달성, gte + null yield, lte 달성, lte 미달성, lte + null yield.

## Test Plan

- `npm run typecheck` — 타입 오류 없음 확인.
- `npm run test` — `yield-target.test.ts` 6개 케이스 전부 통과 확인.
- `npm run lint` — lint 오류 없음 확인.

## Completion Criteria

- `getActiveYieldTargets`를 서버 컴포넌트에서 호출하면 현재 사용자의 활성 알림 룰 목록이 stock 정보와 함께 반환된다.
- `calculateAchieved`가 `gte`/`lte` operator와 null yield를 모두 올바르게 처리한다.
- `npm run test` 가 통과한다.
- `npm run typecheck` 가 통과한다.

## Excluded From This Phase

- UI 구현 (페이지, 카드, 배지).
- 설정 페이지 변경.
- 데이터베이스 스키마 변경.
