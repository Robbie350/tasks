"use client";

import { useState, useTransition } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import {
  ACCENTS,
  ACCENT_SWATCH,
  LOCALES,
  applyPreferencesInBrowser,
  type Accent,
  type Locale,
  type Theme,
} from "@/lib/preferences";
import { changePassword, saveProfile, type Result } from "./actions";

function Message({ result }: { result: Result | null }) {
  const { tr } = useT();
  if (!result) return null;
  return (
    <p
      role="status"
      className={cn("text-sm", result.ok ? "text-green-700 dark:text-green-400" : "text-destructive")}
    >
      {result.ok ? tr(result.message ?? "") : tr(result.error)}
    </p>
  );
}

export function NameForm({ fullName }: { fullName: string }) {
  const { t } = useT();
  const [name, setName] = useState(fullName);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await saveProfile({ fullName: name })));
      }}
    >
      <div className="min-w-60 flex-1 space-y-2">
        <Label htmlFor="full-name">{t("account.fullName")}</Label>
        <Input id="full-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </div>
      <Button type="submit" disabled={pending || !name.trim() || name.trim() === fullName}>
        {pending ? t("common.saving") : t("common.save")}
      </Button>
      <div className="w-full">
        <Message result={result} />
      </div>
    </form>
  );
}

const THEME_OPTIONS: { value: Theme; icon: React.ReactNode }[] = [
  { value: "light", icon: <Sun /> },
  { value: "dark", icon: <Moon /> },
  { value: "system", icon: <Monitor /> },
];

export function AppearanceForm({ theme, accent }: { theme: Theme; accent: Accent }) {
  const { t: tt } = useT();
  const [t, setT] = useState(theme);
  const [a, setA] = useState(accent);
  const [result, setResult] = useState<Result | null>(null);
  const [, start] = useTransition();

  // Apply instantly, then save in the background.
  function update(next: { theme?: Theme; accent?: Accent }) {
    const p = { theme: next.theme ?? t, accent: next.accent ?? a };
    setT(p.theme);
    setA(p.accent);
    applyPreferencesInBrowser(p);
    start(async () => setResult(await saveProfile(p)));
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tt("account.theme")}</legend>
        <div className="inline-flex rounded-lg border p-1">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={t === o.value}
              onClick={() => update({ theme: o.value })}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm [&_svg]:size-4",
                t === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.icon}
              {tt(`account.${o.value}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tt("account.accent")}</legend>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={tt(`account.accents.${c}`)}
              aria-pressed={a === c}
              title={tt(`account.accents.${c}`)}
              onClick={() => update({ accent: c })}
              className={cn(
                "flex size-9 items-center justify-center rounded-full border border-foreground/20 ring-offset-2 ring-offset-card transition",
                a === c ? "ring-2 ring-foreground" : "hover:scale-110"
              )}
              style={{ background: ACCENT_SWATCH[c] }}
            >
              {a === c && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </fieldset>

      {result && !result.ok && <Message result={result} />}
    </div>
  );
}

export function PasswordForm() {
  const { t } = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-4 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changePassword({ current, next, confirm });
          setResult(res);
          if (res.ok) {
            setCurrent("");
            setNext("");
            setConfirm("");
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="pw-current">{t("account.currentPassword")}</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-new">{t("account.newPassword")}</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-confirm">{t("account.repeatPassword")}</Label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("account.changing") : t("account.changePassword")}
        </Button>
      </div>
      <Message result={result} />
    </form>
  );
}

export function LanguageForm({ locale }: { locale: Locale }) {
  const { t, tr } = useT();
  const [value, setValue] = useState(locale);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <Select
        aria-label={t("account.languageTitle")}
        className="w-auto min-w-48"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setValue(next);
          start(async () => {
            const res = await saveProfile({ locale: next });
            if (res.ok) window.location.reload();
            else setError(tr(res.error));
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
