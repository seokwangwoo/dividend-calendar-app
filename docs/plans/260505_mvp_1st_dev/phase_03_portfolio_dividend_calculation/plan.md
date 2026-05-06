# Phase 03: Portfolio and Dividend Calculation

## Goal

Implement the core user input loop: search supported stocks, add holdings, edit holdings, delete holdings, and calculate expected before-tax and after-tax dividends.

## Prerequisites

- Phase 01 and Phase 02 are complete.
- Authenticated users can read `stocks` and manage their own `holdings`.
- Seed stocks include expected annual dividend per share and current price.

## Implementation Scope

- Stock search UI.
- Holding creation and edit forms.
- Portfolio list and summary.
- Dividend calculation logic.
- RPC or database function for reusable holding dividend calculation.
- Same-stock multi-account support.

## User Flow

```text
Portfolio
  -> Add holding
  -> Search stock by ticker or name
  -> Select supported stock
  -> Enter quantity, average purchase price, account type
  -> See live estimated dividend calculation
  -> Save
  -> Completion screen
  -> Calendar or add another holding
```

Unsupported stock flow:

```text
Search stock
  -> Show unsupported row
  -> Disable add action
  -> Display “現在MVP未対応”
```

## Tax Rules

Use these MVP tax rates:

| Account type | Tax rate |
|---|---:|
| `nisa` | 0 |
| `tokutei` | 20.315% |
| `general` | 20.315% |

Do not hardcode display text into calculation functions.

Recommended implementation:

- Use a shared TypeScript utility for live form previews.
- Use a PostgreSQL RPC for persisted data summaries.
- Hardcode tax rates as constants in a shared TypeScript config for Phase 03 MVP. Do not use a `tax_policies` table unless a later phase requires dynamic tax rate management.
- Define constants as: `TAX_RATES = { nisa: 0, tokutei: 0.20315, general: 0.20315 }`.

## Calculation Formulas

Before-tax annual dividend:

```text
expected_annual_dividend_per_share * quantity
```

Estimated tax:

```text
before_tax_amount * account_tax_rate
```

After-tax annual dividend:

```text
before_tax_amount - estimated_tax_amount
```

Before-tax dividend yield:

```text
expected_annual_dividend_per_share / current_price * 100
```

After-tax dividend yield:

```text
(expected_annual_dividend_per_share * (1 - account_tax_rate)) / current_price * 100
```

If `current_price` is null or zero, yield values should be null and displayed as unavailable.

## Portfolio Screens

### `/app/portfolio`

Show:

- Summary card:
  - holding count
  - annual after-tax dividend
  - average after-tax yield
- Account filter:
  - all
  - NISA
  - 特定口座
  - 一般口座
- Sort:
  - highest after-tax dividend first
  - ticker ascending
  - recently added
- Holding cards:
  - stock name and ticker
  - quantity
  - account type
  - average purchase price
  - annual after-tax dividend

### `/app/portfolio/new`

Show:

- Search input.
- Search results.
- Selected stock summary.
- Quantity input.
- Average purchase price input.
- Account type segmented control or radio group.
- Live calculation card.
- Save action.

### `/app/portfolio/[holdingId]/edit`

Show:

- Existing stock summary.
- Editable quantity.
- Editable average purchase price.
- Editable account type.
- Live calculation card.
- Save action.
- Soft delete action.

### Completion Screen

After create, show:

- Stock added message.
- Expected annual after-tax dividend.
- Link to calendar.
- Link to add another holding.

## Data Access

Use Supabase Client for:

- `stocks` search.
- `holdings` insert.
- `holdings` update.
- `holdings` soft delete by setting `deleted_at`.

Use RPC for:

- `calculate_holding_dividend`
- `get_portfolio_summary`

## RPC: `calculate_holding_dividend`

Input:

- `p_stock_id uuid`
- `p_quantity numeric`
- `p_average_purchase_price numeric`
- `p_account_type text`

Return:

- `before_tax_amount`
- `estimated_tax_amount`
- `after_tax_amount`
- `before_tax_yield`
- `after_tax_yield`
- `currency` — sourced from the referenced `stocks.currency` value, not from the holdings row.

Validation:

- Quantity must be greater than zero.
- Average purchase price must be greater than or equal to zero.
- Account type must be one of the MVP account types.
- Unsupported stocks cannot be added as holdings.

## RPC: `get_portfolio_summary`

Input:

- authenticated user inferred from `auth.uid()` — no `p_user_id` parameter required.
- `p_account_type text` (optional) — one of `nisa`, `tokutei`, `general`. Omit or pass `null` to include all account types.

Return:

- `holding_count`
- `annual_before_tax_amount`
- `annual_estimated_tax_amount`
- `annual_after_tax_amount`
- `average_after_tax_yield`
- `currency`

Only include holdings with `deleted_at is null`.

## Validation

Client validation:

- Required stock selection.
- Quantity numeric and greater than zero.
- Average purchase price numeric and greater than or equal to zero.
- Required account type.

Server validation:

- RLS confirms `user_id = auth.uid()`.
- Insert/update rejects unsupported account types.
- Insert rejects unsupported stocks.

## Required Notices

Display on calculation-related screens:

```text
税額および税引後配当額は概算です。
実際の税額・入金額は証券会社の明細をご確認ください。
```

## Test Plan

- Add a NISA holding and verify estimated tax is zero.
- Add a `tokutei` holding and verify 20.315% tax is applied.
- Add a `general` holding and verify 20.315% tax is applied.
- Edit quantity and verify live preview changes.
- Edit account type and verify tax changes.
- Soft delete a holding and verify it disappears from active list and summary.
- Add the same stock under two different account types.
- Search unsupported stock and verify add action is disabled.
- Confirm user cannot access another user's holding edit page.

## Completion Criteria

- Portfolio CRUD works for authenticated users.
- Calculations match MVP formulas.
- Portfolio summary uses active holdings only.
- Unsupported stocks are visible but cannot be added.
- Same stock can be registered multiple times.
- Build, lint, typecheck, and portfolio test scenarios pass.

## Excluded From This Phase

- Home summary.
- Monthly calendar.
- Notification rules.
- Admin review.
- TDnet data collection.
