"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export type ConfirmOptions = {
  message: string;
  /** Text of the confirm button, e.g. "Delete" or "Deactivate". */
  confirmLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
};

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * In-app replacement for window.confirm(): styled like the rest of the app,
 * keyboard friendly (Esc cancels, focus starts on Cancel for risky actions),
 * and announced to screen readers as an alert dialog.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const ask = useCallback<Ask>((options) => new Promise((resolve) => setState({ options, resolve })), []);

  useEffect(() => {
    const d = ref.current;
    if (state && d && !d.open) d.showModal();
  }, [state]);

  function finish(value: boolean) {
    state?.resolve(value);
    setState(null);
    if (ref.current?.open) ref.current.close();
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={ref}
        role="alertdialog"
        aria-labelledby="confirm-message"
        onCancel={(e) => {
          e.preventDefault(); // Esc
          finish(false);
        }}
        onClick={(e) => e.target === e.currentTarget && finish(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40"
      >
        {state && (
          <div className="space-y-5 p-5">
            <div className="flex gap-3">
              {state.options.danger && (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-4" aria-hidden />
                </span>
              )}
              <p id="confirm-message" className="pt-1.5 text-sm leading-relaxed">
                {state.options.message}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" autoFocus={state.options.danger} onClick={() => finish(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant={state.options.danger ? "destructive" : "default"}
                autoFocus={!state.options.danger}
                onClick={() => finish(true)}
              >
                {state.options.confirmLabel ?? t("common.confirm")}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/** const confirm = useConfirm(); if (!(await confirm({ message, danger: true }))) return; */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  return ask ?? (async (o) => window.confirm(o.message));
}
