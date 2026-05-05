# Phase 05: Notifications and Settings

## Goal

Implement target dividend yield notification rules, in-app notifications, and user settings for display and notification preferences.

## Prerequisites

- Phase 04 is complete.
- Stock detail screen exists.
- `notification_rules`, `notifications`, and `user_settings` tables exist with RLS.

## Implementation Scope

- Notification rule create, edit, disable, and list behavior.
- Target yield evaluation function.
- In-app notification list.
- Mark notification as read.
- Settings screen.
- Optional email job creation, without requiring full Resend production readiness.

## Notification Rule Types

MVP rule dimensions:

- Basis:
  - `before_tax_yield` — matches `notification_rules.basis` column value defined in Phase 02.
  - `after_tax_yield` — matches `notification_rules.basis` column value defined in Phase 02.
- Operator:
  - `gte`
  - `lte`

Examples:

- before-tax dividend yield is greater than or equal to 3.5%.
- after-tax dividend yield is less than or equal to 2.0%.

## Notification Rule Screen

Entry point:

- Stock detail screen.

Route:

- `/app/stocks/[stockId]/notification-rule`

Show:

- Stock name and ticker.
- Basis selector.
- Operator selector.
- Target yield input.
- In-app notification checkbox.
- Email notification checkbox.
- Neutral investment disclaimer.
- Save action.

Required disclaimer:

```text
これは売買を推奨するものではありません。
投資判断はご自身で行ってください。
```

Forbidden wording:

- 買いシグナル
- 売りシグナル
- 今すぐ買い
- 今すぐ売り
- 必ず上がる
- 確実に儲かる

## Rule Persistence

Use Supabase Client CRUD:

- Insert rule.
- Update rule.
- Disable rule by setting `status = 'disabled'`.
- Do not hard delete rules in MVP.

Validation:

- Target yield must be greater than zero.
- Basis must be one of the supported basis values.
- Operator must be `gte` or `lte`.
- At least one notification channel must be enabled.

## Edge Function: `evaluate-notification-rules`

Purpose:

- Evaluate active rules against current stock dividend yield.
- Create in-app notifications when conditions are met.
- Avoid excessive duplicate notifications.

Trigger:

- Manual call in MVP.
- GitHub Actions Cron after initial verification.

Input (JSON POST body):

```json
{
  "stockId": "uuid (optional)",
  "userId": "uuid (optional)",
  "dryRun": false
}
```

Omit `stockId` to evaluate all stocks. Omit `userId` to evaluate all users. Set `dryRun: true` to run evaluation without inserting notifications.

Evaluation:

- Load active `notification_rules`.
- Join `stocks`.
- Calculate current before-tax yield from stock fields.
- Calculate after-tax yield using the user's relevant account type when possible.
- If the user has multiple account types for the same stock, use the account type from the highest-quantity active holding. This selection is deterministic and consistent across evaluations; yield results may change when holdings are edited.
- If no holding exists, use `tokutei` tax policy for after-tax yield.
- Apply operator.
- Check deduplication window.
- Insert `notifications` for `notify_in_app = true`.
- If `notify_email = true`, create an email job or email-channel notification for later sending.

Deduplication:

- Deduplication key is `(notification_rule_id, stock_id)`.
- Do not create a notification if `notification_rules.last_triggered_at` is within 24 hours of the current evaluation time.
- Update `notification_rules.last_triggered_at` after successful notification creation.

Notification payload structure:

```json
{
  "evaluatedYield": 3.7,
  "targetYield": 3.5,
  "basis": "after_tax_yield",
  "operator": "gte",
  "stockTicker": "9433"
}
```

## Notification Text

Title example:

```text
目標利回りに到達
```

Body example:

```text
KDDIが設定条件に到達しました。
現在の予想配当利回り: 3.7%
設定条件: 3.5%以上
これは売買を推奨するものではありません。
```

## Notifications Screen

Route: `/app/notifications`

Show:

- Filter tabs:
  - all
  - target yield
  - dividend change
  - data update
- Notification groups:
  - today
  - this week
  - older
- Notification cards:
  - title
  - body summary
  - stock ticker and name when available
  - created time
  - unread/read state

Actions:

- Mark single notification as read.
- Mark all as read.

## Settings Screen

Route: `/app/settings`

Show:

- Account email.
- Email notification enabled toggle.
- In-app notification enabled toggle.
- Default amount basis selector:
  - before-tax
  - after-tax
- Currency display:
  - JPY fixed for MVP.
- Monthly dividend goal amount.
- Tax calculation notice.
- Logout.
- Account deletion entry point — disabled for MVP 1st with message "近日公開予定". If implemented, soft delete by setting `profiles.status = 'deleted'`.

Tax notice:

```text
税額および税引後配当額は概算です。
実際の税額・入金額は証券会社の明細をご確認ください。
```

## Optional Email Foundation

If time allows:

- Add `send-email-notification` Edge Function stub.
- Add Resend environment variable validation.
- Add email template using neutral wording.
- Keep actual email sending gated by environment variable `EMAIL_NOTIFICATIONS_ENABLED`. Set to `false` in MVP until Resend is verified. Add this variable to Phase 01's `.env.example`.

Do not block MVP in-app notification completion on email delivery.

## Test Plan

- Create a before-tax `gte` rule.
- Create an after-tax `lte` rule.
- Disable a rule and verify it is not evaluated.
- Run evaluation and verify matching rule creates an in-app notification.
- Run evaluation twice and verify duplicate is blocked within 24 hours.
- Mark notification as read.
- Mark all notifications as read.
- Update settings and reload to confirm persistence.
- Verify forbidden buy/sell wording is absent from notification UI.

## Completion Criteria

- Users can manage target yield rules per stock.
- Evaluation creates in-app notifications.
- Duplicate notifications are controlled.
- Notifications screen supports read state.
- Settings screen persists user preferences.
- Investment-neutral disclaimer appears where rules are configured and shown.
- Build, lint, typecheck, and notification scenarios pass.

## Excluded From This Phase

- Web Push notifications.
- Full production email sending if Resend is not yet configured.
- Dividend change notification generation from admin review.
- TDnet collection.
