# Phase 02 Verification

Phase file: `docs/plans/20260512_pdftotext-pipeline/phase_02_edge_function_changes/plan.md`

Date: 2026-05-12

Environment:
- Worktree: `/home/seo/OneDrive/linux/projects/dividend-calendar-app-wt-pdftotext-02`
- Node: v20.15.1 observed during `npm install`
- Supabase CLI: project local CLI via `npx supabase`

## Test Plan Results

| Test plan item | Status | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | Completed with exit code 0 after code and type updates. |
| `npm run lint` | PASS | Completed with exit code 0 after code and type updates. |
| `npm run test:unit` | PASS | The full unit suite passed after restoring the missing optional native `@rolldown/binding-linux-x64-gnu` package and updating stale test expectations/mocks. Final result: 46 test files passed, 634 tests passed. |
| Manual smoke test: `supported_types` download-only | SKIPPED | Requires a deployed Edge Function and remote job queue; not available in this local phase worktree. Code was manually verified to filter requested types against the handler map. |
| Manual smoke test: `supported_types` parse-only | SKIPPED | Requires a deployed Edge Function and remote job queue; not available in this local phase worktree. Code was manually verified to filter requested types against the handler map. |
| Manual smoke test: `{}` backward compat | SKIPPED | Requires a deployed Edge Function and remote job queue; not available in this local phase worktree. Code was manually verified to default to all handler keys when no valid `supported_types` is provided. |

## Additional Focused Verification

| Check | Status | Evidence |
|---|---|---|
| Supabase type generation availability | PASS | Ran `npx supabase gen types typescript --local`; output included `disclosures.extracted_text: string | null`. To avoid unrelated full-file generated formatting churn, only the new `extracted_text` fields were added to `src/types/supabase.ts`. |
| Disclosure parser tests | PASS | Ran `npx vitest run --reporter=verbose src/features/disclosures/pdf-ai-parser.test.ts src/features/disclosures/parser-fixtures.test.ts src/features/disclosures/pdf-job-runner.test.ts`; 3 files passed, 149 tests passed. |
| `extracted_text` skips pdf.js download | PASS | Added unit test `uses pre-extracted disclosure text without downloading the PDF`; it asserts `downloadPdf` is not called, OpenAI receives `textExtractionMethod: "extracted_text"`, `pdfBytes: null`, and extracted text content. |
| Blank `extracted_text` fallback | PASS | Added unit test `falls back to PDF extraction when pre-extracted text is blank`; it asserts `downloadPdf` is called for the disclosure storage path. |

## Commands Run

```bash
npm install
```

Status: PASS

Notes: Installed dependencies in the isolated worktree. npm reported engine warnings because the current Node runtime is v20.15.1 while some transitive packages request newer Node patch versions.

```bash
npm run typecheck
```

Status: PASS

```bash
npm run lint
```

Status: PASS

```bash
npm run test:unit
```

Status: FAIL

Important output summary:
- Initial run could not start because npm skipped the optional native package `@rolldown/binding-linux-x64-gnu`.
- After `npm install --no-save @rolldown/binding-linux-x64-gnu@1.0.0-rc.17`, the full suite ran.
- The first full run reported 46 test files, 43 passed and 3 failed; 634 tests, 626 passed and 8 failed.
- Failed files were:
  - `src/features/holdings/actions.test.ts`
  - `src/features/notifications/actions.test.ts`
  - `src/features/stocks/queries.test.ts`
- Fixed stale expectations/mocks in those test files, then reran `npm run test:unit`.

```bash
npm run test:unit
```

Status: PASS

Important output summary:
- 46 test files passed.
- 634 tests passed.

```bash
npx vitest run --reporter=verbose src/features/disclosures/pdf-ai-parser.test.ts src/features/disclosures/parser-fixtures.test.ts src/features/disclosures/pdf-job-runner.test.ts
```

Status: PASS

Important output summary:
- 3 test files passed.
- 149 tests passed.

```bash
npx supabase gen types typescript --local
```

Status: PASS

Important output summary:
- Generated type output includes `disclosures.Row.extracted_text: string | null`.
- Generated type output includes `disclosures.Insert.extracted_text?: string | null`.
- Generated type output includes `disclosures.Update.extracted_text?: string | null`.

## Manual Verification

- Confirmed `process-jobs` reads optional `body.supported_types ?? body.supportedTypes`.
- Confirmed invalid, empty, or absent `supported_types` defaults to all handler keys for backward compatibility.
- Confirmed valid requested types are intersected with the handler map before passing to `createSupabaseJobsClient`.
- Confirmed `fetchDisclosureForParse` SELECT includes `extracted_text` and returns it as `string | null`.
- Confirmed `DisclosureForParse` includes `extracted_text?: string | null`.
- Confirmed `executeParseDisclosurePdfAi` uses non-empty `disclosure.extracted_text` through `trimToDividendSections` and `isTextUsable`, without calling `downloadPdf`.
- Confirmed null, undefined, or blank `extracted_text` keeps the existing pdf.js fallback path via `downloadPdf` and `prepareTextForAI`.
- Confirmed no GitHub Actions workflow files were changed in this phase.
- Confirmed `pdf-table-extractor.ts` was not modified.

## Skipped Checks

- Deployed Edge Function smoke tests were skipped because they require a deployed function, service role credentials, and a remote job queue.

## Failures And Fixes

- `npm run test:unit` initially failed at startup due to missing optional native package `@rolldown/binding-linux-x64-gnu`. Installing the already locked optional package with `--no-save` fixed Vitest startup.
- The first full unit run then found 8 stale test failures outside the parser implementation. Fixed the tests to match current behavior and query chains:
  - `src/features/holdings/actions.test.ts`: aligned missing-stock message with current Japanese UI copy and current unsupported-stock behavior.
  - `src/features/notifications/actions.test.ts`: added the missing `.single()` mock for the stock dividend-data validation query.
  - `src/features/stocks/queries.test.ts`: added the missing `.in()` mock and updated prefix-search expectations.
- After those fixes, `npm run typecheck`, `npm run lint`, and `npm run test:unit` all passed.
