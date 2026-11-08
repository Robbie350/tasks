"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { LOCALES, PREF_COOKIES, type Locale } from "@/lib/preferences";

/** Small EN · RU · UZ switch for the login page (signed-out users). */
export function LanguageSwitcher() {
  const { t, locale } = useT();

  function choose(l: Locale) {
    document.cookie = `${PREF_COOKIES.locale}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  }

  return (
    <nav aria-label="Language" className="flex gap-1 text-sm">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => choose(l)}
          aria-current={l === locale ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1",
            l === locale ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(`languages.${l}`)}
        </button>
      ))}
    </nav>
  );
}
