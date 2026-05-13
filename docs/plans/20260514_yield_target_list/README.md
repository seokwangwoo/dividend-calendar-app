# Yield Target List Plan

## Purpose

사용자가 설정한 종목별 목표 배당수익률을 한눈에 확인할 수 있는 화면을 추가합니다.

설정 탭에 "目標利回り管理" 링크를 추가하고, 이동한 페이지에서 활성 알림 룰이 있는 종목별로 현재 예상 배당수익률과 목표 수익률을 비교하여 달성 여부를 표시합니다.

## Source Specifications

- `docs/dividend_app_wireframe.md` — #9 목표 배당수익률 알림 설정, #11 설정 화면
- `docs/dividend_app_mvp_backend_spec.md` — 6.7 notification_rules, 6.3 stocks

## Fixed Stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router (Server Component) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase PostgreSQL (existing `notification_rules` + `stocks`) |
| Authorization | Supabase RLS (기존 user_id 정책 사용) |

## Scope

Must include:

- `notification_rules`(status=active)와 `stocks`를 조인하여 현재 수익률을 포함한 목록 조회 쿼리.
- 달성 여부 계산 순수 함수 (operator + target_yield vs expected_dividend_yield).
- 설정 페이지(`/app/settings`)에 "目標利回り管理" 링크 추가.
- 새 페이지 `/app/settings/yield-targets`: 활성 목표 수익률 카드 목록 + 빈 상태.
- 각 카드: 종목명, 티커, 현재 예상 수익률, 목표(operator+값), 달성 배지.
- 카드 탭 → `/app/stocks/:stockId` 이동.
- 빈 상태 CTA → `/app/stocks/search`.

Excluded from this plan:

- 이 페이지에서 직접 목표 수익률 편집/삭제. 편집은 종목 상세 화면의 기존 알림 룰 페이지에서 수행.
- 비활성(disabled) 알림 룰 표시.
- 취득가 기준 개인 수익률 비교. 시장 기준(`stocks.expected_dividend_yield`)만 사용.
- 포트폴리오 카드 또는 종목 상세 화면에 목표 수익률 인라인 표시.

## Phase Order

1. [Phase 01: Query and Logic](./phase_01_query_and_logic/plan.md)
2. [Phase 02: UI](./phase_02_ui/plan.md)

## Development Rules

- 기존 `notification_rules` 테이블 스키마 변경 없음. 새 컬럼 추가 불필요.
- 달성 여부 계산은 순수 함수로 분리하여 테스트 작성.
- Server Component로 구현하여 별도 API route 추가 없음.

## Common Domain Terms

| Term | Meaning |
|---|---|
| target_yield | `notification_rules.target_yield` — 사용자가 설정한 목표 배당수익률 (%) |
| expected_dividend_yield | `stocks.expected_dividend_yield` — 현재 주가 기준 예상 배당수익률 |
| operator | `gte`(이상) 또는 `lte`(이하) — 달성 조건 방향 |
| achieved | `operator=gte`이면 `expected_dividend_yield >= target_yield`, `operator=lte`이면 `expected_dividend_yield <= target_yield` |
| active rule | `notification_rules.status = 'active'` |

## Plan Completion Definition

The plan is complete when:

- `/app/settings/yield-targets` 페이지가 활성 알림 룰이 있는 종목을 카드 목록으로 표시한다.
- 각 카드에서 현재 수익률, 목표 수익률, 달성 배지가 올바르게 표시된다.
- 달성 계산이 `gte`/`lte` operator 양쪽에서 올바르게 동작한다.
- 빈 상태에서 `/app/stocks/search` CTA가 표시된다.
- 설정 페이지에서 이 화면으로 이동할 수 있다.

## Document Maintenance

- 구현이 이 문서와 달라지면 해당 phase 문서를 먼저 수정하고 구현한다.
- 각 phase 문서는 500줄 이하로 유지한다.
- 추가 요구사항은 새 플랜으로 분리한다.
