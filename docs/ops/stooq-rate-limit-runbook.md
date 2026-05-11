# Stooq Rate-Limit 대응 런북

## 목적

이 런북은 Stooq 가격 새로고침 파이프라인이 Rate Limit에 도달하거나 연속 실패를 겪을 때 대응 방법을 설명합니다.

## 증상

- `process-price-refresh` Edge Function 로그에 HTTP 429 또는 타임아웃 오류가 표시됨.
- 배치별 `stock_price_refresh_logs.failure_rate`가 5%를 초과.
- `get_stocks_with_consecutive_price_refresh_failures`가 0이 아닌 행을 반환.

## 즉각적인 대응

### 1. 현재 실패율 확인

Supabase Studio에서 최신 배치 조회:

```sql
select *
from public.get_admin_price_refresh_summary(current_date - 1, current_date);
```

### 2. 요청 속도 감소

`supabase/functions/process-price-refresh/index.ts`를 수정:

- `STOOQ_REQUEST_DELAY_MS`를 증가 (기본값은 보통 100–200ms). 먼저 500ms로 시도.
- 함수가 완료되기 전에 타임아웃되면 `BATCH_SIZE`를 줄임.

Edge Function 재배포:

```bash
npx supabase functions deploy process-price-refresh
```

### 3. 실패한 배치 수동 재실행

더 작은 청크로 Supabase Studio 또는 curl을 통해 `process-price-refresh` 실행:

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false, "limit": 500 }'
```

## 근본 원인 확인

| 확인 항목 | 쿼리 / 조치 |
|---|---|
| Stooq가 전체적으로 다운되었는가? | 브라우저에서 `https://stooq.pl` 열기; 개별 ticker URL이 로드되는지 확인. |
| 특정 ticker가 항상 실패하는가? | `select stock_id, ticker, count(*) from stock_price_refresh_logs where status = 'failure' and created_at > now() - interval '24 hours' group by stock_id, ticker order by count desc limit 20;` |
| 함수가 400초 타임아웃에 도달하는가? | Supabase 대시보드의 Edge Function 로그에서 `TimeoutError` 확인. |

## 예방

- `STOOQ_REQUEST_DELAY_MS`를 요청당 최소 100ms 이상 유지.
- 장외 시간(예: 오전 6:00 JST)에 `process-price-refresh`를 예약하여 Stooq 부하 감소.
- 관리자 **ジョブ** 페이지를 통해 매일 `failure_rate` 모니터링.

## 에스컬레이션

Stooq가 Supabase Edge Function IP 범위를 장기간 차단한 경우:

1. 일일 가격 새로고침 일시 중지 (`STOOQ_REQUEST_DELAY_MS = 0` 설정 후 실행 생략).
2. 적절한 Rate Limit이 있는 대체 무료 가격 소스 평가 (예: Yahoo Finance Japan 스크래핑).
3. `docs/issue/active/`에 장애를 문서화.
