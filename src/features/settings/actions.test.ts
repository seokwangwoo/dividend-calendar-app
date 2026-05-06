import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateSettings } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

describe("updateSettings", () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => mockSupabase),
    update: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase)
  };

  const mockUser = { id: "user-123", email: "user@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  function createFormData(overrides: Record<string, string | null> = {}): FormData {
    const formData = new FormData();
    if (overrides.emailNotificationEnabled !== null) {
      formData.append("emailNotificationEnabled", overrides.emailNotificationEnabled ?? "on");
    }
    if (overrides.inAppNotificationEnabled !== null) {
      formData.append("inAppNotificationEnabled", overrides.inAppNotificationEnabled ?? "on");
    }
    formData.append("defaultAmountBasis", overrides.defaultAmountBasis ?? "before_tax");
    if (overrides.monthlyDividendGoalAmount !== undefined && overrides.monthlyDividendGoalAmount !== null) {
      formData.append("monthlyDividendGoalAmount", overrides.monthlyDividendGoalAmount);
    }
    return formData;
  }

  it("redirects to login when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(updateSettings(createFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/login");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("redirects to login when user is null", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Auth error") });

    await expect(updateSettings(createFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws validation error for invalid defaultAmountBasis", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });

    const formData = createFormData({ defaultAmountBasis: "invalid_basis" });

    await expect(updateSettings(formData)).rejects.toThrow();
  });

  it("throws validation error for negative monthlyDividendGoalAmount", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });

    const formData = createFormData({ monthlyDividendGoalAmount: "-100" });

    await expect(updateSettings(formData)).rejects.toThrow("Number must be greater than or equal to 0");
  });

  it("converts empty string monthlyDividendGoalAmount to null", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const formData = createFormData({ monthlyDividendGoalAmount: "" });

    await updateSettings(formData);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        monthly_dividend_goal_amount: null
      })
    );
  });

  it("converts null monthlyDividendGoalAmount to null", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const formData = new FormData();
    formData.append("emailNotificationEnabled", "on");
    formData.append("inAppNotificationEnabled", "on");
    formData.append("defaultAmountBasis", "before_tax");
    // monthlyDividendGoalAmount not appended -> get returns null

    await updateSettings(formData);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        monthly_dividend_goal_amount: null
      })
    );
  });

  it("parses numeric monthlyDividendGoalAmount correctly", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const formData = createFormData({ monthlyDividendGoalAmount: "50000" });

    await updateSettings(formData);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        monthly_dividend_goal_amount: 50000
      })
    );
  });

  it("parses decimal monthlyDividendGoalAmount correctly", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const formData = createFormData({ monthlyDividendGoalAmount: "1234.56" });

    await updateSettings(formData);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        monthly_dividend_goal_amount: 1234.56
      })
    );
  });

  it("updates settings successfully with correct values", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const formData = createFormData({
      emailNotificationEnabled: null,
      inAppNotificationEnabled: "on",
      defaultAmountBasis: "after_tax",
      monthlyDividendGoalAmount: "100000"
    });

    await updateSettings(formData);

    expect(mockSupabase.from).toHaveBeenCalledWith("user_settings");
    expect(mockSupabase.update).toHaveBeenCalledWith({
      email_notification_enabled: false,
      in_app_notification_enabled: true,
      default_amount_basis: "after_tax",
      monthly_dividend_goal_amount: 100000,
      currency: "JPY"
    });
    expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(revalidatePath).toHaveBeenCalledWith("/app/settings");
  });

  it("throws error when supabase update fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: { message: "Update failed" } });

    const formData = createFormData();

    await expect(updateSettings(formData)).rejects.toThrow("Update failed");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("handles unchecked checkbox values (false)", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    const formData = new FormData();
    formData.append("inAppNotificationEnabled", "on");
    formData.append("defaultAmountBasis", "before_tax");
    // emailNotificationEnabled not appended

    await updateSettings(formData);

    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        email_notification_enabled: false
      })
    );
  });

  it("throws validation error when monthlyDividendGoalAmount is not a number", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });

    const formData = createFormData({ monthlyDividendGoalAmount: "abc" });

    await expect(updateSettings(formData)).rejects.toThrow();
  });
});
