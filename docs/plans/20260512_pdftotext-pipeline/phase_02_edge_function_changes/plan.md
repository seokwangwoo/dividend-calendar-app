# Phase 02: Edge Function Changes — supported_types + Use extracted_text

## Goal

Update the `process-jobs` Edge Function so that:

1. The caller can pass a `supported_types` array in the request body to restrict which job types are processed (enabling GitHub Actions to call it for download-only or parse-only passes).
2. `executeParseDisclosurePdfAi` uses `disclosure.extracted_text` when it is non-null, bypassing pdf.js entirely.
3. The `DisclosureForParse` type and `fetchDisclosureForParse` query include `extracted_text`.

## Prerequisites

- Phase 01 migration is applied (`disclosures.extracted_text` column exists)
- `npm run typecheck` and `npm run lint` pass

## Implementation Scope

### `supabase/functions/process-jobs/index.ts`

- Parse optional `supported_types` from the request body: `body.supported_types ?? body.supportedTypes`
  - Must be a non-empty string array when provided; ignored (defaults to all types) when absent or invalid
- Pass `supported_types` to `createSupabaseJobsClient()` — this overrides the `supportedTypes` argument currently hardcoded at call site
- The existing `handlers` map stays the same; only the `supportedTypes` list passed to `createSupabaseJobsClient` changes based on the request body parameter

Implementation detail in the Deno.serve handler (after parsing `batchSize`):
```typescript
const rawSupportedTypes = isRecord(body) ? (body.supported_types ?? body.supportedTypes) : null;
const requestedTypes: string[] | null =
  Array.isArray(rawSupportedTypes) &&
  rawSupportedTypes.length > 0 &&
  rawSupportedTypes.every((t) => typeof t === "string")
    ? (rawSupportedTypes as string[])
    : null;

const handlers = {
  download_disclosure_pdf: createDownloadDisclosurePdfHandler(supabase),
  parse_disclosure_pdf_ai: createParseDisclosurePdfAiHandler(supabase)
};
// Only process types that are both in handlers and in the requested list (if provided)
const effectiveSupportedTypes = requestedTypes
  ? Object.keys(handlers).filter((t) => requestedTypes.includes(t))
  : Object.keys(handlers);

const client = createSupabaseJobsClient(supabase, effectiveSupportedTypes);
```

### `supabase/functions/_shared/pdf-ai-parser.ts`

**`DisclosureForParse` type** — add optional field:
```typescript
extracted_text?: string | null;
```

**`fetchDisclosureForParse` in `process-jobs/index.ts`** — extend the SELECT:
```
"id, stock_id, external_id, title, source_type, document_url, disclosure_type, storage_path, published_at, ai_parse_attempts, raw_payload, extracted_text, stocks(id, ticker, name)"
```
And include `extracted_text: data.extracted_text ?? null` in the returned object.

**`executeParseDisclosurePdfAi`** — new early branch after fetching `disclosure`:

```typescript
// Use pre-extracted text from pdftotext if available; skip pdf.js entirely
let textExtraction: TextExtractionResult;
if (disclosure.extracted_text && disclosure.extracted_text.trim().length > 0) {
  const earningsRelease =
    disclosureType === "earnings_release" || disclosureType === "earnings_revision";
  const { trimmedText, sectionTrimmed } = trimToDividendSections(
    disclosure.extracted_text,
    { earningsRelease }
  );
  const text = isTextUsable(trimmedText) ? trimmedText : disclosure.extracted_text;
  textExtraction = {
    text,
    method: "extracted_text",
    sectionTrimmed,
    fallbackReason: null
  };
} else {
  // Fallback: download PDF and use pdf.js extraction
  // ... (existing pdfBytes download and prepareTextForAI call, unchanged)
}
```

The rest of `executeParseDisclosurePdfAi` (prompt building, OpenAI call, validation, upsert) is unchanged.

**Important**: When `extracted_text` branch is taken, `pdfBytes` is never downloaded. The `downloadPdf` dep is only called in the fallback path. The `textExtractionMethod` in `OpenAIParseRequest` remains `"extracted_text"`, which is already handled correctly by `callOpenAIResponsesApi`.

### `AiParseDependencies` — `downloadPdf` stays required

`downloadPdf` remains a required dep because the pdf.js fallback still needs it. No interface changes.

## Core Tasks

1. **`supabase/functions/process-jobs/index.ts`**:
   - Parse `supported_types` / `supportedTypes` from request body
   - Compute `effectiveSupportedTypes` as described above
   - Pass `effectiveSupportedTypes` to `createSupabaseJobsClient()`
   - In `fetchDisclosureForParse`: extend SELECT string and add `extracted_text` to the returned object

2. **`supabase/functions/_shared/pdf-ai-parser.ts`**:
   - Add `extracted_text?: string | null` to `DisclosureForParse`
   - In `executeParseDisclosurePdfAi`: add the `disclosure.extracted_text` branch before the existing `prepareTextForAI` call
   - Extract the existing pdfBytes download + `prepareTextForAI` call into the `else` branch

3. **Regenerate TypeScript types** (if Supabase CLI is available):
   ```bash
   npx supabase gen types typescript --local > src/types/supabase.ts
   ```
   Only needed if the type generator picks up the new column. If not auto-generated, manually verify `src/types/supabase.ts` does not conflict.

## Test Plan

- `npm run typecheck` — no type errors
- `npm run lint` — zero ESLint warnings
- `npm run test:unit` — all existing unit tests pass
- Manual smoke test (optional, requires deployed function):
  - Call `process-jobs` with `{ "supported_types": ["download_disclosure_pdf"] }` — verify only download jobs are processed
  - Call `process-jobs` with `{ "supported_types": ["parse_disclosure_pdf_ai"] }` — verify only parse jobs are processed
  - Call `process-jobs` with `{}` — verify all types are processed (backward compat)

## Completion Criteria

- `DisclosureForParse.extracted_text` field is present and typed as `string | null | undefined`
- `fetchDisclosureForParse` SELECTs and returns `extracted_text`
- `executeParseDisclosurePdfAi` takes the pre-extracted text branch when `disclosure.extracted_text` is a non-empty string, skipping pdf.js
- `executeParseDisclosurePdfAi` falls back to pdf.js when `disclosure.extracted_text` is null/undefined/empty
- `process-jobs` Edge Function accepts and respects `supported_types` in request body
- When `supported_types` is absent, the function processes all types unchanged
- `npm run typecheck` and `npm run lint` pass
- All existing unit tests pass

## Excluded From This Phase

- GitHub Actions workflow changes
- Removing pdf.js code
- Changes to the AI prompt
- Modifying `pdf-table-extractor.ts`
