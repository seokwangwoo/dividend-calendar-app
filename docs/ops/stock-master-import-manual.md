# Stock Master Import Operating Manual

## Purpose

This manual describes how to import the full JPX/TSE listed stock master into the `stocks` table using the `parse-stock-master-csv` Edge Function.

## Prerequisites

- Admin role in the application.
- Access to Supabase Studio (Storage upload + Edge Function invocation).
- JPX "List of TSE-listed Issues" XLS file (available from JPX website).

## Step 1: Download JPX Stock List

1. Visit the JPX website and download the latest "List of TSE-listed Issues" (上場銘柄一覧).
2. Open the XLS file in Excel or LibreOffice Calc.
3. Save/export as **CSV (UTF-8)** with English headers: `ticker,name,market_segment`.
   - `ticker`: 4-digit stock code (e.g., `7203`).
   - `name`: Company name in Japanese.
   - `market_segment`: Market segment (e.g., `TSE Prime`, `TSE Standard`, `TSE Growth`).
4. Verify the CSV has no duplicate `ticker` values.

## Step 2: Upload CSV to Supabase Storage

1. Open Supabase Studio → Storage.
2. Ensure the `imports` bucket exists (create it if needed, set to private).
3. Upload the CSV to `stock-master/YYYYMM_list_of_tse_listed_issues.csv`.
   - Example: `stock-master/202506_list_of_tse_listed_issues.csv`.
4. Note the full file path: `imports/stock-master/202506_list_of_tse_listed_issues.csv`.

## Step 3: Dry-Run the Import

1. In Supabase Studio, navigate to Edge Functions.
2. Invoke `parse-stock-master-csv` with the following JSON body:
   ```json
   {
     "filePath": "imports/stock-master/202506_list_of_tse_listed_issues.csv",
     "dryRun": true
   }
   ```
3. Review the response. It returns:
   - `processedCount`: number of rows parsed.
   - `insertedCount`, `updatedCount`, `delistedCount`: preview counts of what would happen (computed from existing DB state, no writes performed).
   - `failedCount`: validation errors that would occur.
   - `errors`: any validation errors.

## Step 4: Execute the Import

1. Invoke `parse-stock-master-csv` with `dryRun: false`:
   ```json
   {
     "filePath": "imports/stock-master/202506_list_of_tse_listed_issues.csv",
     "dryRun": false
   }
   ```
2. The function will:
   - Insert new stocks with `support_status = 'unsupported'`.
   - Update existing stocks (preserving their `id` and `support_status` for supported stocks).
   - Overwrite `name` and `market_segment` for all matched tickers.
   - Mark tickers present in the DB but missing from the CSV as `support_status = 'delisted'`.
   - Write a log entry to `stock_import_logs`.

## Step 5: Verify the Import

1. Check `stock_import_logs` in Supabase Studio for the latest run.
2. Query `stocks` to confirm row count >= 3,800.
3. Verify a few known tickers exist with correct `market_segment`.
4. Confirm existing `supported` stocks retained their `id` and `support_status`.

## Rollback Procedure

If the import causes issues:

1. Identify the previous good CSV file in Storage.
2. Re-invoke `parse-stock-master-csv` with the previous CSV path and `dryRun: false`.
3. For catastrophic failure, restore from a database backup (if available).

## Cadence

- Run once per month (recommended: first business day of the month).
- Update the file name to reflect the current `YYYYMM`.

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| "Invalid CSV header" | Headers are not exactly `ticker,name,market_segment` | Re-export with correct headers |
| "Duplicate tickers in CSV" | Same ticker appears multiple times | Deduplicate in the source file |
| "Failed to download file" | Wrong bucket or path | Verify the full `filePath` in Storage |
| Delisted count is unexpectedly high | JPX removed stocks or CSV is incomplete | Verify source file completeness |

## Edge Function Invocation

- **URL**: `https://<project-ref>.supabase.co/functions/v1/parse-stock-master-csv`
- **Method**: `POST`
- **Headers**: `Authorization: Bearer <user-jwt>` (admin user required)
- **Body**: `{ "filePath": string, "dryRun": boolean }`

## Security Notes

- Only admin users can invoke this function.
- The Edge Function uses the service role key for DB operations; never expose this key to the browser.
- `stock_import_logs` is readable only by admins.
