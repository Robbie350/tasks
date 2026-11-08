// Per-user appearance and language. Stored on the profile (so they follow the
// user to any device) and mirrored in cookies (so the first paint is right).

export const THEMES = ["light", "dark", "system"] as const;
export const ACCENTS = ["neutral", "blue", "green", "violet", "orange", "rose"] as const;
export const LOCALES = ["en", "ru", "uz"] as const;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Locale = (typeof LOCALES)[number];

export type Preferences = { theme: Theme; accent: Accent; locale: Locale };

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", accent: "neutral", locale: "en" };

export const PREF_COOKIES = { theme: "pref-theme", accent: "pref-accent", locale: "pref-locale" } as const;

export const ACCENT_SWATCH: Record<Accent, string> = {
  neutral: "oklch(0.205 0 0)",
  blue: "oklch(0.546 0.245 262.881)",
  green: "oklch(0.527 0.154 150.069)",
  violet: "oklch(0.541 0.281 293.009)",
  orange: "oklch(0.553 0.195 38.402)",
  rose: "oklch(0.586 0.253 17.585)",
};

const pick = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : d;

export function normalizePreferences(raw: Partial<Record<keyof Preferences, unknown>>): Preferences {
  return {
    theme: pick(THEMES, raw.theme, DEFAULT_PREFERENCES.theme),
    accent: pick(ACCENTS, raw.accent, DEFAULT_PREFERENCES.accent),
    locale: pick(LOCALES, raw.locale, DEFAULT_PREFERENCES.locale),
  };
}

/** Runs before first paint: resolves "system" and follows OS changes live. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){if(d.dataset.theme==='system'){d.classList.toggle('dark',m.matches)}}a();m.addEventListener('change',a)}catch(e){}})();`;

/** Apply in the browser right away (used by the account page for instant preview). */
export function applyPreferencesInBrowser(p: Pick<Preferences, "theme" | "accent">) {
  const d = document.documentElement;
  d.dataset.theme = p.theme;
  d.dataset.accent = p.accent;
  const dark =
    p.theme === "dark" ||
    (p.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  d.classList.toggle("dark", dark);
  const year = 60 * 60 * 24 * 365;
  document.cookie = `${PREF_COOKIES.theme}=${p.theme}; path=/; max-age=${year}; samesite=lax`;
  document.cookie = `${PREF_COOKIES.accent}=${p.accent}; path=/; max-age=${year}; samesite=lax`;
}
