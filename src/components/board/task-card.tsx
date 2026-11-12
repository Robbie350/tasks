"use client";

import { useDraggable } from "@dnd-kit/core";
import { CheckSquare, MessageSquare, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Person, Task, TeamLabel } from "@/lib/types";
import { CHIP, isColor } from "@/components/personal/palette";
import { useT } from "@/i18n/client";
import { canGrab, type Me } from "@/lib/rules";
import { AssigneeNames, Avatar } from "./avatar";
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
  isNew = false,
  labelsById,
  onOpen,
  onGrab,
}: {
  task: Task;
  people: Map<string, Person>;
  me: Me;
  draggable: boolean;
  overlay?: boolean;
  isNew?: boolean;
  labelsById?: Map<string, TeamLabel>;
  onOpen?: () => void;
  onGrab?: () => void;
}) {
  const { t, tn } = useT();
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable || overlay,
  });

  // The manager who created the task.
  const creator = people.get(task.created_by);
  const assignees = task.assignee_ids
    .map((id) => people.get(id))
    .filter((p): p is Person => Boolean(p));

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      onClick={onOpen}
      className={cn(
        "relative rounded-lg border border-l-4 bg-card p-3 shadow-xs transition-shadow hover:shadow-sm",
        PRIORITY_EDGE[task.priority],
        draggable && "cursor-grab active:cursor-grabbing",
        !draggable && onOpen && "cursor-pointer",
        isDragging && "opacity-30",
        overlay && "rotate-2 cursor-grabbing shadow-lg"
      )}
    >
      {isNew && (
        <span
          className="absolute top-2 right-2 size-2.5 rounded-full bg-sky-500 ring-2 ring-card"
          title={t("board.newForYou")}
        >
          <span className="sr-only">{t("board.newForYou")}</span>
        </span>
      )}
      {labelsById && task.label_ids.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 pr-3">
          {task.label_ids
            .map((id) => labelsById.get(id))
            .filter((l): l is TeamLabel => Boolean(l))
            .map((l) => (
              <span key={l.id} className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", CHIP[isColor(l.color) ? l.color : "gray"])}>
                {l.name}
              </span>
            ))}
        </div>
      )}
      {/* The title is a real button so keyboard users can open the task. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
        className="pr-3 text-left text-sm leading-snug font-medium break-words outline-none focus-visible:underline"
      >
        {task.number != null && <span className="mr-1 font-normal text-muted-foreground tabular-nums">#{task.number}</span>}
        {task.title}
      </button>
      <span className="sr-only">{t("priority.label", { priority: t(`priority.${task.priority}`) })}</span>

      {(assignees.length > 0 || task.due_date || task.notes_count > 0 || task.checklist.length > 0 || task.attachments_count > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          {assignees.length > 0 ? <AssigneeNames people={assignees} className="max-w-[65%]" /> : <span />}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
            {task.checklist.length > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs text-muted-foreground",
                  task.checklist.every((i) => i.done) && "text-green-700 dark:text-green-400"
                )}
                title={t("panel.checklist")}
              >
                <CheckSquare className="size-3.5" aria-hidden />
                {task.checklist.filter((i) => i.done).length}/{task.checklist.length}
              </span>
            )}
            {task.attachments_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={tn("board.attachments", task.attachments_count)}>
                <Paperclip className="size-3.5" aria-hidden />
                <span aria-hidden>{task.attachments_count}</span>
                <span className="sr-only">{tn("board.attachments", task.attachments_count)}</span>
              </span>
            )}
            {task.notes_count > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title={tn("board.notes", task.notes_count)}
              >
                <MessageSquare className="size-3.5" aria-hidden />
                <span aria-hidden>{task.notes_count}</span>
                <span className="sr-only">{tn("board.notes", task.notes_count)}</span>
              </span>
            )}
            {task.due_date && <DueDate date={task.due_date} done={task.status === "done"} />}
          </div>
        </div>
      )}

      {creator && (
        <p className="mt-2 flex items-center gap-1.5 border-t pt-2 text-[11px] text-muted-foreground" title={creator.full_name}>
          <Avatar id={creator.id} name={creator.full_name} url={creator.avatar_url} className="size-4 text-[7px] ring-0" />
          <span className="truncate">{t("board.manager", { name: creator.full_name })}</span>
        </p>
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
          {t("board.grab")}
        </Button>
      )}
    </article>
  );
}
