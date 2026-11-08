"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "@/lib/preferences";
import { createTranslator, type Messages, type Translator } from "./index";

const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => createTranslator(locale, messages), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** For Client Components: { t, tn, tr, locale }. */
export function useT(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT() must be used inside <I18nProvider>");
  return ctx;
}
