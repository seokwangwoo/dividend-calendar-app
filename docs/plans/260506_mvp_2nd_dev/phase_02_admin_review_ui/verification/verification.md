# Phase 02: Minimal Admin Review UI — Verification

## Phase File

`docs/plans/260506_mvp_2nd_dev/phase_02_admin_review_ui/plan.md`

## Verification Date

2026-05-07

## Environment

- Node.js (local)
- Next.js 15 / TypeScript / Vitest
- No Supabase local instance (SQL migration validated manually)

---

## Test Plan Items

| Item | Status | Notes |
|------|--------|-------|
| `npm run lint` | ✅ PASS | 0 errors, 0 warnings |
| `npm run typecheck` | ✅ PASS | No type errors |
| `npm run build` | ✅ PASS | All admin routes compile |
| `npm run test:unit` (admin auth, actions, validation) | ✅ PASS | 3 new test files, all tests pass |
| `npm run test:integration` | SKIPPED | Requires live Supabase credentials; no remote test env available |
| `npx playwright test` | SKIPPED | Requires running dev server and Supabase instance |
| Manual: non-admin cannot access `/admin` | ✅ Verified by code | Middleware + `requireAdminUser()` in layout |
| Manual: admin can create pending event | ✅ Verified by code | `/admin/dividend-reviews/new` form + `createDividendEvent` action |
| Manual: admin can approve event | ✅ Verified by code | Inline approve form + `approveDividendEvent` action |
| Manual: admin can reject event | ✅ Verified by code | Inline reject form + `rejectDividendEvent` action |

---

## Commands Run

### Lint
```
npm run lint
> eslint . --max-warnings=0
(exit 0 — no output)
```

### Typecheck
```
npm run typecheck
> tsc --noEmit
(exit 0 — no output)
```

### Build
```
npm run build
✓ All admin routes compiled as dynamic server-rendered pages:
  /admin/dividend-reviews
  /admin/dividend-reviews/[eventId]
  /admin/dividend-reviews/new
```

### Unit Tests
```
npm run test:unit
Test Files  27 passed (27)
Tests       253 passed (253)

New admin test files:
  src/features/admin/auth.test.ts       — 4 tests (all pass)
  src/features/admin/validation.test.ts — 14 tests (all pass)
  src/features/admin/actions.test.ts    — 13 tests (all pass)
```

---

## Files Changed

**New files:**
- `supabase/migrations/20260507001000_phase_02_admin_review_ui.sql` — adds `rejection_reason` column to `dividend_events`
- `src/features/admin/auth.ts` — `requireAdminUser()` server helper
- `src/features/admin/validation.ts` — month, amount, payment year validators
- `src/features/admin/actions.ts` — `createDividendEvent`, `approveDividendEvent`, `rejectDividendEvent`
- `src/features/admin/queries.ts` — `listDividendEvents`, `getDividendEventById`, `listAllStocks`
- `src/features/admin/auth.test.ts`
- `src/features/admin/validation.test.ts`
- `src/features/admin/actions.test.ts`
- `src/app/admin/dividend-reviews/new/page.tsx` — create form
- `src/app/admin/dividend-reviews/[eventId]/page.tsx` — event detail + approve/reject

**Modified files:**
- `src/app/admin/layout.tsx` — added `await requireAdminUser()` server-side check
- `src/app/admin/dividend-reviews/page.tsx` — replaced placeholder with full table + filters + inline actions
- `src/types/supabase.ts` — added `rejection_reason` to `dividend_events` Row/Insert/Update

---

## Manual Verification Steps

### Admin access protection
- Middleware (`src/middleware.ts`) checks `profiles.role === 'admin'` before granting `/admin/*` access — verified in existing `src/middleware.test.ts`.
- `src/app/admin/layout.tsx` calls `requireAdminUser()` for secondary defense — if middleware is bypassed, the layout redirects.
- Non-admin session is redirected to `/app/home`; unauthenticated user is redirected to `/auth/login`.

### Dividend event table
- `listDividendEvents()` queries `dividend_events` joined with `stocks`, applies optional filters for `review_status`, `payment_year`, `status`, and ticker (client-side filter on ticker since PostgREST join filtering is unavailable without a view).
- Table columns: ticker, stock name, fiscal year, payment year, payment month (displays "未定" for null), dividend per share, event status, review status badge, source type/URL, and action column.

### Dividend event form
- `/admin/dividend-reviews/new` renders a server-side form with all required fields.
- `createDividendEvent` validates `payment_year` (required, 2000–2100), `estimatedPaymentMonth` (1–12 if provided), `dividendPerShare` (≥ 0 if provided).
- On success, `review_status` is always set to `'pending'` — confirmed by unit test.
- Redirects to list after creation.

### Review actions
- `approveDividendEvent(id)` updates `review_status = 'approved'` and calls `revalidatePath` for `/app/home`, `/app/portfolio`, `/app/calendar` — user-facing RPCs filter by `review_status = 'approved'`, so approved events are immediately visible.
- `rejectDividendEvent(id, reason)` updates `review_status = 'rejected'` and stores `rejection_reason` — rejected events are excluded from user-facing RPCs.
- Both actions call `requireAdminUser()` first, so non-admin callers receive a redirect response.

---

## Skipped Checks and Justifications

### `npm run test:integration`
Requires `RUN_REMOTE_TESTS=1` and live Supabase credentials. No remote Supabase instance is configured in the local development environment. Integration tests were passing before this phase (Phase 01 commit), and no existing RPC or RLS logic was modified.

### `npx playwright test`
Requires a running dev server and a live Supabase instance with seed data. Not available in the current development context. The admin UI is built with standard Next.js Server Components and Server Actions — no custom client-side logic that would require E2E-specific testing.

### SQL migration validation
`20260507001000_phase_02_admin_review_ui.sql` adds a single nullable `text` column to `dividend_events`. SQL syntax was reviewed manually: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS rejection_reason text;` is valid PostgreSQL. No existing constraints or triggers are affected.

---

## Post-Audit Fix

After the initial audit, the following MINOR issue was resolved:

- **Missing status filter UI**: `src/app/admin/dividend-reviews/page.tsx` was missing a `<select name="status">` for event status filtering. The backend already read and applied the filter; the UI now exposes it with options for `estimated`, `confirmed`, `paid`, `undecided`. Re-verified: lint, typecheck, and build all pass.

---

## Failures Found and Fixed

1. **ESLint error**: Used `<a>` instead of `<Link>` in new event form cancel button. Fixed by importing `next/link` and replacing.
2. **TypeScript error**: Supabase join returns `stocks` as an array shape in type inference; fixed with `as unknown as DividendEventWithStock[]` cast. The runtime value is an object due to many-to-one FK direction.
3. **TypeScript error**: `notFound()` is not typed as `never` in Next.js, so `event` was still possibly null after the guard. Fixed by assigning to a new `const event = found` after the null check.
4. **TypeScript error**: `rejection_reason` was missing from `dividend_events` types. Fixed by updating `src/types/supabase.ts` to match the migration.
