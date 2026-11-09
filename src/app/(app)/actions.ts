"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendTaskNotifications } from "@/lib/telegram";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CreateTaskResult = { ok: true } | { ok: false; error: string };

const PRIORITIES = ["low", "medium", "high"];

export async function createTask(
  _prev: CreateTaskResult | null,
  formData: FormData
): Promise<CreateTaskResult> {
  // Friendly early check; the database function enforces the same rule.
  const me = await getCurrentProfile();
  if (!me || me.role !== "manager") return { ok: false, error: "Only managers can create tasks." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "medium");
  const dueDate = String(formData.get("due_date") ?? "");
  const assigneeIds = formData.getAll("assignees").map(String);
  const labelIds = formData.getAll("labels").map(String);

  if (!title) return { ok: false, error: "Give the task a title." };
  if (title.length > 200) return { ok: false, error: "Keep the title under 200 characters." };
  if (!PRIORITIES.includes(priority)) return { ok: false, error: "Choose a priority." };
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
    return { ok: false, error: "That due date isn't valid." };

  try {
    const supabase = await createClient();
    const { data: taskId, error } = await supabase.rpc("create_task", {
      p_title: title,
      p_description: description || null,
      p_priority: priority,
      p_due_date: dueDate || null,
      p_assignee_ids: assigneeIds,
    });
    if (error) return { ok: false, error: error.message };
    if (labelIds.length > 0 && taskId) {
      await supabase.rpc("set_task_labels", { p_task_id: taskId, p_label_ids: labelIds });
    }
  } catch (e) {
    console.error("create_task failed", e);
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }

  after(sendTaskNotifications);
  revalidatePath("/");
  return { ok: true };
}
