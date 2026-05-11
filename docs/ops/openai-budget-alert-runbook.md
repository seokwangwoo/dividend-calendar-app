# OpenAI Budget Alert Response Runbook

## Purpose

This runbook describes how to respond when the AI parsing budget exceeds acceptable daily limits or shows unexpected spikes.

## Symptoms

- `get_admin_disclosure_summary.total_ai_cost_usd` exceeds the daily cap.
- `ai_parse_cost_usd` per disclosure is anomalously high (e.g., > $0.05 per PDF).
- OpenAI dashboard shows usage spikes outside normal collection windows.

## Daily Cap Reference

| Environment | Soft Cap | Hard Cap |
|---|---|---|
| Staging | $5/day | $10/day |
| Production | $20/day | $50/day |

> Adjust these values based on actual traffic after launch.

## Immediate Response

### 1. Pause non-essential parsing

Set `DAILY_AI_PARSE_CALL_CAP` in the `parse-disclosure` Edge Function to 0:

```typescript
// supabase/functions/parse-disclosure/index.ts
const DAILY_AI_PARSE_CALL_CAP = 0;
```

Redeploy:

```bash
npx supabase functions deploy parse-disclosure
```

This stops new AI parse jobs while preserving the queue.

### 2. Prioritize holdings-only parsing

If you want to continue parsing but only for stocks users actually hold:

1. Query held stock IDs:
   ```sql
   select distinct stock_id from holdings where deleted_at is null;
   ```
2. Update pending jobs to skip non-held stocks, or filter in `process-jobs`.

### 3. Adjust the daily cap

Once the budget issue is resolved, restore `DAILY_AI_PARSE_CALL_CAP` to a safe value:

```typescript
const DAILY_AI_PARSE_CALL_CAP = 500; // or appropriate limit
```

Redeploy again.

## Root-Cause Checks

| Check | Query / Action |
|---|---|
| Which disclosures consumed the most? | `select id, title, ai_parse_input_tokens, ai_parse_output_tokens, ai_parse_cost_usd from disclosures where date(collected_at) = current_date order by ai_parse_cost_usd desc nulls last limit 20;` |
| Is a single stock generating many disclosures? | `select stock_id, count(*) from disclosures where date(collected_at) = current_date group by stock_id order by count desc limit 10;` |
| Are retries inflating cost? | `select avg(ai_parse_attempts) from disclosures where date(collected_at) = current_date;` |

## Prevention

- Set `DAILY_AI_PARSE_CALL_CAP` to a hard limit in `parse-disclosure`.
- Add a Slack/email alert when `get_admin_disclosure_summary.total_ai_cost_usd` exceeds 80% of the soft cap.
- Retry failed parses with exponential backoff, not immediate re-queue.

## Escalation

If costs remain high after capping:

1. Switch to a cheaper model (e.g., GPT-4o-mini) for initial parsing.
2. Batch multiple short PDFs into a single API call where possible.
3. Document the issue in `docs/issue/active/`.
