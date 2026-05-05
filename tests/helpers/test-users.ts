import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminClient, createAnonClient } from "./supabase";

export interface TestUser {
  id: string;
  email: string;
}

export async function createTestUser(
  email: string,
  password: string
): Promise<TestUser> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createTestUser(${email}): ${error.message}`);
  return { id: data.user.id, email };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
}

export async function signInAs(
  email: string,
  password: string
): Promise<SupabaseClient<Database>> {
  const client = createAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInAs(${email}): ${error.message}`);
  return client;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@test.example.com`;
}
