# Phase 04: Email Notification Delivery

## Goal

Deliver opt-in email notifications through Resend with idempotent delivery state, while keeping in-app notifications as the canonical notification record.

## Prerequisites

- Phase 03 Completion Criteria are met.
- Resend domain, sender address, and `RESEND_API_KEY` are configured outside the browser.
- User notification settings are stored in `user_settings`.

## Implementation Scope

- Add email delivery state to `notifications`, including `sent_via_email_at`, `email_delivery_status`, and `email_delivery_error` if missing.
- Implement `send-email-notification` Edge Function or server-side job runner.
- Send email only when the user opted into email notifications and the notification has not already been sent by email.
- Use investment-neutral Japanese copy for yield and dividend-change notifications.
- Include source URL for dividend-change emails when available.
- Add retry-safe behavior for transient Resend failures.
- Keep email templates simple text or minimal HTML; no marketing email system in this phase.

## Core Tasks

1. **Schema and settings alignment**
   - Add email delivery state columns to `notifications`.
   - Confirm `user_settings.email_notification_enabled` gates delivery.
   - Keep `notifications.channel` compatible with in-app records.

2. **Email template contracts**
   - Define template inputs for `yield_target`, `dividend_increase`, `dividend_decrease`, `no_dividend`, `special_dividend`, and generic data update notifications.
   - Include ticker, stock name, evaluated value, configured condition, source, and neutral disclaimer where applicable.
   - Avoid banned buy/sell recommendation wording.

3. **Delivery implementation**
   - Implement Resend sending in an Edge Function or server-only utility.
   - Mark `sent_via_email_at` only after successful delivery.
   - Store failure status and error summary without exposing secrets.
   - Prevent duplicate emails if the function is retried.

4. **Job and scheduler integration**
   - Reuse `jobs` or notification query filters to find pending email deliveries.
   - Add a scheduled or manually invokable delivery path.
   - Ensure disabled email settings skip delivery without deleting in-app notifications.

5. **Unit tests to add**

   `src/features/notifications/email-templates.test.ts` (new):
   - `renderYieldTargetEmail(data)` output contains stock name, ticker, evaluated yield, and the required disclaimer `これは売買を推奨するものではありません`.
   - `renderDividendChangeEmail(data)` output contains stock name, change type (increase/decrease), and disclaimer.
   - No template output contains any of the banned strings: `買い推奨`, `売り推奨`, `買いシグナル`, `売りシグナル`, `今すぐ買う`, `今すぐ売る`, `確実に儲かる`, `安全に稼げる`.
   - Template function for `data_update` type does not include yield or price evaluation content.

   `src/features/notifications/email-delivery.test.ts` (new):
   - Notification with `sent_via_email_at` already set is skipped; Resend mock is not called.
   - Notification for a user with `email_notification_enabled = false` is skipped.
   - Successful Resend call sets `sent_via_email_at` to the current timestamp.
   - Transient Resend error (5xx) stores `email_delivery_status = 'failed'` and error summary; `sent_via_email_at` remains null.
   - Calling the delivery function twice on the same notification delivers email only once (idempotency).

   Use `vi.mock` or a compatible Resend mock adapter; do not make real HTTP calls in unit tests.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — all new template and delivery tests must pass with Resend mocked.
- Manually invoke the email delivery function against one test notification in a non-production environment.

## Completion Criteria

- Email-enabled users receive one email per eligible notification.
- Email-disabled users still receive in-app notifications but no email.
- Retrying the delivery function does not send duplicate emails for already delivered notifications.
- Resend failures are captured for operator review and do not mark notifications as successfully sent.
- Email copy remains investment-neutral and includes required disclaimer text for yield alerts.

## Excluded From This Phase

- Web Push notifications.
- Marketing newsletters.
- Email preference center beyond existing settings.
- Account deletion or unsubscribe compliance beyond MVP settings toggle.
