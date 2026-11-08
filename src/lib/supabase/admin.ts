import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Supabase client with the SECRET (service-role) key. It bypasses RLS, so:
 * - only import it from server actions / route handlers ("server-only" enforces this),
 * - always check the caller is an admin BEFORE using it.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it in Coolify (runtime only) and redeploy."
    );
  }
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
