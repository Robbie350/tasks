import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  ARCHIVE_AFTER_DAYS,
  STAGE_ORDER,
  type BoardColumn,
  type Person,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TeamLabel,
} from "@/lib/types";

type TaskRow = Omit<Task, "number" | "assignee_ids" | "notes_count" | "label_ids" | "done_at" | "checklist" | "attachments_count" | "column_id"> & {
  column_id?: string | null;
  number?: number | null;
  task_assignees: { user_id: string }[];
  task_notes: { count: number }[];
  task_attachments?: { count: number }[];
  checklist?: Task["checklist"] | null;
  label_ids?: string[] | null;
  done_at?: string | null;
};

export const TASK_COLUMNS =
  "id, number, title, description, status, priority, due_date, position, created_by, created_at, label_ids, done_at, checklist, column_id, task_assignees(user_id), task_notes(count), task_attachments(count)";

export function toTask({ task_assignees, task_notes, task_attachments, ...t }: TaskRow): Task {
  return {
    ...t,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    assignee_ids: task_assignees.map((a) => a.user_id),
    notes_count: task_notes[0]?.count ?? 0,
    label_ids: t.label_ids ?? [],
    done_at: t.done_at ?? null,
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    attachments_count: task_attachments?.[0]?.count ?? 0,
    column_id: t.column_id ?? null,
    number: t.number ?? null,
  };
}

export function archiveCutoff() {
  return new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86400e3).toISOString();
}

/** Everything the board screen needs, read with the user's own session (RLS applies). */
export async function getBoardData(): Promise<{
  tasks: Task[];
  people: Person[];
  labels: TeamLabel[];
  unreadTaskIds: string[];
  archivedCount: number;
  columns: BoardColumn[];
}> {
  const supabase = await createClient();
  const cutoff = archiveCutoff();

  const [tasksRes, peopleRes, unreadRes, labelsRes, archivedRes, columnsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      // Old Done tasks are archived: kept, just not loaded by default.
      .or(`status.neq.done,done_at.is.null,done_at.gte.${cutoff}`)
      .order("position")
      .returns<TaskRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active, avatar_url")
      .order("full_name")
      .returns<Person[]>(),
    // RLS returns only the signed-in user's own notifications.
    supabase.from("notifications").select("task_id").eq("is_read", false),
    supabase.from("task_labels").select("id, name, color").order("name").returns<TeamLabel[]>(),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "done")
      .lt("done_at", cutoff),
    supabase.from("board_columns").select("id, stage, title, position, is_builtin").returns<BoardColumn[]>(),
  ]);

  if (tasksRes.error) throw new Error(`Couldn't load tasks: ${tasksRes.error.message}`);
  if (peopleRes.error) throw new Error(`Couldn't load people: ${peopleRes.error.message}`);

  const unreadTaskIds = [...new Set((unreadRes.data ?? []).map((n) => n.task_id as string))];

  return {
    tasks: (tasksRes.data ?? []).map(toTask),
    people: peopleRes.data ?? [],
    labels: labelsRes.error ? [] : (labelsRes.data ?? []),
    unreadTaskIds,
    archivedCount: archivedRes.count ?? 0,
    columns: sortColumns(
      columnsRes.error || !columnsRes.data?.length
        ? // Before the columns script runs: one built-in column per stage.
          STAGE_ORDER.map((stage) => ({ id: `builtin-${stage}`, stage, title: null, position: 0, is_builtin: true }))
        : columnsRes.data
    ),
  };
}

export function sortColumns(columns: BoardColumn[]) {
  return [...columns].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.position - b.position
  );
}

/** Done tasks older than the archive cutoff, newest first. */
export async function getArchivedTasks(limit = 200): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "done")
    .lt("done_at", archiveCutoff())
    .order("done_at", { ascending: false })
    .limit(limit)
    .returns<TaskRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toTask);
}
