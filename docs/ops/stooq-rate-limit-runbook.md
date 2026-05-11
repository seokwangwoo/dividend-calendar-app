# Stooq Rate-Limit Handling Runbook

## Purpose

This runbook describes how to respond when the Stooq price refresh pipeline hits rate limits or encounters consecutive failures.

## Symptoms

- `process-price-refresh` Edge Function logs show HTTP 429 or timeout errors.
- `stock_price_refresh_logs.failure_rate` exceeds 5% for a batch.
- `get_stocks_with_consecutive_price_refresh_failures` returns non-zero rows.

## Immediate Response

### 1. Check current failure rate

Query the latest batch in Supabase Studio:

```sql
select *
from public.get_admin_price_refresh_summary(current_date - 1, current_date);
```

### 2. Reduce request rate

Edit `supabase/functions/process-price-refresh/index.ts`:

- Increase `STOOQ_REQUEST_DELAY_MS` (default is typically 100–200ms). Try 500ms first.
- Reduce `BATCH_SIZE` if the function times out before completing.

Redeploy the Edge Function:

```bash
npx supabase functions deploy process-price-refresh
```

### 3. Re-run the failed batch manually

Invoke `process-price-refresh` via Supabase Studio or curl with a smaller chunk:

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/process-price-refresh \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "dryRun": false, "limit": 500 }'
```

## Root-Cause Checks

| Check | Query / Action |
|---|---|
| Is Stooq globally down? | Open `https://stooq.pl` in a browser; check if individual ticker URLs load. |
| Are specific tickers always failing? | `select stock_id, ticker, count(*) from stock_price_refresh_logs where status = 'failure' and created_at > now() - interval '24 hours' group by stock_id, ticker order by count desc limit 20;` |
| Is the function hitting the 400s timeout? | Check Edge Function logs in Supabase Dashboard for `TimeoutError`. |

## Prevention

- Keep `STOOQ_REQUEST_DELAY_MS` ≥ 100ms per request.
- Schedule `process-price-refresh` outside market hours (e.g., 06:00 JST) to reduce load on Stooq.
- Monitor `failure_rate` daily via the admin **ジョブ** page.

## Escalation

If Stooq blocks the Supabase Edge Function IP range for an extended period:

1. Pause daily price refresh (`STOOQ_REQUEST_DELAY_MS = 0` and skip invocation).
2. Evaluate alternative free price sources (e.g., Yahoo Finance Japan scraping with proper rate limiting).
3. Document the outage in `docs/issue/active/`.
