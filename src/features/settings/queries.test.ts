import { describe, expect, it, vi, beforeEach } from "vitest";
import { getCurrentUserSettings } from "./queries";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

describe("getCurrentUserSettings", () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    single: vi.fn(() => mockSupabase)
  };

  const mockUser = { id: "user-123", email: "user@example.com" };
  const mockSettings = {
    id: "settings-1",
    user_id: "user-123",
    email_notification_enabled: true,
    in_app_notification_enabled: false,
    default_amount_basis: "before_tax",
    annual_dividend_goal_amount: 50000,
    currency: "JPY"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns email and settings when user is authenticated and settings exist", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.single.mockResolvedValueOnce({ data: mockSettings, error: null });

    const result = await getCurrentUserSettings();

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.auth.getUser).toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith("user_settings");
    expect(mockSupabase.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(mockSupabase.single).toHaveBeenCalled();
    expect(result).toEqual({
      email: "user@example.com",
      settings: mockSettings
    });
  });

  it("returns empty email string when user email is null", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { ...mockUser, email: null } },
      error: null
    });
    mockSupabase.single.mockResolvedValueOnce({ data: mockSettings, error: null });

    const result = await getCurrentUserSettings();

    expect(result.email).toBe("");
    expect(result.settings).toEqual(mockSettings);
  });

  it("returns annual_dividend_goal_amount as null when it is not set", async () => {
    const settingsWithoutGoal = {
      ...mockSettings,
      annual_dividend_goal_amount: null
    };
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.single.mockResolvedValueOnce({ data: settingsWithoutGoal, error: null });

    const result = await getCurrentUserSettings();

    expect(result.settings.annual_dividend_goal_amount).toBeNull();
  });

  it("throws authentication error when getUser returns an error", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("Session expired")
    });

    await expect(getCurrentUserSettings()).rejects.toThrow("Authentication required");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("throws authentication error when user is null", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null
    });

    await expect(getCurrentUserSettings()).rejects.toThrow("Authentication required");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("throws error when settings query fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: "Settings not found" }
    });

    await expect(getCurrentUserSettings()).rejects.toThrow("Settings not found");
  });
});
