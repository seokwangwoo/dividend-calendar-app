import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "./auth";
import { createDividendEvent, approveDividendEvent, rejectDividendEvent } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./auth", () => ({ requireAdminUser: vi.fn() }));

type MockQuery = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  then: (resolve: any, reject: any) => Promise<any>;
};

function buildMockQuery(result: { data?: any; error: any }): MockQuery {
  const self: MockQuery = {
    insert: vi.fn(() => Promise.resolve(result)),
    update: vi.fn(() => self),
    eq: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => self),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  };
  return self;
}

function buildMockSupabase(result: { data?: any; error: any }) {
  const query = buildMockQuery(result);
  return {
    from: vi.fn(() => query),
    _query: query
  };
}

function adminUser() {
  vi.mocked(requireAdminUser).mockResolvedValue({ id: "admin-id" });
}

function nonAdminUser() {
  vi.mocked(requireAdminUser).mockRejectedValue(new Error("Redirect: /app/home"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

const BASE_INPUT = {
  stockId: "stock-uuid",
  fiscalYear: 2026,
  expectedPaymentYear: 2026,
  eventType: "year_end" as const,
  dividendPerShare: 50
};

describe("createDividendEvent", () => {
  it("rejects estimated_payment_month outside 1–12", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await expect(
      createDividendEvent({ ...BASE_INPUT, estimatedPaymentMonth: 0 })
    ).rejects.toThrow();

    await expect(
      createDividendEvent({ ...BASE_INPUT, estimatedPaymentMonth: 13 })
    ).rejects.toThrow();
  });

  it("rejects negative dividend_per_share", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await expect(
      createDividendEvent({ ...BASE_INPUT, dividendPerShare: -1 })
    ).rejects.toThrow();
  });

  it("rejects missing expected_payment_year", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await expect(
      createDividendEvent({ ...BASE_INPUT, expectedPaymentYear: undefined as unknown as number })
    ).rejects.toThrow();
  });

  it("defaults review_status to pending", async () => {
    adminUser();
    const mock = buildMockSupabase({ error: null });
    vi.mocked(createClient).mockResolvedValue(mock as any);

    await createDividendEvent(BASE_INPUT);

    expect(mock.from).toHaveBeenCalledWith("dividend_events");
    const insertCall = mock._query.insert.mock.calls[0][0];
    expect(insertCall.review_status).toBe("pending");
  });

  it("calls revalidatePath after successful insert", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await createDividendEvent(BASE_INPUT);

    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
  });

  it("throws on database error", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(
      buildMockSupabase({ error: { message: "db error" } }) as any
    );

    await expect(createDividendEvent(BASE_INPUT)).rejects.toThrow("db error");
  });
});

describe("approveDividendEvent", () => {
  it("sets review_status to approved", async () => {
    adminUser();
    const mock = buildMockSupabase({ error: null });
    vi.mocked(createClient).mockResolvedValue(mock as any);

    await approveDividendEvent("event-id");

    expect(mock.from).toHaveBeenCalledWith("dividend_events");
    expect(mock._query.update).toHaveBeenCalledWith({ review_status: "approved" });
    expect(mock._query.eq).toHaveBeenCalledWith("id", "event-id");
  });

  it("calls revalidatePath for admin and user-facing routes", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await approveDividendEvent("event-id");

    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/app/home");
    expect(revalidatePath).toHaveBeenCalledWith("/app/portfolio");
    expect(revalidatePath).toHaveBeenCalledWith("/app/calendar");
  });

  it("fails for non-admin caller", async () => {
    nonAdminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await expect(approveDividendEvent("event-id")).rejects.toThrow("Redirect: /app/home");
  });
});

describe("rejectDividendEvent", () => {
  it("sets review_status to rejected and stores rejection_reason", async () => {
    adminUser();
    const mock = buildMockSupabase({ error: null });
    vi.mocked(createClient).mockResolvedValue(mock as any);

    await rejectDividendEvent("event-id", "データ不備");

    expect(mock.from).toHaveBeenCalledWith("dividend_events");
    expect(mock._query.update).toHaveBeenCalledWith({
      review_status: "rejected",
      rejection_reason: "データ不備"
    });
    expect(mock._query.eq).toHaveBeenCalledWith("id", "event-id");
  });

  it("calls revalidatePath for admin and user-facing routes", async () => {
    adminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await rejectDividendEvent("event-id", "reason");

    expect(revalidatePath).toHaveBeenCalledWith("/admin/dividend-reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/app/home");
    expect(revalidatePath).toHaveBeenCalledWith("/app/portfolio");
    expect(revalidatePath).toHaveBeenCalledWith("/app/calendar");
  });

  it("stores null when reason is blank", async () => {
    adminUser();
    const mock = buildMockSupabase({ error: null });
    vi.mocked(createClient).mockResolvedValue(mock as any);

    await rejectDividendEvent("event-id", "  ");

    expect(mock._query.update).toHaveBeenCalledWith({
      review_status: "rejected",
      rejection_reason: null
    });
  });

  it("fails for non-admin caller", async () => {
    nonAdminUser();
    vi.mocked(createClient).mockResolvedValue(buildMockSupabase({ error: null }) as any);

    await expect(rejectDividendEvent("event-id", "reason")).rejects.toThrow(
      "Redirect: /app/home"
    );
  });
});
