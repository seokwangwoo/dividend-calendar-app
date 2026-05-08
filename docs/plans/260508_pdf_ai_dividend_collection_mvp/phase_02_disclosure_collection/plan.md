# Phase 02: Disclosure Collection

## Goal

Implement deterministic TDnet/Yanoshin disclosure collection that stores only dividend-related and earnings-release candidates, classifies them, matches them to stocks, and enqueues follow-up jobs without invoking AI.

## Prerequisites

- Phase 01 Completion Criteria are met.
- Yanoshin TDnet list API is the Phase 02 source: `https://webapi.yanoshin.jp/webapi/tdnet/list/{condition}.json2` by default, with `.json` allowed if the simplified `json2` shape is insufficient.
- `stocks` includes ticker/company-code fields sufficient to match TDnet company codes, including alphanumeric four-character Japanese securities codes such as `130A`.

## Implementation Scope

- Replace or extend the existing `collect-disclosures` Edge Function so it fetches Yanoshin TDnet list responses by condition and still accepts normalized test candidates.
- Implement title keyword filtering for strong dividend, earnings, and correction disclosure groups.
- Classify each accepted disclosure and assign initial `review_priority`.
- Upsert `disclosures` idempotently by `external_id`.
- Enqueue `download_disclosure_pdf` jobs according to document availability and classification; do not enqueue `parse_disclosure_pdf_ai` until the PDF download handler stores the file successfully.
- Add GitHub Actions Cron configuration for daily 16:00, 18:00, and 22:00 JST invocation, passing `mode = recent` or an explicit date condition.

## Core Tasks

1. **Yanoshin source adapter**
   - Add a Yanoshin TDnet client module or Edge Function helper with typed normalized disclosure fields.
   - Build list URLs as `https://webapi.yanoshin.jp/webapi/tdnet/list/{condition}.{format}?limit={limit}&hasXBRL=0`.
   - Use `format = json2` by default because it removes the extra `items -> TDnet` nesting; allow `json` as a fallback when fixture evidence requires fields that `json2` omits.
   - Support conditions `recent`, `today`, `yesterday`, a single four-character securities code, hyphen-joined securities codes, `YYYYmmdd`, and `YYYYmmdd-YYYYmmdd`.
   - Map request body `{ "date": "YYYY-MM-DD", "mode": "recent" }` to `recent` when mode is recent, otherwise to `YYYYmmdd`; allow manual condition override for backfill/testing.
   - Keep `hasXBRL=0` for MVP PDF collection because `hasXBRL=1` makes `document_url` point to XBRL files rather than disclosure PDFs.
   - Preserve a normalized candidate input path so unit/integration tests do not require live network access.

2. **Keyword groups and classification**
   - Define strong dividend keywords: `配当予想`, `配当予想の修正`, `剰余金の配当`, `期末配当`, `中間配当`, `増配`, `減配`, `無配`, `復配`, `特別配当`, and `記念配当`.
   - Define earnings keywords: `決算短信`, `四半期決算短信`, and `通期決算短信`.
   - Define correction keywords: `訂正`, `一部訂正`, and `修正`.
   - Implement classification precedence: `配当予想の修正`, `剰余金の配当`, `決算短信`, correction, then `other`.
   - Treat correction plus dividend-related title as high review priority.

3. **Normalization, stock matching, and persistence**
   - Normalize Yanoshin rows into the existing candidate contract: `externalId`, `sourceType`, `ticker`, `companyName`, `title`, `documentUrl`, `publishedAt`, and `rawPayload`.
   - Derive `externalId` from a source-provided identifier when available; otherwise use a stable `tdnet:{publishedAt}:{ticker}:{documentUrl-or-title}` key so repeated Yanoshin fetches are idempotent.
   - Match TDnet company code to `stocks.ticker` or the repository's canonical Japanese ticker field, preserving alphanumeric codes.
   - Store unmatched but relevant disclosures with `stock_id = null` only if operationally useful for admin triage; otherwise record structured skip results.
   - Upsert `disclosures` with raw source payload, title, document URL, published timestamp, source type, disclosure type, and initial parse status.

4. **Job enqueue rules**
   - Create `download_disclosure_pdf` job whenever an accepted disclosure has a PDF URL and no stored PDF.
   - Do not create `parse_disclosure_pdf_ai` jobs in Phase 02; parsing depends on `disclosures.storage_path` and is enqueued by the successful download handler.
   - If an accepted disclosure has no PDF URL, still save the `disclosures` row but set `parse_status = 'skipped'`, `review_priority = 'high'`, `last_parse_error = 'missing_document_url'`, and `raw_payload.missing_document_url = true`; create no download or parse job.
   - Do not enqueue AI parse jobs for generic non-dividend supplemental materials in MVP unless explicitly classified as accepted and a PDF is later downloaded.
   - Make job creation idempotent for repeated collection of the same disclosure.

5. **Scheduler**
   - Add GitHub Actions workflow that invokes the Edge Function at 16:00, 18:00, and 22:00 JST.
   - Include manual dispatch inputs for `date`, `mode`, `condition`, `format`, and `limit`.
   - Default `limit` to Yanoshin's documented default of 300 unless an environment variable or dispatch input overrides it.
   - Keep secrets in GitHub Actions/Supabase environment variables only, even though the Yanoshin list API itself is public.

6. **Tests to add or update**
   - Unit tests for Yanoshin URL construction across `recent`, `today`, `YYYYmmdd`, date range, single ticker, and hyphen-joined ticker conditions.
   - Unit tests proving `hasXBRL=0` is the MVP default and `limit` is configurable.
   - Unit tests for keyword filtering and classification precedence.
   - Unit tests for priority assignment, including correction plus dividend keyword.
   - Edge Function tests or mocked integration tests for Yanoshin fixture normalization, candidate input, upsert idempotency, download-job enqueue idempotency, missing-document-url skipped/high behavior, and proof that parse jobs are not created before PDF storage exists.
   - Scheduler workflow validation if the repository has CI checks for workflow files.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration` when Supabase test credentials are available.
- Manual verification:
  - Invoke `collect-disclosures` with a mocked Yanoshin `json2` response and fixture candidates containing dividend, earnings, correction, and unrelated titles.
  - Confirm only accepted disclosures are stored and the request URL uses `hasXBRL=0`.
  - Confirm duplicate invocations do not create duplicate disclosures or duplicate jobs.

## Completion Criteria

- `collect-disclosures` can collect from Yanoshin by `recent`, date, date range, and ticker conditions and can also run against normalized local/test candidates.
- Relevant dividend and earnings disclosure titles are accepted; unrelated disclosures are skipped before AI costs are incurred.
- Accepted disclosures are classified and prioritized according to the MVP rules.
- PDF download jobs are enqueued idempotently, missing-PDF accepted disclosures are retained as skipped/high/manual-check records without jobs, and no AI parse job is created before successful PDF storage.
- GitHub Actions Cron exists with the required JST schedule and manual dispatch support for date/mode/condition/format/limit inputs.

## Excluded From This Phase

- Downloading PDF bytes.
- AI parsing or text extraction.
- Admin review screens.
- User notification creation.
