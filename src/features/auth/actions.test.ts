import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { login, signup, requestPasswordReset, logout } from "./actions";

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
  auth: {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signOut: vi.fn(),
    exchangeCodeForSession: vi.fn()
  },
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  order: vi.fn(() => mockSupabase),
  limit: vi.fn(() => mockSupabase),
  single: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  insert: vi.fn(() => mockSupabase),
  is: vi.fn(() => mockSupabase),
  rpc: vi.fn(() => mockSupabase)
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

describe("login", () => {
  it("redirects with error on signIn failure", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" }
    });
    const formData = makeFormData({
      email: "test@example.com",
      password: "wrong"
    });
    await expect(login(formData)).rejects.toThrow(
      "Redirect: /auth/login?error=Invalid+credentials"
    );
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "wrong"
    });
  });

  it("revalidates and redirects to home on success", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null
    });
    const formData = makeFormData({
      email: "test@example.com",
      password: "secret"
    });
    await expect(login(formData)).rejects.toThrow(
      "Redirect: /app/home"
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/app/home");
  });

  it("handles empty email and password", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Missing credentials" }
    });
    const formData = makeFormData({ email: "", password: "" });
    await expect(login(formData)).rejects.toThrow(
      "Redirect: /auth/login?error=Missing+credentials"
    );
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "",
      password: ""
    });
  });
});

describe("signup", () => {
  it("redirects with error on signUp failure", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: null,
      error: { message: "Email already registered" }
    });
    const formData = makeFormData({
      email: "test@example.com",
      password: "secret"
    });
    await expect(signup(formData)).rejects.toThrow(
      "Redirect: /auth/signup?error=Email+already+registered"
    );
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "secret"
    });
  });

  it("redirects to login with message on success", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null
    });
    const formData = makeFormData({
      email: "test@example.com",
      password: "secret"
    });
    await expect(signup(formData)).rejects.toThrow(
      "Redirect: /auth/login?message=%E7%A2%BA%E8%AA%8D%E3%83%A1%E3%83%BC%E3%83%AB%E3%82%92%E9%80%81%E4%BF%A1%E3%81%97%E3%81%BE%E3%81%97%E3%81%9F%E3%80%82%E3%83%A1%E3%83%BC%E3%83%AB%E3%82%92%E7%A2%BA%E8%AA%8D%E3%81%97%E3%81%A6%E3%83%AD%E3%82%B0%E3%82%A4%E3%83%B3%E3%81%97%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84%E3%80%82"
    );
  });
});

describe("requestPasswordReset", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_APP_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_APP_URL;
    }
  });

  it("redirects with error on resetPasswordForEmail failure", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: "Rate limit exceeded" }
    });
    const formData = makeFormData({ email: "test@example.com" });
    await expect(requestPasswordReset(formData)).rejects.toThrow(
      "Redirect: /auth/reset-password?error=Rate+limit+exceeded"
    );
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      {
        redirectTo: "http://localhost:3000/auth/reset-password"
      }
    );
  });

  it("uses NEXT_PUBLIC_APP_URL when available", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: null
    });
    const formData = makeFormData({ email: "test@example.com" });
    await expect(requestPasswordReset(formData)).rejects.toThrow();
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      {
        redirectTo: "https://example.com/auth/reset-password"
      }
    );
  });

  it("redirects to login with message on success", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: null
    });
    const formData = makeFormData({ email: "test@example.com" });
    await expect(requestPasswordReset(formData)).rejects.toThrow(
      "Redirect: /auth/login?message=%E3%83%91%E3%82%B9%E3%83%AF%E3%83%BC%E3%83%89%E5%86%8D%E8%A8%AD%E5%AE%9A%E7%94%A8%E3%83%AA%E3%83%B3%E3%82%AF%E3%82%92%E9%80%81%E4%BF%A1%E3%81%97%E3%81%BE%E3%81%97%E3%81%9F%E3%80%82"
    );
  });
});

describe("logout", () => {
  it("calls signOut, revalidates and redirects to login", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    await expect(logout()).rejects.toThrow("Redirect: /auth/login");
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});
