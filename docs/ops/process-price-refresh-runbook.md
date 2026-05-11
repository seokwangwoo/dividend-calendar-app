# process-price-refresh 워크플로우 런북

## 목적

이 런북은 일일 `process-price-refresh` Edge Function을 수동으로 실행, 모니터링, 복구하는 방법을 설명합니다.

## 정상 운영

이 함수는 GitHub Actions Cron에 의해 매일 오전 6:00 JST에 트리거됩니다:

```yaml
# .github/workflows/daily-price-refresh.yml
- name: Invoke price refresh
  run: |
    curl -X POST \
      ${{ secrets.SUPABASE_FUNCTION_URL }}/process-price-refresh \
      -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
      -d '{ "dryRun": false }'
```

## 수동 실행

### 드라이 런 (쓰기 없음)

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": true }'
```

예상 응답:

```json
{
  "processed": 4000,
  "successCount": 3980,
  "failureCount": 20,
  "dryRun": true
}
```

### 전체 실행

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false }'
```

### 부분 실행 (복구용)

이전 실행이 타임아웃된 경우, 더 작은 제한이나 오프셋으로 재개:

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false, "limit": 1000, "offset": 2000 }'
```

## 반복 동작

이 함수는 주식을 청크 단위로 처리합니다:

1. `price_updated_at asc, ticker` 순으로 모든 비상장 폐지 종목을 조회.
2. 각 종목에 대해 Stooq에서 최신 가격을 가져옴.
3. `stock_price_refresh_logs`에 `status` = `success` 또는 `failure`인 행을 삽입.
4. 성공 시 `stocks.current_price`와 `stocks.price_updated_at`을 업데이트.
5. 개별 실패와 관계없이 다음 종목으로 계속 진행.

## 모니터링

### 최신 배치 확인

```sql
select *
from public.get_admin_price_refresh_summary(current_date - interval '2 days', current_date);
```

### 연속 실패 확인

```sql
select * from public.get_stocks_with_consecutive_price_refresh_failures(3);
```

### Edge Function 로그 확인

Supabase 대시보드 → Edge Functions → `process-price-refresh` → Logs.

## 복구 절차

### 시나리오: 배치 중 타임아웃

1. 마지막 실행에서 처리된 종목 수 확인:
   ```sql
   select count(*) from stock_price_refresh_logs where date(created_at) = current_date;
   ```
2. 개수가 전체 비상장 폐지 종목 수보다 적으면, 처리된 개수를 `offset`으로 설정하여 재개.
3. 실패율이 높으면 [Stooq Rate-Limit 대응 런북](./stooq-rate-limit-runbook.md)을 따릅니다.

### 시나리오: 모든 종목 실패

1. 브라우저에서 `https://stooq.pl/q/l/?s=7203.T`를 열어 Stooq 가용성을 확인.
2. Supabase Edge Function IP가 차단되었는지 확인.
3. Cron 작업을 일시 중지하고 대체 소스를 조사.

### 시나리오: 데이터 손상 의심

1. 응답 형식을 확인하기 위해 드라이 런 실행.
2. `stock_price_refresh_logs`의 `old_price`와 `new_price`를 비교하여 이상 여부 확인.
3. 특정 종목에 비정상적인 가격이 있으면 Supabase Studio를 통해 `stocks.current_price`를 수동 업데이트.

## 롤백

가격 새로고침에는 자동 롤백이 없습니다. 잘못된 배치를 되돌리려면:

1. 해당 날짜의 `stock_price_refresh_logs`에서 영향을 받은 종목을 식별.
2. 이전 성공적인 로그 항목에서 `current_price`를 복원:
   ```sql
   update stocks s
   set current_price = l.old_price,
       price_updated_at = l.created_at
   from stock_price_refresh_logs l
   where s.id = l.stock_id
     and date(l.created_at) = '<bad-batch-date>'
     and l.status = 'success';
   ```

## 관련 런북

- [Stooq Rate-Limit 대응 런북](./stooq-rate-limit-runbook.md)
- [주식 마스터 임포트 운영 매뉴얼](./stock-master-import-manual.md)
