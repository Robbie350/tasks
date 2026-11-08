"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const ROLES: Role[] = ["admin", "manager", "specialist"];
const MIN_PASSWORD = 8;
// Effectively permanent; Supabase needs a duration, not "forever".
const BAN_FOREVER = "876000h";

/**
 * Every action starts here. Server actions are public HTTP endpoints, so the
 * admin check must happen inside each one, not just on the page.
 */
async function requireAdmin() {
  const me = await getCurrentProfile();
  if (!me || me.role !== "admin") {
    throw new Error("Only an admin can manage users.");
  }
  return me;
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}

// ---------------------------------------------------------------------------

export async function createUser(_prev: ActionResult | null, formData: FormData) {
  return run(async () => {
    await requireAdmin();

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = formData.get("role");
    const password = String(formData.get("password") ?? "");

    if (!fullName || fullName.length > 100) return fail("Enter a name (up to 100 characters).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
    if (!isRole(role)) return fail("Choose a role.");
    if (password.length < MIN_PASSWORD)
      return fail(`The password needs at least ${MIN_PASSWORD} characters.`);

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation email: the admin vouches for the address
      // app_metadata can only be set with the secret key; the database trigger
      // reads the role and name from here when it creates the profile.
      app_metadata: { role, full_name: fullName },
      user_metadata: { full_name: fullName },
    });

    if (error) {
      if (/already.*(registered|exists)/i.test(error.message)) {
        return fail("A user with this email already exists.");
      }
      return fail(error.message);
    }

    revalidatePath("/admin/users");
    return { ok: true, message: `${fullName} can now sign in with ${email}.` };
  });
}

export async function updateUser(
  userId: string,
  input: { fullName: string; role: string; newPassword?: string }
) {
  return run(async () => {
    const me = await requireAdmin();

    const fullName = input.fullName.trim();
    if (!fullName || fullName.length > 100) return fail("Enter a name (up to 100 characters).");
    if (!isRole(input.role)) return fail("Choose a role.");
    if (userId === me.id && input.role !== me.role) {
      return fail("You can't change your own role. Ask another admin.");
    }
    const newPassword = input.newPassword ?? "";
    if (newPassword && newPassword.length < MIN_PASSWORD) {
      return fail(`The new password needs at least ${MIN_PASSWORD} characters.`);
    }

    const admin = createAdminClient();

    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: input.role, full_name: fullName },
      user_metadata: { full_name: fullName },
      ...(newPassword ? { password: newPassword } : {}),
    });
    if (authError) return fail(authError.message);

    const { error } = await admin
      .from("profiles")
      .update({ full_name: fullName, role: input.role })
      .eq("id", userId);
    if (error) return fail(error.message);

    revalidatePath("/admin/users");
    revalidatePath("/", "layout");
    return { ok: true, message: newPassword ? "Saved. The new password works now." : "Saved." };
  });
}

export async function setUserActive(userId: string, active: boolean) {
  return run(async () => {
    const me = await requireAdmin();
    if (userId === me.id) return fail("You can't deactivate your own account.");

    const admin = createAdminClient();

    // 1) Block sign-in and session refresh at the auth level.
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: active ? "none" : BAN_FOREVER,
    });
    if (authError) return fail(authError.message);

    // 2) RLS hides everything from inactive users, even with a still-valid token.
    const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", userId);
    if (error) return fail(error.message);

    revalidatePath("/admin/users");
    return { ok: true, message: active ? "User reactivated." : "User deactivated." };
  });
}
