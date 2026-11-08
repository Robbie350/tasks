import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, type Person, type Task } from "@/lib/types";
import { AvatarStack } from "./avatar";
import { DueDate } from "./due-date";

const PRIORITY_EDGE = {
  low: "border-l-zinc-300",
  medium: "border-l-amber-400",
  high: "border-l-red-500",
} as const;

export function TaskCard({ task, people }: { task: Task; people: Map<string, Person> }) {
  const assignees = task.assignee_ids
    .map((id) => people.get(id))
    .filter((p): p is Person => Boolean(p));

  return (
    <article
      className={cn(
        "rounded-lg border border-l-4 bg-card p-3 shadow-xs",
        PRIORITY_EDGE[task.priority]
      )}
    >
      <h3 className="text-sm leading-snug font-medium break-words">{task.title}</h3>
      <span className="sr-only">Priority: {PRIORITY_LABELS[task.priority]}</span>

      {(assignees.length > 0 || task.due_date) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {assignees.length > 0 ? <AvatarStack people={assignees} /> : <span />}
          {task.due_date && <DueDate date={task.due_date} done={task.status === "done"} />}
        </div>
      )}
    </article>
  );
}
