"use client";

import { useState, useTransition } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ACCENTS,
  ACCENT_SWATCH,
  applyPreferencesInBrowser,
  type Accent,
  type Theme,
} from "@/lib/preferences";
import { changePassword, saveProfile, type Result } from "./actions";

function Message({ result }: { result: Result | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={cn("text-sm", result.ok ? "text-green-700 dark:text-green-400" : "text-destructive")}
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

export function NameForm({ fullName }: { fullName: string }) {
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
        <Label htmlFor="full-name">Full name</Label>
        <Input id="full-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </div>
      <Button type="submit" disabled={pending || !name.trim() || name.trim() === fullName}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <div className="w-full">
        <Message result={result} />
      </div>
    </form>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
];

export function AppearanceForm({ theme, accent }: { theme: Theme; accent: Accent }) {
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
        <legend className="text-sm font-medium">Theme</legend>
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
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Accent colour</legend>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={a === c}
              title={c[0].toUpperCase() + c.slice(1)}
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
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-confirm">Repeat new password</Label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
      <Message result={result} />
    </form>
  );
}
