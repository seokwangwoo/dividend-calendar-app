# 종목 상세/알림 설정 진입을 위한 `/app/stocks/search` 라우트 누락

## 개요 (Overview)

MVP 정책은 배당수익률 알림을 종목 상세 화면에서 설정하도록 둡니다. 실제 종목 상세 화면(`/app/stocks/[stockId]`)과 알림 설정 화면(`/app/stocks/[stockId]/notification-rule`)은 구현되어 있지만, 보유하지 않은 종목을 검색해 종목 상세로 진입하는 `/app/stocks/search` 라우트가 없습니다. 이 때문에 사용자는 관심 종목의 목표 배당수익률 알림을 설정하려 해도, 포트폴리오에 먼저 등록하거나 다른 화면에서 우연히 종목 상세 링크를 만나야 합니다. 이는 “종목 검색 → 종목 상세 → 목표수익률 알림 설정” MVP 흐름의 진입점 누락입니다.

## 재현 방법 (Reproduction Steps)

1. 로그인한 사용자로 앱에 접속한다.
2. `/app/stocks/search`로 이동한다.
3. 현재 `src/app/app/stocks/search/page.tsx`가 없으므로 해당 검색 화면이 제공되지 않는지 확인한다.
4. `/app/stocks/<stockId>` 종목 상세 화면에는 접근 가능한 라우트가 있음을 확인한다.
5. 종목 상세 화면 하단에 `/app/stocks/<stockId>/notification-rule`로 이동하는 목표수익률 설정 링크가 있음을 확인한다.
6. 하단 탭은 홈/포트폴리오/캘린더/알림/설정 5개만 제공하므로, 독립 종목 검색 진입점이 탭으로도 제공되지 않는지 확인한다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| 기대 라우트 | `/app/stocks/search` |
| 현재 존재하는 종목 라우트 | `/app/stocks/[stockId]`, `/app/stocks/[stockId]/notification-rule` |
| 현재 존재하지 않는 파일 | `src/app/app/stocks/search/page.tsx` |
| 현재 종목 추가 검색 | `/app/portfolio/new` 내부 `NewHoldingForm`에서만 제공 |
| 현재 하단 탭 | `/app/home`, `/app/portfolio`, `/app/calendar`, `/app/notifications`, `/app/settings` |

### Root Data Comparison

| Table / Column | Value A | Value B | Notes |
|----------------|---------|---------|-------|
| `stocks.support_status` | `supported` | `unsupported` | 검색 결과에서 지원/미지원 표시 필요 |
| `stocks.expected_dividend_yield` | 예상 배당수익률 | — | 검색 결과와 알림 설정 판단에 표시할 핵심 값 |
| `notification_rules.stock_id` | 종목 상세에서 설정 대상 | — | 알림 룰은 종목 단위로 저장됨 |

## 기술적 원인 분석 (Technical Root Cause)

- `src/app/app/stocks/[stockId]/page.tsx`는 종목 상세 화면을 제공하며, 하단에 `/app/stocks/${stockId}/notification-rule` 링크를 렌더링합니다.
- `src/app/app/stocks/[stockId]/notification-rule/page.tsx`는 특정 종목의 목표수익률 알림 설정 화면을 제공합니다.
- `src/app/app/portfolio/new/page.tsx`와 `src/features/holdings/components/new-holding-form.tsx`는 포트폴리오 추가 흐름 안에서 종목 검색을 제공합니다.
- 그러나 `src/app/app/stocks/search/page.tsx`가 없어, 보유 등록과 분리된 독립 종목 검색/상세 진입 화면이 없습니다.
- `src/components/app-shell/bottom-nav.tsx`는 5개 하단 탭만 제공하므로 검색 화면을 탭으로 추가하려면 앱 shell UX 결정도 필요합니다. 현재 문서 결정은 하단 탭은 유지하고 검색은 보조 화면/CTA로 접근하는 방향입니다.

## 영향 범위 (Impact)

- **User experience**: 보유하지 않은 종목의 배당 정보나 목표수익률 알림 설정에 접근하기 어렵습니다. 사용자는 알림을 설정하려고 포트폴리오 등록부터 해야 한다고 오해할 수 있습니다.
- **Affected screens**: `/app/stocks/search` 신규 화면, `/app/stocks/[stockId]`, `/app/stocks/[stockId]/notification-rule`, `/app/portfolio/new`, 포트폴리오 상단 CTA, 알림 빈 상태 CTA.
- **Tests**: 신규 E2E가 필요합니다. 예: 검색 화면에서 KDDI 검색 → 상세 보기 → 목표수익률 알림 설정 화면 진입.
- **Data integrity**: 데이터 모델 자체 문제는 아닙니다. 문제는 라우팅/탐색 흐름 누락입니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 방안 A: `/app/stocks/search` 독립 화면 추가 (권장)

1. **Description**: `src/app/app/stocks/search/page.tsx`를 추가하고, 기존 `searchStocksAction` 또는 stocks query를 재사용해 종목명/코드 검색을 제공합니다. 지원 종목 결과는 `[상세 보기]`로 `/app/stocks/:stockId`에 연결하고, `[보유 추가]`는 `/app/portfolio/new?stockId=:stockId` 또는 선택 상태가 채워진 보유 등록 흐름으로 연결합니다.
2. **Pros**: 배당수익률 알림 설정을 위한 자연스러운 진입 경로가 생깁니다. 보유하지 않은 종목도 상세/알림 설정이 가능해집니다. 기존 종목 상세/알림 설정 화면을 그대로 활용할 수 있습니다.
3. **Cons / Risks**: `/app/portfolio/new?stockId=` 사전 선택 지원이 없다면 추가 구현이 필요합니다. 검색 화면 진입 CTA는 MVP에서 포트폴리오 상단과 알림 빈 상태에 배치하기로 했으므로, 해당 화면 CTA 구현도 함께 필요합니다.
4. **Recommended?**: 예.

### 방안 B: `/app/portfolio/new`를 종목 상세 진입도 가능한 통합 검색 화면으로 확장

1. **Description**: 기존 포트폴리오 추가 화면의 검색 결과에 `[상세 보기]`를 추가하고, 알림 설정 목적의 사용자를 이 화면으로 유도합니다.
2. **Pros**: 새 라우트 추가 없이 기존 검색 UI를 재사용할 수 있습니다.
3. **Cons / Risks**: 화면 이름이 “銘柄追加”라서 보유 등록 목적이 아닌 사용자가 혼란스러울 수 있습니다. 알림 설정을 위해 “포트폴리오 추가” 화면에 들어가는 UX가 어색합니다.
4. **Recommended?**: MVP의 알림 진입점 명확성을 고려하면 비권장.

### 방안 C: 종목 상세 진입을 포트폴리오/캘린더 보유 종목 카드에서만 제공

1. **Description**: 독립 검색 없이 기존 보유/캘린더 카드에서만 종목 상세로 진입하게 합니다.
2. **Pros**: 구현 범위가 작습니다.
3. **Cons / Risks**: 보유하지 않은 종목의 목표수익률 알림 설정이 사실상 막힙니다. 사용자가 지적한 “알림은 종목 상세에서 설정하지만 상세 진입 경로가 없음” 문제가 해결되지 않습니다.
4. **Recommended?**: 아니오.

## 관련 파일 (Related Files)

- `docs/dividend_app_wireframe.md` — `/app/stocks/search` 와이어프레임과 라우팅 정책.
- `docs/dividend_calendar_mvp_plan.md` — 종목 검색/등록 요구사항 및 화면 목록.
- `src/app/app/stocks/[stockId]/page.tsx` — 종목 상세 화면과 목표수익률 설정 링크.
- `src/app/app/stocks/[stockId]/notification-rule/page.tsx` — 목표수익률 알림 설정 화면.
- `src/app/app/portfolio/new/page.tsx` — 현재 포트폴리오 추가 목적의 검색 진입점.
- `src/features/holdings/components/new-holding-form.tsx` — 기존 종목 검색 UI/검색 결과 처리.
- `src/features/stocks/actions.ts` — 기존 종목 검색 server action.
- `src/features/stocks/queries.ts` — 종목 조회 query.
- `src/components/app-shell/bottom-nav.tsx` — 하단 탭은 5개 유지 결정과 관련.

## 라벨 제안 (Suggested Labels)

`ui`, `routing`, `mvp-scope`, `notifications`, `stock-search`, `high-priority`
