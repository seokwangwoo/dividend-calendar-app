# 설계 결정: 주가 API 장애 시 알림 룰 평가 정책

> **상태: ⏳ 미구현** — 주가 staleness 체크(48시간) 로직 없음; 주가 수집 파이프라인 자체가 미구현

## 결정일
2026-05-06

## 질문
Stooq API 장애로 인해 캐시된 주가가 stale(오래된) 상태일 때, 목표 배당수익률 알림 룰 평가를 어떻게 처리할 것인가?

## 결정
**캐시 주가가 48시간 이상 stale이면, 해당 종목의 `yield_above`/`yield_below` 룰 평가를 중단합니다.**

### 상세

1. **stale 기준**: `stock_prices.fetched_at` (또는 `stocks.price_updated_at`)이 현재 시각으로부터 48시간 이상 경과
2. **평가 중단 대상**: MVP 수익률 기반 알림 룰만 중단
   - `yield_above`
   - `yield_below`
   - `after_tax_yield_above` / `after_tax_yield_below`는 MVP에서 제외하고 Phase 2 고급 알림 후보로 둠
3. **평가 계속 대상**: 주가와 무관한 알림 룰은 정상 평가
   - `dividend_increase`
   - `dividend_cut`
   - `dividend_suspended`
   - `special_dividend`
   - `ex_date_before`
4. **중단 시 로그**: 스킵된 평가는 내부 로그에 기록 (디버깅용)

### 알림 룰 평가 흐름

```text
룰 평가 시작
  ↓
rule_type이 수익률 기반인가?
  ↓ 예
해당 종목의 stock_prices.fetched_at 확인
  ↓
fetched_at > now() - 48h?
  ↓ 예 (정상)
평가 진행 → 조건 충족 시 알림 생성
  ↓ 아니오 (stale)
평가 스킵 → 로그 기록 → 알림 생성 안 함
```

### 사용자 경험
- stale 주가 기간 중에는 수익률 알림이 발송되지 않습니다.
- 사용자는 알림을 "놓친" 것으로 인지할 수 있으나, 이는 잘못된 알림을 보내는 것보다 안전합니다.
- 3일 연속 API 실패 시 관리자에게 알림이 가므로, 관리자는 문제를 인지하고 조치할 수 있습니다.

## 근거
- 금융 알림 서비스에서 **잘못된 알림을 보내는 것보다 알림을 보내지 않는 것이 훨씬 안전**합니다.
- 사용자가 "왜 알림이 안 왔지?"라고 불만을 표현하면, "데이터 업데이트 지연으로 인해 일시적으로 알림이 지연되고 있습니다"라고 설명 가능합니다.
- 잘못된 알림을 받은 사용자는 서비스의 신뢰도를 영구적으로 잃게 됩니다.
- 48시간은 "하루 1회 호출" 기준으로 2회 연속 실패를 허용하는 여유 있는 임계값입니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.7 목표 배당수익률 알림
- DB 스키마: `stocks.price_updated_at` 또는 별도 `stock_prices` 테이블에 타임스탬프 필요
- 알림 평가 Worker: stale 체크 로직 추가
- 주가 수집 Worker: `fetched_at` 갱신

## 관련 이슈
- #stock-price
- #alert-rules
- #stale-data
- #notification-reliability
