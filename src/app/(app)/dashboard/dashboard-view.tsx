"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { timeAgo } from "@/lib/time";
import { Avatar, AvatarStack } from "@/components/board/avatar";
import { DueDate } from "@/components/board/due-date";
import { describe } from "@/components/board/task-history";
import { columnOf } from "@/lib/rules";
import type { DashboardData, ActivityRow } from "@/lib/dashboard";
import type { Person, Role, Task } from "@/lib/types";

const PRIORITY_DOT = { low: "bg-zinc-300", medium: "bg-amber-400", high: "bg-red-500" } as const;
const DAY = 86400e3;

/** YYYY-MM-DD in the viewer's own time zone. */
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const daysBetween = (fromDay: string, toDay: string) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY);

export function DashboardView({
  data,
  me,
  initialTab,
}: {
  data: DashboardData;
  me: { id: string; role: Role; name: string };
  initialTab: "mine" | "team";
}) {
  const { t } = useT();
  const isLead = me.role === "manager" || me.role === "admin";
  const [tab, setTab] = useState(initialTab);
  // "Today" depends on the viewer's clock: work it out in the browser.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localDay()), []);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.hello", { name: me.name.split(" ")[0] })}</p>
        </div>
        {isLead && (
          <div role="tablist" className="inline-flex rounded-lg border bg-background p-1">
            {(me.role === "admin" ? (["team"] as const) : (["mine", "team"] as const)).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key);
                  window.history.replaceState(null, "", `/dashboard?tab=${key}`);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {key === "mine" ? t("dashboard.tabMine") : t("dashboard.tabTeam")}
              </button>
            ))}
          </div>
        )}
      </div>

      {today === null ? null : tab === "team" && isLead ? (
        <TeamView data={data} today={today} />
      ) : (
        <MineView data={data} me={me} today={today} />
      )}
    </main>
  );
}

// -----------------------------------------------------------------------------
// Shared pieces
// -----------------------------------------------------------------------------

function Tile({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href?: string; tone?: "bad" }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "bad" && Number(value) > 0 && "text-red-600 dark:text-red-400")}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border bg-card p-4 shadow-xs";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-foreground/30")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    // min-w-0: let panels shrink inside the grid so a wide table scrolls instead of stretching the page.
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

function TaskRow({
  task,
  data,
  extra,
  showPeople,
}: {
  task: Task;
  data: DashboardData;
  extra?: string;
  showPeople?: boolean;
}) {
  const { t } = useT();
  const col = columnOf(task, data.columns);
  const people = task.assignee_ids
    .map((id) => data.people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p));
  return (
    <li>
      <Link href={`/?task=${task.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
        <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {task.number != null && <span className="mr-1 font-normal text-muted-foreground tabular-nums">#{task.number}</span>}
            {task.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {col.title ?? t(`status.${col.stage}`)}
            {extra && <> · {extra}</>}
          </span>
        </span>
        {showPeople && people.length > 0 && <AvatarStack people={people} max={3} />}
        {task.due_date && <DueDate date={task.due_date} done={false} />}
      </Link>
    </li>
  );
}

function ActivityFeed({ rows, data }: { rows: ActivityRow[]; data: DashboardData }) {
  const { t, locale } = useT();
  const people = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  if (rows.length === 0) return <Empty>{t("dashboard.noActivity")}</Empty>;
  return (
    <ol className="space-y-2.5">
      {rows.map((a) => {
        const actor = a.actor_id ? people.get(a.actor_id) : undefined;
        return (
          <li key={a.id} className="flex gap-2.5 text-sm">
            <Avatar id={a.actor_id ?? "former"} name={actor?.full_name ?? t("common.formerUser")} url={actor?.avatar_url} className="size-6 text-[10px] ring-0" />
            <p className="min-w-0 flex-1 leading-snug">
              <span className="font-medium">{actor?.full_name ?? t("common.formerUser")}</span> {describe(a, people, t)}
              {a.task_title && (
                <>
                  {" · "}
                  <Link href={`/?task=${a.task_id}`} className="underline-offset-4 hover:underline">
                    {a.task_number != null && `#${a.task_number} `}
                    {a.task_title}
                  </Link>
                </>
              )}
              <span className="block text-xs text-muted-foreground">{timeAgo(a.created_at, locale, t("history.justNow"))}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// -----------------------------------------------------------------------------
// My work
// -----------------------------------------------------------------------------

function MineView({ data, me, today }: { data: DashboardData; me: { id: string; role: Role }; today: string }) {
  const { t, tn } = useT();
  const mine = data.openTasks.filter((x) => x.assignee_ids.includes(me.id));
  const in7 = localDay(new Date(Date.now() + 7 * DAY));

  const groups: { key: string; label: string; tasks: Task[] }[] = [
    { key: "overdue", label: t("dashboard.gOverdue"), tasks: mine.filter((x) => x.due_date && x.due_date < today) },
    { key: "today", label: t("dashboard.gToday"), tasks: mine.filter((x) => x.due_date === today) },
    { key: "week", label: t("dashboard.gWeek"), tasks: mine.filter((x) => x.due_date && x.due_date > today && x.due_date <= in7) },
    { key: "later", label: t("dashboard.gLater"), tasks: mine.filter((x) => x.due_date && x.due_date > in7) },
    { key: "none", label: t("dashboard.gNoDate"), tasks: mine.filter((x) => !x.due_date) },
  ].map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9")) }));

  const finished7 = data.myFinished.filter((f) => Date.parse(f.done_at) >= Date.now() - 7 * DAY).length;
  const withDue = data.myFinished.filter((f) => f.due_date);
  const onTime = withDue.filter((f) => localDay(new Date(f.done_at)) <= f.due_date!).length;
  const review = me.role === "manager" ? data.openTasks.filter((x) => x.status === "review" && !x.assignee_ids.includes(me.id)) : [];
  const notices = data.notices
    .map((n) => ({ ...n, task: data.openTasks.find((x) => x.id === n.task_id) }))
    .filter((n): n is typeof n & { task: Task } => Boolean(n.task));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Tile label={t("dashboard.myOpen")} value={mine.length} href={`/registry?person=${me.id}`} />
        <Tile label={t("dashboard.myOverdue")} value={groups[0].tasks.length} tone="bad" href={`/registry?person=${me.id}&overdue=1`} />
        <Tile label={t("dashboard.dueWeek")} value={groups[1].tasks.length + groups[2].tasks.length} />
        <Tile label={t("dashboard.finished7")} value={finished7} href={`/registry?scope=done&person=${me.id}`} />
        <Tile
          label={t("dashboard.onTime")}
          value={withDue.length ? `${Math.round((onTime / withDue.length) * 100)}%` : "—"}
          hint={withDue.length ? t("dashboard.onTimeHint", { done: onTime, total: withDue.length }) : undefined}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title={t("dashboard.myTasks")}
          action={
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
              {t("dashboard.openBoard")} <ArrowRight className="inline size-3" />
            </Link>
          }
        >
          {mine.length === 0 ? (
            <Empty>{t("dashboard.noTasks")}</Empty>
          ) : (
            <div className="space-y-4">
              {groups
                .filter((g) => g.tasks.length > 0)
                .map((g) => (
                  <div key={g.key}>
                    <h3
                      className={cn(
                        "mb-1 px-2 text-xs font-semibold tracking-wide uppercase",
                        g.key === "overdue" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                      )}
                    >
                      {g.label} · {g.tasks.length}
                    </h3>
                    <ul>
                      {g.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          data={data}
                          extra={g.key === "overdue" && task.due_date ? tn("dashboard.daysOverdue", daysBetween(task.due_date, today)) : undefined}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={t("dashboard.attention")}>
            {notices.length === 0 ? (
              <Empty>{t("dashboard.noAttention")}</Empty>
            ) : (
              <ul>
                {notices.map((n) => (
                  <li key={n.task_id + n.type + n.created_at}>
                    <Link href={`/?task=${n.task_id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full",
                          n.type === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                        )}
                      >
                        {n.type === "rejected" ? <Undo2 className="size-3.5" /> : <Bell className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-muted-foreground">
                          {n.type === "rejected" ? t("dashboard.attnRejected") : t("dashboard.attnAssigned")}
                        </span>
                        <span className="block truncate text-sm font-medium">
                          {n.task.number != null && <span className="mr-1 font-normal text-muted-foreground">#{n.task.number}</span>}
                          {n.task.title}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {me.role === "manager" && (
            <Panel title={`${t("dashboard.review")} · ${review.length}`}>
              {review.length === 0 ? (
                <Empty>{t("dashboard.noReview")}</Empty>
              ) : (
                <ul>
                  {review.map((task) => (
                    <TaskRow key={task.id} task={task} data={data} showPeople />
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel title={t("dashboard.myActivity")}>
            <ActivityFeed rows={data.myActivity} data={data} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Team
// -----------------------------------------------------------------------------

function TeamView({ data, today }: { data: DashboardData; today: string }) {
  const { t, tn } = useT();
  const team = data.team!;
  const open = data.openTasks;
  const overdue = open.filter((x) => x.due_date && x.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const unassigned = open.filter((x) => x.status === "unassigned").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ageDays = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY));
  const stuck = open
    .filter((x) => x.status !== "unassigned" && team.lastActivity[x.id] && ageDays(team.lastActivity[x.id]) >= 7)
    .sort((a, b) => team.lastActivity[a.id].localeCompare(team.lastActivity[b.id]));
  const finished7 = team.finished.filter((f) => Date.parse(f.done_at) >= Date.now() - 7 * DAY).length;

  const perColumn = data.columns
    .filter((c) => c.stage !== "done")
    .map((c) => ({ column: c, count: open.filter((x) => columnOf(x, data.columns).id === c.id).length }));
  const maxCol = Math.max(1, ...perColumn.map((c) => c.count));

  const workload = data.people
    .filter((p) => p.is_active && p.role !== "admin")
    .map((p) => {
      const theirs = open.filter((x) => x.assignee_ids.includes(p.id));
      return {
        person: p,
        open: theirs.length,
        review: theirs.filter((x) => x.status === "review").length,
        overdue: theirs.filter((x) => x.due_date && x.due_date < today).length,
        finished: team.finished.filter((f) => f.assignee_ids.includes(p.id)).length,
      };
    })
    .sort((a, b) => b.open - a.open || b.finished - a.finished);
  const maxOpen = Math.max(1, ...workload.map((w) => w.open));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Tile label={t("dashboard.open")} value={open.length} href="/registry" />
        <Tile label={t("dashboard.overdue")} value={overdue.length} tone="bad" href="/registry?overdue=1" />
        <Tile label={t("dashboard.inReview")} value={open.filter((x) => x.status === "review").length} />
        <Tile
          label={t("dashboard.unassigned")}
          value={unassigned.length}
          hint={unassigned.length ? tn("dashboard.oldest", ageDays(unassigned[0].created_at)) : undefined}
        />
        <Tile label={t("dashboard.finishedWeek")} value={finished7} href="/registry?scope=done" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("dashboard.perColumn")}>
          <ul className="space-y-2.5">
            {perColumn.map(({ column, count }) => (
              <li key={column.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate" title={column.title ?? t(`status.${column.stage}`)}>
                  {column.title ?? t(`status.${column.stage}`)}
                  {column.title && <span className="block truncate text-[10px] text-muted-foreground uppercase">{t(`status.${column.stage}`)}</span>}
                </span>
                <span className="h-2.5 rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/80"
                    style={{ width: count ? `${Math.max(3, (count / maxCol) * 100)}%` : 0 }}
                  />
                </span>
                <span className="text-right font-medium tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("dashboard.workload")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs whitespace-nowrap text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">{t("dashboard.colPerson")}</th>
                  <th className="pb-2 font-medium">{t("dashboard.colOpen")}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t("dashboard.colReview")}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t("dashboard.colOverdue")}</th>
                  <th className="pb-2 pl-3 text-right font-medium">{t("dashboard.colFinished")}</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.person.id} className="border-t">
                    <td className="py-2 pr-2">
                      <Link href={`/registry?person=${w.person.id}`} className="flex items-center gap-2 hover:underline">
                        <Avatar id={w.person.id} name={w.person.full_name} url={w.person.avatar_url} className="size-6 text-[10px] ring-0" />
                        <span className="truncate">{w.person.full_name}</span>
                      </Link>
                    </td>
                    <td className="w-1/3 py-2 pr-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary/80" style={{ width: `${(w.open / maxOpen) * 100}%` }} />
                        </span>
                        <span className="w-5 text-right font-medium tabular-nums">{w.open}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{w.review}</td>
                    <td className={cn("py-2 text-right tabular-nums", w.overdue > 0 && "font-semibold text-red-600 dark:text-red-400")}>
                      {w.overdue}
                    </td>
                    <td className="py-2 text-right tabular-nums">{w.finished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title={`${t("dashboard.overdueList")} · ${overdue.length}`}
          action={overdue.length > 8 ? <Link href="/registry?overdue=1&sort=due_asc" className="text-xs text-muted-foreground hover:text-foreground">{t("dashboard.seeAll")}</Link> : undefined}
        >
          {overdue.length === 0 ? (
            <Empty>{t("dashboard.allGood")}</Empty>
          ) : (
            <ul>
              {overdue.slice(0, 8).map((task) => (
                <TaskRow key={task.id} task={task} data={data} showPeople extra={tn("dashboard.daysOverdue", daysBetween(task.due_date!, today))} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`${t("dashboard.stuck")} · ${stuck.length}`}>
          {stuck.length === 0 ? (
            <Empty>{t("dashboard.allGood")}</Empty>
          ) : (
            <ul>
              {stuck.slice(0, 8).map((task) => (
                <TaskRow key={task.id} task={task} data={data} showPeople extra={tn("dashboard.daysQuiet", ageDays(team.lastActivity[task.id]))} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`${t("dashboard.unassignedList")} · ${unassigned.length}`}>
          {unassigned.length === 0 ? (
            <Empty>{t("dashboard.allGood")}</Empty>
          ) : (
            <ul>
              {unassigned.slice(0, 8).map((task) => (
                <TaskRow key={task.id} task={task} data={data} extra={tn("dashboard.daysWaiting", ageDays(task.created_at))} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={t("dashboard.teamActivity")}>
          <ActivityFeed rows={team.activity} data={data} />
        </Panel>
        <div className="self-start rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          <Link href="/reports" className="hover:text-foreground">
            {t("dashboard.reports")}
          </Link>
        </div>
      </div>
    </div>
  );
}
