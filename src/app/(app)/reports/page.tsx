import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/i18n/server";
import type { Translator } from "@/i18n";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/board/avatar";
import type { Person, TaskStatus } from "@/lib/types";
import { WeeklyChart, type Week } from "./charts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("reports.title")} · ${t("common.appName")}` };
}

const PERIODS = [7, 30, 90] as const;

type Summary = {
  created: number;
  completed: number;
  rejected: number;
  open: number;
  overdue: number;
  avg_cycle_hours: number | null;
};
type PersonRow = { user_id: string; full_name: string; completed: number; open: number; overdue: number };
type ColumnRow = { status: TaskStatus; avg_hours: number; median_hours: number; stays: number };

function duration(hours: number | null | undefined, t: Translator["t"]) {
  if (hours == null) return "—";
  if (hours < 1) return t("reports.lessThanHour");
  if (hours < 24) return t("reports.hours", { h: Math.round(hours) });
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h ? t("reports.daysHours", { d, h }) : t("reports.days", { d });
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireRole("manager", "admin");
  const { t, tn } = await getI18n();
  const raw = Number((await searchParams).days);
  const days = (PERIODS as readonly number[]).includes(raw) ? raw : 30;

  const supabase = await createClient();
  const [summaryRes, peopleRes, columnsRes, weeklyRes, profilesRes] = await Promise.all([
    supabase.rpc("report_summary", { p_days: days }),
    supabase.rpc("report_people", { p_days: days }),
    supabase.rpc("report_columns", { p_days: days }),
    supabase.rpc("report_weekly", { p_weeks: 12 }),
    supabase.from("profiles").select("id, full_name, role, is_active, avatar_url").returns<Person[]>(),
  ]);

  const error = summaryRes.error ?? peopleRes.error ?? columnsRes.error ?? weeklyRes.error;
  const summary = (summaryRes.data ?? {}) as Partial<Summary>;
  const people = (peopleRes.data ?? []) as PersonRow[];
  const columns = (columnsRes.data ?? []) as ColumnRow[];
  const weeks = ((weeklyRes.data ?? []) as Week[]).map((w) => ({ ...w, completed: Number(w.completed) }));
  const avatars = new Map((profilesRes.data ?? []).map((p) => [p.id, p.avatar_url]));
  const maxMedian = Math.max(1, ...columns.map((c) => Number(c.median_hours)));
  const maxFinished = Math.max(1, ...people.map((p) => Number(p.completed)));

  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: t("reports.completed"), value: String(summary.completed ?? 0) },
    { label: t("reports.created"), value: String(summary.created ?? 0) },
    { label: t("reports.avgCycle"), value: duration(summary.avg_cycle_hours, t), hint: t("reports.avgCycleHint") },
    { label: t("reports.open"), value: String(summary.open ?? 0) },
    { label: t("reports.overdue"), value: String(summary.overdue ?? 0) },
    { label: t("reports.rejected"), value: String(summary.rejected ?? 0) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("reports.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
        <nav aria-label={t("reports.period")} className="inline-flex rounded-lg border bg-background p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/reports?days=${p}`}
              aria-current={p === days ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                p === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(p === 7 ? "reports.last7" : p === 30 ? "reports.last30" : "reports.last90")}
            </Link>
          ))}
        </nav>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error.message}</p>
      )}

      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border bg-card p-4 shadow-xs">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</p>
            {tile.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.hint}</p>}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
          <div>
            <h2 className="font-semibold">{t("reports.weeklyTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("reports.weeklyDesc")}</p>
          </div>
          {weeks.length ? <WeeklyChart weeks={weeks} /> : <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
          <div>
            <h2 className="font-semibold">{t("reports.columnsTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("reports.columnsDesc")}</p>
          </div>
          {columns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            <ul className="space-y-4">
              {columns.map((c) => (
                <li key={c.status} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{t(`status.${c.status}`)}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{duration(Number(c.median_hours), t)}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {t("reports.typical")} · {t("reports.average", { time: duration(Number(c.avg_hours), t) })}
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${Math.max(2, (Number(c.median_hours) / maxMedian) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{tn("reports.basedOn", Number(c.stays))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
        <div>
          <h2 className="font-semibold">{t("reports.peopleTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("reports.peopleDesc")}</p>
        </div>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("reports.noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("reports.colPerson")}</th>
                  <th className="py-2 pr-3 font-medium">{t("reports.colFinished")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("reports.colOpen")}</th>
                  <th className="py-2 text-right font-medium">{t("reports.colOverdue")}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <Avatar id={p.user_id} name={p.full_name} url={avatars.get(p.user_id)} className="size-6 text-[10px] ring-0" />
                        {p.full_name}
                      </span>
                    </td>
                    <td className="w-1/2 py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary/80"
                            style={{ width: `${(Number(p.completed) / maxFinished) * 100}%` }}
                          />
                        </span>
                        <span className="w-8 text-right font-medium tabular-nums">{p.completed}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.open}</td>
                    <td className={cn("py-2 text-right tabular-nums", Number(p.overdue) > 0 && "font-semibold text-red-600 dark:text-red-400")}>
                      {p.overdue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
