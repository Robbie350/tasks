"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Person, TeamLabel } from "@/lib/types";
import { CHIP, isColor } from "@/components/personal/palette";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { createTask, type CreateTaskResult } from "@/app/(app)/actions";
import { Avatar } from "./avatar";

export function NewTaskDialog({ people, labels = [] }: { people: Person[]; labels?: TeamLabel[] }) {
  const { t, tn, tr } = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pickedLabels, setPickedLabels] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState<CreateTaskResult | null, FormData>(
    createTask,
    null
  );

  // Only active managers and specialists can be assigned.
  const assignable = people.filter((p) => p.is_active && p.role !== "admin");

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setSelected([]);
      setPickedLabels([]);
      dialogRef.current?.close();
    }
  }, [state]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <Button onClick={() => dialogRef.current?.showModal()}>
        <Plus /> {t("newTask.button")}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="new-task-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40"
      >
        <form ref={formRef} action={formAction} className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 id="new-task-title" className="text-lg font-semibold">
              {t("newTask.heading")}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.close")}
              onClick={() => dialogRef.current?.close()}
            >
              <X />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-title">{t("newTask.title")}</Label>
            <Input id="task-title" name="title" required maxLength={200} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">{t("newTask.description")}</Label>
            <Textarea id="task-description" name="description" maxLength={5000} rows={3} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-priority">{t("newTask.priority")}</Label>
              <Select id="task-priority" name="priority" defaultValue="medium">
                <option value="low">{t("priority.low")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="high">{t("priority.high")}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">{t("newTask.dueDate")}</Label>
              <Input id="task-due" name="due_date" type="date" />
            </div>
          </div>

          {labels.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("board.labels")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const on = pickedLabels.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className={cn(
                        "cursor-pointer rounded px-2 py-1 text-xs font-medium transition",
                        CHIP[isColor(l.color) ? l.color : "gray"],
                        on ? "ring-2 ring-foreground/60" : "opacity-50 hover:opacity-100"
                      )}
                    >
                      <input
                        type="checkbox"
                        name="labels"
                        value={l.id}
                        checked={on}
                        onChange={() =>
                          setPickedLabels((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))
                        }
                        className="sr-only"
                      />
                      {l.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("newTask.assignees")}{" "}
              <span className="font-normal text-muted-foreground">{t("newTask.assigneesHint")}</span>
            </legend>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {assignable.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">{t("newTask.noPeople")}</p>
              )}
              {assignable.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    name="assignees"
                    value={p.id}
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="size-4"
                  />
                  <Avatar id={p.id} name={p.full_name} className="ring-0" />
                  <span className="text-sm">{p.full_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t(`roles.${p.role}`)}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.length > 0
                ? tn("newTask.startsTodo", selected.length)
                : t("newTask.startsUnassigned")}
            </p>
          </fieldset>

          {state && !state.ok && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {tr(state.error)}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("newTask.creating") : t("newTask.create")}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
