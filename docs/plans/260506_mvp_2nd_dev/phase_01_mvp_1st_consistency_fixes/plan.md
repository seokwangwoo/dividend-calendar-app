# Phase 01: MVP 1st Consistency Fixes

## Goal

Fix the MVP 1st data consistency problems before adding new features, so every user-facing annual dividend total is calculated from the same approved event source for the same `payment_year`, and settings/home copy reflect the annual after-tax dividend goal decision.

## Prerequisites

- MVP 1st Phase 08 Completion Criteria are met.
- Local Supabase migrations and generated TypeScript database types are available.
- Existing E2E value verification tests can run against a seeded test user.

## Implementation Scope

- Add or backfill `dividend_events.payment_year` as the user-facing calendar-year aggregation key.
- Update home, portfolio, calendar, stock detail, and related RPCs so annual/current-month totals use approved `dividend_events` for the selected `payment_year`.
- Keep `stocks.expected_annual_dividend_per_share` as a stock-level estimate for search/detail display, not as the portfolio annual cash-flow source of truth.
- Fix `get_portfolio_summary` and holding card totals to use approved events when showing "this year" dividend totals.
- Rename user-facing portfolio yield label to portfolio after-tax yield and calculate it as annual after-tax dividend / total acquisition cost.
- Replace monthly goal semantics with annual after-tax dividend goal where the UI promises annual progress.
- Store annual goal in `user_settings.annual_dividend_goal_amount`; keep `user_settings.default_amount_basis` as the canonical implementation name for default display basis.
- Update home "next dividend" logic using approved future events, `payment_start_date`, `estimated_payment_month`, and after-tax amount descending as tie breaker.
- Ensure user-facing status badges use dividend event status only, while review status appears only as small source metadata.

## Core Tasks

1. **Schema and seed alignment**
   - Add `payment_year int` to `dividend_events` if it is missing.
   - Backfill existing events from `payment_start_date` year when present, otherwise from `fiscal_year` plus the known seed fixture rules.
   - Add indexes for `(stock_id, payment_year)` and `(payment_year, estimated_payment_month)`.
   - Add `annual_dividend_goal_amount numeric(18,2)` to `user_settings` if it is missing.

2. **RPC source-of-truth cleanup**
   - Update `get_home_summary`, `get_portfolio_summary`, `get_dividend_calendar`, `get_dividend_month_detail`, and `get_stock_detail` to use approved events for user cash-flow totals.
   - Pass selected `p_year` through portfolio summary calls instead of relying on current stock estimates.
   - Keep unsupported or missing event data visible as unknown/empty rather than falling back to inconsistent stock estimates.

3. **Frontend query and UI updates**
   - Update TypeScript types, query functions, and tests for any RPC response changes.
   - Update portfolio summary labels and cards from "average yield" wording to "portfolio after-tax yield" wording.
   - Update settings form, home goal CTA, and home goal progress to use annual goal naming.
   - Update empty goal state when holdings exist but annual goal is null.

4. **Regression test updates**
   - Update unit tests for calculation utilities and query adapters.
   - Update Playwright value tests so home, portfolio, calendar, and stock detail assert the same annual total for the same seed data.
   - Add a regression test for the specific KDDI/JT mismatch documented in `docs/issue/home-portfolio-dividend-mismatch.md`.

5. **Unit tests to add or modify**

   `src/lib/dividends/calculations.test.ts`:
   - Portfolio after-tax yield = `annual_after_tax_dividend / total_acquisition_cost`; test with NISA (zero tax) and tokutei (20.315%) holding mixes.
   - When approved annual dividend total is null (no events), portfolio yield is null not zero.

   `src/features/holdings/queries.test.ts`:
   - `getPortfolioSummary` mock returns `payment_year`-keyed totals, not `stocks.expected_annual_dividend_per_share`.
   - Annual total for `payment_year = N` excludes events whose `payment_year` is N±1.

   `src/features/dividends/queries.test.ts`:
   - `getHomeSummary` mock returns next-dividend sorted by `payment_start_date` asc, then `estimated_payment_month` asc, then `after_tax_amount` desc.
   - Next-dividend aggregates same-stock multi-account holdings into one after-tax sum.
   - Pending and rejected events are absent from all user-facing query results.

   `src/features/settings/queries.test.ts`:
   - `getUserSettings` returns `annual_dividend_goal_amount`; null when not set.
   - `saveUserSettings` persists `annual_dividend_goal_amount` without overwriting `default_amount_basis`.

   `tests/integration/portfolio/holdings-crud.test.ts` (update):
   - Holding summary row uses approved event `payment_year` total, not stock estimate.
   - Add KDDI + JT regression: combined after-tax total on portfolio query matches home summary total for same `payment_year`.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — all unit tests including the five new test groups above must pass.
- Run `npm run test:integration` — regression for KDDI/JT mismatch must pass.
- Run existing Playwright value verification specs with `npx playwright test --workers=1`.
- Manually verify `/app/home`, `/app/portfolio`, `/app/calendar`, and `/app/stocks/[ticker]` for one seeded user with KDDI and JT holdings.

## Completion Criteria

- The same seeded user sees matching annual after-tax dividend totals on home and portfolio for the same selected year.
- Calendar month totals reconcile with the annual total when summing approved events for the selected `payment_year`.
- Portfolio after-tax yield uses annual after-tax dividend divided by total acquisition cost.
- Home annual goal progress uses `annual_dividend_goal_amount`; monthly goal wording no longer appears in user-facing annual progress UI.
- Next dividend card shows one nearest approved event and aggregates same-stock multi-account after-tax amount.
- User screens do not show pending or rejected dividend events as confirmed data.

## Excluded From This Phase

- Custom admin UI changes.
- Stooq price refresh.
- Email delivery.
- CSV import.
- PWA installability.
