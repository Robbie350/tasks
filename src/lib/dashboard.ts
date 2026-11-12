import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TASK_COLUMNS, sortColumns, toTask } from "@/lib/board";
import { STAGE_ORDER, type Activity, type BoardColumn, type Person, type Task } from "@/lib/types";

export type ActivityRow = Activity & { task_number: number | null; task_title: string };
export type Notice = { task_id: string; type: "assigned" | "rejected"; created_at: string };

export type DashboardData = {
  openTasks: Task[];
  columns: BoardColumn[];
  people: Person[];
  /** Tasks I finished (was on) in the last 30 days: due date and finish date. */
  myFinished: { due_date: string | null; done_at: string }[];
  notices: Notice[];
  myActivity: ActivityRow[];
  team: null | {
    activity: ActivityRow[];
    lastActivity: Record<string, string>;
    /** Finished in the last 30 days, with who was on them. */
    finished: { done_at: string; assignee_ids: string[] }[];
  };
};

type ActivityJoin = Activity & { tasks: { number: number | null; title: string } | null };
const toRow = ({ tasks, ...a }: ActivityJoin): ActivityRow => ({
  ...a,
  task_number: tasks?.number ?? null,
  task_title: tasks?.title ?? "",
});

/** Everything both dashboards need, read with the user's own session (RLS applies). */
export async function getDashboard(me: { id: string; role: string }): Promise<DashboardData> {
  const supabase = await createClient();
  const since30 = new Date(Date.now() - 30 * 86400e3).toISOString();
  const isLead = me.role === "manager" || me.role === "admin";
  const ACT = "id, task_id, actor_id, action, from_status, to_status, details, created_at, tasks(number, title)";

  const [open, cols, people, mine, notices, myAct] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).neq("status", "done").order("position"),
    supabase.from("board_columns").select("id, stage, title, position, is_builtin").returns<BoardColumn[]>(),
    supabase.from("profiles").select("id, full_name, role, is_active, avatar_url").order("full_name").returns<Person[]>(),
    supabase.from("task_assignees").select("task_id").eq("user_id", me.id),
    supabase
      .from("notifications")
      .select("task_id, type, created_at")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<Notice[]>(),
    supabase.from("task_activity").select(ACT).eq("actor_id", me.id).order("id", { ascending: false }).limit(15).returns<ActivityJoin[]>(),
  ]);

  const myIds = (mine.data ?? []).map((r) => r.task_id as string);
  const myFinishedRes = myIds.length
    ? await supabase
        .from("tasks")
        .select("due_date, done_at")
        .eq("status", "done")
        .gte("done_at", since30)
        .in("id", myIds)
    : { data: [] };

  let team: DashboardData["team"] = null;
  if (isLead) {
    const [act, last, finished] = await Promise.all([
      supabase.from("task_activity").select(ACT).order("id", { ascending: false }).limit(20).returns<ActivityJoin[]>(),
      supabase.rpc("dashboard_last_activity"),
      supabase
        .from("tasks")
        .select("done_at, task_assignees(user_id)")
        .eq("status", "done")
        .gte("done_at", since30)
        .returns<{ done_at: string; task_assignees: { user_id: string }[] }[]>(),
    ]);
    team = {
      activity: (act.data ?? []).map(toRow),
      // Before the dashboard script runs this function doesn't exist: no "stuck" list.
      lastActivity: Object.fromEntries(
        ((last.data ?? []) as { task_id: string; last_activity_at: string }[]).map((r) => [r.task_id, r.last_activity_at])
      ),
      finished: (finished.data ?? []).map((f) => ({
        done_at: f.done_at,
        assignee_ids: f.task_assignees.map((a) => a.user_id),
      })),
    };
  }

  if (open.error) throw new Error(`Couldn't load tasks: ${open.error.message}`);

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openTasks: (open.data ?? []).map((r: any) => toTask(r)),
    columns: sortColumns(
      cols.error || !cols.data?.length
        ? STAGE_ORDER.map((stage) => ({ id: `builtin-${stage}`, stage, title: null, position: 0, is_builtin: true }))
        : cols.data
    ),
    people: people.data ?? [],
    myFinished: ((myFinishedRes.data ?? []) as { due_date: string | null; done_at: string }[]).filter((f) => f.done_at),
    notices: notices.data ?? [],
    myActivity: (myAct.data ?? []).map(toRow),
    team,
  };
}
