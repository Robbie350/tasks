import en from "./en";
import type { Locale } from "@/lib/preferences";

type Plural = { one: string; few: string; many: string; other: string };

/** Same shape as English, any string values. */
type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, string>
      ? string extends keyof T[K]
        ? Record<string, string>
        : DeepStrings<T[K]>
      : DeepStrings<T[K]>;
};
export type Messages = DeepStrings<typeof en>;

/** "board.title"-style keys for plain strings. */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: K extends "serverMessages"
    ? never
    : T[K] extends string
      ? `${P}${K}`
      : T[K] extends Plural
        ? never
        : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Keys of plural objects, e.g. "board.notes". */
type PluralPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends Plural
      ? `${P}${K}`
      : PluralPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<typeof en>;
export type PluralKey = PluralPaths<typeof en>;
export type Vars = Record<string, string | number>;

function lookup(messages: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages);
}

function fill(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

export type Translator = {
  locale: Locale;
  /** Translate a key, filling {placeholders}. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** Plural-aware: picks one/few/many/other for n (also available as {n}). */
  tn: (key: PluralKey, n: number, vars?: Vars) => string;
  /** Translate a message that came from the server/database (falls back to it). */
  tr: (message: string) => string;
};

export function createTranslator(locale: Locale, messages: Messages): Translator {
  const rules = new Intl.PluralRules(locale);
  return {
    locale,
    t: (key, vars) => {
      const v = lookup(messages, key) ?? lookup(en as unknown as Messages, key);
      return typeof v === "string" ? fill(v, vars) : key;
    },
    tn: (key, n, vars) => {
      const forms = (lookup(messages, key) ?? lookup(en as unknown as Messages, key)) as Plural | undefined;
      const form = forms?.[rules.select(n) as keyof Plural] ?? forms?.other ?? key;
      return fill(form, { n, ...vars });
    },
    tr: (message) => messages.serverMessages[message] ?? message,
  };
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  switch (locale) {
    case "ru":
      return (await import("./ru")).default;
    case "uz":
      return (await import("./uz")).default;
    default:
      return en;
  }
}
