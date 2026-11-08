"use client";

import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, type Person, type Task } from "@/lib/types";
import { canGrab, type Me } from "@/lib/rules";
import { AvatarStack } from "./avatar";
import { DueDate } from "./due-date";

const PRIORITY_EDGE = {
  low: "border-l-zinc-300",
  medium: "border-l-amber-400",
  high: "border-l-red-500",
} as const;

export function TaskCard({
  task,
  people,
  me,
  draggable,
  overlay = false,
  onOpen,
  onGrab,
}: {
  task: Task;
  people: Map<string, Person>;
  me: Me;
  draggable: boolean;
  overlay?: boolean;
  onOpen?: () => void;
  onGrab?: () => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable || overlay,
  });

  const assignees = task.assignee_ids
    .map((id) => people.get(id))
    .filter((p): p is Person => Boolean(p));

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      onClick={onOpen}
      className={cn(
        "rounded-lg border border-l-4 bg-card p-3 shadow-xs transition-shadow hover:shadow-sm",
        PRIORITY_EDGE[task.priority],
        draggable && "cursor-grab active:cursor-grabbing",
        !draggable && onOpen && "cursor-pointer",
        isDragging && "opacity-30",
        overlay && "rotate-2 cursor-grabbing shadow-lg"
      )}
    >
      {/* The title is a real button so keyboard users can open the task. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
        className="text-left text-sm leading-snug font-medium break-words outline-none focus-visible:underline"
      >
        {task.title}
      </button>
      <span className="sr-only">Priority: {PRIORITY_LABELS[task.priority]}</span>

      {(assignees.length > 0 || task.due_date) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {assignees.length > 0 ? <AvatarStack people={assignees} /> : <span />}
          {task.due_date && <DueDate date={task.due_date} done={task.status === "done"} />}
        </div>
      )}

      {!overlay && onGrab && canGrab(task, me) && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onGrab();
          }}
        >
          Grab
        </Button>
      )}
    </article>
  );
}
