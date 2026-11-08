// What the signed-in user may do with a task, for the UI only (which buttons
// to show, which columns accept a drop). The database functions enforce the
// same rules; if these ever disagree, the database wins.
import type { Role, Task, TaskStatus } from "@/lib/types";

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

/** The next column an assignee can move the task to, if any. */
export function nextStep(task: Task, me: Me): TaskStatus | null {
  if (!isWorker(me) || !isAssignee(task, me)) return null;
  if (task.status === "todo") return "in_progress";
  if (task.status === "in_progress") return "review";
  return null;
}

export function canReview(task: Task, me: Me) {
  return me.role === "manager" && task.status === "review" && !isAssignee(task, me);
}

export function canEdit(me: Me) {
  return me.role === "manager";
}

/** Columns this user can drop the task on. */
export function dropTargets(task: Task, me: Me): TaskStatus[] {
  if (canGrab(task, me)) return ["todo"];
  const next = nextStep(task, me);
  if (next) return [next];
  if (canReview(task, me)) return ["done", "in_progress"];
  return [];
}
