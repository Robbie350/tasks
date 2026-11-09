// What the signed-in user may do with a task, for the UI only (which buttons
// to show, which columns accept a drop). The database functions enforce the
// same rules; if these ever disagree, the database wins.
import type { BoardColumn, Role, Task, TaskStatus } from "@/lib/types";

export type Me = { id: string; role: Role };

const isWorker = (me: Me) => me.role === "manager" || me.role === "specialist";
export const isAssignee = (task: Task, me: Me) => task.assignee_ids.includes(me.id);

export function canGrab(task: Task, me: Me) {
  return isWorker(me) && task.status === "unassigned";
}

export function canJoin(task: Task, me: Me) {
  return (
    isWorker(me) &&
    ["todo", "in_progress", "review"].includes(task.status) &&
    !isAssignee(task, me)
  );
}

export function canLeave(task: Task, me: Me) {
  return isWorker(me) && task.status !== "done" && isAssignee(task, me);
}

export function canReview(task: Task, me: Me) {
  return me.role === "manager" && task.status === "review" && !isAssignee(task, me);
}

export function canEdit(me: Me) {
  return me.role === "manager";
}

// ---------------------------------------------------------------------------
// Columns (steps). `columns` must be in board order (stage, then position).
// ---------------------------------------------------------------------------

export function firstColumn(columns: BoardColumn[], stage: TaskStatus) {
  return columns.find((c) => c.stage === stage)!;
}

/** The column a task is shown in (falls back to its stage's first column). */
export function columnOf(task: Task, columns: BoardColumn[]) {
  return (
    columns.find((c) => c.id === task.column_id && c.stage === task.status) ??
    firstColumn(columns, task.status)
  );
}

export type Move =
  | { kind: "grab"; target: BoardColumn }
  | { kind: "step"; target: BoardColumn } // next step, same stage
  | { kind: "stage"; target: BoardColumn; to: TaskStatus } // leave the stage from its last step
  | { kind: "approve"; target: BoardColumn }
  | { kind: "reject"; target: BoardColumn };

/** Everything this user can do to move the task, with the column it lands in. */
export function availableMoves(task: Task, me: Me, columns: BoardColumn[]): Move[] {
  if (canGrab(task, me)) return [{ kind: "grab", target: firstColumn(columns, "todo") }];

  const current = columnOf(task, columns);
  const next = columns[columns.indexOf(current) + 1];
  const moves: Move[] = [];

  if ((task.status === "todo" || task.status === "in_progress") && isWorker(me) && isAssignee(task, me) && next) {
    moves.push(next.stage === task.status ? { kind: "step", target: next } : { kind: "stage", target: next, to: next.stage });
  }
  if (canReview(task, me)) {
    if (next?.stage === "review") moves.push({ kind: "step", target: next });
    else moves.push({ kind: "approve", target: firstColumn(columns, "done") });
    moves.push({ kind: "reject", target: firstColumn(columns, "in_progress") });
  }
  return moves;
}

/** Column ids this user can drop the task on. */
export function dropTargets(task: Task, me: Me, columns: BoardColumn[]): string[] {
  return availableMoves(task, me, columns).map((m) => m.target.id);
}
