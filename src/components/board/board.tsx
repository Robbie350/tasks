"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { COLUMNS, type Person, type Task, type TaskStatus } from "@/lib/types";
import { dropTargets, type Me } from "@/lib/rules";
import {
  approveTask,
  grabTask,
  joinTask,
  leaveTask,
  moveTask,
  type ActionResult,
} from "@/app/(app)/task-actions";
import { TaskCard } from "./task-card";
import { TaskPanel } from "./task-panel";

async function safe(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

type Change = { id: string; status?: TaskStatus; add?: string; remove?: string };

function applyChange(tasks: Task[], c: Change): Task[] {
  return tasks.map((t) => {
    if (t.id !== c.id) return t;
    let assignee_ids = t.assignee_ids;
    if (c.add && !assignee_ids.includes(c.add)) assignee_ids = [...assignee_ids, c.add];
    if (c.remove) assignee_ids = assignee_ids.filter((x) => x !== c.remove);
    return { ...t, status: c.status ?? t.status, assignee_ids, position: c.status ? Infinity : t.position };
  });
}

export type BoardActions = {
  grab: (task: Task) => void;
  join: (task: Task) => void;
  leave: (task: Task) => void;
  move: (task: Task, to: TaskStatus) => void;
  approve: (task: Task) => void;
  /** Runs an action that has no instant preview (reject, edit). */
  run: (fn: () => Promise<ActionResult>) => Promise<boolean>;
};

export function Board({ tasks, people, me }: { tasks: Task[]; people: Person[]; me: Me }) {
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const [optimisticTasks, preview] = useOptimistic(tasks, applyChange);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // Show the change immediately; if the database refuses, it snaps back.
  function act(change: Change, fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      preview(change);
      const res = await safe(fn);
      if (!res.ok) setError(res.error);
    });
  }

  const actions: BoardActions = {
    grab: (t) => act({ id: t.id, status: "todo", add: me.id }, () => grabTask(t.id)),
    join: (t) => act({ id: t.id, add: me.id }, () => joinTask(t.id)),
    leave: (t) =>
      act(
        {
          id: t.id,
          remove: me.id,
          status: t.status === "todo" && t.assignee_ids.length === 1 ? "unassigned" : undefined,
        },
        () => leaveTask(t.id)
      ),
    move: (t, to) => act({ id: t.id, status: to }, () => moveTask(t.id, to)),
    approve: (t) => act({ id: t.id, status: "done" }, () => approveTask(t.id)),
    run: async (fn) => {
      setError(null);
      const res = await safe(fn);
      if (!res.ok) setError(res.error);
      return res.ok;
    },
  };

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks working (they open the panel).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const allowed = dragging ? dropTargets(dragging, me) : [];

  function onDragStart(e: DragStartEvent) {
    setDragging(optimisticTasks.find((t) => t.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    const task = dragging;
    setDragging(null);
    const to = e.over?.id as TaskStatus | undefined;
    if (!task || !to || to === task.status || !dropTargets(task, me).includes(to)) return;

    if (task.status === "unassigned") actions.grab(task);
    else if (task.status === "review" && to === "done") actions.approve(task);
    else if (task.status === "review" && to === "in_progress") {
      // A rejection needs a note: open the panel with the note box ready.
      setRejectMode(true);
      setOpenId(task.id);
    } else actions.move(task, to);
  }

  const openTask = optimisticTasks.find((t) => t.id === openId) ?? null;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              tasks={optimisticTasks
                .filter((t) => t.status === col.status)
                .sort((a, b) => a.position - b.position)}
              state={
                !dragging || col.status === dragging.status
                  ? "idle"
                  : allowed.includes(col.status)
                    ? "allowed"
                    : "blocked"
              }
              render={(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  people={peopleById}
                  me={me}
                  draggable={dropTargets(task, me).length > 0}
                  onOpen={() => {
                    setRejectMode(false);
                    setOpenId(task.id);
                  }}
                  onGrab={() => actions.grab(task)}
                />
              )}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <TaskCard task={dragging} people={peopleById} me={me} draggable={false} overlay />
          )}
        </DragOverlay>
      </DndContext>

      <TaskPanel
        task={openTask}
        people={peopleById}
        me={me}
        actions={actions}
        startInRejectMode={rejectMode}
        onClose={() => {
          setOpenId(null);
          setRejectMode(false);
        }}
      />

      {error && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg bg-destructive px-4 py-3 text-sm text-white shadow-lg"
        >
          {error}
        </div>
      )}
    </>
  );
}

function Column({
  status,
  label,
  tasks,
  state,
  render,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  state: "idle" | "allowed" | "blocked";
  render: (task: Task) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: state === "blocked" });
  const isPool = status === "unassigned";

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl p-3 transition-[opacity,box-shadow] lg:w-auto",
        isPool ? "border border-dashed border-sky-300 bg-sky-50/70" : "bg-zinc-100",
        state === "blocked" && "opacity-40",
        state === "allowed" && "ring-2 ring-sky-400/60",
        state === "allowed" && isOver && "ring-sky-500 bg-sky-50"
      )}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {tasks.map(render)}
        {tasks.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {isPool ? "No tasks waiting to be grabbed" : "Nothing here"}
          </p>
        )}
      </div>
    </section>
  );
}
