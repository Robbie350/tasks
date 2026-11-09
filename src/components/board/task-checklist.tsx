"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { PCheckItem, Task } from "@/lib/types";
import { setTaskChecklist } from "@/app/(app)/task-actions";
import type { BoardActions } from "./board";

/** Checklist on a team task. Editable by managers and assignees until Done. */
export function TaskChecklist({
  task,
  editable,
  actions,
}: {
  task: Task;
  editable: boolean;
  actions: BoardActions;
}) {
  const { t } = useT();
  const [items, setItems] = useState<PCheckItem[]>(task.checklist);
  const [draft, setDraft] = useState("");

  // Follow changes made by others (live updates).
  const serverVersion = JSON.stringify(task.checklist);
  useEffect(() => setItems(JSON.parse(serverVersion)), [serverVersion]);

  if (!editable && items.length === 0) return null;

  function save(next: PCheckItem[]) {
    setItems(next);
    actions.run(() => setTaskChecklist(task.id, next)).then((ok) => {
      if (!ok) setItems(JSON.parse(serverVersion));
    });
  }

  const done = items.filter((i) => i.done).length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("panel.checklist")}</h3>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {done}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done}
              disabled={!editable}
              onChange={(e) => save(items.map((i) => (i.id === item.id ? { ...i, done: e.target.checked } : i)))}
              className="size-4 shrink-0 accent-[var(--primary)]"
              aria-label={item.text}
            />
            <span className={cn("min-w-0 flex-1 text-sm break-words", item.done && "text-muted-foreground line-through")}>
              {item.text}
            </span>
            {editable && (
              <button
                onClick={() => save(items.filter((i) => i.id !== item.id))}
                aria-label={t("panel.removeItem")}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            save([...items, { id: crypto.randomUUID(), text: draft.trim().slice(0, 300), done: false }]);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("panel.itemPlaceholder")}
            aria-label={t("panel.itemPlaceholder")}
            className="h-8"
          />
          <Button size="sm" variant="outline" type="submit" disabled={!draft.trim() || items.length >= 50}>
            {t("panel.addItem")}
          </Button>
        </form>
      )}
    </section>
  );
}
