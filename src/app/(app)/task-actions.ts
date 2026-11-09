"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getArchivedTasks } from "@/lib/board";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_ATTACHMENT_BYTES,
  type Activity,
  type Attachment,
  type Note,
  type PCheckItem,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";

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
  | { ok: true; notes: Note[]; activity: Activity[]; attachments: Attachment[] }
  | { ok: false; error: string };

/** Notes (oldest first) and activity (newest first) for the task panel. */
export async function getTaskDetails(taskId: string): Promise<TaskDetails> {
  try {
    const supabase = await createClient();
    const [notes, activity, attachments] = await Promise.all([
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
      supabase
        .from("task_attachments")
        .select("id, task_id, uploaded_by, file_name, size_bytes, mime_type, created_at")
        .eq("task_id", taskId)
        .order("created_at")
        .returns<Attachment[]>(),
    ]);
    if (notes.error) return { ok: false, error: notes.error.message };
    if (activity.error) return { ok: false, error: activity.error.message };
    return {
      ok: true,
      notes: notes.data ?? [],
      activity: activity.data ?? [],
      // Before the Phase E script runs this table doesn't exist; show no files.
      attachments: attachments.error ? [] : (attachments.data ?? []),
    };
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

// ---------------------------------------------------------------------------
// Checklists and attachments (Phase E)
// ---------------------------------------------------------------------------

export async function setTaskChecklist(taskId: string, checklist: PCheckItem[]) {
  return call("set_task_checklist", { p_task_id: taskId, p_checklist: checklist });
}

const BUCKET = "task-files";
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

/** Storage keys allow only simple characters; the real name is kept in the table. */
function storageSafe(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^A-Za-z0-9]/g, "").slice(0, 10) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "file";
  return ext ? `${base}.${ext}` : base;
}

export async function uploadAttachment(formData: FormData): Promise<ActionResult> {
  const taskId = String(formData.get("taskId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Files can be up to 25 MB." };

  try {
    const supabase = await createClient();
    // Permission check first, with the user's own session.
    const { error: denied } = await supabase.rpc("can_attach", { p_task_id: taskId });
    if (denied) return { ok: false, error: denied.message };

    const path = `${taskId}/${crypto.randomUUID()}-${storageSafe(file.name)}`;
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      console.error("upload failed", upErr);
      return { ok: false, error: "Couldn't upload the file. Try again." };
    }

    const { error } = await supabase.rpc("add_attachment", {
      p_task_id: taskId,
      p_path: path,
      p_file_name: file.name.slice(0, 200),
      p_size: file.size,
      p_mime: file.type || null,
    });
    if (error) {
      await admin.storage.from(BUCKET).remove([path]); // don't leave an orphan file
      return { ok: false, error: error.message };
    }
  } catch (e) {
    console.error("uploadAttachment failed", e);
    return { ok: false, error: OFFLINE };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAttachment(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: path, error } = await supabase.rpc("remove_attachment", { p_id: id });
    if (error) return { ok: false, error: error.message };
    if (typeof path === "string") await createAdminClient().storage.from(BUCKET).remove([path]);
  } catch (e) {
    console.error("deleteAttachment failed", e);
    return { ok: false, error: OFFLINE };
  }
  revalidatePath("/");
  return { ok: true };
}

/** A download link valid for one minute, for signed-in active users only. */
export async function getAttachmentUrl(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    // RLS: only active users can see the row (and so learn the path).
    const { data, error } = await supabase
      .from("task_attachments")
      .select("path, file_name")
      .eq("id", id)
      .maybeSingle<{ path: string; file_name: string }>();
    if (error || !data) return { ok: false, error: "That file no longer exists." };

    const { data: signed, error: signErr } = await createAdminClient()
      .storage.from(BUCKET)
      .createSignedUrl(data.path, 60, { download: data.file_name });
    if (signErr || !signed) return { ok: false, error: "Couldn't open the file." };
    return { ok: true, url: signed.signedUrl };
  } catch (e) {
    console.error("getAttachmentUrl failed", e);
    return { ok: false, error: OFFLINE };
  }
}
