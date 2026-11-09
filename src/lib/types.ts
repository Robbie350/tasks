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
  label_ids: string[];
  done_at: string | null;
  checklist: PCheckItem[];
  attachments_count: number;
};

export type Attachment = {
  id: string;
  task_id: string;
  uploaded_by: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
};

/** Largest file people can attach to a task (matches the storage bucket limit). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Team label (shared by everyone, managed by managers). Same shape as personal labels. */
export type TeamLabel = { id: string; name: string; color: string };

/** Done tasks older than this disappear from the board until "Show archived". */
export const ARCHIVE_AFTER_DAYS = 14;

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
  | "edited"
  | "attached"
  | "detached";

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

// ---------------------------------------------------------------------------
// Personal board
// ---------------------------------------------------------------------------
export type PColumn = { id: string; title: string; color: string; position: number };
export type PLabel = { id: string; name: string; color: string };
export type PCheckItem = { id: string; text: string; done: boolean };
export type PCard = {
  id: string;
  column_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: TaskPriority | null;
  label_ids: string[];
  checklist: PCheckItem[];
  position: number;
};
export type PersonalBoardData = {
  columns: PColumn[];
  cards: PCard[];
  labels: PLabel[];
  background: string;
};
