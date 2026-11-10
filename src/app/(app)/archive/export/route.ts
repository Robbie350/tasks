import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseArchiveQuery, queryArchive } from "@/lib/archive";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/** CSV of the current archive filters (all pages), opened directly by Excel. */
export async function GET(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });

  const query = parseArchiveQuery(Object.fromEntries(request.nextUrl.searchParams));
  const { t } = await getI18n();
  const supabase = await createClient();

  const [{ tasks, error }, people, labels] = await Promise.all([
    queryArchive(query, { limit: MAX_ROWS, offset: 0 }),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("task_labels").select("id, name"),
  ]);
  if (error) return new NextResponse(error, { status: 500 });

  const name = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));
  const label = new Map((labels.data ?? []).map((l) => [l.id as string, l.name as string]));
  // Quote every cell; neutralise values Excel would treat as formulas.
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

  const header = [
    t("archive.colNumber"),
    t("archive.colTask"),
    t("archive.colStatus"),
    t("archive.colPriority"),
    t("archive.colPeople"),
    t("archive.colLabels"),
    t("archive.colCreated"),
    t("archive.colFinished"),
    t("archive.colDue"),
  ];
  const rows = tasks.map((task) => [
    task.number,
    task.title,
    t(`status.${task.status}`),
    t(`priority.${task.priority}`),
    task.assignee_ids.map((id) => name.get(id) ?? "").join(", "),
    task.label_ids.map((id) => label.get(id) ?? "").join(", "),
    day(task.created_at),
    day(task.done_at),
    task.due_date ?? "",
  ]);

  // BOM so Excel reads Cyrillic and Uzbek letters correctly.
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tasks-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
