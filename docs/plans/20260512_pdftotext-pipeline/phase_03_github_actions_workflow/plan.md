# Phase 03: GitHub Actions Workflow — Split + pdftotext Extraction Step

## Goal

Restructure `.github/workflows/collect-disclosures.yml` to split the single `process-jobs` call into three sequential jobs:

1. `download` — calls `process-jobs` with `supported_types: ["download_disclosure_pdf"]` only
2. `extract` — for each newly-downloaded disclosure, downloads the PDF from Supabase Storage via signed URL, runs `pdftotext -layout`, and writes the extracted text to `disclosures.extracted_text` via Supabase REST API
3. `parse` — calls `process-jobs` with `supported_types: ["parse_disclosure_pdf_ai"]` only

This ensures the pdftotext text is available in the DB before the AI parse jobs run.

## Prerequisites

- Phase 01 migration is applied (`disclosures.extracted_text` column exists)
- Phase 02 Edge Function is deployed (supports `supported_types`, uses `extracted_text`)
- `SUPABASE_FUNCTION_URL`, `SUPABASE_SERVICE_ROLE_KEY` secrets are set in the GitHub repository
- `SUPABASE_PROJECT_REF` or `SUPABASE_REST_URL` is available (see implementation note below)

## Implementation Scope

File modified: `.github/workflows/collect-disclosures.yml`

### Job structure

```
collect  →  download  →  extract  →  parse
```

- `collect` job: unchanged — calls `collect-disclosures` Edge Function
- `download` job: replaces the old `process-jobs` call; sends `{ supported_types: ["download_disclosure_pdf"], batch_size: <N> }`
- `extract` job: new job; queries Supabase for disclosures with `storage_path IS NOT NULL AND extracted_text IS NULL`, downloads each PDF, runs `pdftotext -layout`, patches `extracted_text` via Supabase REST PATCH
- `parse` job: new job; sends `{ supported_types: ["parse_disclosure_pdf_ai"], batch_size: <N> }`

### `extract` job implementation

The `extract` job uses `node` inline script (matching the pattern in the existing `collect` and `process-jobs` steps). Key steps:

1. Query disclosures pending extraction:
   ```
   GET ${SUPABASE_REST_URL}/rest/v1/disclosures?select=id,storage_path&storage_path=not.is.null&extracted_text=is.null&limit=50
   Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}
   apikey: ${SUPABASE_SERVICE_ROLE_KEY}
   ```
   Limit to 50 per run (matches typical `process-jobs` batch window). If no rows, skip gracefully.

2. For each disclosure:
   a. Create a signed URL for the PDF:
      ```
      POST ${SUPABASE_REST_URL}/storage/v1/object/sign/disclosures/${storage_path}
      { "expiresIn": 120 }
      ```
   b. Download the PDF bytes to a temp file: `curl -sL <signedUrl> -o /tmp/disclosure.pdf`
   c. Run `pdftotext -layout /tmp/disclosure.pdf /tmp/disclosure.txt`
   d. Read the output text file
   e. PATCH `disclosures` via REST:
      ```
      PATCH ${SUPABASE_REST_URL}/rest/v1/disclosures?id=eq.<id>
      { "extracted_text": "<text>" }
      ```
   f. Log `extracted id=<id> chars=<length>` or `failed id=<id> reason=<error>`

3. Continue on per-disclosure errors (do not fail the whole step on a single PDF error); report a summary at the end.

### Environment variables in `extract` job

```yaml
env:
  SUPABASE_REST_URL: ${{ secrets.SUPABASE_REST_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

`SUPABASE_REST_URL` is the Supabase project REST URL (e.g., `https://<ref>.supabase.co`). If not available as a secret, derive it from `SUPABASE_FUNCTION_URL` by replacing `/functions/v1` with an empty string.

### workflow_dispatch inputs

The existing `process_batch_size` input applies to both `download` and `parse` jobs.

No new inputs are required — the `extract` job's limit (50) is hardcoded as a safe default that can be adjusted later.

### Full updated workflow structure

```yaml
jobs:
  collect:
    # unchanged

  download:
    runs-on: ubuntu-latest
    needs: collect
    if: always()
    steps:
      - name: Invoke process-jobs (download only)
        env:
          SUPABASE_FUNCTION_URL: ${{ secrets.SUPABASE_FUNCTION_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          PROCESS_BATCH_SIZE: ${{ inputs.process_batch_size || vars.PROCESS_JOBS_BATCH_SIZE || '5' }}
        run: |
          set -euo pipefail
          node <<'NODE'
          const response = await fetch(`${process.env.SUPABASE_FUNCTION_URL}/process-jobs`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              batch_size: Number(process.env.PROCESS_BATCH_SIZE || "5"),
              supported_types: ["download_disclosure_pdf"]
            })
          });
          const text = await response.text();
          console.log(text);
          if (!response.ok) process.exit(1);
          NODE

  extract:
    runs-on: ubuntu-latest
    needs: download
    if: always()
    steps:
      - name: Extract PDF text with pdftotext
        env:
          SUPABASE_REST_URL: ${{ secrets.SUPABASE_REST_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          set -euo pipefail
          node <<'NODE'
          // (see Core Tasks below for full script)
          NODE

  parse:
    runs-on: ubuntu-latest
    needs: extract
    if: always()
    steps:
      - name: Invoke process-jobs (parse only)
        env:
          SUPABASE_FUNCTION_URL: ${{ secrets.SUPABASE_FUNCTION_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          PROCESS_BATCH_SIZE: ${{ inputs.process_batch_size || vars.PROCESS_JOBS_BATCH_SIZE || '5' }}
        run: |
          set -euo pipefail
          node <<'NODE'
          const response = await fetch(`${process.env.SUPABASE_FUNCTION_URL}/process-jobs`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              batch_size: Number(process.env.PROCESS_BATCH_SIZE || "5"),
              supported_types: ["parse_disclosure_pdf_ai"]
            })
          });
          const text = await response.text();
          console.log(text);
          if (!response.ok) process.exit(1);
          NODE
```

## Core Tasks

1. **Rename** the existing `process-jobs` job to `download`.
   - Change `needs: collect` to remain
   - Add `supported_types: ["download_disclosure_pdf"]` to the request body

2. **Add `extract` job** (depends on `download`, runs on ubuntu-latest):
   - `needs: download`, `if: always()`
   - Single step `Extract PDF text with pdftotext` using inline Node.js script:

   ```javascript
   const restUrl = process.env.SUPABASE_REST_URL;
   const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
   const headers = {
     "Authorization": `Bearer ${key}`,
     "apikey": key,
     "Content-Type": "application/json"
   };
   const LIMIT = 50;

   // 1. Fetch disclosures pending extraction
   const listRes = await fetch(
     `${restUrl}/rest/v1/disclosures?select=id,storage_path&storage_path=not.is.null&extracted_text=is.null&limit=${LIMIT}`,
     { headers }
   );
   if (!listRes.ok) { console.error("Failed to list disclosures", await listRes.text()); process.exit(1); }
   const disclosures = await listRes.json();
   console.log(`Disclosures pending extraction: ${disclosures.length}`);
   if (disclosures.length === 0) process.exit(0);

   const { execSync, spawnSync } = await import("child_process");
   const fs = await import("fs");
   const os = await import("os");
   const path = await import("path");

   let extracted = 0, failed = 0;
   for (const d of disclosures) {
     try {
       // 2a. Create signed URL
       const signRes = await fetch(
         `${restUrl}/storage/v1/object/sign/disclosures/${d.storage_path}`,
         { method: "POST", headers, body: JSON.stringify({ expiresIn: 120 }) }
       );
       if (!signRes.ok) throw new Error(`sign_failed:${await signRes.text()}`);
       const { signedURL } = await signRes.json();

       // 2b. Download PDF
       const tmpPdf = path.join(os.tmpdir(), `disclosure_${d.id}.pdf`);
       const tmpTxt = path.join(os.tmpdir(), `disclosure_${d.id}.txt`);
       const dlResult = spawnSync("curl", ["-sLf", signedURL, "-o", tmpPdf], { encoding: "utf8" });
       if (dlResult.status !== 0) throw new Error(`download_failed:${dlResult.stderr}`);

       // 2c. Run pdftotext
       const ptResult = spawnSync("pdftotext", ["-layout", tmpPdf, tmpTxt], { encoding: "utf8" });
       if (ptResult.status !== 0) throw new Error(`pdftotext_failed:${ptResult.stderr}`);

       // 2d. Read extracted text
       const text = fs.readFileSync(tmpTxt, "utf8");

       // 2e. Cleanup temp files
       fs.unlinkSync(tmpPdf);
       fs.unlinkSync(tmpTxt);

       // 2f. PATCH disclosures
       const patchRes = await fetch(
         `${restUrl}/rest/v1/disclosures?id=eq.${d.id}`,
         { method: "PATCH", headers, body: JSON.stringify({ extracted_text: text }) }
       );
       if (!patchRes.ok) throw new Error(`patch_failed:${await patchRes.text()}`);
       console.log(`extracted id=${d.id} chars=${text.length}`);
       extracted++;
     } catch (err) {
       console.error(`failed id=${d.id} reason=${err.message}`);
       failed++;
     }
   }
   console.log(`Summary: extracted=${extracted} failed=${failed}`);
   // Don't exit(1) on partial failures — the parse step falls back to pdf.js
   NODE

3. **Add `parse` job** (depends on `extract`, runs on ubuntu-latest):
   - `needs: extract`, `if: always()`
   - Sends `supported_types: ["parse_disclosure_pdf_ai"]` to `process-jobs`

4. **Add `SUPABASE_REST_URL` secret** to GitHub repository settings (value: `https://<project-ref>.supabase.co`).

## Test Plan

- `npm run typecheck` — no type errors
- `npm run lint` — zero ESLint warnings
- Manual: trigger workflow via `workflow_dispatch` and verify:
  - `download` job shows only `download_disclosure_pdf` job type processed
  - `extract` job shows `extracted id=... chars=...` lines in logs
  - `parse` job shows only `parse_disclosure_pdf_ai` job type processed
  - At least one disclosure has `extracted_text IS NOT NULL` after the run
- Verify backwards compat: if `SUPABASE_REST_URL` secret is not set, the `extract` job exits non-zero but `parse` still runs (due to `if: always()`)

## Completion Criteria

- `.github/workflows/collect-disclosures.yml` has four jobs: `collect`, `download`, `extract`, `parse`
- `download` job invokes `process-jobs` with `supported_types: ["download_disclosure_pdf"]`
- `parse` job invokes `process-jobs` with `supported_types: ["parse_disclosure_pdf_ai"]`
- `extract` job uses `pdftotext -layout` and PATCHes `disclosures.extracted_text` via Supabase REST
- `extract` job handles per-disclosure errors gracefully (continues on error, does not fail the workflow step)
- `npm run typecheck` and `npm run lint` pass

## Excluded From This Phase

- Backfilling `extracted_text` for existing downloaded PDFs (can be done via a separate one-off script)
- Monitoring / alerting for extraction failures
- Removing pdf.js fallback code
