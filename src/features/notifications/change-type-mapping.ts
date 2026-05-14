import type { Database } from "@/types/supabase";

type DividendChangeType = Database["public"]["Enums"]["dividend_change_type"];
type NotificationType = Database["public"]["Enums"]["notification_type"];

/**
 * Maps a dividend_reviews.change_type value to a notification type for
 * dividend-change notifications created after admin approval.
 *
 * - increase       → dividend_increase
 * - decrease       → dividend_decrease
 * - no_dividend    → no_dividend
 * - resumed        → dividend_increase  (resuming dividends is positive)
 * - special        → special_dividend
 * - commemorative  → special_dividend   (nearest existing type)
 * - none           → null (no change notification)
 * - unchanged      → null (no notification needed)
 * - unknown        → null (cannot classify; admin must decide)
 *
 * Returns null for change types that do not warrant a dividend-change
 * notification, so callers can skip notification creation.
 */
export function mapChangeTypeToNotificationType(
  changeType: DividendChangeType
): NotificationType | null {
  switch (changeType) {
    case "increase":
      return "dividend_increase";
    case "decrease":
      return "dividend_decrease";
    case "no_dividend":
      return "no_dividend";
    case "resumed":
      return "dividend_increase";
    case "special":
      return "special_dividend";
    case "commemorative":
      return "special_dividend";
    case "none":
      return null;
    case "unchanged":
      return null;
    case "unknown":
      return null;
    default: {
      // Exhaustiveness guard – if a new change_type is added this will error
      // at compile time.
      const _exhaustive: never = changeType;
      void _exhaustive;
      return null;
    }
  }
}

export interface DividendChangeNotificationPayload {
  /** Notification type, or null if no notification should be sent. */
  notificationType: NotificationType | null;
  /** Whether a notification should be created for this change type. */
  shouldNotify: boolean;
  /** Previous dividend per share when available from the review. */
  previousDividendPerShare: number | null;
  /** New (current) dividend per share from the review. */
  dividendPerShare: number | null;
  /** The original change type from the review for payload metadata. */
  changeType: DividendChangeType;
}

/**
 * Builds the notification creation decision and payload fields for an
 * approved dividend review.
 *
 * Use this alongside shouldSendDividendChangeNotification (which checks
 * whether the user holds the stock and whether a duplicate exists) to
 * determine whether to insert a notification row.
 */
export function buildDividendChangeNotificationPayload(
  changeType: DividendChangeType,
  dividendPerShare: number | null,
  previousDividendPerShare: number | null
): DividendChangeNotificationPayload {
  const notificationType = mapChangeTypeToNotificationType(changeType);
  return {
    notificationType,
    shouldNotify: notificationType !== null,
    previousDividendPerShare,
    dividendPerShare,
    changeType
  };
}
