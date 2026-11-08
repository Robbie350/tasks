export type Role = "admin" | "manager" | "specialist";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  theme: import("@/lib/preferences").Theme;
  accent: import("@/lib/preferences").Accent;
  locale: import("@/lib/preferences").Locale;
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
  notes_count: number;
};

export type Note = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  is_rejection: boolean;
  created_at: string;
  updated_at: string;
};

export type ActivityAction =
  | "created"
  | "assigned"
  | "grabbed"
  | "joined"
  | "left"
  | "moved"
  | "approved"
  | "rejected"
  | "edited";

export type Activity = {
  id: number;
  task_id: string;
  actor_id: string;
  action: ActivityAction;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  details: Record<string, unknown>;
  created_at: string;
};

/** Minimal person info the board needs for names and avatars. */
export type Person = Pick<Profile, "id" | "full_name" | "role" | "is_active">;

/** Board columns, left to right. Labels come from the dictionary: status.<status>. */
export const COLUMNS: { status: TaskStatus }[] = [
  { status: "unassigned" },
  { status: "todo" },
  { status: "in_progress" },
  { status: "review" },
  { status: "done" },
];


export type AppNotification = {
  id: string;
  task_id: string;
  type: "assigned" | "rejected";
  is_read: boolean;
  created_at: string;
  task_title: string;
};
