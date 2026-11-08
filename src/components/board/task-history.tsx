"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COLUMNS, type Activity, type Note, type Person, type Task } from "@/lib/types";
import type { Me } from "@/lib/rules";
import { addNote, deleteNote, editNote, getTaskDetails } from "@/app/(app)/task-actions";
import type { BoardActions } from "./board";
import { Avatar } from "./avatar";

const STATUS_LABEL = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label]));

// ---------------------------------------------------------------------------
// Time helpers: "2h ago", with the full date on hover.
// ---------------------------------------------------------------------------
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Time({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {timeAgo(iso)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// Activity sentences, e.g. "Aziz moved this to Review".
// ---------------------------------------------------------------------------
function describe(a: Activity, people: Map<string, Person>) {
  const name = (id: unknown) => (typeof id === "string" && people.get(id)?.full_name) || "someone";
  const to = a.to_status ? STATUS_LABEL[a.to_status] : "";
  switch (a.action) {
    case "created":
      return `created this task in ${to}`;
    case "assigned":
      return `assigned ${name(a.details.user_id)}`;
    case "grabbed":
      return "grabbed this task";
    case "joined":
      return "joined";
    case "left":
      return a.to_status === "unassigned" ? "left — it went back to Unassigned" : "left";
    case "moved":
      return `moved this to ${to}`;
    case "approved":
      return "approved this → Done";
    case "rejected":
      return "rejected this → In Progress";
    case "edited": {
      const fields = Array.isArray(a.details.fields) ? (a.details.fields as string[]) : [];
      return fields.length ? `edited the ${fields.join(", ")}` : "edited this task";
    }
    default:
      return a.action;
  }
}

// ---------------------------------------------------------------------------

export function TaskHistory({
  task,
  people,
  me,
  actions,
}: {
  task: Task;
  people: Map<string, Person>;
  me: Me;
  actions: BoardActions;
}) {
  const [tab, setTab] = useState<"notes" | "activity">("notes");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getTaskDetails(task.id);
    if (res.ok) {
      setNotes(res.notes);
      setActivity(res.activity);
      setLoadError(null);
    } else {
      setLoadError(res.error);
    }
  }, [task.id]);

  // Reload when the task changes (moved, joined, edited, new note...).
  const version = [task.status, task.assignee_ids.join(), task.notes_count, task.title, task.priority, task.due_date, task.description].join("|");
  useEffect(() => {
    load();
  }, [load, version]);

  const canWrite = me.role === "manager" || me.role === "specialist";

  return (
    <section className="space-y-3">
      <div role="tablist" aria-label="Task history" className="flex gap-1 border-b">
        {(["notes", "activity"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "notes" ? `Notes${notes ? ` (${notes.length})` : ""}` : "Activity"}
          </button>
        ))}
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {tab === "notes" ? (
        <div role="tabpanel" className="space-y-4">
          {notes === null && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
          {notes?.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
          <ul className="space-y-3">
            {notes?.map((n) => (
              <NoteItem key={n.id} note={n} people={people} me={me} actions={actions} />
            ))}
          </ul>
          {canWrite && <NoteComposer taskId={task.id} actions={actions} />}
        </div>
      ) : (
        <div role="tabpanel">
          {activity === null && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
          <ol className="space-y-3">
            {activity?.map((a) => {
              const actor = people.get(a.actor_id);
              return (
                <li key={a.id} className="flex gap-3 text-sm">
                  <Avatar id={a.actor_id} name={actor?.full_name ?? "?"} className="size-6 text-[10px] ring-0" />
                  <p className="min-w-0 flex-1">
                    <span className="font-medium">{actor?.full_name ?? "Someone"}</span>{" "}
                    {describe(a, people)}
                    <span className="text-muted-foreground"> · <Time iso={a.created_at} /></span>
                  </p>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            The activity log is recorded automatically and can&apos;t be changed.
          </p>
        </div>
      )}
    </section>
  );
}

function NoteItem({
  note,
  people,
  me,
  actions,
}: {
  note: Note;
  people: Map<string, Person>;
  me: Me;
  actions: BoardActions;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const author = people.get(note.author_id);
  const mine = note.author_id === me.id && !note.is_rejection;
  const edited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 1000;

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        note.is_rejection ? "border-red-200 bg-red-50" : "bg-background"
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
        <Avatar id={note.author_id} name={author?.full_name ?? "?"} className="size-6 text-[10px] ring-0" />
        <span className="font-medium">{author?.full_name ?? "Former user"}</span>
        {author && !author.is_active && <span className="text-muted-foreground">(inactive)</span>}
        <span className="text-muted-foreground">
          <Time iso={note.created_at} />
          {edited && " · edited"}
        </span>
        {note.is_rejection && (
          <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
            Rejection
          </span>
        )}
      </div>

      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await actions.run(() => editNote(note.id, body));
            setBusy(false);
            if (ok) setEditing(false);
          }}
        >
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !body.trim()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setEditing(false);
                setBody(note.body);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
      )}

      {mine && !editing && (
        <div className="mt-2 flex gap-3 text-xs">
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            className="text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Delete this note?")) return;
              setBusy(true);
              await actions.run(() => deleteNote(note.id));
              setBusy(false);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function NoteComposer({ taskId, actions }: { taskId: string; actions: BoardActions }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await actions.run(() => addNote(taskId, body));
        setBusy(false);
        if (ok) setBody("");
      }}
    >
      <Textarea
        aria-label="Add a note"
        placeholder="Add a note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Enter sends.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
        }}
        rows={3}
        maxLength={5000}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Ctrl + Enter to send</span>
        <Button size="sm" type="submit" disabled={busy || !body.trim()}>
          {busy ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
