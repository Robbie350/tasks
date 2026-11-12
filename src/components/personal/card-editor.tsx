"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { useConfirm } from "@/components/confirm-dialog";
import type { PCard, PCheckItem, TaskPriority } from "@/lib/types";
import { CHIP, COLORS, DOT, isColor, type ColorName } from "./palette";
import type { BoardApi } from "./personal-board";

/** Slide-in editor for a personal card. Every change saves on its own. */
export function CardEditor({ card, api, onClose }: { card: PCard | null; api: BoardApi; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (card && !d.open) d.showModal();
    if (!card && d.open) d.close();
  }, [card]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      aria-label={card?.title ?? ""}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md border-l bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/30"
    >
      {card && <Body key={card.id} card={card} api={api} close={() => ref.current?.close()} />}
    </dialog>
  );
}

function Body({ card, api, close }: { card: PCard; api: BoardApi; close: () => void }) {
  const { t } = useT();
  const confirm = useConfirm();
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? "");
  const [newItem, setNewItem] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<ColorName>("blue");
  const update = (patch: Partial<PCard>) => api.updateCard(card.id, patch);

  const commitTitle = () => {
    const next = title.trim().slice(0, 200);
    if (next && next !== card.title) update({ title: next });
    else setTitle(card.title);
  };
  const commitNotes = () => {
    const next = notes.trim() ? notes.slice(0, 10000) : null;
    if (next !== card.notes) update({ notes: next });
  };

  const setChecklist = (checklist: PCheckItem[]) => update({ checklist });
  const toggleLabel = (id: string) =>
    update({
      label_ids: card.label_ids.includes(id) ? card.label_ids.filter((x) => x !== id) : [...card.label_ids, id],
    });

  const done = card.checklist.filter((i) => i.done).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b p-5">
        <Textarea
          aria-label={t("personal.title_")}
          value={title}
          rows={1}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="min-h-0 resize-none border-transparent px-2 text-lg font-semibold shadow-none focus-visible:border-input"
        />
        <Button variant="ghost" size="icon" aria-label={t("common.close")} onClick={close}>
          <X />
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {/* Column / due / priority */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="pc-column">{t("personal.column")}</Label>
            <Select
              id="pc-column"
              value={card.column_id}
              onChange={(e) => api.moveCardTo(card.id, e.target.value)}
            >
              {api.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pc-due">{t("personal.dueDate")}</Label>
            <Input
              id="pc-due"
              type="date"
              value={card.due_date ?? ""}
              onChange={(e) => update({ due_date: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pc-priority">{t("personal.priority")}</Label>
            <Select
              id="pc-priority"
              value={card.priority ?? ""}
              onChange={(e) => update({ priority: (e.target.value || null) as TaskPriority | null })}
            >
              <option value="">{t("personal.priorityNone")}</option>
              <option value="low">{t("priority.low")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="high">{t("priority.high")}</option>
            </Select>
          </div>
        </div>

        {/* Labels */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("personal.labels")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {api.labels.map((l) => {
              const on = card.label_ids.includes(l.id);
              const c = isColor(l.color) ? l.color : "gray";
              return (
                <button
                  key={l.id}
                  aria-pressed={on}
                  onClick={() => toggleLabel(l.id)}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition",
                    CHIP[c],
                    on ? "ring-2 ring-foreground/60" : "opacity-50 hover:opacity-100"
                  )}
                >
                  {l.name}
                </button>
              );
            })}
            {api.labels.length === 0 && <p className="text-xs text-muted-foreground">{t("personal.noLabels")}</p>}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const l = api.createLabel(newLabel, newLabelColor);
              if (l) update({ label_ids: [...card.label_ids, l.id] });
              setNewLabel("");
            }}
          >
            <Input
              value={newLabel}
              maxLength={30}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("personal.newLabel")}
              aria-label={t("personal.labelName")}
              className="h-8"
            />
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  title={t(`personal.colors.${c}`)}
                  aria-label={t(`personal.colors.${c}`)}
                  aria-pressed={newLabelColor === c}
                  onClick={() => setNewLabelColor(c)}
                  className={cn("size-4 shrink-0 rounded-full", DOT[c], newLabelColor === c && "ring-2 ring-foreground ring-offset-1 ring-offset-card")}
                />
              ))}
            </div>
            <Button size="icon" type="submit" variant="outline" className="size-8 shrink-0" aria-label={t("personal.newLabel")} disabled={!newLabel.trim()}>
              <Plus />
            </Button>
          </form>
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <Label htmlFor="pc-notes">{t("personal.notes")}</Label>
          <Textarea
            id="pc-notes"
            value={notes}
            rows={5}
            maxLength={10000}
            placeholder={t("personal.notesPlaceholder")}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
          />
        </section>

        {/* Checklist */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("personal.checklist")}</h3>
            {card.checklist.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {done}/{card.checklist.length}
              </span>
            )}
          </div>
          {card.checklist.length > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(done / card.checklist.length) * 100}%` }}
              />
            </div>
          )}
          <ul className="space-y-1">
            {card.checklist.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onChange={(patch) =>
                  setChecklist(card.checklist.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))
                }
                onDelete={() => setChecklist(card.checklist.filter((i) => i.id !== item.id))}
              />
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              setChecklist([...card.checklist, { id: crypto.randomUUID(), text: newItem.trim().slice(0, 300), done: false }]);
              setNewItem("");
            }}
          >
            <Input
              value={newItem}
              maxLength={300}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder={t("personal.itemPlaceholder")}
              aria-label={t("personal.itemPlaceholder")}
              className="h-8"
            />
            <Button size="sm" type="submit" variant="outline" disabled={!newItem.trim()}>
              {t("personal.addItem")}
            </Button>
          </form>
        </section>
      </div>

      <footer className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={async () => {
            if (await confirm({ message: t("personal.deleteCardConfirm"), confirmLabel: t("common.delete"), danger: true }))
              api.deleteCard(card.id);
          }}
        >
          <Trash2 /> {t("personal.deleteCard")}
        </Button>
      </footer>
    </div>
  );
}

function ChecklistRow({
  item,
  onChange,
  onDelete,
}: {
  item: PCheckItem;
  onChange: (patch: Partial<PCheckItem>) => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const [text, setText] = useState(item.text);
  return (
    <li className="group flex items-center gap-2">
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => onChange({ done: e.target.checked })}
        className="size-4 shrink-0 accent-[var(--primary)]"
        aria-label={item.text}
      />
      <input
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (text.trim() ? text !== item.text && onChange({ text: text.trim() }) : setText(item.text))}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn(
          "min-w-0 flex-1 rounded px-1 py-0.5 text-sm outline-none focus:bg-muted",
          item.done && "text-muted-foreground line-through"
        )}
      />
      <button
        onClick={onDelete}
        aria-label={t("personal.deleteItem")}
        className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
