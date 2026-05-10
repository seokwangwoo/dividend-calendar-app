# Phase 02 Verification

Phase file: `docs/plans/260508_pdf_ai_dividend_collection_mvp/phase_02_disclosure_collection/plan.md`

Verification date: 2026-05-10

Environment:
- Workspace: `/home/seo/OneDrive/linux/projects/dividend-calendar-app`
- Shell: `zsh`
- Node/Next/Vitest through repository `npm` scripts
- Remote Supabase integration credentials loaded from `.env.local`

## Test Plan Results

| Test-plan item | Status | Evidence |
|---|---:|---|
| `npm run lint` | PASS | ESLint completed with `--max-warnings=0`. |
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `npm run build` | PASS | Next.js production build compiled, type-checked, and generated 18 static pages. |
| `npm run test:unit` | PASS | 37 files, 348 tests passed. Includes new disclosure collection helper tests. |
| `npm run test:integration` when Supabase credentials are available | PASS | Initial sandbox run failed on Supabase DNS/network access. Re-run with approved network escalation passed: 11 files, 71 tests passed. |
| Manual: invoke `collect-disclosures` with mocked Yanoshin `json2` response and fixture candidates | PASS BY MOCKED FIXTURE TEST | Direct Edge Function invocation was not available locally because `deno` is not installed. Equivalent mocked fixture coverage is in `src/features/disclosures/disclosure-collection.test.ts`, covering `json2` row extraction, normalized candidate input, dividend/earnings/correction/unrelated titles, and alphanumeric ticker normalization. |
| Manual: confirm only accepted disclosures are stored and request URL uses `hasXBRL=0` | PASS BY CODE/TABLE CONTRACT REVIEW | Helper tests prove unrelated titles are rejected before persistence and `buildYanoshinListUrl` emits `hasXBRL=0` with default `json2` and configurable `limit`. Edge Function persistence only runs after `candidate.accepted`. |
| Manual: confirm duplicate invocations do not create duplicate disclosures or duplicate jobs | PASS BY CODE/TABLE CONTRACT REVIEW | `disclosures.external_id` is used for lookup before insert. `download_disclosure_pdf` job creation checks existing `jobs` rows with matching `{ disclosureId }` payload before insert. No `parse_disclosure_pdf_ai` job is created by Phase 02 code. |

## Commands Run

```bash
npm run test:unit -- src/features/disclosures/disclosure-collection.test.ts
```

Result: FAIL on first run because the test expected `配当予想の修正` to be normal priority. The phase plan treats correction/revision plus dividend-related title as high priority, so the test was corrected. The command also ran all `src` tests because the existing script already includes `src`.

```bash
npm run lint
```

Result: PASS.

```bash
npm run typecheck
```

Result: PASS.

```bash
npm run test:unit
```

Result: PASS, 37 test files and 348 tests.

```bash
npm run build
```

Result: PASS. Next.js 15.5.15 production build completed successfully.

```bash
npm run test:integration
```

Result: FAIL in the default sandbox because network access to `zmsakrezapoxbugnphix.supabase.co` failed with `getaddrinfo EAI_AGAIN`.

```bash
npm run test:integration
```

Result after approved network escalation: PASS, 11 test files and 71 tests.

```bash
deno --version
```

Result: FAIL, `deno` is not installed locally. This prevented a local `supabase functions serve` style manual Edge Function invocation, so manual fixture checks were verified through the shared helper unit tests and implementation review.

## Phase-Specific Verification Notes

- Yanoshin URL construction supports `recent`, `today`, explicit `YYYYmmdd`, date ranges, single alphanumeric ticker, and hyphen-joined ticker conditions.
- Yanoshin URLs default to `.json2`, `limit=300`, and `hasXBRL=0`; `.json` remains available as an explicit fallback.
- Keyword filtering covers strong dividend, earnings, and correction groups from the phase plan.
- Classification precedence is implemented as dividend forecast revision, dividend decision, earnings release, correction, then other.
- `collect-disclosures` now accepts either normalized test candidates or live Yanoshin list fetches.
- Accepted disclosures with missing PDF URLs are persisted as `parse_status = skipped`, `review_priority = high`, `last_parse_error = missing_document_url`, and `raw_payload.missing_document_url = true`; no job is created.
- Accepted disclosures with PDF URLs create only `download_disclosure_pdf` jobs. Phase 02 does not enqueue `parse_disclosure_pdf_ai`.
- The Edge Function uses the Supabase service-role key for system writes and rejects requests whose bearer token does not match that key.
- GitHub Actions workflow schedules 16:00, 18:00, and 22:00 JST collection and supports manual `date`, `mode`, `condition`, `format`, and `limit` inputs.
