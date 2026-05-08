# PDF AI Dividend Collection Plan Audit Agent

## Purpose

Use this file as a lightweight audit checklist before and after executing each phase of the PDF AI dividend collection plan.

## Audit Loop

1. Confirm any behavior, schema, workflow, security, or terminology decision for the phase is reflected in the existing source specifications before implementation starts.
2. Confirm the phase does not expose AI results to user-facing pages before approval.
3. Confirm service-role credentials, `OPENAI_API_KEY`, and OpenAI model configuration are used only in Edge Functions or server-only contexts.
4. Confirm new database contracts are reflected in migrations, generated or maintained TypeScript types, and tests.
5. Confirm all job handlers run through the central `process-jobs` runner, all job/Yanoshin collection runs are idempotent when retried with the same payload or condition, missing-PDF accepted disclosures are skipped/high without jobs, and parse jobs are only created after successful PDF storage.
6. Confirm low-confidence or high-risk AI results become admin review work, not automatic app data.
7. Confirm user-facing dividend totals continue to filter by approved payable `dividend_events`, exclude `annual_total` reference events, avoid double-counting special/commemorative breakdown components, and never synthesize `ex_dividend_date`.
8. Confirm tests mock external network and OpenAI Responses API calls unless explicitly running a manual integration check.
9. After implementation, perform a documentation audit for implementation-proven details only; do not introduce new behavior during the after-the-fact spec pass.

## Stop Conditions

Pause implementation and update the source specifications and plan if:

- A phase requires parsing all TDnet disclosures with AI or sets Yanoshin `hasXBRL=1` for the MVP PDF collection path.
- User-facing code needs to read directly from `dividend_reviews`.
- A browser route needs a service-role key, `OPENAI_API_KEY`, OpenAI model configuration secret, raw private Storage path, or direct access to `process-jobs`.
- Existing `payment_year` behavior conflicts with a proposed `fiscal_year`-only implementation, an approval path can create user-facing events without confirmed `payment_year`, `annual_total` can be counted in user-facing cash total/calendar aggregation, special/commemorative components can be counted both as breakdowns and separate payable rows, `ex_dividend_date` is calculated from `record_date` without a separate approved market-calendar plan, missing-PDF accepted disclosures create jobs, or parse jobs can be enqueued before PDF storage succeeds.
