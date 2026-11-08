"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Activity, Note, Person, Task } from "@/lib/types";
import { useT } from "@/i18n/client";
import type { Translator } from "@/i18n";
import type { Me } from "@/lib/rules";
import { addNote, deleteNote, editNote, getTaskDetails } from "@/app/(app)/task-actions";
import { timeAgo } from "@/lib/time";
import type { BoardActions } from "./board";
import { Avatar } from "./avatar";


function Time({ iso }: { iso: string }) {
  const { t, locale } = useT();
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString(locale)}>
      {timeAgo(iso, locale, t("history.justNow"))}
    </time>
  );
}

// ---------------------------------------------------------------------------
// Activity sentences, e.g. "Aziz moved this to Review".
// ---------------------------------------------------------------------------
function describe(a: Activity, people: Map<string, Person>, t: Translator["t"]) {
  const name = (id: unknown) =>
    (typeof id === "string" && people.get(id)?.full_name) || t("common.someone");
  const column = a.to_status ? t(`status.${a.to_status}`) : "";
  switch (a.action) {
    case "created":
      return t("history.created", { column });
    case "assigned":
      return t("history.assigned", { name: name(a.details.user_id) });
    case "grabbed":
      return t("history.grabbed");
    case "joined":
      return t("history.joined");
    case "left":
      return a.to_status === "unassigned" ? t("history.leftUnassigned") : t("history.left");
    case "moved":
      return t("history.moved", { column });
    case "approved":
      return t("history.approved");
    case "rejected":
      return t("history.rejected");
    case "edited": {
      const fields = Array.isArray(a.details.fields) ? (a.details.fields as string[]) : [];
      const label = (f: string) =>
        f === "due date" ? t("history.fields.dueDate")
        : f === "title" || f === "description" || f === "priority" ? t(`history.fields.${f}`)
        : f;
      return fields.length
        ? t("history.editedFields", { fields: fields.map(label).join(", ") })
        : t("history.editedGeneric");
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
  const { t, tr } = useT();
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
      setLoadError(tr(res.error));
    }
  }, [task.id, tr]);

  // Reload when the task changes (moved, joined, edited, new note...).
  const version = [task.status, task.assignee_ids.join(), task.notes_count, task.title, task.priority, task.due_date, task.description].join("|");
  useEffect(() => {
    load();
  }, [load, version]);

  const canWrite = me.role === "manager" || me.role === "specialist";

  return (
    <section className="space-y-3">
      <div role="tablist" aria-label={t("history.tabsLabel")} className="flex gap-1 border-b">
        {(["notes", "activity"] as const).map((tabName) => (
          <button
            key={tabName}
            role="tab"
            aria-selected={tab === tabName}
            onClick={() => setTab(tabName)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === tabName
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tabName === "notes"
              ? notes ? t("history.notesCount", { n: notes.length }) : t("history.notes")
              : t("history.activity")}
          </button>
        ))}
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {tab === "notes" ? (
        <div role="tabpanel" className="space-y-4">
          {notes === null && !loadError && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {notes?.length === 0 && <p className="text-sm text-muted-foreground">{t("history.noNotes")}</p>}
          <ul className="space-y-3">
            {notes?.map((n) => (
              <NoteItem key={n.id} note={n} people={people} me={me} actions={actions} />
            ))}
          </ul>
          {canWrite && <NoteComposer taskId={task.id} actions={actions} />}
        </div>
      ) : (
        <div role="tabpanel">
          {activity === null && !loadError && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          <ol className="space-y-3">
            {activity?.map((a) => {
              const actor = people.get(a.actor_id);
              return (
                <li key={a.id} className="flex gap-3 text-sm">
                  <Avatar id={a.actor_id} name={actor?.full_name ?? "?"} className="size-6 text-[10px] ring-0" />
                  <p className="min-w-0 flex-1">
                    <span className="font-medium">{actor?.full_name ?? t("common.someone")}</span>{" "}
                    {describe(a, people, t)}
                    <span className="text-muted-foreground"> · <Time iso={a.created_at} /></span>
                  </p>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("history.logLocked")}
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
  const { t } = useT();
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
        note.is_rejection ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "bg-background"
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
        <Avatar id={note.author_id} name={author?.full_name ?? "?"} className="size-6 text-[10px] ring-0" />
        <span className="font-medium">{author?.full_name ?? t("common.formerUser")}</span>
        {author && !author.is_active && <span className="text-muted-foreground">({t("common.inactive")})</span>}
        <span className="text-muted-foreground">
          <Time iso={note.created_at} />
          {edited && ` · ${t("history.edited")}`}
        </span>
        {note.is_rejection && (
          <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {t("history.rejection")}
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
              {t("common.save")}
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
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
      )}

      {mine && !editing && (
        <div className="mt-2 flex gap-3 text-xs">
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </button>
          <button
            className="text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={async () => {
              if (!confirm(t("history.deleteConfirm"))) return;
              setBusy(true);
              await actions.run(() => deleteNote(note.id));
              setBusy(false);
            }}
          >
            {t("common.delete")}
          </button>
        </div>
      )}
    </li>
  );
}

function NoteComposer({ taskId, actions }: { taskId: string; actions: BoardActions }) {
  const { t } = useT();
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
        aria-label={t("history.addNoteLabel")}
        placeholder={t("history.addNotePlaceholder")}
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
        <span className="text-xs text-muted-foreground">{t("history.ctrlEnter")}</span>
        <Button size="sm" type="submit" disabled={busy || !body.trim()}>
          {busy ? t("history.adding") : t("history.addNote")}
        </Button>
      </div>
    </form>
  );
}
