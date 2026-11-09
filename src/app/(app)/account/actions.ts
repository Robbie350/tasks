"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { PREF_COOKIES, normalizePreferences, type Preferences } from "@/lib/preferences";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const MIN_PASSWORD = 8;

export async function saveProfile(input: { fullName?: string } & Partial<Preferences>): Promise<Result> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "Please sign in again." };

    const prefs = normalizePreferences({
      theme: input.theme ?? me.theme,
      accent: input.accent ?? me.accent,
      locale: input.locale ?? me.locale,
    });
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_my_profile", {
      p_full_name: input.fullName ?? null,
      p_theme: prefs.theme,
      p_accent: prefs.accent,
      p_locale: prefs.locale,
    });
    if (error) return { ok: false, error: error.message };

    const jar = await cookies();
    const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
    jar.set(PREF_COOKIES.theme, prefs.theme, opts);
    jar.set(PREF_COOKIES.accent, prefs.accent, opts);
    jar.set(PREF_COOKIES.locale, prefs.locale, opts);

    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    console.error("saveProfile failed", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

export async function changePassword(input: {
  current: string;
  next: string;
  confirm: string;
}): Promise<Result> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "Please sign in again." };
    if (input.next.length < MIN_PASSWORD)
      return { ok: false, error: `The new password needs at least ${MIN_PASSWORD} characters.` };
    if (input.next !== input.confirm) return { ok: false, error: "The new passwords don't match." };
    if (input.next === input.current)
      return { ok: false, error: "The new password must be different from the current one." };

    // Check the current password with a throwaway client, so a wrong guess
    // doesn't touch this browser's session.
    const verifier = createPlainClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: wrong } = await verifier.auth.signInWithPassword({
      email: me.email,
      password: input.current,
    });
    if (wrong) return { ok: false, error: "Your current password is wrong." };
    await verifier.auth.signOut({ scope: "local" });

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: input.next });
    if (error) return { ok: false, error: error.message };

    return { ok: true, message: "Password changed. Use the new one next time you sign in." };
  } catch (e) {
    console.error("changePassword failed", e);
    return { ok: false, error: "Couldn't change the password. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------
const AVATARS = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/webp", "image/jpeg", "image/png"];

/** Storage path of an avatar URL from our bucket, or null. */
function avatarPath(url: string | null | undefined) {
  const marker = `/storage/v1/object/public/${AVATARS}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i >= 0 ? url!.slice(i + marker.length).split("?")[0] : null;
}

export async function uploadAvatar(formData: FormData): Promise<Result> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "Please sign in again." };
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
    if (file.size > MAX_AVATAR_BYTES || !AVATAR_TYPES.includes(file.type))
      return { ok: false, error: "Use a JPG, PNG or WebP image up to 2 MB." };

    const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const path = `${me.id}/${crypto.randomUUID()}.${ext}`;
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from(AVATARS)
      .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (upErr) {
      console.error("avatar upload failed", upErr);
      return { ok: false, error: "Couldn't upload the file. Try again." };
    }
    const url = admin.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;

    const supabase = await createClient();
    const { data: oldUrl, error } = await supabase.rpc("set_my_avatar", { p_url: url });
    if (error) {
      await admin.storage.from(AVATARS).remove([path]);
      return { ok: false, error: error.message };
    }
    const old = avatarPath(oldUrl as string | null);
    if (old && old.startsWith(`${me.id}/`)) await admin.storage.from(AVATARS).remove([old]);
  } catch (e) {
    console.error("uploadAvatar failed", e);
    return { ok: false, error: "Couldn't upload the file. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function removeAvatar(): Promise<Result> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "Please sign in again." };
    const supabase = await createClient();
    const { data: oldUrl, error } = await supabase.rpc("set_my_avatar", { p_url: null });
    if (error) return { ok: false, error: error.message };
    const old = avatarPath(oldUrl as string | null);
    if (old && old.startsWith(`${me.id}/`)) await createAdminClient().storage.from(AVATARS).remove([old]);
  } catch (e) {
    console.error("removeAvatar failed", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
