"use server";

import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { botApi, botToken, botUsername, getSetting, webhookSecret } from "@/lib/telegram";

export type TelegramStatus = {
  configured: boolean; // token set and bot reachable
  linked: boolean;
  linkedUsername: string | null;
};

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const configured = Boolean(botToken() && (await botUsername()));
  try {
    const supabase = await createClient();
    // RLS: only the user's own row is visible.
    const { data } = await supabase.from("telegram_links").select("username").maybeSingle();
    return { configured, linked: Boolean(data), linkedUsername: (data?.username as string | null) ?? null };
  } catch {
    return { configured, linked: false, linkedUsername: null };
  }
}

/** A one-time t.me link that connects this user when they press Start. */
export async function startTelegramLink(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const bot = await botUsername();
  if (!bot) return { ok: false, error: "Telegram isn't set up on this site yet. Ask your admin." };
  const supabase = await createClient();
  const { data: code, error } = await supabase.rpc("create_telegram_link_code");
  if (error || typeof code !== "string") return { ok: false, error: error?.message ?? "Something went wrong." };
  return { ok: true, url: `https://t.me/${bot}?start=${code}` };
}

export async function disconnectTelegram(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("telegram_unlink");
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// Admin: connect the bot's webhook to this site
// ---------------------------------------------------------------------------

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  return host ? `${proto}://${host}` : null;
}

export type BotSetup = { hasToken: boolean; username: string | null; webhookUrl: string | null; expectedUrl: string | null };

export async function getBotSetup(): Promise<BotSetup | null> {
  const me = await getCurrentProfile();
  if (me?.role !== "admin") return null;
  const origin = await siteOrigin();
  const username = await botUsername();
  const info = username ? await botApi<{ url: string }>("getWebhookInfo") : null;
  return {
    hasToken: Boolean(botToken()),
    username,
    webhookUrl: info?.url || null,
    expectedUrl: origin ? `${origin}/api/telegram/webhook` : null,
  };
}

export async function connectBot(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (me?.role !== "admin") return { ok: false, error: "Only an admin can manage users." };
  const origin = await siteOrigin();
  if (!origin?.startsWith("https://")) {
    return { ok: false, error: "Telegram needs the site to be opened over https:// (your domain)." };
  }
  if (!(await botUsername())) return { ok: false, error: "TELEGRAM_BOT_TOKEN isn't set in Coolify (runtime), or the token is wrong." };

  const ok = await botApi("setWebhook", {
    url: `${origin}/api/telegram/webhook`,
    secret_token: webhookSecret(),
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  if (ok === null) return { ok: false, error: "Telegram refused the webhook. Check that the site is reachable over https." };

  // Links in messages point here.
  await createAdminClient().from("app_settings").upsert({ key: "app_url", value: origin });
  await botApi("setMyCommands", {
    commands: [
      { command: "start", description: "Connect / help" },
      { command: "stop", description: "Turn notifications off" },
    ],
  });
  return { ok: true };
}

export async function currentAppUrl() {
  return getSetting("app_url");
}
