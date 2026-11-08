import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, avatar_url, created_at")
    .eq("id", userId)
    .maybeSingle<Profile>();

  return profile && profile.is_active ? profile : null;
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
