# Phase 01: Project Foundation

## Goal

Create a runnable Next.js application foundation that can host the authenticated dividend app, connect to Supabase, and provide the shared UI and formatting utilities needed by later phases.

## Prerequisites

- Node.js LTS is installed.
- A Supabase project exists or will be created before Phase 02.
- The repository currently contains planning docs only, so this phase includes initial app scaffolding.

## Implementation Scope

- Initialize Next.js with App Router, TypeScript, Tailwind CSS, and ESLint.
- Set up the route structure for auth, app tabs, and admin.
- Add Supabase browser/server client helpers.
- Add environment variable templates.
- Add shared layout, navigation, loading, error, and empty states.
- Add basic formatting utilities for JPY amounts, percentages, dates, and account labels.

## Recommended Project Structure

```text
src/
  app/
    auth/
      login/
      signup/
      reset-password/
    app/
      home/
      portfolio/
      portfolio/new/
      portfolio/[holdingId]/edit/
      calendar/
      notifications/
      settings/
    admin/
      dividend-reviews/
      disclosures/
      jobs/
  components/
    app-shell/
    ui/
  features/
    auth/
    calendar/
    dividends/
    holdings/
    notifications/
    settings/
    stocks/
  lib/
    constants/
    formatting/
    supabase/
    validators/
  types/
```

## Core Tasks

1. Scaffold the app.
   - Use Next.js App Router.
   - Use TypeScript.
   - Use Tailwind CSS.
   - Configure import alias such as `@/*`.
   - Keep the first screen as the app experience, not a marketing landing page.

2. Add baseline scripts.
   - `dev`
   - `build`
   - `start`
   - `lint`
   - `typecheck`

3. Configure environment variables.
   - Add `.env.example`.
   - Required browser variables:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `NEXT_PUBLIC_APP_URL`
   - Required server-only variables for later phases:
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `RESEND_API_KEY`
     - `TDNET_BASE_URL`
     - `PRICE_API_BASE_URL`
     - `PRICE_API_KEY`
     - `SENTRY_DSN`

4. Add Supabase client helpers.
   - `src/lib/supabase/client.ts` for browser components.
   - `src/lib/supabase/server.ts` for server components and route handlers.
   - Use `@supabase/ssr`.
   - Never import service role keys into client-side code.

5. Create route groups and placeholder pages.
   - `/auth/login`
   - `/auth/signup`
   - `/auth/reset-password`
   - `/app/home`
   - `/app/portfolio`
   - `/app/portfolio/new`
   - `/app/calendar`
   - `/app/notifications`
   - `/app/settings`
   - `/admin/dividend-reviews`

6. Add app shell.
   - Use a bottom tab layout for authenticated user screens.
   - Tabs: Home, Portfolio, Calendar, Notifications, Settings.
   - Keep the shell dense, calm, and finance-focused.
   - Do not use a decorative landing-page hero.

7. Add shared UI primitives.
   - Button
   - Input
   - Select
   - Checkbox or Switch
   - Tabs or segmented control
   - Badge
   - Card for repeated items only
   - Form field
   - Empty state
   - Loading state
   - Error state

8. Add formatting helpers.
   - `formatCurrencyJpy(amount)`
   - `formatPercent(value, digits)`
   - `formatYearMonth(year, month)`
   - `formatAccountType(accountType)`
   - `formatDividendStatus(status)`
   - `formatReviewStatus(status)`

9. Add constants.
   - Account types:
     - `nisa`
     - `tokutei`
     - `general`
   - Amount basis:
     - `before_tax`
     - `after_tax`
   - Calendar filter:
     - `all`
     - `nisa`
     - `tokutei`
     - `general`

10. Add baseline validation setup.
    - Install and configure Zod.
    - Create shared number validators for quantity, price, amount, and yield.
    - Quantity must be greater than zero.
    - Average purchase price must be greater than or equal to zero.

## UI Direction

- Use Japanese display text for app-facing labels where the product spec includes Japanese copy.
- Keep data cards compact and readable.
- Show after-tax amount more prominently than before-tax amount.
- Use badges for estimated, confirmed, paid, unknown, and reviewed statuses.
- Avoid trading app language and aggressive colors.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Start the dev server and verify these routes render:
  - `/auth/login`
  - `/auth/signup`
  - `/app/home`
  - `/app/portfolio`
  - `/app/calendar`
  - `/app/notifications`
  - `/app/settings`
  - `/admin/dividend-reviews`

## Completion Criteria

- The app starts locally.
- Placeholder routes render without runtime errors.
- Tailwind styles apply correctly.
- Supabase helper modules compile.
- Shared formatting helpers have unit tests or simple test coverage through the typecheck/build flow.
- No secret service role key is reachable from client-side code.

## Excluded From This Phase

- Actual database schema creation.
- Auth form submission.
- Portfolio CRUD.
- Dividend calculation logic.
- Notification evaluation.
- TDnet collection or parsing.
