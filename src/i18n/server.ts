import "server-only";
import { cookies } from "next/headers";
import { PREF_COOKIES, normalizePreferences } from "@/lib/preferences";
import { createTranslator, loadMessages } from "./index";

/** For Server Components and server actions: the current user's language. */
export async function getI18n() {
  const jar = await cookies();
  const { locale } = normalizePreferences({ locale: jar.get(PREF_COOKIES.locale)?.value });
  const messages = await loadMessages(locale);
  return { ...createTranslator(locale, messages), messages };
}
