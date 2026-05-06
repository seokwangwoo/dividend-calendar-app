# Phase 07: MVP Acceptance Testing

## Goal

Verify that MVP 1st is usable end to end, secure under RLS, accurate enough for the stated tax and dividend assumptions, and safe from investment recommendation wording.

## Prerequisites

- Phases 01 through 06 are complete.
- Test users exist:
  - normal user A
  - normal user B
  - admin user
- Seed stocks and approved dividend events exist.

## Test Data

Prepare at least:

- Supported stock: KDDI `9433`
- Supported stock: JT `2914`
- Unsupported stock row
- Approved dividend event for KDDI
- Approved dividend event for JT
- Pending dividend review
- Rejected dividend review
- One dividend increase review candidate
- One dividend decrease review candidate

Holdings:

- User A:
  - KDDI, 100 shares, NISA, average purchase price 4300.
  - JT, 100 shares, `tokutei`, average purchase price 3800.
- User B:
  - KDDI, 50 shares, `general`, average purchase price 4100.

## Automated Checks

Run:

```text
npm run lint
npm run typecheck
npm run build
```

If test framework exists, also run:

```text
npm test
```

Add focused tests where practical for:

- Formatting helpers.
- Tax calculation.
- Dividend calculation.
- Rule evaluation.
- RLS-sensitive query helpers.

## Auth Acceptance Scenarios

- A new user can sign up with email and password.
- Signup creates `profiles` and `user_settings`.
- A user can log in.
- A user can log out.
- A user can request password reset.
- Logged-out users are redirected away from `/app/*`.
- Non-admin users are redirected or blocked from `/admin/*`.
- Admin users can access admin placeholder routes.

## RLS And Security Scenarios

- User A can read only User A profile.
- User A cannot read User B holdings.
- User A cannot update User B holdings.
- User A cannot read User B notifications.
- User A cannot manage `dividend_reviews`.
- Authenticated users can search stocks.
- Normal users can see only approved dividend events.
- Pending and rejected dividend events are not returned to normal user screens.
- Service role keys are absent from browser bundles and public environment variables.

## Portfolio Scenarios

- User can search by ticker.
- User can search by company name.
- Unsupported stock appears as unsupported and cannot be added.
- User can add supported stock.
- User can add same stock under a different account type.
- User can edit quantity.
- User can edit average purchase price.
- User can edit account type.
- User can soft delete a holding.
- Deleted holding is excluded from list, summary, home, and calendar.

## Dividend Calculation Scenarios

- NISA holding has zero estimated tax.
- `tokutei` holding applies 20.315% estimated tax.
- `general` holding applies 20.315% estimated tax.
- Before-tax amount equals annual dividend per share times quantity.
- After-tax amount equals before-tax amount minus estimated tax.
- Yield is unavailable when current price is null or zero.
- `未定` dividend amount is shown as undecided, not zero.
- Tax disclaimer is visible on calculation-related screens.

## Home Scenarios

- No-holdings state prompts user to add a stock.
- Annual after-tax dividend is the primary amount.
- Annual before-tax dividend and estimated tax are secondary.
- Current-month expected amount uses the current month only.
- Next dividend card picks the nearest future approved event.
- Monthly goal progress appears when a goal is configured.
- Monthly goal progress is hidden or neutral when no goal exists.
- Recent dividend change appears only for approved changes.

## Calendar Scenarios

- Calendar shows all 12 months.
- Year selector changes query year.
- Before-tax basis shows before-tax totals.
- After-tax basis shows after-tax totals.
- Account filter `nisa` includes only NISA holdings.
- Account filter `tokutei` includes only specific-account holdings.
- Account filter `general` includes only general-account holdings.
- Month detail lists per-stock events.
- Event cards show status badge, account type, before-tax amount, and after-tax amount.
- Source URL and review status are available where required.

## Stock Detail Scenarios

- Stock detail shows ticker, name, current price, expected annual dividend, and yield.
- User holdings for that stock are shown.
- Dividend schedule shows approved events.
- Data source and review status are shown.
- User can navigate to notification rule setup.
- If user does not hold the stock, detail page offers add-to-portfolio entry.

## Notification Scenarios

- User can create target yield rule.
- User can choose before-tax basis.
- User can choose after-tax basis.
- User can choose greater-than-or-equal condition.
- User can choose less-than-or-equal condition.
- User can disable a rule.
- Evaluation creates an in-app notification when condition is met.
- Evaluation does not create notification when condition is not met.
- Evaluation does not duplicate the same rule notification within 24 hours.
- Notification list shows unread state.
- User can mark one notification as read.
- User can mark all notifications as read.
- Notification wording does not include forbidden buy/sell language.

## Settings Scenarios

- User can toggle email notifications.
- User can toggle in-app notifications.
- User can set default amount basis.
- Currency remains JPY for MVP.
- User can set monthly dividend goal.
- User can log out.
- Tax calculation notice is visible.

## Admin Review Scenarios

- Admin can view pending reviews through Supabase Studio.
- Non-admin cannot approve review through Edge Function.
- Admin can approve pending review.
- Approval creates approved dividend event.
- Approval links review to created event.
- Approval creates dividend change notification for affected holders when change is meaningful.
- Admin can reject pending review.
- Rejection stores reason and creates no dividend event.
- Rejected data never appears in home or calendar.
- `未定`, `無配`, special dividend, commemorative dividend, and large changes require manual review.

## Data Pipeline Scenarios

- Disclosure collection stores candidate metadata.
- Duplicate disclosure collection is idempotent by `external_id`.
- Parser creates pending review with raw payload.
- Parser confidence score is stored.
- PDF-only extraction remains pending and does not auto-approve.
- Private storage files are not directly accessible to normal users.

## Performance Acceptance

- Common screens load within 3 seconds on a normal development connection.
- Home summary RPC completes within 2 seconds for seed-scale data.
- Calendar month switching feels immediate and targets under 1 second after data is cached or prefetched.
- Disclosure collection and parsing do not block user-facing requests.

## Copy And Compliance Acceptance

Required tax notice appears:

```text
税額および税引後配当額は概算です。
実際の税額・入金額は証券会社の明細をご確認ください。
```

Required investment notice appears in notification setup and notification bodies:

```text
これは売買を推奨するものではありません。
投資判断はご自身で行ってください。
```

Forbidden wording is absent:

- 買い推奨
- 売り推奨
- 買いシグナル
- 売りシグナル
- 今すぐ買う
- 今すぐ売る
- 確実に儲かる
- 安全に稼げる

## MVP 1st Release Criteria

MVP 1st can be considered complete when:

- All automated checks pass.
- All critical auth, RLS, portfolio, calculation, home, calendar, notification, and admin review scenarios pass.
- Known issues are documented and do not affect user data isolation, tax calculation basics, or approved-data-only display.
- Admin can operate data review without a custom dashboard.
- The product clearly communicates that all tax and dividend values are estimates.
- The product does not look or sound like a buy/sell recommendation service.

## Follow-Up Candidates After MVP 1st

- Custom `/admin` dashboard.
- Resend production email delivery.
- Web Push notifications.
- CSV import from SBI or Rakuten Securities.
- Ex-dividend date and record date calendar modes.
- Higher-accuracy XBRL/PDF parser.
- Paid data source integration.
- Premium subscription experiments.
