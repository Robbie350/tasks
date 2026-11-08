import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Person, Task, TaskPriority, TaskStatus } from "@/lib/types";

type TaskRow = Omit<Task, "assignee_ids"> & { task_assignees: { user_id: string }[] };

/** Everything the board screen needs, read with the user's own session (RLS applies). */
export async function getBoardData(): Promise<{ tasks: Task[]; people: Person[] }> {
  const supabase = await createClient();

  const [tasksRes, peopleRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, position, created_by, created_at, task_assignees(user_id)"
      )
      .order("position")
      .returns<TaskRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .order("full_name")
      .returns<Person[]>(),
  ]);

  if (tasksRes.error) throw new Error(`Couldn't load tasks: ${tasksRes.error.message}`);
  if (peopleRes.error) throw new Error(`Couldn't load people: ${peopleRes.error.message}`);

  const tasks = (tasksRes.data ?? []).map(({ task_assignees, ...t }) => ({
    ...t,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    assignee_ids: task_assignees.map((a) => a.user_id),
  }));

  return { tasks, people: peopleRes.data ?? [] };
}
