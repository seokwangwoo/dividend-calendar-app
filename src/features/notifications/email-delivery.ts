import type { Database } from "@/types/supabase";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export interface DeliveryResult {
  notificationId: string;
  status: "sent" | "failed" | "skipped_disabled" | "skipped_already_sent";
  error?: string;
}

export async function sendEmailNotification(params: {
  notification: NotificationRow;
  userEmail: string;
  emailEnabled: boolean;
  sendEmail: (args: { to: string; subject: string; text: string }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  updateDeliveryStatus: (args: {
    notificationId: string;
    status: "sent" | "failed";
    error?: string;
  }) => Promise<void>;
}): Promise<DeliveryResult> {
  const { notification, userEmail, emailEnabled, sendEmail, updateDeliveryStatus } =
    params;

  // Skip if user disabled email notifications
  if (!emailEnabled) {
    return {
      notificationId: notification.id,
      status: "skipped_disabled"
    };
  }

  // Skip if already sent
  if (notification.sent_via_email_at != null) {
    return {
      notificationId: notification.id,
      status: "skipped_already_sent"
    };
  }

  const result = await sendEmail({
    to: userEmail,
    subject: notification.title,
    text: notification.body
  });

  if (result.success) {
    await updateDeliveryStatus({
      notificationId: notification.id,
      status: "sent"
    });
    return {
      notificationId: notification.id,
      status: "sent"
    };
  }

  await updateDeliveryStatus({
    notificationId: notification.id,
    status: "failed",
    error: result.error
  });

  return {
    notificationId: notification.id,
    status: "failed",
    error: result.error
  };
}
