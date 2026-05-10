# PDF AI Dividend Collection Spec Coverage

## Coverage Matrix

| Spec Area | Planned Coverage | Phase |
|---|---|---|
| MVP goal: PDF + AI parsing with admin confirmation | End-to-end collection, PDF storage, AI review candidates, approval, and user-surface gating | Phases 01-08 |
| Included disclosure types | Dividend forecast revisions, dividend decisions, earnings releases, corrections, and low-priority supplemental handling | Phases 01-02 |
| Excluded scope | XBRL full parser, all-disclosure AI parsing, brokerage integration, pre-approval notifications, separate backend | README Scope |
| Architecture | GitHub Actions Cron, Edge Functions, Yanoshin/TDnet, Storage, central `process-jobs` runner, AI parsing, reviews, approvals, notifications | Phases 02-07 |
| Data source priority | Yanoshin TDnet list API, TDnet PDF URL from `document_url`, Supabase Storage, AI parser, admin review | Phases 02-06 |
| Keyword filtering | Strong dividend, earnings, and correction keyword groups with priority classification | Phase 02 |
| `disclosures` schema | Add disclosure type, parse status, review priority, AI attempts, error payload, raw payload, indexes | Phase 01 |
| `dividend_reviews` schema | Add fiscal year, event type, dates, change type, evidence, warnings, rejection, raw AI payload, and one-review-per-AI-event semantics | Phase 01 |
| `dividend_events` schema alignment | Ensure approved event fields support fiscal year, payment year/month/date, source metadata, disclosure linkage, required `payment_year` before user-facing approval, `annual_total` exclusion from payable aggregation, and special/commemorative breakdown metadata | Phases 01 and 05 |
| `jobs` schema | Add max attempts, job types, status contracts, run-after retry behavior, and central `process-jobs` claim/dispatch semantics | Phases 01 and 03 |
| `collect-disclosures` | Fetch Yanoshin `json2`/`json` list responses by recent/date/range/ticker conditions with `hasXBRL=0`, filter, classify, match stocks, upsert, enqueue PDF download jobs only, and mark missing-PDF accepted disclosures as skipped/high | Phase 02 |
| `download_disclosure_pdf` job | First `process-jobs` handler downloads PDFs, validates file type, stores in private bucket, updates status, retries failures, and enqueues dependent parse jobs after successful storage | Phase 03 |
| `parse_disclosure_pdf_ai` job | Add `process-jobs` handler to load stored PDF/text after download success, select prompt, call OpenAI, validate JSON, create one review per AI event, update status | Phase 04 |
| `approve-dividend-review` | Admin JWT check, optional overrides, upsert event, mark review approved, enqueue notifications | Phase 05 |
| `reject-dividend-review` | Admin JWT check, rejection status and reason | Phase 05 |
| AI input strategy | OpenAI Responses API with extracted text and relevant-section trimming first; direct PDF/page input and OCR are fallback/hardening paths | Phase 04, Phase 08 follow-up boundaries |
| AI JSON schema | Use OpenAI Structured Outputs/JSON schema, then validate ticker, disclosure type, currency, events, warnings, and needs manual check server-side | Phase 04 |
| AI prompts | Separate dividend-specific and earnings-release prompt templates | Phase 04 |
| AI validation | JSON parsing, enum checks, date checks, amount checks, confidence range, ticker warning, explicit-only `ex_dividend_date` | Phase 04 |
| Confidence adjustment | Server-side deterministic score adjustment and priority mapping | Phase 04 |
| Manual review priority | High/urgent routing for low confidence, corrections, decreases, no dividend, special dividends, large differences | Phase 04 |
| MVP 1 admin review | Supabase Studio remains usable through table contracts | Phases 01 and 05 |
| MVP 2 admin review UI | `/admin/dividend-reviews` list, card details, signed PDF, edit, approve, reject | Phase 06 |
| User home/calendar surfaces | Approved payable events only, `annual_total` exclusion, special/commemorative no-double-count behavior, expected date/month behavior, explicit-only ex-dividend basis, disclaimer copy | Phase 07 |
| Notifications | Approval-time dividend change notification creation and deduplication, including special/commemorative breakdown notifications without duplicate payable rows | Phase 07 |
| Approval matching | Upsert one event per approved review by stock, fiscal year, event type, and source publication context while deriving `payment_year`, requiring admin confirmation for month-only timing, treating `annual_total` as reference-only, and preserving special/commemorative breakdowns on parent payable events | Phase 05 |
| Error handling | Missing document URL skipped/high state, download failure, dependent parse-job creation, invalid missing-storage parse state, AI failure, no-result handling, retry and final failure state | Phases 02-04 |
| Cost reduction | Yanoshin `limit`, title filtering, `hasXBRL=0` PDF-only collection, relevant text extraction before OpenAI calls, idempotent parsing, no all-TDnet AI parsing | Phases 02, 04, 08 |
| Security | Service-role and AI secrets only in Edge Functions, private Storage, signed admin PDF access | Phases 01, 03, 06 |
| Investment disclaimer | User-facing and notification copy makes clear the app is not investment advice | Phase 07 |
| MVP 1/2/3 priority sequencing | Data/contracts, collection, download, parsing, review approval, admin UI, notifications, hardening | Phases 01-08 |
| Success criteria | Collection, PDF storage, AI extraction, review, user reflection, notifications, safety | Plan Completion Definition |
| E2E user isolation safety | Pending/rejected/needs-manual-check reviews invisible to users; `annual_total` excluded from cash/calendar totals; special/commemorative non-double-count; explicit-only `ex_dividend_date` | Phase 09 |
| E2E admin review UI | List filters, priority sorting, detail rendering, signed PDF access, raw payload visibility, correction badges | Phase 09 |
| E2E approval pipeline | Approve/reject via real Edge Functions, override validation, required `payment_year` for month-only timing, idempotency, sibling independence | Phase 09 |
| E2E notification integration | Eligible change types create notifications after approval, deduplication on re-approval, rejection creates no notification | Phase 09 |
| E2E full pipeline flow | Seeded disclosure → review → approval → user home/calendar/notification reflection in a single narrative spec | Phase 09 |
| E2E regression protection | Existing `mvp-critical-flows`, `calendar`, `notifications`, `portfolio`, `admin-workflow`, and `verify-*` specs continue to pass | Phase 09 |
| E2E system pipeline | `collect-disclosures` fixture candidate → disclosure + job creation, idempotency; `process-jobs` download → complete/retry/final-failure → DB + Admin UI reflection | Phase 09 |

## Existing Repository Contracts To Preserve

- Existing user-facing dividend calculations depend on approved payable `dividend_events` and `payment_year`; this plan must not regress those filters, approve events without a confirmed `payment_year`, include `annual_total` in cash total/payment-calendar aggregation, double-count special/commemorative breakdown components as separate payable rows, or synthesize `ex_dividend_date` from `record_date`.
- Existing `/admin` routes and Edge Functions already provide a manual review baseline; this plan should extend them rather than replacing the whole admin model at once.
- Existing notification deduplication and target-scope decisions remain authoritative for user delivery; disclosure-based notifications must integrate with those decisions.

## Intentional Follow-Up Work Outside This Plan

- Full XBRL parser and XBRL-vs-PDF reconciliation.
- OCR-specific infrastructure for image-only PDFs unless Phase 08 evidence shows text extraction plus OpenAI direct PDF fallback is insufficient.
- Batch backfill of historical multi-year TDnet disclosures beyond the MVP collection window.
- Advanced monitoring dashboards, alerting, and queue worker autoscaling.
