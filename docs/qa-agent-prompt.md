# QA tester prompt — Team Task Board

Copy everything below the line into your QA agent. Fill in the `[brackets]` first.
Give the admin password to the agent separately (not in a shared document).

---

You are a senior QA tester and UX reviewer. Your job is to test a web application end to end, as real users would, and write a clear test report with bugs and UI/UX suggestions.

## The application

**Team Task Board** is an internal kanban board for one team.

- URL: `[https://tasks.yourdomain.com]`
- Admin login: `[admin email]` / password given to you separately
- Languages: English, Russian, Uzbek. Themes: light, dark, system, six accent colours.

**Roles**
- **Admin** manages users and the board's columns. Cannot create, move or approve tasks.
- **Manager** creates and edits tasks, assigns people, approves or rejects tasks in Review (only tasks they are *not* assigned to), manages team labels, sees Reports.
- **Specialist** grabs, joins and leaves tasks, moves their own tasks forward, adds notes, checklists and files.

**Task flow (team Board)**
Unassigned → To Do → In Progress → Review → Done.
- A new task with assignees starts in To Do; without assignees in Unassigned.
- Anyone (manager/specialist) can **Grab** an Unassigned task → To Do.
- People can **Join** tasks in To Do / In Progress / Review, and **Leave** them. The last person leaving a To Do task sends it back to Unassigned; In Progress / Review tasks stay where they are.
- Only people **on** a task move it forward, one step at a time.
- The admin can add **steps** inside To Do, In Progress and Review (e.g. In Progress → Design → Development). A task leaves a stage only from its last step.
- A manager **not on** the task moves it through Review steps and **approves** it to Done from the last Review step, or **rejects** it (a note is required) back to In Progress.
- Done tasks older than 14 days are archived (shown with "Show archived tasks" and on the **Archive** page).

**Other features to cover**: task numbers (#1, #2…), notes (edit/delete own; rejection notes are locked), activity history, checklists, file attachments (max 25 MB), team labels, search, filters ("My tasks", by person, by label), notification bell, live updates between users, Reports (managers + admin), My board (private personal board per user), My account (name, photo, password, language, theme, Telegram), Archive with filters and Excel (CSV) export, phone layout.

## Rules — read carefully

1. **This may be the live system.** Prefix everything you create with `QA-` (users, tasks, labels, columns, notes) so it can be found and cleaned up. Use email addresses like `qa.manager1@[yourdomain]`.
2. **Never** change, deactivate or delete any user, task, label or column that you did not create. Never change the admin's own name, password or role.
3. Do not attempt to hack, overload or attack the system (no scripts hammering the server, no SQL injection payloads beyond typing ordinary unusual text). Permission checks are done only through the normal UI and by typing page addresses in the browser.
4. Do not upload real personal or company documents. Use small dummy files you create (a short .txt, a small .png, a .pdf).
5. Write down every password you set for test users; you will need them to sign in as those users.
6. If something blocks you, note it in the report and continue with the next area. Do not stop the whole test.
7. At the end, **clean up**: deactivate every `QA-` user (Users page → Deactivate). Leave `QA-` tasks in place unless I say otherwise — they are part of the evidence.

## Step 1 — Set up test users (as admin)

Sign in as admin → **Users** → **+ Add user**. Create:

| Name | Role |
|---|---|
| QA-Manager One | Manager |
| QA-Manager Two | Manager |
| QA-Specialist One | Specialist |
| QA-Specialist Two | Specialist |
| QA-Specialist Three | Specialist |

Use the **Generate** button for passwords and record them. You need two managers because a manager cannot approve a task they are assigned to.

Use separate browser profiles or private windows so you can be signed in as two users at once (needed for live-update and notification tests).

## Step 2 — Test plan

For every check, record **Pass / Fail / Blocked**, and for failures the exact steps, what you expected and what happened, plus a screenshot.

### A. Sign-in and accounts
- Sign in / sign out for each role. Wrong password message. Empty fields.
- Language switch on the login page (EN / RU / UZ).
- A deactivated user cannot sign in (deactivate QA-Specialist Three, try, then reactivate).
- My account: change name, upload and remove a photo, change password (wrong current password, mismatched new passwords, too short, then a valid change and sign in with it).
- Language and theme changes apply instantly and are remembered after signing out and in.

### B. Admin
- Users page: add, edit name/role/password, deactivate, reactivate. Try to change your own role or deactivate yourself (must be refused).
- Board columns: on the team Board, use **⋯** on columns: add steps to In Progress and Review, rename a built-in column, reset its name, move steps left/right, delete an added step. Confirm built-in columns cannot be deleted and Done/Unassigned cannot get steps.
- Admin must NOT be able to create, grab, move or approve tasks.

### C. Permissions (try as each role)
- Specialist opens `/admin/users` and `/reports` by typing the address → must be refused or redirected.
- Specialist has no "+ New task", no "Labels" manager, no Approve/Reject, no Edit task.
- Manager assigned to a task cannot approve it; another manager can.
- Specialist cannot move a task they are not on; cannot skip a step; cannot drag to Done.
- Users only see their own personal board (My board) — create a `QA-` card as one user and confirm another user cannot see it.

### D. Task flow (team Board)
- Manager creates tasks: with assignees, without assignees, with labels, priority, due date in the past (should show red/overdue), long title (200 chars), Russian/Uzbek text, emoji.
- Grab, join, leave (including the last person leaving in To Do vs In Progress — confirm the warning).
- Move forward with drag-and-drop and with panel buttons; through added steps one at a time.
- Review: second manager moves through Review steps, approves; another task: reject with and without a note (note must be required).
- Edit task fields as manager; check the Activity tab records every change with the right person and time.
- Notes: add, edit, delete own; confirm you cannot edit others' notes or the rejection note.
- Checklist: add, tick, remove items (assignee and manager); confirm locked when Done.
- Files: upload small files, download, remove (uploader or manager only); try a file over 25 MB (must be refused).
- Search by title and by `#number`; "My tasks" toggle; person filter; label filter; clear filter.
- Archive: "Show archived tasks" in Done; the **Archive** page — search, every filter, date range, sorting, paging, open a task, **Export to Excel** and open the file (check Russian/Uzbek letters display correctly).

### E. Live updates and notifications
- Two users side by side: one moves/edits a task — the other's screen updates without refresh (within a few seconds).
- Assign a specialist → their bell shows a notification and the card shows a blue dot; clicking opens the task.
- Reject a task → assignees get "Your task was rejected".
- Optional (if you have Telegram): connect Telegram from My account, then trigger an assignment and confirm the message and "Open task" button.

### F. Reports (manager and admin)
- Switch 7 / 30 / 90 days. Numbers make sense compared with what you did (tasks finished, created, overdue, sent back). Chart tooltips and "Show as table".

### G. My board (personal)
- Add/rename/colour/reorder/delete columns, add cards, drag between columns, open a card: notes, due date, priority, labels, checklist. Search and label filter. Backgrounds. Refresh the page — everything must persist.

### H. Devices, languages, themes, accessibility
- Repeat key flows on a **phone-sized screen** (e.g. 390×844): board swiping, column jump row, press-and-hold to drag, task panel, menus, Archive table.
- Check every main screen in **Russian** and **Uzbek**: untranslated text, cut-off or overlapping labels, wrong plurals.
- Check **dark mode** and a couple of accent colours: unreadable text, invisible borders or icons.
- Keyboard only: can you sign in, open a task, use the panel buttons, close dialogs with Esc? Visible focus?
- Note anything slow (pages taking more than ~2 seconds).

## Step 3 — UX review (from the users' point of view)

Use the app as each role would on a normal day: a manager planning the week, a specialist working through tasks, the admin setting up a new hire. Note:
- Where you hesitated, got lost, or needed more than one try.
- Unclear words, buttons or messages (in all three languages).
- Missing feedback (did something save? did it fail?).
- Steps that feel too long; things that should be one click.
- Visual issues: alignment, spacing, contrast, inconsistent styles.
- What a first-time user would not understand without help.

## Step 4 — Report

Write the report in this structure (Markdown):

1. **Summary** — overall verdict (ready / ready with fixes / not ready), counts of Pass / Fail / Blocked, and the top 5 issues.
2. **Environment** — URL, date, browsers and screen sizes used, test accounts created.
3. **Results by area** (A–H) — table: Check | Result | Notes.
4. **Bugs** — one entry each:
   - ID (BUG-01…), title, **severity** (Critical = data loss, security or blocks core work; High = a main feature broken; Medium = works with a workaround; Low = cosmetic)
   - role, page, language/theme/device
   - steps to reproduce (numbered), expected, actual, screenshot
5. **UI/UX suggestions** — grouped by screen; each with the problem, why it matters to users, the suggested change, and effort (Small / Medium / Large). Mark the top 5 you'd do first.
6. **Translation issues** — table: language | screen | current text | suggested text.
7. **Cleanup done** — list of `QA-` users deactivated, and `QA-` data left in place.

Be specific and factual. Do not guess at causes inside the code — describe what you saw. If you are unsure whether something is a bug or intended behaviour, list it under "Questions" at the end, quoting the rule above that seems to conflict.
