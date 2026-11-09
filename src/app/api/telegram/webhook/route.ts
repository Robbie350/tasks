import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { botApi, webhookSecret } from "@/lib/telegram";
import { createTranslator, loadMessages } from "@/i18n";
import { normalizePreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

type Update = {
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { username?: string; language_code?: string };
  };
};

function sameSecret(a: string | null, b: string | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Telegram calls this for every message sent to the bot. */
export async function POST(request: NextRequest) {
  // Only Telegram knows the secret we gave it when the webhook was set up.
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret())) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const update = (await request.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  const reply = async (key: "telegram.linked" | "telegram.badCode" | "telegram.help" | "telegram.stopped", locale?: string) => {
    const l = normalizePreferences({ locale: locale ?? msg.from?.language_code?.slice(0, 2) }).locale;
    const { t } = createTranslator(l, await loadMessages(l));
    await botApi("sendMessage", { chat_id: msg.chat.id, text: t(key) });
  };

  if (command === "/start" && arg && /^[a-f0-9]{64}$/.test(arg)) {
    const { data: userId } = await admin.rpc("telegram_redeem_code", {
      p_code: arg,
      p_chat_id: msg.chat.id,
      p_username: msg.from?.username ?? null,
    });
    if (!userId) {
      await reply("telegram.badCode");
    } else {
      const { data: p } = await admin.from("profiles").select("locale").eq("id", userId).maybeSingle();
      await reply("telegram.linked", p?.locale);
    }
  } else if (command === "/stop") {
    await admin.from("telegram_links").delete().eq("chat_id", msg.chat.id);
    await reply("telegram.stopped");
  } else {
    await reply("telegram.help");
  }

  return NextResponse.json({ ok: true });
}
