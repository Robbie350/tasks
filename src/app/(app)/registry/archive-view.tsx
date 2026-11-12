"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AvatarStack } from "@/components/board/avatar";
import { TaskPanel } from "@/components/board/task-panel";
import type { BoardActions } from "@/components/board/board";
import { CHIP, isColor } from "@/components/personal/palette";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/time";
import { useT } from "@/i18n/client";
import type { ArchiveQuery } from "@/lib/archive";
import type { Me } from "@/lib/rules";
import type { BoardColumn, Person, Task, TeamLabel } from "@/lib/types";
import type { ActionResult } from "@/app/(app)/task-actions";

const PRIORITY_DOT = { low: "bg-zinc-300", medium: "bg-amber-400", high: "bg-red-500" } as const;

export function ArchiveView({
  query,
  tasks,
  total,
  error,
  pageSize,
  people,
  labels,
  columns,
  me,
}: {
  query: ArchiveQuery;
  tasks: Task[];
  total: number;
  error: string | null;
  pageSize: number;
  people: Person[];
  labels: TeamLabel[];
  columns: BoardColumn[];
  me: Me;
}) {
  const { t, tn, tr } = useT();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const months = t("dates.monthsShort");
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // Finished tasks can't be moved, so the panel only needs "run" (notes,
  // edits, labels). Unfinished tasks are opened on the board instead.
  const actions: BoardActions = {
    grab: () => {},
    join: () => {},
    leave: () => {},
    move: () => {},
    step: () => {},
    approve: () => {},
    run: async (fn: () => Promise<ActionResult>) => {
      try {
        const res = await fn();
        if (!res.ok) setToast(tr(res.error));
        else router.refresh();
        return res.ok;
      } catch {
        setToast(tr("Couldn't reach the server. Check your connection and try again."));
        return false;
      }
    },
  };

  const href = (patch: Partial<Record<keyof ArchiveQuery, string | number | boolean>>) => {
    const p = new URLSearchParams();
    const merged = { ...query, ...patch } as Record<string, string | number | boolean>;
    for (const [k, v] of Object.entries(merged)) {
      if (v === "" || v === false || (k === "page" && v === 1) || (k === "scope" && v === "open") || (k === "sort" && v === "finished_desc")) continue;
      if (v === true) {
        p.set(k, "1");
        continue;
      }
      p.set(k, String(v));
    }
    const s = p.toString();
    return `/registry${s ? `?${s}` : ""}`;
  };
  const exportHref = href({ page: 1 }).replace("/registry", "/registry/export");

  const openTask = tasks.find((x) => x.id === openId) ?? null;
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  // Name of an added step (built-in columns just show the status).
  const stepName = (task: Task) => {
    const c = columns.find((x) => x.id === task.column_id);
    return c?.title && c.title !== t(`status.${c.stage}`) ? c.title : null;
  };
  const dateOf = (task: Task) => (query.scope === "done" ? task.done_at : task.created_at);

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("archive.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("archive.subtitle")}</p>
      </div>

      {/* Filters: a plain GET form, so results have a shareable URL */}
      <form action="/registry" method="get" className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-6">
        <div className="relative md:col-span-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={query.q} placeholder={t("archive.search")} aria-label={t("archive.search")} className="pl-8" />
        </div>
        <Select name="scope" defaultValue={query.scope} aria-label={t("archive.scopeDone")} className="md:col-span-1">
          <option value="open">{t("archive.scopeOpen")}</option>
          <option value="done">{t("archive.scopeDone")}</option>
          <option value="all">{t("archive.scopeAll")}</option>
        </Select>
        <Select name="sort" defaultValue={query.sort} aria-label={t("archive.sort")} className="md:col-span-2">
          <option value="finished_desc">{t("archive.sortFinishedDesc")}</option>
          <option value="finished_asc">{t("archive.sortFinishedAsc")}</option>
          <option value="due_asc">{t("archive.sortDue")}</option>
          <option value="number_desc">{t("archive.sortNumberDesc")}</option>
          <option value="number_asc">{t("archive.sortNumberAsc")}</option>
          <option value="title">{t("archive.sortTitle")}</option>
        </Select>
        <Select name="person" defaultValue={query.person} aria-label={t("archive.everyone")} className="md:col-span-2">
          <option value="">{t("archive.everyone")}</option>
          {people
            .filter((p) => p.role !== "admin")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
                {p.is_active ? "" : ` (${t("common.inactive")})`}
              </option>
            ))}
        </Select>
        <Select name="label" defaultValue={query.label} aria-label={t("archive.allLabels")} className="md:col-span-1">
          <option value="">{t("archive.allLabels")}</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <label
          className="flex items-center gap-2 text-xs text-muted-foreground md:col-span-1"
          title={query.scope === "done" ? t("archive.dateHintDone") : t("archive.dateHintAll")}
        >
          {t("archive.from")}
          <Input name="from" type="date" defaultValue={query.from} aria-label={t("archive.from")} />
        </label>
        <label
          className="flex items-center gap-2 text-xs text-muted-foreground md:col-span-1"
          title={query.scope === "done" ? t("archive.dateHintDone") : t("archive.dateHintAll")}
        >
          {t("archive.to")}
          <Input name="to" type="date" defaultValue={query.to} aria-label={t("archive.to")} />
        </label>
        <div className="flex items-center gap-2 md:col-span-1">
          <Button type="submit" className="flex-1">
            {t("archive.apply")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/registry">{t("archive.reset")}</Link>
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm font-medium">{tn("archive.results", total)}</p>
          <Link
            href={href({ overdue: !query.overdue, page: 1 })}
            aria-pressed={query.overdue}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              query.overdue ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("archive.overdueOnly")}
          </Link>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={exportHref}>
            <Download /> {t("archive.export")}
          </a>
        </Button>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-16 px-4 py-3 font-medium">{t("archive.colNumber")}</th>
              <th className="px-4 py-3 font-medium">{t("archive.colTask")}</th>
              <th className="px-4 py-3 font-medium">{t("archive.colPeople")}</th>
              {query.scope !== "done" && <th className="px-4 py-3 font-medium">{t("archive.colStep")}</th>}
              {query.scope !== "done" && <th className="px-4 py-3 font-medium">{t("archive.colDue")}</th>}
              <th className="px-4 py-3 text-right font-medium">
                {query.scope === "done" ? t("archive.colFinished") : t("archive.colCreated")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const assignees = task.assignee_ids.map((id) => peopleById.get(id)).filter((p): p is Person => Boolean(p));
              const date = dateOf(task);
              const open = () => (task.status === "done" ? setOpenId(task.id) : router.push(`/?task=${task.id}`));
              return (
                <tr key={task.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={open}>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">#{task.number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      className="flex items-center gap-2 text-left font-medium hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        open();
                      }}
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} aria-hidden />
                      {task.title}
                    </button>
                    {task.label_ids.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-4">
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
                  </td>
                  <td className="px-4 py-3">{assignees.length > 0 ? <AvatarStack people={assignees} max={4} /> : "—"}</td>
                  {query.scope !== "done" && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {t(`status.${task.status}`)}
                      {stepName(task) && <span className="block text-xs">{stepName(task)}</span>}
                    </td>
                  )}
                  {query.scope !== "done" && (
                    <td
                      className={cn(
                        "px-4 py-3 whitespace-nowrap tabular-nums",
                        task.due_date && task.status !== "done" && task.due_date < today
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {task.due_date ? formatDay(task.due_date, months) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                    {date ? formatDay(date.slice(0, 10), months) : "—"}
                  </td>
                </tr>
              );
            })}
            {tasks.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {t("archive.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label={t("archive.page", { page: query.page, pages })}>
          <Button asChild={query.page > 1} variant="outline" size="sm" disabled={query.page <= 1}>
            {query.page > 1 ? (
              <Link href={href({ page: query.page - 1 })}>
                <ChevronLeft /> {t("archive.prev")}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2">
                <ChevronLeft /> {t("archive.prev")}
              </span>
            )}
          </Button>
          <span className="text-muted-foreground">{t("archive.page", { page: query.page, pages })}</span>
          <Button asChild={query.page < pages} variant="outline" size="sm" disabled={query.page >= pages}>
            {query.page < pages ? (
              <Link href={href({ page: query.page + 1 })}>
                {t("archive.next")} <ChevronRight />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2">
                {t("archive.next")} <ChevronRight />
              </span>
            )}
          </Button>
        </nav>
      )}

      <TaskPanel
        columns={columns}
        labels={labels}
        task={openTask}
        people={peopleById}
        me={me}
        actions={actions}
        startInRejectMode={false}
        onClose={() => setOpenId(null)}
      />

      {toast && (
        <div role="alert" onClick={() => setToast(null)} className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg bg-destructive px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
