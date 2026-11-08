"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Same message for every failure, so it doesn't reveal which emails exist.
    return { error: "Wrong email or password.", email };
  }

  // RLS hides profiles from deactivated users, so no row = not allowed in.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return {
      error: "This account is not active. Contact your admin.",
      email,
    };
  }

  redirect("/");
}
