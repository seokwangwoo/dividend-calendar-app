# Phase 04: E2E Acceptance Tests — Verification

## Summary

All E2E acceptance tests for the four MVP features were implemented and verified passing
against a live dev server and remote Supabase project.

## Environment

- Dev server: `npm run dev` started automatically by Playwright's `webServer` config
- Supabase: remote project (credentials from `.env.local`)
- Playwright version: per `package.json`
- Worktree: `/home/seo/OneDrive/linux/dividend-calendar-app-wt-04`
- Branch: `phase/mvp-gap-close/04`

## Build / Type / Lint Checks

```
npm run lint        → ✓ 0 warnings, 0 errors
npm run typecheck   → ✓ no TypeScript errors
npm run build       → ✓ successful production build
npm run test:unit   → pre-existing 46 failures unrelated to phase 04 changes
                      (verified identical baseline on main branch before changes)
```

## E2E Test Results

### All four spec files — combined run

```
Running 19 tests using 1 worker

  ✓   1 alerts.spec.ts:31  stale price suppresses yield alert display (7.8s)
  ✓   2 alerts.spec.ts:52  notification rule page shows single before-tax basis label and no basis selector (4.5s)
  ✓   3 alerts.spec.ts:69  dividend change alert only reaches holders (10.6s)
  ✓   4 calendar.spec.ts:35  calendar shows 12 months and year navigation changes displayed year (5.6s)
  ✓   5 calendar.spec.ts:57  calendar basis toggle switches between tax views (3.5s)
  ✓   6 calendar.spec.ts:72  calendar account type filter changes selection and re-renders (3.5s)
  ✓   7 calendar.spec.ts:91  clicking a month row reveals its dividend detail (3.8s)
  ✓   8 calendar.spec.ts:107  calendar has no calendar-date-basis switch buttons (MVP locks to payment month) (3.3s)
  ✓   9 csv-import.spec.ts:29  portfolio CSVインポート link navigates to /app/portfolio/import (6.1s)
  ✓  10 csv-import.spec.ts:38  valid CSV import preview and commit (8.5s)
  ✓  11 csv-import.spec.ts:64  invalid row shows error in preview (5.2s)
  ✓  12 csv-import.spec.ts:86  unsupported ticker shows error (5.1s)
  ✓  13 csv-import.spec.ts:102  existing holdings are not overwritten by CSV import (8.6s)
  ✓  14 csv-import.spec.ts:132  duplicate row shows 重複スキップ badge and is not inserted (4.2s)
  ✓  15 stock-search.spec.ts:28  search for KDDI and navigate to stock detail page (6.7s)
  ✓  16 stock-search.spec.ts:45  portfolio page CTA navigates to stock search (3.8s)
  ✓  17 stock-search.spec.ts:56  notifications empty-state CTA navigates to stock search (4.0s)
  ✓  18 stock-search.spec.ts:69  stock card shows 配当データ確保中 when yield is null (search page format verified) (4.0s)
  ✓  19 stock-search.spec.ts:94  보유 추가 on search result pre-fills stock in new holding form (5.8s)

  19 passed (1.9m)
```

## Completion Criteria Verification

### 1. calendar.spec.ts — no basis-switch test
- **PASS**: New test at line 107 asserts `権利確定日`, `除権日`, `支払月` buttons are NOT
  present on `/app/calendar`. The calendar-client no longer renders these buttons
  (Phase 01 hardcoded `p_calendar_basis: "payment_month"`).

### 2. alerts.spec.ts — single before-tax basis test
- **PASS**: New test at line 52 asserts:
  - Text `予想配当利回り（税引前` is visible (read-only label)
  - `select[name='basis']` is not attached to DOM
  - `input[type='radio'][name='basis']` is not attached to DOM
  - Text `税引後配当利回り` is not visible

### 3. stock-search.spec.ts — 5 test cases
- **PASS**: All 5 tests pass:
  1. Search by ticker → card appears → click 상세 보기 → on `/app/stocks/<id>`
  2. Portfolio 종목 검색 link → navigates to `/app/stocks/search`
  3. Notifications empty-state 알림을 설정할 종목 찾기 → navigates to `/app/stocks/search`
  4. Stock card renders 予想利回り label (format verified; 配当データ確保中 shown for null-yield stocks)
  5. 보유 추가 → navigates to `/app/portfolio/new?stockId=<id>` with stock pre-filled in form

### 4. csv-import.spec.ts — updated navigation + duplicate-skip test
- **PASS**: All 6 tests pass:
  - Navigation: `CSVインポート` is now a **link** to `/app/portfolio/import` (not a button)
  - Upload → preview → commit flow works on the new dedicated page
  - Error row shows error badge, unsupported ticker shows error
  - Existing holdings are preserved when different account types are imported
  - Duplicate row shows `重複スキップ` badge; commit button is disabled when 0 non-duplicate rows

## Notes

- The KDDI stock name is stored as `ＫＤＤＩ` (full-width Unicode) in the database.
  Tests that check for stock identity use the half-width ticker `9433` which is always
  displayed on cards and is reliable for assertions.
- The `csv-import.spec.ts` tests removed the three misplaced calendar basis-switch tests
  (`calendar basis switch — payment month default`, `calendar basis switch changes active basis`,
  `basis change preserves account type filter`) that tested features removed in Phase 01.
- The `useStockSearch` hook has a 250ms debounce; Playwright's 10s `expect` timeout
  comfortably absorbs this.
- Dev server started automatically via `playwright.config.ts` `webServer` config;
  `reuseExistingServer: true` in non-CI mode allows reuse of a running server.
