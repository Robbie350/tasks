"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/lib/types";

type Row = Omit<AppNotification, "task_title"> & { tasks: { title: string } | null };

/** The signed-in user's latest notifications (RLS: own rows only). */
export async function getNotifications(): Promise<AppNotification[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("id, task_id, type, is_read, created_at, tasks(title)")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<Row[]>();
    if (error) return [];
    return (data ?? []).map(({ tasks, ...n }) => ({ ...n, task_title: tasks?.title ?? "A task" }));
  } catch {
    return [];
  }
}

/** Mark some (ids), a task's, or all of my notifications as read. */
export async function markNotificationsRead(opts: { ids?: string[]; taskId?: string } = {}) {
  try {
    const supabase = await createClient();
    await supabase.rpc("mark_notifications_read", {
      p_ids: opts.ids ?? null,
      p_task_id: opts.taskId ?? null,
    });
  } catch (e) {
    console.error("mark_notifications_read failed", e);
  }
  revalidatePath("/");
}
