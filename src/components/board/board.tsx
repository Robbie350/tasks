"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LabelsManager } from "@/components/personal/labels-manager";
import { STEP_STAGES, type BoardColumn, type Person, type Task, type TaskStatus, type TeamLabel } from "@/lib/types";
import { availableMoves, columnOf, dropTargets, firstColumn, type Me } from "@/lib/rules";
import {
  addBoardColumn,
  approveTask,
  createTeamLabel,
  deleteBoardColumn,
  moveBoardColumn,
  moveTaskStep,
  renameBoardColumn,
  deleteTeamLabel,
  grabTask,
  loadArchivedTasks,
  updateTeamLabel,
  joinTask,
  leaveTask,
  moveTask,
  type ActionResult,
} from "@/app/(app)/task-actions";
import { markNotificationsRead } from "@/app/(app)/notification-actions";
import { OPEN_TASK } from "@/components/notification-bell";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import { TaskCard } from "./task-card";
import { TaskPanel } from "./task-panel";

async function safe(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

type Change = { id: string; status?: TaskStatus; column_id?: string; add?: string; remove?: string };

function applyChange(tasks: Task[], c: Change): Task[] {
  return tasks.map((t) => {
    if (t.id !== c.id) return t;
    let assignee_ids = t.assignee_ids;
    if (c.add && !assignee_ids.includes(c.add)) assignee_ids = [...assignee_ids, c.add];
    if (c.remove) assignee_ids = assignee_ids.filter((x) => x !== c.remove);
    const moved = c.status !== undefined || c.column_id !== undefined;
    return {
      ...t,
      status: c.status ?? t.status,
      column_id: c.column_id ?? t.column_id,
      assignee_ids,
      position: moved ? Infinity : t.position,
    };
  });
}

export type BoardActions = {
  grab: (task: Task) => void;
  join: (task: Task) => void;
  leave: (task: Task) => void;
  move: (task: Task, to: TaskStatus) => void;
  /** Next step inside the same stage. */
  step: (task: Task, column: BoardColumn) => void;
  approve: (task: Task) => void;
  /** Runs an action that has no instant preview (reject, edit). */
  run: (fn: () => Promise<ActionResult>) => Promise<boolean>;
};

const FILTER_KEY = "board-filter";

export function Board({
  tasks,
  people,
  me,
  unreadTaskIds = [],
  labels = [],
  archivedCount = 0,
  initialOpenId,
  toolbarEnd,
  columns,
}: {
  columns: BoardColumn[];
  tasks: Task[];
  people: Person[];
  me: Me;
  unreadTaskIds?: string[];
  labels?: TeamLabel[];
  archivedCount?: number;
  initialOpenId?: string;
  toolbarEnd?: React.ReactNode;
}) {
  const { t, tn, tr } = useT();
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const unread = useMemo(() => new Set(unreadTaskIds), [unreadTaskIds]);
  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const [query, setQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [archived, setArchived] = useState<Task[] | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const isWorker = me.role !== "admin";

  // Filter: "" = everyone, otherwise a person's id (me.id = "My tasks").
  const [filter, setFilter] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved && (saved === me.id || people.some((p) => p.id === saved))) setFilter(saved);
    } catch {}
  }, [me.id, people]);
  const changeFilter = (value: string) => {
    setFilter(value);
    try {
      localStorage.setItem(FILTER_KEY, value);
    } catch {}
  };
  const filterPeople = people.filter((p) => p.is_active && p.role !== "admin");
  const [optimisticTasks, preview] = useOptimistic(tasks, applyChange);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  // Opened from a link (e.g. the Telegram "Open task" button): /?task=<id>
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
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
    grab: (t) =>
      act({ id: t.id, status: "todo", column_id: firstColumn(columns, "todo").id, add: me.id }, () => grabTask(t.id)),
    join: (t) => act({ id: t.id, add: me.id }, () => joinTask(t.id)),
    leave: (t) =>
      act(
        {
          id: t.id,
          remove: me.id,
          ...(t.status === "todo" && t.assignee_ids.length === 1
            ? { status: "unassigned" as const, column_id: firstColumn(columns, "unassigned").id }
            : {}),
        },
        () => leaveTask(t.id)
      ),
    move: (t, to) => act({ id: t.id, status: to, column_id: firstColumn(columns, to).id }, () => moveTask(t.id, to)),
    step: (t, c) => act({ id: t.id, column_id: c.id }, () => moveTaskStep(t.id, c.id)),
    approve: (t) =>
      act({ id: t.id, status: "done", column_id: firstColumn(columns, "done").id }, () => approveTask(t.id)),
    run: async (fn) => {
      setError(null);
      const res = await safe(fn);
      if (!res.ok) setError(res.error);
      return res.ok;
    },
  };

  const sensors = useSensors(
    // Mouse: a small distance keeps plain clicks working (they open the panel).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold to drag, so a normal swipe still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const allowed = dragging ? dropTargets(dragging, me, columns) : [];
  const label = (c: BoardColumn) => c.title ?? t(`status.${c.stage}`);

  function onDragStart(e: DragStartEvent) {
    setDragging(optimisticTasks.find((t) => t.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    const task = dragging;
    setDragging(null);
    const to = e.over?.id as string | undefined;
    const move = task && to ? availableMoves(task, me, columns).find((m) => m.target.id === to) : undefined;
    if (!task || !move) return;

    if (move.kind === "grab") actions.grab(task);
    else if (move.kind === "approve") actions.approve(task);
    else if (move.kind === "step") actions.step(task, move.target);
    else if (move.kind === "stage") actions.move(task, move.to);
    // A rejection needs a note: open the panel with the note box ready.
    else if (move.kind === "reject") openPanel(task.id, true);
  }

  function openPanel(taskId: string, reject = false) {
    setRejectMode(reject);
    setOpenId(taskId);
    // Opening a task counts as seeing its notifications.
    if (unread.has(taskId)) markNotificationsRead({ taskId });
  }

  // The notification bell asks the board to open a task.
  useEffect(() => {
    const onOpenTask = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setRejectMode(false);
      setOpenId(id);
    };
    window.addEventListener(OPEN_TASK, onOpenTask);
    return () => window.removeEventListener(OPEN_TASK, onOpenTask);
  }, []);

  // Person filters apply to every column except Unassigned, the shared pool.
  // Search and label filters apply everywhere.
  const q = query.trim().toLowerCase();
  const visible = (task: Task) =>
    (!filter || task.status === "unassigned" || task.assignee_ids.includes(filter)) &&
    (!labelFilter || task.label_ids.includes(labelFilter)) &&
    (!q ||
      task.title.toLowerCase().includes(q) ||
      (task.description ?? "").toLowerCase().includes(q) ||
      task.label_ids.some((id) => labelsById.get(id)?.name.toLowerCase().includes(q)));

  // Archived Done tasks are shown on request, below the recent ones.
  const shown = archived
    ? [...optimisticTasks, ...archived.filter((a) => !optimisticTasks.some((x) => x.id === a.id))]
    : optimisticTasks;

  async function toggleArchive() {
    if (archived) return setArchived(null);
    setLoadingArchive(true);
    const res = await loadArchivedTasks();
    setLoadingArchive(false);
    if (res.ok) setArchived(res.tasks.map((x) => ({ ...x, position: -Infinity })));
    else setError(res.error);
  }

  const labelStore = {
    labels,
    createLabel: (name: string, color: string) => {
      actions.run(() => createTeamLabel(name, color));
      return null;
    },
    updateLabel: (id: string, patch: { name?: string; color?: string }) => {
      actions.run(() => updateTeamLabel(id, patch));
    },
    deleteLabel: (id: string) => {
      setLabelFilter((f) => (f === id ? "" : f));
      actions.run(() => deleteTeamLabel(id));
    },
  };

  const openTask = shown.find((t) => t.id === openId) ?? null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-semibold tracking-tight">{t("board.title")}</h1>
        {isWorker && (
          <Button
            variant={filter === me.id ? "default" : "outline"}
            size="sm"
            aria-pressed={filter === me.id}
            onClick={() => changeFilter(filter === me.id ? "" : me.id)}
          >
            {t("board.myTasks")}
          </Button>
        )}
        <Select
          aria-label={t("board.filterByPerson")}
          className="h-8 w-auto min-w-40"
          value={filter && filter !== me.id ? filter : ""}
          onChange={(e) => changeFilter(e.target.value)}
        >
          <option value="">{t("common.everyone")}</option>
          {filterPeople.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {p.id === me.id ? ` (${t("common.you")})` : ""}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("board.search")}
            aria-label={t("board.search")}
            className="h-8 w-48 pl-8"
          />
        </div>
        {labels.length > 0 && (
          <Select
            aria-label={t("board.labels")}
            className="h-8 w-auto min-w-32"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
          >
            <option value="">{t("board.allLabels")}</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        {me.role === "manager" && <LabelsManager api={labelStore} />}
        {(filter || q || labelFilter) && (
          <button
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              changeFilter("");
              setQuery("");
              setLabelFilter("");
            }}
          >
            {t("common.clearFilter")}
          </button>
        )}
        <div className="ml-auto">{toolbarEnd}</div>
      </div>

      {/* Phones: jump to a column (columns swipe sideways one at a time). */}
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 sm:hidden" role="navigation" aria-label={t("board.title")}>
        {columns.map((col) => (
          <button
            key={col.id}
            onClick={() =>
              document
                .getElementById(`column-${col.id}`)
                ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
            }
            className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs font-medium whitespace-nowrap"
          >
            {label(col)}{" "}
            <span className="text-muted-foreground">
              {shown.filter((x) => columnOf(x, columns).id === col.id && visible(x)).length}
            </span>
          </button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:snap-none">
          {columns.map((col, i) => (
            <Column
              key={col.id}
              column={col}
              label={label(col)}
              // Show the stage name when a stage has several steps.
              stageLabel={columns.filter((c) => c.stage === col.stage).length > 1 ? t(`status.${col.stage}`) : null}
              isAdmin={me.role === "admin"}
              isFirstInStage={columns[i - 1]?.stage !== col.stage}
              isLastInStage={columns[i + 1]?.stage !== col.stage}
              onError={setError}
              tasks={shown
                .filter((t) => columnOf(t, columns).id === col.id && visible(t))
                .sort((a, b) => a.position - b.position)}
              state={
                !dragging || col.id === columnOf(dragging, columns).id
                  ? "idle"
                  : allowed.includes(col.id)
                    ? "allowed"
                    : "blocked"
              }
              footer={
                col.stage === "done" && (archivedCount > 0 || archived) ? (
                  <div className="mt-3 space-y-1 text-center">
                    <Button variant="ghost" size="sm" className="w-full" onClick={toggleArchive} disabled={loadingArchive}>
                      {archived ? t("board.hideArchived") : tn("board.showArchived", archivedCount)}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">{t("board.archivedHint")}</p>
                  </div>
                ) : null
              }
              render={(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  people={peopleById}
                  me={me}
                  draggable={dropTargets(task, me, columns).length > 0}
                  isNew={unread.has(task.id)}
                  labelsById={labelsById}
                  onOpen={() => openPanel(task.id)}
                  onGrab={() => actions.grab(task)}
                />
              )}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <TaskCard task={dragging} people={peopleById} me={me} draggable={false} overlay labelsById={labelsById} />
          )}
        </DragOverlay>
      </DndContext>

      <TaskPanel
        columns={columns}
        labels={labels}
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
          {tr(error)}
        </div>
      )}
    </>
  );
}

function Column({
  column,
  label,
  stageLabel,
  isAdmin,
  isFirstInStage,
  isLastInStage,
  onError,
  tasks,
  state,
  render,
  footer,
}: {
  column: BoardColumn;
  label: string;
  stageLabel: string | null;
  isAdmin: boolean;
  isFirstInStage: boolean;
  isLastInStage: boolean;
  onError: (e: string) => void;
  tasks: Task[];
  state: "idle" | "allowed" | "blocked";
  render: (task: Task) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useT();
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: state === "blocked" });
  const isPool = column.stage === "unassigned";
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(label);
  useEffect(() => setName(label), [label]);

  async function run(fn: () => Promise<ActionResult>) {
    const res = await safe(fn);
    if (!res.ok) onError(res.error);
  }

  function commitRename() {
    setRenaming(false);
    const next = name.trim().slice(0, 40);
    if (next && next !== label) run(() => renameBoardColumn(column.id, next));
    else setName(label);
  }

  return (
    <section
      ref={setNodeRef}
      id={`column-${column.id}`}
      aria-label={label}
      className={cn(
        "flex w-[85vw] shrink-0 snap-center flex-col rounded-xl p-3 transition-[opacity,box-shadow] sm:w-72 lg:w-auto lg:min-w-56 lg:flex-1 lg:shrink",
        isPool
          ? "border border-dashed border-sky-300 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-950/30"
          : "bg-zinc-100 dark:bg-zinc-900",
        state === "blocked" && "opacity-40",
        state === "allowed" && "ring-2 ring-sky-400/60",
        state === "allowed" && isOver && "ring-sky-500 bg-sky-50 dark:bg-sky-950/50"
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          {stageLabel && stageLabel !== label && (
            <p className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stageLabel}</p>
          )}
          {renaming ? (
            <Input
              autoFocus
              aria-label={t("board.columnName")}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setName(label);
                  setRenaming(false);
                }
              }}
              className="h-7 bg-background"
            />
          ) : (
            <h2
              className="truncate text-sm font-semibold"
              title={label}
              onDoubleClick={isAdmin ? () => setRenaming(true) : undefined}
            >
              {label}
            </h2>
          )}
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
        {isAdmin && (
          <ColumnMenu
            column={column}
            isFirstInStage={isFirstInStage}
            isLastInStage={isLastInStage}
            onRename={() => setRenaming(true)}
            run={run}
            label={label}
          />
        )}
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {tasks.map(render)}
        {tasks.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {isPool ? t("board.emptyPool") : t("board.emptyColumn")}
          </p>
        )}
      </div>
      {footer}
    </section>
  );
}

/** Admin-only column menu. Rendered above the page so the board can't clip it. */
function ColumnMenu({
  column,
  label,
  isFirstInStage,
  isLastInStage,
  onRename,
  run,
}: {
  column: BoardColumn;
  label: string;
  isFirstInStage: boolean;
  isLastInStage: boolean;
  onRename: () => void;
  run: (fn: () => Promise<ActionResult>) => Promise<void>;
}) {
  const { t } = useT();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const canAddStep = STEP_STAGES.includes(column.stage);

  useEffect(() => {
    if (!pos) return;
    const inside = (n: Node) => buttonRef.current?.contains(n) || popupRef.current?.contains(n);
    const close = (e: PointerEvent) => !inside(e.target as Node) && setPos(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    const hide = () => setPos(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = buttonRef.current!.getBoundingClientRect();
    const width = 224;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) });
  }

  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40";
  const close = () => setPos(null);

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="-mt-0.5 size-7"
        aria-label={t("board.columnMenu")}
        aria-expanded={Boolean(pos)}
        onClick={toggle}
      >
        <MoreHorizontal />
      </Button>
      {pos &&
        createPortal(
          <div
            ref={popupRef}
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-56 space-y-0.5 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
          >
            <button className={item} onClick={() => { close(); onRename(); }}>
              {t("board.rename")}
            </button>
            {column.is_builtin && column.title && (
              <button className={item} onClick={() => { close(); run(() => renameBoardColumn(column.id, null)); }}>
                <RotateCcw className="size-4" /> {t("board.resetName")}
              </button>
            )}
            {canAddStep && (
              <button className={item} onClick={() => { close(); run(() => addBoardColumn(column.id, t("board.newStep"))); }}>
                <Plus className="size-4" /> {t("board.addStep")}
              </button>
            )}
            {canAddStep && (
              <>
                <button className={item} disabled={isFirstInStage} onClick={() => run(() => moveBoardColumn(column.id, -1))}>
                  <ChevronLeft className="size-4" /> {t("board.moveLeft")}
                </button>
                <button className={item} disabled={isLastInStage} onClick={() => run(() => moveBoardColumn(column.id, 1))}>
                  <ChevronRight className="size-4" /> {t("board.moveRight")}
                </button>
              </>
            )}
            {column.is_builtin ? (
              <p className="px-2 pt-1 text-xs text-muted-foreground">{t("board.builtinHint")}</p>
            ) : (
              <button
                className={cn(item, "text-destructive")}
                onClick={() => {
                  close();
                  if (confirm(t("board.deleteStepConfirm", { name: label }))) run(() => deleteBoardColumn(column.id));
                }}
              >
                <Trash2 className="size-4" /> {t("board.deleteStep")}
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
