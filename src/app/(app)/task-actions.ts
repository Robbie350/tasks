"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/lib/types";

// Thin wrappers around the database functions. Each runs with the signed-in
// user's session, and the database checks whether they're allowed.

export type ActionResult = { ok: true } | { ok: false; error: string };

async function call(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    console.error(`${fn} failed`, e);
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function grabTask(taskId: string) {
  return call("grab_task", { p_task_id: taskId });
}

export async function joinTask(taskId: string) {
  return call("join_task", { p_task_id: taskId });
}

export async function leaveTask(taskId: string) {
  return call("leave_task", { p_task_id: taskId });
}

export async function moveTask(taskId: string, to: TaskStatus) {
  return call("move_task", { p_task_id: taskId, p_to: to });
}

export async function approveTask(taskId: string) {
  return call("approve_task", { p_task_id: taskId });
}

export async function rejectTask(taskId: string, note: string) {
  if (!note.trim()) return { ok: false, error: "Write a note saying what needs to change." } as const;
  return call("reject_task", { p_task_id: taskId, p_note: note.trim() });
}

export async function updateTask(
  taskId: string,
  input: { title: string; description: string; priority: TaskPriority; dueDate: string }
) {
  if (!input.title.trim()) return { ok: false, error: "Give the task a title." } as const;
  return call("update_task", {
    p_task_id: taskId,
    p_title: input.title.trim(),
    p_description: input.description.trim() || null,
    p_priority: input.priority,
    p_due_date: input.dueDate || null,
  });
}
