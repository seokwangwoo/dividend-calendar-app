import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createHolding,
  updateHolding,
  softDeleteHolding
} from "./actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  order: vi.fn(() => mockSupabase),
  limit: vi.fn(() => mockSupabase),
  single: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  insert: vi.fn(() => mockSupabase),
  is: vi.fn(() => mockSupabase)
};

function makeFormData(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    fd.append(k, v);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  vi.mocked(redirect).mockImplementation((path: string) => {
    throw new Error(`Redirect: ${path}`);
  });
});

describe("createHolding", () => {
  const validData = {
    stockId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    quantity: "10",
    averagePurchasePrice: "1000",
    accountType: "nisa"
  };

  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(createHolding(makeFormData(validData))).rejects.toThrow(
      "Redirect: /auth/login"
    );
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws on invalid stockId", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, stockId: "not-a-uuid" };
    await expect(createHolding(makeFormData(data))).rejects.toThrow(
      "Invalid stock ID"
    );
  });

  it("throws on invalid quantity", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, quantity: "-1" };
    await expect(createHolding(makeFormData(data))).rejects.toThrow(
      "Quantity must be greater than zero"
    );
  });

  it("throws on invalid averagePurchasePrice", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, averagePurchasePrice: "-5" };
    await expect(createHolding(makeFormData(data))).rejects.toThrow(
      "Average purchase price must be greater than or equal to zero"
    );
  });

  it("throws on invalid accountType", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, accountType: "invalid" };
    await expect(createHolding(makeFormData(data))).rejects.toThrow(
      "Invalid account type"
    );
  });

  it("throws when stock is not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { message: "Stock not found" }
    });
    await expect(createHolding(makeFormData(validData))).rejects.toThrow(
      "Stock not found"
    );
    expect(mockSupabase.from).toHaveBeenCalledWith("stocks");
    expect(mockSupabase.select).toHaveBeenCalledWith("id, support_status");
    expect(mockSupabase.eq).toHaveBeenCalledWith("id", validData.stockId);
  });

  it("throws when stock support_status is not supported", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.single.mockResolvedValue({
      data: { id: validData.stockId, support_status: "unsupported" },
      error: null
    });
    await expect(createHolding(makeFormData(validData))).rejects.toThrow(
      "This stock is not supported in the current MVP."
    );
  });

  it("throws on insert error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.single.mockResolvedValue({
      data: { id: validData.stockId, support_status: "supported" },
      error: null
    });
    mockSupabase.insert.mockResolvedValue({
      data: null,
      error: { message: "Insert failed" }
    });
    await expect(createHolding(makeFormData(validData))).rejects.toThrow(
      "Insert failed"
    );
    expect(mockSupabase.from).toHaveBeenCalledWith("holdings");
    expect(mockSupabase.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      stock_id: validData.stockId,
      quantity: 10,
      average_purchase_price: 1000,
      account_type: "nisa"
    });
  });

  it("succeeds and revalidates path", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.single.mockResolvedValue({
      data: { id: validData.stockId, support_status: "supported" },
      error: null
    });
    mockSupabase.insert.mockResolvedValue({ data: null, error: null });
    await createHolding(makeFormData(validData));
    expect(revalidatePath).toHaveBeenCalledWith("/app/portfolio");
  });
});

describe("updateHolding", () => {
  const validData = {
    quantity: "20",
    averagePurchasePrice: "2000",
    accountType: "tokutei"
  };
  const holdingId = "holding-1";

  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(
      updateHolding(holdingId, makeFormData(validData))
    ).rejects.toThrow("Redirect: /auth/login");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws on invalid quantity", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, quantity: "0" };
    await expect(
      updateHolding(holdingId, makeFormData(data))
    ).rejects.toThrow("Quantity must be greater than zero");
  });

  it("throws on invalid averagePurchasePrice", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, averagePurchasePrice: "-1" };
    await expect(
      updateHolding(holdingId, makeFormData(data))
    ).rejects.toThrow("Average purchase price must be greater than or equal to zero");
  });

  it("throws on invalid accountType", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    const data = { ...validData, accountType: "foo" };
    await expect(
      updateHolding(holdingId, makeFormData(data))
    ).rejects.toThrow("Invalid account type");
  });

  it("throws on update error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.is.mockResolvedValue({
      data: null,
      error: { message: "Update failed" }
    });
    await expect(
      updateHolding(holdingId, makeFormData(validData))
    ).rejects.toThrow("Update failed");
    expect(mockSupabase.from).toHaveBeenCalledWith("holdings");
    expect(mockSupabase.update).toHaveBeenCalledWith({
      quantity: 20,
      average_purchase_price: 2000,
      account_type: "tokutei"
    });
  });

  it("succeeds, revalidates path and redirects", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.is.mockResolvedValue({ data: null, error: null });
    await expect(
      updateHolding(holdingId, makeFormData(validData))
    ).rejects.toThrow("Redirect: /app/portfolio");
    expect(revalidatePath).toHaveBeenCalledWith("/app/portfolio");
    expect(redirect).toHaveBeenCalledWith("/app/portfolio");
  });
});

describe("softDeleteHolding", () => {
  const holdingId = "holding-1";

  it("redirects to login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(softDeleteHolding(holdingId)).rejects.toThrow(
      "Redirect: /auth/login"
    );
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("throws on update error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.is.mockResolvedValue({
      data: null,
      error: { message: "Delete failed" }
    });
    await expect(softDeleteHolding(holdingId)).rejects.toThrow("Delete failed");
    expect(mockSupabase.from).toHaveBeenCalledWith("holdings");
    expect(mockSupabase.update).toHaveBeenCalledWith({
      deleted_at: expect.any(String)
    });
  });

  it("succeeds, revalidates path and redirects", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } }
    });
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.is.mockResolvedValue({ data: null, error: null });
    await expect(softDeleteHolding(holdingId)).rejects.toThrow(
      "Redirect: /app/portfolio"
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app/portfolio");
    expect(redirect).toHaveBeenCalledWith("/app/portfolio");
  });
});
