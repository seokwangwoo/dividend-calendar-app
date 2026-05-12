# Phase 03 Verification

Phase file: `docs/plans/20260512_pdftotext-pipeline/phase_03_github_actions_workflow/plan.md`

Date: 2026-05-12

Environment:
- Worktree: `/home/seo/OneDrive/linux/projects/dividend-calendar-app-wt-pdftotext-03`
- Node: v20.15.1 observed during `npm install`

## Test Plan Results

| Test plan item | Status | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | Completed with exit code 0. |
| `npm run lint` | PASS | Completed with exit code 0. |
| Manual workflow trigger verification | SKIPPED | Requires GitHub Actions execution with repository secrets and remote Supabase access. The workflow was statically verified locally instead. |
| Download job processes only `download_disclosure_pdf` | PASS, static | Reviewed `.github/workflows/collect-disclosures.yml`; `download` posts `supported_types: ["download_disclosure_pdf"]`. |
| Extract job runs `pdftotext -layout` and PATCHes `extracted_text` | PASS, static | Reviewed `.github/workflows/collect-disclosures.yml`; `extract` queries pending disclosures, signs storage URLs, runs `pdftotext -layout`, and PATCHes `disclosures.extracted_text`. |
| Parse job processes only `parse_disclosure_pdf_ai` | PASS, static | Reviewed `.github/workflows/collect-disclosures.yml`; `parse` posts `supported_types: ["parse_disclosure_pdf_ai"]`. |
| REST URL fallback when `SUPABASE_REST_URL` is absent | PASS, static | The implementation follows the phase implementation note: `extract` derives the REST base URL from `SUPABASE_FUNCTION_URL` by removing `/functions/v1`. If both `SUPABASE_REST_URL` and a derivable `SUPABASE_FUNCTION_URL` are unavailable, `extract` exits non-zero; `parse` still has `if: always()` and depends on `extract`. |

## Additional Verification

| Check | Status | Evidence |
|---|---|---|
| YAML parse | PASS | Parsed `.github/workflows/collect-disclosures.yml` with the installed `yaml` package. |
| Inline Node script syntax | PASS | Extracted the four `node <<'NODE'` script bodies and checked them with `node --input-type=module --check`. |
| Unit suite | PASS | Ran `npm run test:unit`; 46 files passed, 634 tests passed. |

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
node -e "const fs=require('fs'); const YAML=require('yaml'); YAML.parse(fs.readFileSync('.github/workflows/collect-disclosures.yml','utf8')); console.log('yaml ok');"
```

Status: PASS

Important output summary:
- `yaml ok`

```bash
node -e "const fs=require('fs'); const text=fs.readFileSync('.github/workflows/collect-disclosures.yml','utf8'); const blocks=[...text.matchAll(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/g)].map(m=>m[1]); if(blocks.length!==4){console.error('expected 4 node blocks, found '+blocks.length); process.exit(1);} console.log(blocks.map(b=>'{\n'+b+'\n}').join('\n'));" | node --input-type=module --check
```

Status: PASS

Important output summary:
- No syntax errors.
- Confirmed four inline Node script blocks were found.

```bash
npm run test:unit
```

Status: PASS

Important output summary:
- Initial run could not start because npm skipped the optional native package `@rolldown/binding-linux-x64-gnu`.
- Ran `npm install --no-save @rolldown/binding-linux-x64-gnu@1.0.0-rc.17`.
- Final result: 46 test files passed, 634 tests passed.

## Manual Verification

- Confirmed workflow jobs are now `collect`, `download`, `extract`, and `parse`.
- Confirmed job order is `collect -> download -> extract -> parse`.
- Confirmed `download` keeps the existing batch size input and adds `supported_types: ["download_disclosure_pdf"]`.
- Confirmed `extract` limits pending extraction query to 50 rows.
- Confirmed `extract` continues on per-disclosure errors and logs `failed id=... reason=...` without exiting non-zero for partial failures.
- Confirmed `extract` cleans up temporary PDF and text files in a `finally` block.
- Confirmed `parse` keeps the existing batch size input and adds `supported_types: ["parse_disclosure_pdf_ai"]`.

## Skipped Checks

- Live `workflow_dispatch` execution was skipped because it requires GitHub Actions runtime, repository secrets, Supabase service role credentials, and remote Supabase data.

## Failures And Fixes

- A first attempt to parse YAML with `ruby` failed because Ruby is not installed. Replaced it with the installed Node `yaml` package.
- A first attempt to use `node --input-type=module --check` directly on the YAML file failed because `--input-type` only applies to stdin/eval/print. Replaced it with extraction of embedded Node heredoc bodies piped to `node --input-type=module --check`.
- `npm run test:unit` initially failed at startup due to missing optional native package `@rolldown/binding-linux-x64-gnu`. Installing the already locked optional package with `--no-save` fixed Vitest startup.
