"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/time";
import { useT } from "@/i18n/client";

export type Week = { week_start: string; completed: number };

/** Single-series column chart: tasks finished per week. Hover or focus a bar for its value. */
export function WeeklyChart({ weeks }: { weeks: Week[] }) {
  const { t, tn } = useT();
  const [active, setActive] = useState<number | null>(null);
  const months = t("dates.monthsShort");
  const max = Math.max(1, ...weeks.map((w) => w.completed));
  // Recessive gridlines at 0, half and the top (rounded to whole tasks).
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const label = (w: Week) =>
    `${t("reports.weekOf", { date: formatDay(w.week_start, months) })}: ${tn("reports.finished", w.completed)}`;

  return (
    <div>
      {/* Top margin leaves room for the top axis label and the hover tooltip. */}
      <div className="relative mt-8 h-44 pl-7">
        {/* gridlines + y labels */}
        {ticks.map((v) => (
          <div key={v} className="absolute inset-x-0 flex items-center" style={{ bottom: `${(v / max) * 100}%` }}>
            <span className="w-6 -translate-y-1/2 pr-1 text-right text-[10px] text-muted-foreground tabular-nums">{v}</span>
            <span className="h-px flex-1 -translate-y-1/2 bg-border" />
          </div>
        ))}
        {/* bars */}
        <div className="absolute inset-y-0 right-0 left-7 flex items-end gap-0.5">
          {weeks.map((w, i) => (
            <button
              key={w.week_start}
              type="button"
              aria-label={label(w)}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 items-end justify-center outline-none"
            >
              <span
                className={cn(
                  "w-full max-w-7 rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary group-focus-visible:bg-primary",
                  w.completed === 0 && "bg-transparent"
                )}
                style={{ height: `${(w.completed / max) * 100}%` }}
              />
              {active === i && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
                >
                  {label(w)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {/* x labels: first, middle and last week, to avoid collisions */}
      <div className="mt-1 flex justify-between pl-7 text-[10px] text-muted-foreground">
        {[weeks[0], weeks[Math.floor(weeks.length / 2)], weeks.at(-1)].filter(Boolean).map((w) => (
          <span key={w!.week_start}>{formatDay(w!.week_start, months)}</span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{t("reports.tableView")}</summary>
        <table className="mt-2 w-full text-left text-xs">
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week_start} className="border-b last:border-0">
                <td className="py-1">{t("reports.weekOf", { date: formatDay(w.week_start, months) })}</td>
                <td className="py-1 text-right tabular-nums">{w.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
