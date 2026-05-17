---
status: open
type: bug
created: 2026-05-17
resolved:
priority: medium
labels: [bug, ui, data-consistency, portfolio]
---

# 포트폴리오에서 `stocks.expected_annual_dividend_per_share` 폴백 없이 "配当データ確認中"이 표시됨

## 개요 (Overview)

`/app/portfolio` 화면의 보유 카드 우측은 해당 종목의 연간 세후 배당을 표시합니다. 그러나 현재 구현은 오직 `dividend_events`에서 `review_status = 'approved'` + `expected_payment_year = 현재 연도(2026)` + `dividend_per_share IS NOT NULL`인 이벤트 합계만 사용합니다. 그 결과, 종목 마스터(`stocks.expected_annual_dividend_per_share`)에는 이미 예상 연간 배당이 등록되어 있고 종목 상세 페이지(`/app/stocks/[id]`)에서는 그 값이 정상적으로 보임에도, 포트폴리오 카드에는 "配当データ確認中"이 표시됩니다. 사용자 입장에서는 "이미 배당데이터가 등록된 종목인데도 확인중이 뜬다"라는 인상을 받게 되며, 같은 종목의 같은 값이 화면마다 다르게 보여 신뢰성 문제를 일으킵니다.

## 재현 방법 (Reproduction Steps)

1. `stocks.expected_annual_dividend_per_share != NULL` 이면서 `dividend_events`에 2026년 `approved` 이벤트가 존재하지 않는 종목을 포트폴리오에 추가합니다. 현재 DB에서는 예를 들어 다음 종목이 이 조건을 만족합니다.
   - 1878 大東建託 (`stocks.expected_annual_dividend_per_share = 560`)
   - 8316 三井住友フィナンシャルグループ (`= 330`)
   - 5108 ブリヂストン (`= 210`)
   - 4502 武田薬品工業 (`= 188`)
   - 6301 小松製作所 (`= 167`)
2. `/app/stocks/<stockId>` 에서 "予想年間配当/株"이 등록된 값으로 표시되는 것을 확인합니다 (예: 1878이면 ¥560).
3. `/app/portfolio` 로 이동하여 동일 종목의 카드를 확인합니다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values (예: 1878 大東建託, 100주 보유, NISA 가정)

| 화면 / 컴포넌트 | 표시 | 사용 데이터 |
|-----------------|------|-------------|
| `/app/stocks/1878` ("予想年間配当/株") | **¥560** | `stocks.expected_annual_dividend_per_share` |
| `/app/portfolio` 카드 우측 | **配当データ確認中** | `dividend_events` (2026 approved 0건) |
| `/app/portfolio` 합계 (`get_portfolio_summary` RPC) | 해당 종목 0엔으로 누락 | `dividend_events` 기반 RPC |

### Root Data Comparison

| 종목 (ticker) | `stocks.expected_annual_dividend_per_share` | 2026 approved 이벤트 수 | 포트폴리오 카드 표시 |
|---------------|---------------------------------------------|------------------------|----------------------|
| 1878 大東建託 | 560 | 0 | 配当データ確認中 |
| 8316 三井住友FG | 330 | 0 | 配当データ確認中 |
| 5108 ブリヂストン | 210 | 0 | 配当データ確認中 |
| 4502 武田薬品工業 | 188 | 0 | 配当データ確認中 |
| 6301 小松製作所 | 167 | 0 | 配当データ確認中 |
| 9433 ＫＤＤＩ (참고) | 150 | 1 (140) | ¥14,000 (140 × 100) |
| 4307 野村総合研究所 (참고) | 77 | 1 (42) | ¥4,200 (42 × 100) |
| 2914 日本たばこ産業 (참고) | 194 | 1 (38) | ¥3,800 (38 × 100) |

> 전체 통계 (2026-05-17 기준): `stocks` 4,453건 중 `expected_annual_dividend_per_share`가 채워진 종목 39건, 그중 2026 approved 이벤트가 없는 종목 **36건**. 따라서 사용자 입장에서는 마스터 데이터를 갖춘 39개 종목 중 약 92%가 포트폴리오에 추가될 경우 "確認中" 메시지를 만나게 됩니다.

## 기술적 원인 분석 (Technical Root Cause)

### 1. 포트폴리오 카드의 분기 조건

`src/features/holdings/components/portfolio-client.tsx` (현재 main):

```ts
// L60-75
function getApprovedAnnualDividendPerShare(
  holding: HoldingWithStock,
  year: number
): number | null {
  const total =
    holding.stock.dividend_events
      ?.filter(
        (event) =>
          event.review_status === "approved" &&
          event.expected_payment_year === year &&
          event.dividend_per_share != null
      )
      .reduce((sum, event) => sum + Number(event.dividend_per_share), 0) ?? 0;

  return total > 0 ? total : null;
}

// L77-97
function calculateHoldingAnnualAmounts(holding: HoldingWithStock, year: number) {
  const annualDividendPerShare = getApprovedAnnualDividendPerShare(holding, year);
  ...
  if (annualDividendPerShare == null) {
    return { beforeTaxAmount: null, estimatedTaxAmount: null, afterTaxAmount: null };
  }
  ...
}

// L115, L142-143
const hasNoDividendData = calc.afterTaxAmount == null;
...
{hasNoDividendData ? (
  <p className="text-sm text-muted">配当データ確認中</p>
) : ( ... )}
```

`stocks.expected_annual_dividend_per_share` 는 어떤 경로에서도 참조되지 않으며, 폴백이 존재하지 않습니다.

### 2. 종목 상세 페이지의 분기 조건 (대조)

`src/app/app/stocks/[stockId]/page.tsx`:

```tsx
// L45-49
<p className="text-sm text-muted">予想年間配当/株</p>
<p className="font-semibold">
  {formatCurrencyJpy(stock.expectedAnnualDividendPerShare)}
</p>

// L98-103 — 같은 "配当データ確認中" 문구이지만 분기 조건이 다름
{dividendSchedule.length === 0 ? (
  <p className="text-sm text-muted">
    {stock.expectedAnnualDividendPerShare == null
      ? "配当データ確認中"
      : "配当スケジュールは登録されていません。"}
  </p>
) : ( ... )}
```

종목 상세에서는 `stocks.expected_annual_dividend_per_share` 가 채워져 있으면 메인 카드에 값이 표시되고, 배당 스케줄 섹션조차 "確認中" 대신 "配当スケジュールは登録されていません。" 라는 다른 문구를 사용합니다. **같은 한 종목에 대해 포트폴리오는 確認中, 종목 상세는 ¥560** 라는 정반대 신호를 보냅니다.

### 3. `get_portfolio_summary` 및 `get_home_summary` 도 같은 정책

`supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql` 에서 두 RPC 모두 다음과 같이 `dividend_events` 만 조인합니다.

```sql
from public.holdings h
join public.dividend_events de on de.stock_id = h.stock_id
where h.user_id = v_user_id
  and h.deleted_at is null
  and de.review_status = 'approved'
  and de.expected_payment_year = p_year
  and de.dividend_per_share is not null
```

즉 상단 "ポートフォリオ概要" / 홈의 "今年の予想税引後配当" 도 같은 종목을 0엔 취급합니다. 카드만의 표시 문제가 아니라 집계까지 누락됩니다.

### 4. 경계 사례

위 정책상 다음의 경우 모두 "確認中" 분기를 탑니다.

- `stocks.expected_annual_dividend_per_share` 만 있고 `dividend_events` 에는 아무 row 도 없는 경우 (현재 36/39 종목).
- `dividend_events` 가 있지만 모두 `pending` / `needs_manual_check` / `rejected` 상태인 경우 (관리자 검수 전 신규 종목).
- `dividend_events` 가 모두 과거(2025) 또는 미래(2027) 연도여서 현재 연도와 매칭되지 않는 경우.
- `dividend_events.dividend_per_share IS NULL` (예: `status = 'undecided'`) 인 이벤트만 있는 경우.

### 5. 배경 — 이전 archived 이슈

`docs/issue/archive/20260506-home-portfolio-dividend-mismatch.md` 의 해결책으로 "방안 B: 포트폴리오도 `dividend_events` 기준으로 계산" 이 채택된 것으로 보입니다 (`8285d1d AI schema payment month phase 05`). 이 변경으로 홈/포트폴리오 간 불일치는 해결되었지만, **종목 상세 페이지가 여전히 `stocks` 기준이라 새로운 화면 간 불일치가 생긴 것**이 본 이슈의 핵심입니다.

## 영향 범위 (Impact)

- **사용자 경험**: "주식은 등록되어 있는데 배당 데이터 확인 중이 사라지지 않는다" 라는 체감. 또한 같은 종목의 "予想年間配当/株"이 종목 상세에서는 ¥560 인데 포트폴리오 합계 기여는 0엔이라 합계 금액·이용률도 과소 표시됩니다.
- **메시지 의미의 오해**: "確認中" (verifying / in progress) 이라는 일본어 표현은 시스템이 백그라운드에서 무언가를 검증 중이라는 인상을 주지만, 실제로는 단순히 "현재 연도 approved 이벤트가 0건" 이라는 정적 상태입니다.
- **영향 화면**:
  - `/app/portfolio` (보유 카드, 상단 ポートフォリオ概要 요약)
  - `/app/home` (`get_home_summary` 가 동일 정책)
  - 연동 컴포넌트: `src/features/holdings/components/portfolio-client.tsx` `SummaryCard`, `HoldingCard`
- **테스트**: 현재 E2E/integration 테스트는 admin이 사전 approve 한 seed 데이터에 의존하므로 이 분기에 대한 회귀 가능성을 잡지 못합니다.
- **데이터 정합성**: 종목 마스터의 값(`stocks.expected_annual_dividend_per_share`) 자체는 별도 동기화 흐름(`docs/issue/active/20260514-stock-expected-dividend-sync-and-simulation-basis.md`)에서 관리되므로 본 이슈와는 별개 layer 입니다. 본 이슈는 "두 layer 가 동시에 존재할 때 화면이 어떤 layer 를 신뢰해야 하는가" 정책의 부재입니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 방안 A — `stocks.expected_annual_dividend_per_share` 폴백 추가 (Recommended)

`getApprovedAnnualDividendPerShare` 가 null 을 반환할 때 `holding.stock.expected_annual_dividend_per_share` 를 폴백 값으로 사용하고, 폴백을 사용한 경우 카드에 "予想" / "마스터 기준" 같은 시각적 표식(Badge 등)을 노출합니다. `get_portfolio_summary` / `get_home_summary` RPC 도 동일 폴백을 SQL 안에서 `coalesce(sum_approved_2026, stocks.expected_annual_dividend_per_share)` 식으로 반영합니다.

- **Pros**: 종목 상세와 표시 정합. `dividend_events` 가 채워지기 전까지도 의미 있는 추정치를 사용자에게 제공.
- **Cons / Risks**:
  - 추정치와 확정치(approved 이벤트 합계)가 섞이면 두 종류 값이 합산되어 의미 불명확. 카드 단위로는 "마스터 기준" 표식이 필요.
  - RPC 단에서도 분기 표식을 같이 반환해야 하므로 시그니처 확장이 필요.
- **Recommended**.

### 방안 B — 종목 상세 페이지도 `dividend_events` 기준으로 통일

종목 상세의 "予想年間配当/株" 도 `dividend_events` 합계로 바꾸어 모든 화면을 한 가지 정책으로 통일합니다.

- **Pros**: 단일 진실원(Single Source of Truth) 으로 가장 깔끔. 이전 archive 이슈가 추구한 방향과도 일관.
- **Cons / Risks**:
  - 현재 4,453개 종목 중 marketed `stocks.expected_annual_dividend_per_share` 가 채워진 39 종목조차도 사용자에게 "予想年間配当/株 ¥—" 로 비게 됨. 사용자 체감 후퇴.
  - `stocks.expected_annual_dividend_per_share` 컬럼의 존재 의의가 사라지므로, 사용 중인 다른 화면(`notification-rule/page.tsx`, `new-holding-form.tsx`, `edit-holding-form.tsx`, `notifications/actions.ts`) 까지 같은 정책으로 전부 변경해야 함.

### 방안 C — 메시지 문구 명확화

분기 자체는 그대로 두되 "配当データ確認中" 을 "今年の配当データはまだ登録されていません" 같은 정적 상태를 직접 알리는 표현으로 바꾸고, 종목 상세에서 사용 중인 동일 문구도 함께 통일합니다.

- **Pros**: 가장 작은 변경. 사용자에게 "시스템이 작업 중" 이라는 오해를 즉시 제거.
- **Cons / Risks**: 화면 간 값 불일치 본질은 해결되지 않음. 단독 적용 시 부분 처방.

> 권장 조합은 **A + C** 입니다 (폴백 도입 + 문구도 정적 상태로 명확화). B 는 마스터 데이터 활용 정책 자체가 별도 이슈([active/20260514-stock-expected-dividend-sync-and-simulation-basis.md](20260514-stock-expected-dividend-sync-and-simulation-basis.md)) 결론에 의존하므로 함께 다루는 것이 안전합니다.

## 관련 파일 (Related Files)

- `src/features/holdings/components/portfolio-client.tsx` — `getApprovedAnnualDividendPerShare`, `calculateHoldingAnnualAmounts`, `HoldingCard` (L60–L159)
- `src/features/holdings/queries.ts` — `getHoldings`, `getPortfolioSummary` (L26–L102, dividend_events 임베디드 select)
- `src/app/app/portfolio/page.tsx` — `year = new Date().getFullYear()` 전달 (L7)
- `src/app/app/stocks/[stockId]/page.tsx` — 종목 상세에서의 대조 분기 (L45–L49, L98–L103)
- `supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql` — `get_portfolio_summary`, `get_home_summary` RPC 본문
- `docs/issue/archive/20260506-home-portfolio-dividend-mismatch.md` — 본 이슈의 직접적 선행 결정
- `docs/issue/active/20260514-stock-expected-dividend-sync-and-simulation-basis.md` — `stocks.expected_annual_dividend_per_share` 동기화 정책 (본 이슈와 인접)

## 라벨 제안 (Suggested Labels)

- `bug`
- `ui`
- `data-consistency`
- `portfolio`
- (선택) `copywriting` — 방안 C 까지 포함할 경우
