import { describe, expect, it, vi } from "vitest";
import { sendEmailNotification } from "@/features/notifications/email-delivery";

describe("email delivery", () => {
  const baseNotification = {
    id: "notif-1",
    user_id: "user-1",
    stock_id: null,
    notification_rule_id: null,
    type: "yield_target" as const,
    title: "目標利回りに到達",
    body: "テスト本文",
    payload: {},
    status: "unread" as const,
    channel: "email" as const,
    sent_at: null,
    read_at: null,
    created_at: "2026-05-06T00:00:00Z",
    sent_via_email_at: null,
    email_delivery_status: null,
    email_delivery_error: null
  };

  it("skips when email notifications are disabled", async () => {
    const sendEmail = vi.fn();
    const updateDeliveryStatus = vi.fn();

    const result = await sendEmailNotification({
      notification: baseNotification,
      userEmail: "user@example.com",
      emailEnabled: false,
      sendEmail,
      updateDeliveryStatus
    });

    expect(result.status).toBe("skipped_disabled");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updateDeliveryStatus).not.toHaveBeenCalled();
  });

  it("skips when already sent via email", async () => {
    const sendEmail = vi.fn();
    const updateDeliveryStatus = vi.fn();

    const result = await sendEmailNotification({
      notification: {
        ...baseNotification,
        sent_via_email_at: "2026-05-06T12:00:00Z"
      },
      userEmail: "user@example.com",
      emailEnabled: true,
      sendEmail,
      updateDeliveryStatus
    });

    expect(result.status).toBe("skipped_already_sent");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updateDeliveryStatus).not.toHaveBeenCalled();
  });

  it("sends email and marks sent on success", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const updateDeliveryStatus = vi.fn().mockResolvedValue(undefined);

    const result = await sendEmailNotification({
      notification: baseNotification,
      userEmail: "user@example.com",
      emailEnabled: true,
      sendEmail,
      updateDeliveryStatus
    });

    expect(result.status).toBe("sent");
    expect(sendEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      subject: "目標利回りに到達",
      text: "テスト本文"
    });
    expect(updateDeliveryStatus).toHaveBeenCalledWith({
      notificationId: "notif-1",
      status: "sent"
    });
  });

  it("stores failed status and error on transient Resend error", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      success: false,
      error: "Resend 500 Internal Server Error"
    });
    const updateDeliveryStatus = vi.fn().mockResolvedValue(undefined);

    const result = await sendEmailNotification({
      notification: baseNotification,
      userEmail: "user@example.com",
      emailEnabled: true,
      sendEmail,
      updateDeliveryStatus
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Resend 500 Internal Server Error");
    expect(updateDeliveryStatus).toHaveBeenCalledWith({
      notificationId: "notif-1",
      status: "failed",
      error: "Resend 500 Internal Server Error"
    });
  });

  it("delivers only once when called twice (idempotency)", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ success: true });
    const updateDeliveryStatus = vi.fn().mockResolvedValue(undefined);

    // First call
    await sendEmailNotification({
      notification: baseNotification,
      userEmail: "user@example.com",
      emailEnabled: true,
      sendEmail,
      updateDeliveryStatus
    });

    // Second call with updated notification
    const result2 = await sendEmailNotification({
      notification: {
        ...baseNotification,
        sent_via_email_at: "2026-05-06T12:00:00Z"
      },
      userEmail: "user@example.com",
      emailEnabled: true,
      sendEmail,
      updateDeliveryStatus
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result2.status).toBe("skipped_already_sent");
  });
});
