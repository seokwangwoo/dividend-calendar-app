# 홈 화면과 포트폴리오 화면의 연간 예상 배당 금액 불일치

> **상태: ✅ 해결됨** — 홈/포트폴리오 모두 `dividend_events` 기반 RPC로 통일; `payment_year` 컬럼 추가로 데이터 정합성 확보

## 개요

홈 화면의 "올해 예상 배당(세후)"과 포트폴리오 화면의 "연간 세후 배당"이 **동일 사용자, 동일 보유 종목**임에도 불구하고 서로 다른 값을 표시하고 있습니다. 이는 사용자에게 데이터 신뢰성 혼란을 줄 수 있는 심각한 UI/데이터 정합성 이슈입니다.

## 재현 방법

1. User A로 로그인
   - KDDI 100주 (NISA, 평균 매입가 4,300엔)
   - JT(2914) 100주 (특정 계좌, 평균 매입가 3,800엔)
2. `/app/home` 접속 → "올해 예상 세후 배당" 확인
3. `/app/portfolio` 접속 → "연간 세후 배당" 확인
4. 두 값 비교

## 예상 vs 실제

### 현재 표시되는 값 (User A 기준)

| 화면 | 연간 세후 배당 |
|------|--------------|
| 홈 (`/app/home`) | 약 **¥17,800** (KDDI ¥14,000 + JT ¥3,800) |
| 포트폴리오 (`/app/portfolio`) | 약 **¥30,459** (KDDI ¥15,000 + JT ¥15,459) |

> KDDI: NISA(무세)라 세후=세전. JT: 특정 계좌(세율 20.315%) 적용.

### 원인: 서로 다른 데이터 소스 사용

| 화면 | RPC / 함수 | 참조 테이블 | 사용 컬럼 | 의미 |
|------|-----------|------------|----------|------|
| **홈** | `get_home_summary` | `dividend_events` | `dividend_per_share` | 해당 회계연도의 **개별 배당 이벤트 합계** |
| **포트폴리오** | `get_portfolio_summary` / `calculateHoldingDividend` | `stocks` | `expected_annual_dividend_per_share` | 주식 정보의 **예상 연간 배당(1주당)** |

### DB에 저장된 실제 값 비교

| 종목 | `stocks.expected_annual_dividend_per_share` | `dividend_events.dividend_per_share` (2026년, approved) |
|------|-------------------------------------------|------------------------------------------------------|
| KDDI (9433) | **150** | **140** |
| JT (2914) | **194** | **38** |

- JT는 `stocks`에는 194엔으로 되어 있지만, `dividend_events`에는 38엔만 등록되어 있어 차이가 극심합니다.
- KDDI도 150 vs 140으로 10엔 차이가 있습니다.

## 기술적 원인 분석

### 1. 홈 화면: 이벤트 기반 합계

`supabase/migrations/20260505003000_phase_04_home_calendar_rpcs.sql`의 `get_home_summary`는 `dividend_events` 테이블에서 `fiscal_year = 현재연도`이고 `review_status = 'approved'`인 레코드들의 `dividend_per_share × 보유 수량`을 합산합니다.

```sql
-- get_home_summary 낶部
from public.dividend_events de
where de.review_status = 'approved'
  and de.fiscal_year = p_year
  and de.dividend_per_share is not null
```

### 2. 포트폴리오: 주식 정보 기반

`supabase/migrations/20260505002000_phase_03_portfolio_rpcs.sql`의 `get_portfolio_summary`는 `stocks.expected_annual_dividend_per_share`를 `holdings.quantity`와 곱해 계산합니다.

```sql
-- get_portfolio_summary 낶部
select
  s.expected_annual_dividend_per_share,
  h.quantity
from public.holdings h
join public.stocks s on s.id = h.stock_id
```

### 3. 추가 차이: 연도 필터 유무

- **홈**: `fiscal_year = 2026` 조건으로 해당 연도 이벤트만 집계
- **포트폴리오**: 연도 필터 없음. 현재 `stocks`의 예상 배당 값을 그대로 사용

## 영향 범위

- **사용자 경험**: 동일 앱 내에서 "연간 예상 배당"이라는 동일한 개념에 다른 값이 표시되어 데이터 신뢰성이 떨어집니다.
- **관련 화면**: 홈, 포트폴리오, 캘린더(월별 합계), 주식 상세 페이지의 "예상 연간 배당/주" 등 모두 `stocks` 또는 `dividend_events` 중 하나를 참조하여 값이 어긋날 수 있습니다.
- **E2E 테스트**: Phase 08의 테스트에서도 seed 데이터 기준으로 값을 계산해야 해서 테스트 작성이 복잡해졌습니다.

## 제안하는 해결 방향

### 방안 A: `stocks`를 `dividend_events` 기준으로 동기화 (권장)

`dividend_events`에서 `review_status = 'approved'`인 이벤트들의 `dividend_per_share`를 종합하여 `stocks.expected_annual_dividend_per_share`를 갱신하는 메커니즘을 만듭니다.

- **장점**: 배당 이벤트(공시 원본)를 Single Source of Truth로 삼을 수 있음
- **구현 위치**: 
  - DB 트리거: `dividend_events`의 INSERT/UPDATE 시 `stocks` 자동 갱신
  - 또는 배치 함수: 관리자 검수 완료(approve) 시 `stocks` 업데이트

### 방안 B: 포트폴리오도 `dividend_events` 기준으로 계산

포트폴리오 화면에서도 `stocks.expected_annual_dividend_per_share` 대신 `dividend_events`의 approved 이벤트를 기준으로 연간 배당을 계산하도록 변경합니다.

- **장점**: 별도 동기화 없이 즉시 정합성 확보
- **단점**: 포트폴리오 로딩 시 `dividend_events`까지 조인/집계해야 해서 쿼리가 복잡해짐

### 방안 C: 두 값의 의도를 명확히 분리 (UI 개선)

- `stocks.expected_annual_dividend_per_share` → "예상 연간 배당(예측)"
- `dividend_events` 합계 → "확정/공시된 연간 배당"

이렇게 라벨을 다르게 표시하여 사용자에게 두 값이 다른 기준임을 인지시킵니다.

- **단점**: 사용자 입장에서 여전히 혼란스러울 수 있음

## 관련 파일

- `supabase/migrations/20260505003000_phase_04_home_calendar_rpcs.sql` — `get_home_summary`, `get_dividend_calendar`
- `supabase/migrations/20260505002000_phase_03_portfolio_rpcs.sql` — `get_portfolio_summary`, `calculate_holding_dividend`
- `src/app/app/home/page.tsx` — 홈 화면
- `src/features/holdings/components/portfolio-client.tsx` — 포트폴리오 화면
- `src/lib/dividends/calculations.ts` — 클라이언트 사이드 계산

## 라벨 제안

`bug`, `data-consistency`, `ui`, `high-priority`
