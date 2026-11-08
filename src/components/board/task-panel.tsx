"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  COLUMNS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  type Person,
  type Task,
  type TaskPriority,
} from "@/lib/types";
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
import { rejectTask, updateTask } from "@/app/(app)/task-actions";
import type { BoardActions } from "./board";
import { Avatar } from "./avatar";
import { DueDate } from "./due-date";

const STATUS_LABEL = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label]));

const PRIORITY_DOT = {
  low: "bg-zinc-300",
  medium: "bg-amber-400",
  high: "bg-red-500",
} as const;

export function TaskPanel({
  task,
  people,
  me,
  actions,
  startInRejectMode,
  onClose,
}: {
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
  task,
  people,
  me,
  actions,
  startInRejectMode,
  close,
}: {
  task: Task;
  people: Map<string, Person>;
  me: Me;
  actions: BoardActions;
  startInRejectMode: boolean;
  close: () => void;
}) {
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
              {STATUS_LABEL[task.status]}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className={cn("size-2 rounded-full", PRIORITY_DOT[task.priority])} />
              {PRIORITY_LABELS[task.priority]} priority
            </span>
            {task.due_date && <DueDate date={task.due_date} done={task.status === "done"} />}
          </div>
          <h2 className="text-lg leading-snug font-semibold break-words">{task.title}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
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
              <p className="text-sm text-muted-foreground italic">No description.</p>
            )}

            {/* People */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">On this task</h3>
                <div className="flex gap-2">
                  {canGrab(task, me) && (
                    <Button size="sm" onClick={() => actions.grab(task)}>
                      Grab
                    </Button>
                  )}
                  {canJoin(task, me) && (
                    <Button size="sm" variant="outline" onClick={() => actions.join(task)}>
                      Join
                    </Button>
                  )}
                  {canLeave(task, me) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const last = task.assignee_ids.length === 1;
                        const where =
                          task.status === "todo"
                            ? "It will go back to Unassigned."
                            : `It will stay in ${STATUS_LABEL[task.status]} with nobody on it.`;
                        if (!last || confirm(`You're the last person on this task. ${where} Leave?`))
                          actions.leave(task);
                      }}
                    >
                      Leave
                    </Button>
                  )}
                </div>
              </div>
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody yet.</p>
              ) : (
                <ul className="space-y-2">
                  {assignees.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <Avatar id={p.id} name={p.full_name} className="ring-0" />
                      <span>
                        {p.full_name}
                        {p.id === me.id && <span className="text-muted-foreground"> (you)</span>}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {ROLE_LABELS[p.role]}
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
                    {next === "in_progress" ? "Start work → In Progress" : "Submit for review → Review"}
                  </Button>
                )}

                {canReview(task, me) && mode === "view" && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => actions.approve(task)}>
                      Approve → Done
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setMode("reject")}>
                      Reject
                    </Button>
                  </div>
                )}

                {canReview(task, me) && mode === "reject" && (
                  <RejectForm task={task} actions={actions} cancel={() => setMode("view")} />
                )}

                {task.status === "review" && me.role === "manager" && onTask && (
                  <p className="text-xs text-muted-foreground">
                    You&apos;re on this task, so another manager has to approve or reject it.
                  </p>
                )}
              </section>
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt>Created by</dt>
              <dd>{creator?.full_name ?? "Unknown"}</dd>
              <dt>Created</dt>
              <dd>{new Date(task.created_at).toLocaleDateString()}</dd>
            </dl>

            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Notes and the activity history appear here from step 6.
            </p>
          </>
        )}
      </div>

      {canEdit(me) && mode === "view" && (
        <footer className="border-t p-4">
          <Button variant="outline" className="w-full" onClick={() => setMode("edit")}>
            Edit task
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
      <Label htmlFor="reject-note">What needs to change? (required)</Label>
      <Textarea
        id="reject-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
        autoFocus
        rows={4}
        maxLength={5000}
        placeholder="The people on this task will see this note and get a notification."
      />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={busy || !note.trim()}>
          {busy ? "Sending back…" : "Reject → In Progress"}
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
          Cancel
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
        <Label htmlFor="edit-title">Title</Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-description">Description</Label>
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
          <Label htmlFor="edit-priority">Priority</Label>
          <Select
            id="edit-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-due">Due date</Label>
          <Input id="edit-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={done} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
