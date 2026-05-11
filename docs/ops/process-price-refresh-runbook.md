# process-price-refresh Workflow Runbook

## Purpose

This runbook describes how to manually invoke, monitor, and recover the daily `process-price-refresh` Edge Function.

## Normal Operation

The function is triggered by GitHub Actions Cron daily at 06:00 JST:

```yaml
# .github/workflows/daily-price-refresh.yml
- name: Invoke price refresh
  run: |
    curl -X POST \
      ${{ secrets.SUPABASE_FUNCTION_URL }}/process-price-refresh \
      -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
      -d '{ "dryRun": false }'
```

## Manual Invocation

### Dry run (no writes)

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": true }'
```

Expected response:

```json
{
  "processed": 4000,
  "successCount": 3980,
  "failureCount": 20,
  "dryRun": true
}
```

### Full run

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false }'
```

### Partial run (for recovery)

If a previous run timed out, resume with a smaller limit or offset:

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false, "limit": 1000, "offset": 2000 }'
```

## Loop Behavior

The function processes stocks in chunks:

1. Query all non-delisted stocks ordered by `price_updated_at asc, ticker`.
2. For each stock, fetch the latest price from Stooq.
3. Insert a row into `stock_price_refresh_logs` with `status` = `success` or `failure`.
4. Update `stocks.current_price` and `stocks.price_updated_at` on success.
5. Continue to the next stock regardless of individual failures.

## Monitoring

### Check the latest batch

```sql
select *
from public.get_admin_price_refresh_summary(current_date - interval '2 days', current_date);
```

### Check consecutive failures

```sql
select * from public.get_stocks_with_consecutive_price_refresh_failures(3);
```

### Check Edge Function logs

In Supabase Dashboard → Edge Functions → `process-price-refresh` → Logs.

## Recovery Procedures

### Scenario: Timeout mid-batch

1. Check how many stocks were processed in the last run:
   ```sql
   select count(*) from stock_price_refresh_logs where date(created_at) = current_date;
   ```
2. If count < total non-delisted stocks, resume with `offset` set to the processed count.
3. If failures are high, follow the [Stooq Rate-Limit Handling Runbook](./stooq-rate-limit-runbook.md).

### Scenario: All stocks failing

1. Verify Stooq availability by opening `https://stooq.pl/q/l/?s=7203.T` in a browser.
2. Check if the Supabase Edge Function IP is blocked.
3. Pause the Cron job and investigate alternative sources.

### Scenario: Data corruption suspicion

1. Run a dry-run to verify response format.
2. Compare `old_price` vs `new_price` in `stock_price_refresh_logs` for anomalies.
3. If a stock has an impossible price, manually update `stocks.current_price` via Supabase Studio.

## Rollback

There is no automatic rollback for price refresh. To revert a bad batch:

1. Identify the affected stocks from `stock_price_refresh_logs` for that date.
2. Restore `current_price` from the previous successful log entry:
   ```sql
   update stocks s
   set current_price = l.old_price,
       price_updated_at = l.created_at
   from stock_price_refresh_logs l
   where s.id = l.stock_id
     and date(l.created_at) = '<bad-batch-date>'
     and l.status = 'success';
   ```

## Related Runbooks

- [Stooq Rate-Limit Handling Runbook](./stooq-rate-limit-runbook.md)
- [Stock Master Import Operating Manual](./stock-master-import-manual.md)
