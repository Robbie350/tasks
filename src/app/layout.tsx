import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PREF_COOKIES, THEME_BOOT_SCRIPT, normalizePreferences } from "@/lib/preferences";
import { I18nProvider } from "@/i18n/client";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { loadMessages } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Task Board",
  description: "Internal kanban board for the team",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const prefs = normalizePreferences({
    theme: jar.get(PREF_COOKIES.theme)?.value,
    accent: jar.get(PREF_COOKIES.accent)?.value,
    locale: jar.get(PREF_COOKIES.locale)?.value,
  });

  const messages = await loadMessages(prefs.locale);

  return (
    <html
      lang={prefs.locale}
      className={prefs.theme === "dark" ? "dark" : undefined}
      data-theme={prefs.theme}
      data-accent={prefs.accent}
      // The boot script may add "dark" before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <I18nProvider locale={prefs.locale} messages={messages}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
