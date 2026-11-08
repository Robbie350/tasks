import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePreferences } from "@/lib/preferences";
import type { Profile, Role } from "@/lib/types";

/**
 * Returns the signed-in user's profile, or null when signed out.
 * The profiles RLS policy hides rows from deactivated users, so a deactivated
 * user also gets null here.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  // select("*") keeps working if a newer column hasn't been added yet.
  const { data: row } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Record<string, unknown>>();

  if (!row || !row.is_active) return null;
  return { ...(row as Profile), ...normalizePreferences(row) };
}

/** For pages: the active profile, or sign out and go to /login (via middleware). */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?error=inactive");
  return profile;
}

/** For pages and server actions that need specific roles. */
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}
