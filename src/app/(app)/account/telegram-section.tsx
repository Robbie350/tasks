"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import {
  connectBot,
  disconnectTelegram,
  getTelegramStatus,
  startTelegramLink,
  type BotSetup,
  type TelegramStatus,
} from "./telegram-actions";

export function TelegramSection({ initial }: { initial: TelegramStatus }) {
  const { t, tr } = useT();
  const [status, setStatus] = useState(initial);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (polling.current) clearInterval(polling.current);
  }, []);

  // After opening Telegram, check every 3 s (for up to 3 minutes) until linked.
  function waitForLink() {
    if (polling.current) clearInterval(polling.current);
    const until = Date.now() + 3 * 60_000;
    polling.current = setInterval(async () => {
      const s = await getTelegramStatus();
      if (s.linked || Date.now() > until) {
        clearInterval(polling.current!);
        polling.current = null;
        setStatus(s);
        if (s.linked) setLink(null);
      }
    }, 3000);
  }

  if (!status.configured) return <p className="text-sm text-muted-foreground">{t("account.telegramNotSetUp")}</p>;

  if (status.linked) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4" aria-hidden />
          {status.linkedUsername ? t("account.telegramConnectedAs", { username: status.linkedUsername }) : t("account.telegramConnected")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await disconnectTelegram();
              setStatus(await getTelegramStatus());
            })
          }
        >
          {t("account.telegramDisconnect")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startTelegramLink();
            if (!res.ok) return setError(tr(res.error));
            setLink(res.url);
            window.open(res.url, "_blank", "noopener");
            waitForLink();
          })
        }
      >
        <Send /> {t("account.telegramConnect")}
      </Button>
      {link && (
        <p className="text-sm text-muted-foreground">
          {t("account.telegramWaiting")}{" "}
          <a href={link} target="_blank" rel="noopener" className="font-medium text-foreground underline underline-offset-4">
            {t("account.telegramOpenAgain")}
          </a>
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function BotSetupSection({ setup }: { setup: BotSetup }) {
  const { t, tr } = useT();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const connected = Boolean(setup.webhookUrl && setup.webhookUrl === setup.expectedUrl) || result?.ok;

  if (!setup.hasToken || !setup.username) {
    return <p className="text-sm text-destructive">{t("account.botNoToken")}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {connected
          ? t("account.botReady", { username: setup.username, url: setup.expectedUrl ?? "" })
          : t("account.botNotConnected", { username: setup.username })}
      </p>
      <Button
        variant={connected ? "outline" : "default"}
        disabled={pending}
        onClick={() => start(async () => setResult(await connectBot()))}
      >
        {pending ? t("account.botConnecting") : t("account.botConnect")}
      </Button>
      {result && !result.ok && <p className="text-sm text-destructive">{tr(result.error ?? "")}</p>}
    </div>
  );
}
