export type Role = "admin" | "manager" | "specialist";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  specialist: "Specialist",
};

export type TaskStatus = "unassigned" | "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null; // YYYY-MM-DD
  position: number;
  created_by: string;
  created_at: string;
  assignee_ids: string[];
};

/** Minimal person info the board needs for names and avatars. */
export type Person = Pick<Profile, "id" | "full_name" | "role" | "is_active">;

export const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "unassigned", label: "Unassigned" },
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
