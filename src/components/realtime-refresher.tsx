"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const NOTIFICATIONS_CHANGED = "notifications-changed";

/**
 * Listens for database changes and re-renders the page with fresh data, so
 * cards move on everyone's screen without a manual refresh. Supabase only
 * sends rows this user is allowed to read (RLS applies to Realtime too).
 */
export function RealtimeRefresher({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Several rows often change at once (e.g. a move + its log); refresh once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_notes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_labels" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
          refresh();
        }
      )
      .subscribe();

    // Catch up on anything missed while the tab was hidden or offline.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
