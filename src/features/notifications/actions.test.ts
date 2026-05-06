import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  saveNotificationRule,
  disableNotificationRule,
  markNotificationRead,
  markAllNotificationsRead
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`Redirect: ${url}`);
  })
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

function createMockQuery(result: any) {
  const self: any = {
    select: vi.fn(() => self),
    insert: vi.fn(() => self),
    update: vi.fn(() => self),
    eq: vi.fn(() => self),
    order: vi.fn(() => self),
    limit: vi.fn(() => self),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject)
  };
  return self;
}

function createMockSupabase() {
  const query = createMockQuery({ error: null });
  return {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn(() => query)
  };
}

let mockSupabase: ReturnType<typeof createMockSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase = createMockSupabase();
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
});

describe("saveNotificationRule", () => {
  function createValidFormData(overrides?: Record<string, string>) {
    const formData = new FormData();
    formData.append("stockId", "550e8400-e29b-41d4-a716-446655440000");
    formData.append("basis", "before_tax_yield");
    formData.append("operator", "gte");
    formData.append("targetYield", "3.5");
    formData.append("notifyInApp", "on");
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        formData.set(key, value);
      }
    }
    return formData;
  }

  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(saveNotificationRule(new FormData())).rejects.toThrow(
      "Redirect: /auth/login"
    );
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws validation error for invalid data", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const formData = new FormData();
    formData.append("stockId", "invalid-uuid");
    await expect(saveNotificationRule(formData)).rejects.toThrow(
      "Invalid uuid"
    );
  });

  it("throws when no notification channel is selected", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const formData = createValidFormData();
    formData.delete("notifyInApp");
    formData.delete("notifyEmail");
    await expect(saveNotificationRule(formData)).rejects.toThrow(
      "At least one notification channel must be enabled"
    );
  });

  it("inserts a new rule successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    await saveNotificationRule(createValidFormData());
    expect(mockSupabase.from).toHaveBeenCalledWith("notification_rules");
    const query = mockSupabase.from("notification_rules");
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: "550e8400-e29b-41d4-a716-446655440000",
        user_id: "user-1",
        basis: "before_tax_yield",
        operator: "gte",
        target_yield: 3.5,
        notify_in_app: true,
        notify_email: false,
        status: "active"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/app/stocks/550e8400-e29b-41d4-a716-446655440000/notification-rule"
    );
  });

  it("updates an existing rule successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const formData = createValidFormData({
      ruleId: "550e8400-e29b-41d4-a716-446655440001"
    });
    await saveNotificationRule(formData);
    const query = mockSupabase.from("notification_rules");
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        basis: "before_tax_yield",
        operator: "gte",
        target_yield: 3.5,
        notify_in_app: true,
        notify_email: false,
        status: "active"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/app/stocks/550e8400-e29b-41d4-a716-446655440000/notification-rule"
    );
  });

  it("throws when database returns an error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const query = createMockQuery({ error: { message: "DB error" } });
    mockSupabase.from.mockReturnValue(query);
    await expect(saveNotificationRule(createValidFormData())).rejects.toThrow(
      "DB error"
    );
  });
});

describe("disableNotificationRule", () => {
  function createValidFormData() {
    const formData = new FormData();
    formData.append("ruleId", "550e8400-e29b-41d4-a716-446655440001");
    formData.append("stockId", "550e8400-e29b-41d4-a716-446655440000");
    return formData;
  }

  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(disableNotificationRule(new FormData())).rejects.toThrow(
      "Redirect: /auth/login"
    );
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws on invalid ruleId", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const formData = new FormData();
    formData.append("ruleId", "bad-uuid");
    formData.append("stockId", "550e8400-e29b-41d4-a716-446655440000");
    await expect(disableNotificationRule(formData)).rejects.toThrow();
  });

  it("disables rule successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    await disableNotificationRule(createValidFormData());
    const query = mockSupabase.from("notification_rules");
    expect(query.update).toHaveBeenCalledWith({ status: "disabled" });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/app/stocks/550e8400-e29b-41d4-a716-446655440000/notification-rule"
    );
  });

  it("throws when database returns an error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const query = createMockQuery({ error: { message: "DB fail" } });
    mockSupabase.from.mockReturnValue(query);
    await expect(disableNotificationRule(createValidFormData())).rejects.toThrow(
      "DB fail"
    );
  });
});

describe("markNotificationRead", () => {
  function createValidFormData() {
    const formData = new FormData();
    formData.append("notificationId", "550e8400-e29b-41d4-a716-446655440002");
    return formData;
  }

  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(markNotificationRead(new FormData())).rejects.toThrow(
      "Redirect: /auth/login"
    );
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws on invalid notificationId", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const formData = new FormData();
    formData.append("notificationId", "bad-uuid");
    await expect(markNotificationRead(formData)).rejects.toThrow();
  });

  it("marks notification as read successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    await markNotificationRead(createValidFormData());
    const query = mockSupabase.from("notifications");
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "read", read_at: expect.any(String) })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app/notifications");
  });

  it("throws when database returns an error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const query = createMockQuery({ error: { message: "DB error" } });
    mockSupabase.from.mockReturnValue(query);
    await expect(markNotificationRead(createValidFormData())).rejects.toThrow(
      "DB error"
    );
  });
});

describe("markAllNotificationsRead", () => {
  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null }
    } as never);
    await expect(markAllNotificationsRead()).rejects.toThrow(
      "Redirect: /auth/login"
    );
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("marks all unread notifications as read successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    } as never);
    await markAllNotificationsRead();
    const query = mockSupabase.from("notifications");
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "read", read_at: expect.any(String) })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app/notifications");
  });

  it("throws when database returns an error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    } as never);
    const query = createMockQuery({ error: { message: "DB error" } });
    mockSupabase.from.mockReturnValue(query);
    await expect(markAllNotificationsRead()).rejects.toThrow("DB error");
  });
});
