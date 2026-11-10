import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TASK_COLUMNS, toTask } from "@/lib/board";
import type { Task } from "@/lib/types";

export const ARCHIVE_PAGE_SIZE = 50;
export const SORTS = ["finished_desc", "finished_asc", "number_desc", "number_asc", "title"] as const;
export type ArchiveSort = (typeof SORTS)[number];

export type ArchiveQuery = {
  q: string;
  scope: "done" | "all";
  person: string;
  label: string;
  from: string; // YYYY-MM-DD
  to: string;
  sort: ArchiveSort;
  page: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Read and clean the archive filters from the URL. */
export function parseArchiveQuery(sp: Record<string, string | string[] | undefined>): ArchiveQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const sort = one("sort") as ArchiveSort;
  return {
    q: one("q").trim().slice(0, 100),
    scope: one("scope") === "all" ? "all" : "done",
    person: UUID.test(one("person")) ? one("person") : "",
    label: UUID.test(one("label")) ? one("label") : "",
    from: DATE.test(one("from")) ? one("from") : "",
    to: DATE.test(one("to")) ? one("to") : "",
    sort: SORTS.includes(sort) ? sort : "finished_desc",
    page: Math.max(1, Math.min(10000, Number.parseInt(one("page"), 10) || 1)),
  };
}

/**
 * Searches every task in the database (RLS: active users only), not just the
 * ones on the board. "#12" or "12" finds task number 12.
 */
export async function queryArchive(
  query: ArchiveQuery,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ tasks: Task[]; total: number; error?: string }> {
  const supabase = await createClient();
  const limit = opts.limit ?? ARCHIVE_PAGE_SIZE;
  const offset = opts.offset ?? (query.page - 1) * ARCHIVE_PAGE_SIZE;

  // Tasks a person is on (kept as a separate lookup so each task still lists everyone on it).
  let personTaskIds: string[] | null = null;
  if (query.person) {
    const { data } = await supabase.from("task_assignees").select("task_id").eq("user_id", query.person);
    personTaskIds = (data ?? []).map((r) => r.task_id as string);
    if (personTaskIds.length === 0) return { tasks: [], total: 0 };
  }

  let req = supabase.from("tasks").select(TASK_COLUMNS, { count: "exact" });

  const numberMatch = query.q.match(/^#?(\d{1,9})$/);
  if (numberMatch) {
    req = req.eq("number", Number(numberMatch[1])); // a number finds that task in any column
  } else {
    if (query.scope === "done") req = req.eq("status", "done");
    if (query.q) {
      // Escape characters that have meaning in PostgREST filters and LIKE patterns.
      const safe = query.q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ");
      req = req.or(`title.ilike.*${safe}*,description.ilike.*${safe}*`);
    }
  }
  if (personTaskIds) req = req.in("id", personTaskIds);
  if (query.label) req = req.contains("label_ids", [query.label]);
  // Date range applies to the finish date (or creation date when showing all tasks).
  const dateField = query.scope === "done" ? "done_at" : "created_at";
  if (query.from) req = req.gte(dateField, `${query.from}T00:00:00`);
  if (query.to) req = req.lte(dateField, `${query.to}T23:59:59.999`);

  switch (query.sort) {
    case "finished_asc":
      req = req.order(dateField, { ascending: true, nullsFirst: false });
      break;
    case "number_desc":
      req = req.order("number", { ascending: false });
      break;
    case "number_asc":
      req = req.order("number", { ascending: true });
      break;
    case "title":
      req = req.order("title", { ascending: true });
      break;
    default:
      req = req.order(dateField, { ascending: false, nullsFirst: false });
  }
  req = req.order("number", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await req;
  if (error) return { tasks: [], total: 0, error: error.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { tasks: (data ?? []).map((r: any) => toTask(r)), total: count ?? 0 };
}
