import { createAdminClient } from "./supabase";
import { deleteTestUser } from "./test-users";

export async function cleanupUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("holdings").delete().eq("user_id", userId);
  await admin.from("notification_rules").delete().eq("user_id", userId);
  await admin.from("notifications").delete().eq("user_id", userId);
  await deleteTestUser(userId);
}
