"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PREF_COOKIES, normalizePreferences } from "@/lib/preferences";
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
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle<Record<string, unknown>>();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return {
      error: "This account is not active. Contact your admin.",
      email,
    };
  }

  // Bring this user's theme, accent and language to this browser.
  const prefs = normalizePreferences(profile);
  const jar = await cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  jar.set(PREF_COOKIES.theme, prefs.theme, opts);
  jar.set(PREF_COOKIES.accent, prefs.accent, opts);
  jar.set(PREF_COOKIES.locale, prefs.locale, opts);

  redirect("/");
}
