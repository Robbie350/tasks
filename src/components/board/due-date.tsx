"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function localToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Due date as "12 Nov"; red when overdue in the viewer's own time zone. */
export function DueDate({ date, done }: { date: string; done: boolean }) {
  // "Today" depends on the viewer's clock, so work it out in the browser.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localToday()), []);

  const [y, m, d] = date.split("-").map(Number);
  const overdue = !done && today !== null && date < today;
  const label = `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
      )}
      title={overdue ? "Overdue" : "Due date"}
    >
      <CalendarDays className="size-3.5" aria-hidden />
      {label}
      {overdue && <span className="sr-only">(overdue)</span>}
    </span>
  );
}
