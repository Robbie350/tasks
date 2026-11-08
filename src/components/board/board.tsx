import { cn } from "@/lib/utils";
import { COLUMNS, type Person, type Task } from "@/lib/types";
import { TaskCard } from "./task-card";

export function Board({ tasks, people }: { tasks: Task[]; people: Person[] }) {
  const peopleById = new Map(people.map((p) => [p.id, p]));

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-5 lg:overflow-visible">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.status);
        const isPool = col.status === "unassigned";
        return (
          <section
            key={col.status}
            aria-label={col.label}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl p-3 lg:w-auto",
              isPool ? "border border-dashed border-sky-300 bg-sky-50/70" : "bg-zinc-100"
            )}
          >
            <header className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {items.length}
              </span>
            </header>
            <div className="flex min-h-24 flex-col gap-2">
              {items.map((task) => (
                <TaskCard key={task.id} task={task} people={peopleById} />
              ))}
              {items.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  {isPool ? "No tasks waiting to be grabbed" : "Nothing here"}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
