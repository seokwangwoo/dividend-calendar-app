# Phase 02: UI

## Goal

목표 수익률 목록 페이지와 설정 탭 진입점을 구현합니다. 사용자는 설정 탭에서 버튼을 눌러 활성 목표 수익률이 설정된 종목 목록을 확인하고, 각 카드에서 현재 수익률 대비 달성 여부를 볼 수 있습니다.

## Prerequisites

- Phase 01 Completion Criteria가 충족되어 있다.
  - `getActiveYieldTargets` 함수가 동작한다.
  - `calculateAchieved` 함수가 테스트 통과 상태다.
- `/app/settings/page.tsx`가 존재한다.
- `Badge`, `Card`, `EmptyState`, `PageHeader` UI 컴포넌트가 존재한다.
- `/app/stocks/[stockId]/page.tsx` 라우트가 존재한다.

## Implementation Scope

- `/app/settings/yield-targets/page.tsx` 신규 파일 생성 (Server Component).
  - `getActiveYieldTargets`를 호출하여 활성 룰 목록을 가져온다.
  - 각 항목에 대해 `calculateAchieved`로 달성 여부를 계산한다.
  - 카드 목록 또는 빈 상태를 렌더링한다.
- 카드 레이아웃:
  - 왼쪽: 종목명 + 티커 (소문자 텍스트).
  - 오른쪽: 현재 수익률 (굵게) / 목표 `operator` `target_yield`% (작은 텍스트).
  - 하단 또는 우측 상단: 달성 배지 (`Badge variant="success"` / `variant="neutral"`).
  - `stocks.expected_dividend_yield`가 null이면 현재 수익률 자리에 "データなし" 표시, 달성 배지는 표시하지 않는다.
  - 카드 전체를 `<Link href="/app/stocks/:stockId">` 로 감싼다.
- 빈 상태:
  - `EmptyState` 컴포넌트 사용.
  - title: "目標利回りが設定されていません"
  - description: "銘柄を検索して目標利回りを設定しましょう"
  - actionHref: `/app/stocks/search`
  - actionLabel: "銘柄を探す"
- `/app/settings/page.tsx` 수정:
  - 기존 카드 섹션 아래 또는 로그아웃 버튼 위에 "目標利回り管理" 링크 행 추가.
  - `<Link href="/app/settings/yield-targets">` 를 사용하며, 설정 카드 내부에 항목 행 스타일로 추가한다 (예: `flex items-center justify-between p-4 border-t`).

## Core Tasks

1. **`/app/settings/yield-targets/page.tsx` 생성**
   - `getActiveYieldTargets` 호출.
   - 결과를 순회하며 `calculateAchieved`로 달성 여부 계산.
   - 카드 목록 또는 `EmptyState` 렌더링.
   - `PageHeader title="目標利回り管理"` 사용.

2. **카드 컴포넌트 구현 (page.tsx 내 인라인 또는 분리)**
   - 종목명 + 티커.
   - 현재 수익률 (`formatPercent(expectedDividendYield)` 또는 "データなし").
   - 목표: `operator === 'gte' ? '以上' : '以下'` + `target_yield`%.
   - 달성 배지: achieved=true → `<Badge variant="success">達成</Badge>`, false → `<Badge variant="neutral">未達成</Badge>`, currentYield=null → 배지 미표시.
   - 전체를 `<Link href={/app/stocks/${stockId}}>` 로 감싸고 `hover:shadow-md transition` 적용.

3. **설정 페이지 링크 행 추가**
   - `/app/settings/page.tsx`의 기존 Card 내에 링크 행 추가.
   - 텍스트: "目標利回り管理"
   - 우측에 `›` 또는 chevron 아이콘 표시.

4. **와이어프레임 업데이트**
   - `docs/dividend_app_wireframe.md` #11 설정 화면 섹션에 "目標利回り管理" 항목 추가.
   - 링크 행 레이아웃과 이동 경로(`/app/settings/yield-targets`) 명시.

## Test Plan

- `npm run lint` — lint 오류 없음.
- `npm run typecheck` — 타입 오류 없음.
- `npm run build` — 빌드 성공.
- 수동 검증:
  - 설정 탭 → "目標利回り管理" 링크 표시 확인.
  - 링크 탭 → `/app/settings/yield-targets` 이동 확인.
  - 활성 알림 룰이 있는 계정: 카드 목록 표시, 현재 수익률·목표·달성 배지 정상 표시 확인.
  - 달성/미달성 양쪽 케이스 확인 (gte, lte 각 1건씩 설정 후 확인).
  - `expected_dividend_yield`가 null인 종목 포함 시 "データなし" 표시 확인.
  - 활성 알림 룰이 없는 계정: 빈 상태 + "銘柄を探す" CTA 표시 확인.
  - CTA 탭 → `/app/stocks/search` 이동 확인.
  - 카드 탭 → `/app/stocks/:stockId` 이동 확인.

## Completion Criteria

- `/app/settings/yield-targets` 페이지가 존재하며, 활성 룰이 있을 때 카드 목록을 표시한다.
- 카드에 종목명·티커·현재 수익률·목표 수익률·달성 배지가 올바르게 표시된다.
- `gte` 룰: 현재 수익률 ≥ 목표이면 "達成", 미만이면 "未達成" 배지.
- `lte` 룰: 현재 수익률 ≤ 목표이면 "達成", 초과이면 "未達成" 배지.
- `expected_dividend_yield` = null인 경우 배지가 표시되지 않고 "データなし"가 표시된다.
- 빈 상태에서 "銘柄を探す" 버튼이 `/app/stocks/search`로 이동한다.
- 설정 페이지에서 "目標利回り管理" 링크로 이 페이지에 진입할 수 있다.
- `docs/dividend_app_wireframe.md` #11 설정 화면에 "目標利回り管理" 항목이 추가되어 있다.
- `npm run build` 가 통과한다.

## Excluded From This Phase

- 이 페이지에서 목표 수익률 직접 편집/삭제.
- 비활성(disabled) 알림 룰 표시.
- 포트폴리오 카드 또는 종목 상세 화면 내 목표 수익률 표시.
- 정렬·필터 기능.
