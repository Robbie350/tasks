"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, UserPlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import type { AppNotification } from "@/lib/types";
import { getNotifications, markNotificationsRead } from "@/app/(app)/notification-actions";
import { NOTIFICATIONS_CHANGED } from "@/components/realtime-refresher";

/** Fired to ask the board to open a task's panel. */
export const OPEN_TASK = "open-task";

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => setItems(await getNotifications()), []);

  useEffect(() => {
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [load]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.is_read).length;

  async function openItem(n: AppNotification) {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(OPEN_TASK, { detail: n.task_id }));
    if (!n.is_read) {
      setItems((list) => list.map((x) => (x.task_id === n.task_id ? { ...x, is_read: true } : x)));
      await markNotificationsRead({ taskId: n.task_id });
    }
  }

  async function markAll() {
    setItems((list) => list.map((x) => ({ ...x, is_read: true })));
    await markNotificationsRead();
  }

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative"
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4.5 font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-muted",
                      !n.is_read && "bg-sky-50/60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        n.type === "rejected" ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"
                      )}
                    >
                      {n.type === "rejected" ? <Undo2 className="size-3.5" /> : <UserPlus className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {n.type === "rejected" ? "Your task was rejected" : "You were assigned"}
                      </span>
                      <span className="block truncate font-medium">{n.task_title}</span>
                      <span className="block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.is_read && <span className="mt-2 size-2 shrink-0 rounded-full bg-sky-500" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
