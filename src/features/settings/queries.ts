import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type UserSettingsRow =
  Database["public"]["Tables"]["user_settings"]["Row"];

export async function getCurrentUserSettings(): Promise<{
  email: string;
  settings: UserSettingsRow;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentication required");
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    email: user.email ?? "",
    settings: data
  };
}
