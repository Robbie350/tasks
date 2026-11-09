"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Person, Task, TaskPriority, TeamLabel } from "@/lib/types";
import { CHIP, isColor } from "@/components/personal/palette";
import { useT } from "@/i18n/client";
import {
  canEdit,
  canGrab,
  canJoin,
  canLeave,
  canReview,
  isAssignee,
  nextStep,
  type Me,
} from "@/lib/rules";
import { rejectTask, setTaskLabels, updateTask } from "@/app/(app)/task-actions";
import type { BoardActions } from "./board";
import { Avatar } from "./avatar";
import { DueDate } from "./due-date";
import { TaskHistory } from "./task-history";


const PRIORITY_DOT = {
  low: "bg-zinc-300",
  medium: "bg-amber-400",
  high: "bg-red-500",
} as const;

export function TaskPanel({
  labels,
  task,
  people,
  me,
  actions,
  startInRejectMode,
  onClose,
}: {
  labels: TeamLabel[];
  task: Task | null;
  people: Map<string, Person>;
  me: Me;
  actions: BoardActions;
  startInRejectMode: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (task && !d.open) d.showModal();
    if (!task && d.open) d.close();
  }, [task]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Click on the dimmed backdrop closes the panel.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      aria-label={task?.title ?? "Task"}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md border-l bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/30"
    >
      {task && (
        <PanelBody
          labels={labels}
          key={task.id + String(startInRejectMode)}
          task={task}
          people={people}
          me={me}
          actions={actions}
          startInRejectMode={startInRejectMode}
          close={() => ref.current?.close()}
        />
      )}
    </dialog>
  );
}

function PanelBody({
  labels,
  task,
  people,
  me,
  actions,
  startInRejectMode,
  close,
}: {
  labels: TeamLabel[];
  task: Task;
  people: Map<string, Person>;
  me: Me;
  actions: BoardActions;
  startInRejectMode: boolean;
  close: () => void;
}) {
  const { t, locale } = useT();
  const [mode, setMode] = useState<"view" | "edit" | "reject">(
    startInRejectMode && canReview(task, me) ? "reject" : "view"
  );
  const assignees = task.assignee_ids
    .map((id) => people.get(id))
    .filter((p): p is Person => Boolean(p));
  const creator = people.get(task.created_by);
  const next = nextStep(task, me);
  const onTask = isAssignee(task, me);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b p-5">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
              {t(`status.${task.status}`)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className={cn("size-2 rounded-full", PRIORITY_DOT[task.priority])} />
              {t("priority.label", { priority: t(`priority.${task.priority}`) })}
            </span>
            {task.due_date && <DueDate date={task.due_date} done={task.status === "done"} />}
          </div>
          <h2 className="text-lg leading-snug font-semibold break-words">{task.title}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("common.close")} onClick={close}>
          <X />
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {mode === "edit" ? (
          <EditForm task={task} actions={actions} done={() => setMode("view")} />
        ) : (
          <>
            {task.description ? (
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">{t("panel.noDescription")}</p>
            )}

            {/* Labels: managers toggle them, everyone sees them */}
            {(labels.length > 0 && (canEdit(me) || task.label_ids.length > 0)) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("board.labels")}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {labels
                    .filter((l) => canEdit(me) || task.label_ids.includes(l.id))
                    .map((l) => {
                      const on = task.label_ids.includes(l.id);
                      const chip = cn("rounded px-2 py-1 text-xs font-medium", CHIP[isColor(l.color) ? l.color : "gray"]);
                      return canEdit(me) ? (
                        <button
                          key={l.id}
                          aria-pressed={on}
                          onClick={() =>
                            actions.run(() =>
                              setTaskLabels(task.id, on ? task.label_ids.filter((x) => x !== l.id) : [...task.label_ids, l.id])
                            )
                          }
                          className={cn(chip, "transition", on ? "ring-2 ring-foreground/60" : "opacity-45 hover:opacity-100")}
                        >
                          {l.name}
                        </button>
                      ) : (
                        <span key={l.id} className={chip}>
                          {l.name}
                        </span>
                      );
                    })}
                </div>
              </section>
            )}

            {/* People */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("panel.onThisTask")}</h3>
                <div className="flex gap-2">
                  {canGrab(task, me) && (
                    <Button size="sm" onClick={() => actions.grab(task)}>
                      {t("board.grab")}
                    </Button>
                  )}
                  {canJoin(task, me) && (
                    <Button size="sm" variant="outline" onClick={() => actions.join(task)}>
                      {t("panel.join")}
                    </Button>
                  )}
                  {canLeave(task, me) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const last = task.assignee_ids.length === 1;
                        const question =
                          task.status === "todo"
                            ? t("panel.leaveLastTodo")
                            : t("panel.leaveLastStay", { column: t(`status.${task.status}`) });
                        if (!last || confirm(question))
                          actions.leave(task);
                      }}
                    >
                      {t("panel.leave")}
                    </Button>
                  )}
                </div>
              </div>
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("common.nobodyYet")}</p>
              ) : (
                <ul className="space-y-2">
                  {assignees.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <Avatar id={p.id} name={p.full_name} className="ring-0" />
                      <span>
                        {p.full_name}
                        {p.id === me.id && <span className="text-muted-foreground"> ({t("common.you")})</span>}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t(`roles.${p.role}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Workflow */}
            {(next || canReview(task, me) || (task.status === "review" && me.role === "manager" && onTask)) && (
              <section className="space-y-3 rounded-lg border p-4">
                {next && (
                  <Button className="w-full" onClick={() => actions.move(task, next)}>
                    {next === "in_progress" ? t("panel.start") : t("panel.submit")}
                  </Button>
                )}

                {canReview(task, me) && mode === "view" && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => actions.approve(task)}>
                      {t("panel.approve")}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setMode("reject")}>
                      {t("panel.reject")}
                    </Button>
                  </div>
                )}

                {canReview(task, me) && mode === "reject" && (
                  <RejectForm task={task} actions={actions} cancel={() => setMode("view")} />
                )}

                {task.status === "review" && me.role === "manager" && onTask && (
                  <p className="text-xs text-muted-foreground">
                    {t("panel.reviewerOnTask")}
                  </p>
                )}
              </section>
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt>{t("panel.createdBy")}</dt>
              <dd>{creator?.full_name ?? t("common.unknown")}</dd>
              <dt>{t("panel.created")}</dt>
              <dd>{new Date(task.created_at).toLocaleDateString(locale)}</dd>
            </dl>

            <TaskHistory task={task} people={people} me={me} actions={actions} />
          </>
        )}
      </div>

      {canEdit(me) && mode === "view" && (
        <footer className="border-t p-4">
          <Button variant="outline" className="w-full" onClick={() => setMode("edit")}>
            {t("panel.editTask")}
          </Button>
        </footer>
      )}
    </div>
  );
}

function RejectForm({
  task,
  actions,
  cancel,
}: {
  task: Task;
  actions: BoardActions;
  cancel: () => void;
}) {
  const { t } = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await actions.run(() => rejectTask(task.id, note));
        setBusy(false);
        if (ok) cancel();
      }}
    >
      <Label htmlFor="reject-note">{t("panel.rejectLabel")}</Label>
      <Textarea
        id="reject-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
        autoFocus
        rows={4}
        maxLength={5000}
        placeholder={t("panel.rejectPlaceholder")}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={busy || !note.trim()}>
          {busy ? t("panel.rejectSending") : t("panel.rejectSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  task,
  actions,
  done,
}: {
  task: Task;
  actions: BoardActions;
  done: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await actions.run(() =>
          updateTask(task.id, { title, description, priority, dueDate })
        );
        setBusy(false);
        if (ok) done();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="edit-title">{t("newTask.title")}</Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-description">{t("newTask.description")}</Label>
        <Textarea
          id="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={5000}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit-priority">{t("newTask.priority")}</Label>
          <Select
            id="edit-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="low">{t("priority.low")}</option>
            <option value="medium">{t("priority.medium")}</option>
            <option value="high">{t("priority.high")}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-due">{t("newTask.dueDate")}</Label>
          <Input id="edit-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("common.saving") : t("panel.saveChanges")}
        </Button>
        <Button type="button" variant="ghost" onClick={done} disabled={busy}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
