"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { useConfirm } from "@/components/confirm-dialog";
import type { PLabel } from "@/lib/types";
import { COLORS, DOT, isColor, type ColorName } from "./palette";
import type { BoardApi } from "./personal-board";

type LabelStore = Pick<BoardApi, "labels" | "createLabel" | "updateLabel" | "deleteLabel">;

/** Toolbar popover: create, rename, recolour and delete labels. */
export function LabelsManager({ api }: { api: LabelStore }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorName>("blue");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" className="bg-background" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Tag /> {t("personal.labels")}
      </Button>
      {open && (
        <div className="absolute z-30 mt-1 w-80 space-y-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
          <p className="text-sm font-semibold">{t("personal.manageLabels")}</p>
          {api.labels.length === 0 && <p className="text-xs text-muted-foreground">{t("personal.noLabels")}</p>}
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {api.labels.map((l) => (
              <LabelRow key={l.id} label={l} api={api} />
            ))}
          </ul>
          <form
            className="flex items-center gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              api.createLabel(name, color);
              setName("");
            }}
          >
            <ColorDots value={color} onChange={setColor} />
            <Input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("personal.newLabel")}
              aria-label={t("personal.labelName")}
              className="h-8"
            />
            <Button size="icon" type="submit" className="size-8 shrink-0" aria-label={t("personal.newLabel")} disabled={!name.trim()}>
              <Plus />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function LabelRow({ label, api }: { label: PLabel; api: LabelStore }) {
  const { t } = useT();
  const confirm = useConfirm();
  const [name, setName] = useState(label.name);
  const color: ColorName = isColor(label.color) ? label.color : "gray";
  return (
    <li className="flex items-center gap-2">
      <ColorDots value={color} onChange={(c) => api.updateLabel(label.id, { color: c })} />
      <Input
        value={name}
        maxLength={30}
        aria-label={t("personal.labelName")}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() ? name.trim() !== label.name && api.updateLabel(label.id, { name: name.trim() }) : setName(label.name))}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-8"
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={t("common.delete")}
        onClick={async () => {
          if (await confirm({ message: t("personal.deleteLabelConfirm", { name: label.name }), confirmLabel: t("common.delete"), danger: true }))
            api.deleteLabel(label.id);
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Compact colour chooser: shows the current colour, cycles on click. */
function ColorDots({ value, onChange }: { value: ColorName; onChange: (c: ColorName) => void }) {
  const { t } = useT();
  const next = COLORS[(COLORS.indexOf(value) + 1) % COLORS.length];
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={t(`personal.colors.${value}`)}
      aria-label={`${t("personal.colour")}: ${t(`personal.colors.${value}`)}`}
      className={cn("size-6 shrink-0 rounded-full border border-foreground/20", DOT[value])}
    />
  );
}
