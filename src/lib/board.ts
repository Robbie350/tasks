import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Person, Task, TaskPriority, TaskStatus } from "@/lib/types";

type TaskRow = Omit<Task, "assignee_ids" | "notes_count"> & {
  task_assignees: { user_id: string }[];
  task_notes: { count: number }[];
};

/** Everything the board screen needs, read with the user's own session (RLS applies). */
export async function getBoardData(): Promise<{
  tasks: Task[];
  people: Person[];
  unreadTaskIds: string[];
}> {
  const supabase = await createClient();

  const [tasksRes, peopleRes, unreadRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, position, created_by, created_at, task_assignees(user_id), task_notes(count)"
      )
      .order("position")
      .returns<TaskRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .order("full_name")
      .returns<Person[]>(),
    // RLS returns only the signed-in user's own notifications.
    supabase.from("notifications").select("task_id").eq("is_read", false),
  ]);

  if (tasksRes.error) throw new Error(`Couldn't load tasks: ${tasksRes.error.message}`);
  if (peopleRes.error) throw new Error(`Couldn't load people: ${peopleRes.error.message}`);

  const tasks = (tasksRes.data ?? []).map(({ task_assignees, task_notes, ...t }) => ({
    ...t,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    assignee_ids: task_assignees.map((a) => a.user_id),
    notes_count: task_notes[0]?.count ?? 0,
  }));

  const unreadTaskIds = [...new Set((unreadRes.data ?? []).map((n) => n.task_id as string))];

  return { tasks, people: peopleRes.data ?? [], unreadTaskIds };
}
