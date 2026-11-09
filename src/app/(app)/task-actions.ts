"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getArchivedTasks } from "@/lib/board";
import type { Activity, Note, Task, TaskPriority, TaskStatus } from "@/lib/types";

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

// ---------------------------------------------------------------------------
// Notes and activity (step 6)
// ---------------------------------------------------------------------------

export type TaskDetails =
  | { ok: true; notes: Note[]; activity: Activity[] }
  | { ok: false; error: string };

/** Notes (oldest first) and activity (newest first) for the task panel. */
export async function getTaskDetails(taskId: string): Promise<TaskDetails> {
  try {
    const supabase = await createClient();
    const [notes, activity] = await Promise.all([
      supabase
        .from("task_notes")
        .select("id, task_id, author_id, body, is_rejection, created_at, updated_at")
        .eq("task_id", taskId)
        .order("created_at")
        .returns<Note[]>(),
      supabase
        .from("task_activity")
        .select("id, task_id, actor_id, action, from_status, to_status, details, created_at")
        .eq("task_id", taskId)
        .order("id", { ascending: false })
        .returns<Activity[]>(),
    ]);
    if (notes.error) return { ok: false, error: notes.error.message };
    if (activity.error) return { ok: false, error: activity.error.message };
    return { ok: true, notes: notes.data ?? [], activity: activity.data ?? [] };
  } catch (e) {
    console.error("getTaskDetails failed", e);
    return { ok: false, error: "Couldn't load notes and activity." };
  }
}

export async function addNote(taskId: string, body: string) {
  if (!body.trim()) return { ok: false, error: "A note can't be empty." } as const;
  return call("add_note", { p_task_id: taskId, p_body: body.trim() });
}

export async function editNote(noteId: string, body: string) {
  if (!body.trim()) return { ok: false, error: "A note can't be empty." } as const;
  return call("edit_note", { p_note_id: noteId, p_body: body.trim() });
}

export async function deleteNote(noteId: string) {
  return call("delete_note", { p_note_id: noteId });
}

// ---------------------------------------------------------------------------
// Archive and team labels (Phase D)
// ---------------------------------------------------------------------------

export async function loadArchivedTasks(): Promise<{ ok: true; tasks: Task[] } | { ok: false; error: string }> {
  try {
    return { ok: true, tasks: await getArchivedTasks() };
  } catch (e) {
    console.error("loadArchivedTasks failed", e);
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export async function setTaskLabels(taskId: string, labelIds: string[]) {
  return call("set_task_labels", { p_task_id: taskId, p_label_ids: labelIds });
}

const LABEL_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"];

async function labelWrite(
  fn: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string } | null }>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await fn(supabase);
    // RLS refuses non-managers; say it in plain words.
    if (error) return { ok: false, error: /row-level security/i.test(error.message) ? "Only managers can edit tasks." : error.message };
  } catch (e) {
    console.error("label write failed", e);
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function createTeamLabel(name: string, color: string) {
  if (!name.trim()) return { ok: false, error: "A label needs a name." } as const;
  const c = LABEL_COLORS.includes(color) ? color : "blue";
  return labelWrite((s) => s.from("task_labels").insert({ name: name.trim().slice(0, 30), color: c }));
}

export async function updateTeamLabel(id: string, patch: { name?: string; color?: string }) {
  const clean: { name?: string; color?: string } = {};
  if (patch.name?.trim()) clean.name = patch.name.trim().slice(0, 30);
  if (patch.color && LABEL_COLORS.includes(patch.color)) clean.color = patch.color;
  return labelWrite((s) => s.from("task_labels").update(clean).eq("id", id));
}

export async function deleteTeamLabel(id: string) {
  return labelWrite((s) => s.from("task_labels").delete().eq("id", id));
}
