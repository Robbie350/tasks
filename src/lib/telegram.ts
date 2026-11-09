import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTranslator, loadMessages } from "@/i18n";
import { normalizePreferences } from "@/lib/preferences";

// Telegram Bot API helpers. The token comes from TELEGRAM_BOT_TOKEN (runtime
// only) and never leaves the server.

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

/** Secret Telegram sends back on every webhook call (derived from the token). */
export function webhookSecret(): string | null {
  const token = botToken();
  return token ? createHash("sha256").update(`webhook:${token}`).digest("hex").slice(0, 48) : null;
}

export async function botApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      console.error(`Telegram ${method} failed:`, json.description);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`Telegram ${method} error`, e);
    return null;
  }
}

let cachedUsername: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const me = await botApi<{ username: string }>("getMe");
  cachedUsername = me?.username ?? null;
  return cachedUsername;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

/**
 * Sends Telegram messages for new notifications (assigned / rejected).
 * Safe to call often and from several places: rows are claimed atomically,
 * so each notification is sent at most once.
 */
export async function sendTaskNotifications(): Promise<void> {
  if (!botToken()) return;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_telegram_batch", { p_limit: 50 });
    if (error || !data?.length) return;

    const appUrl = (await getSetting("app_url"))?.replace(/\/$/, "") ?? null;
    type Row = { type: string; task_id: string; task_title: string; chat_id: number; locale: string; note: string | null };

    for (const row of data as Row[]) {
      const { locale } = normalizePreferences({ locale: row.locale });
      const { t } = createTranslator(locale, await loadMessages(locale));
      const title = escapeHtml(row.task_title);
      let text =
        row.type === "rejected" ? t("telegram.rejected", { title }) : t("telegram.assigned", { title });
      if (row.type === "rejected" && row.note) {
        text += `\n\n<i>${escapeHtml(row.note.slice(0, 600))}</i>`;
      }
      await botApi("sendMessage", {
        chat_id: row.chat_id,
        text,
        parse_mode: "HTML",
        ...(appUrl?.startsWith("https://")
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: t("telegram.openTask"), url: `${appUrl}/?task=${row.task_id}` }]],
              },
            }
          : {}),
      });
    }
  } catch (e) {
    console.error("sendTaskNotifications failed", e);
  }
}
