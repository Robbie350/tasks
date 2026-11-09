"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DueDate } from "@/components/board/due-date";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import type { PCard, PColumn, PLabel, PersonalBoardData } from "@/lib/types";
import {
  BACKGROUNDS,
  BOARD_BG,
  BOARD_SWATCH,
  CHIP,
  COLORS,
  COLUMN_BG,
  COLUMN_TOP,
  DOT,
  isBackground,
  isColor,
  type Background,
  type ColorName,
} from "./palette";
import { CardEditor } from "./card-editor";
import { LabelsManager } from "./labels-manager";

const COL = "col:"; // sortable id prefix for columns
const col = (c: string): ColorName => (isColor(c) ? c : "gray");

/** A position between two neighbours (fractional ordering). */
function between(prev?: number, next?: number) {
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

export type BoardApi = {
  labels: PLabel[];
  columns: PColumn[];
  updateCard: (id: string, patch: Partial<PCard>) => void;
  /** Move a card to the bottom of another column. */
  moveCardTo: (id: string, columnId: string) => void;
  deleteCard: (id: string) => void;
  createLabel: (name: string, color: ColorName) => PLabel | null;
  updateLabel: (id: string, patch: Partial<PLabel>) => void;
  deleteLabel: (id: string) => void;
};

export function PersonalBoard({ initial }: { initial: PersonalBoardData }) {
  const { t } = useT();
  const supabase = useMemo(() => createClient(), []);
  const [columns, setColumns] = useState<PColumn[]>(initial.columns);
  const [cards, setCards] = useState<PCard[]>(initial.cards);
  const [labels, setLabels] = useState<PLabel[]>(initial.labels);
  const [background, setBackground] = useState<Background>(
    isBackground(initial.background) ? initial.background : "none"
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [active, setActive] = useState<{ type: "card" | "column"; id: string } | null>(null);
  const dragFrom = useRef<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  // ---------------------------------------------------------------------------
  // Persistence: change the screen first, save in the background. If the save
  // fails, reload everything from the database so nothing is silently lost.
  // ---------------------------------------------------------------------------
  const reload = useCallback(async () => {
    const [c, k, l] = await Promise.all([
      supabase.from("personal_columns").select("id, title, color, position").order("position"),
      supabase
        .from("personal_cards")
        .select("id, column_id, title, notes, due_date, priority, label_ids, checklist, position")
        .order("position"),
      supabase.from("personal_labels").select("id, name, color").order("created_at"),
    ]);
    if (c.data) setColumns(c.data as PColumn[]);
    if (k.data) setCards(k.data as PCard[]);
    if (l.data) setLabels(l.data as PLabel[]);
  }, [supabase]);

  const save = useCallback(
    (op: PromiseLike<{ error: unknown }>) => {
      Promise.resolve(op).then(
        ({ error: e }) => {
          if (e) {
            console.error(e);
            setError(t("personal.saveFailed"));
            reload();
          }
        },
        () => {
          setError(t("personal.saveFailed"));
          reload();
        }
      );
    },
    [reload, t]
  );

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------
  function addColumn() {
    const column: PColumn = {
      id: crypto.randomUUID(),
      title: t("personal.newColumn"),
      color: "gray",
      position: between(columns.at(-1)?.position),
    };
    setColumns((cs) => [...cs, column]);
    save(supabase.from("personal_columns").insert(column));
  }

  function updateColumn(id: string, patch: Partial<PColumn>) {
    setColumns((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    save(supabase.from("personal_columns").update(patch).eq("id", id));
  }

  function moveColumn(id: string, dir: -1 | 1) {
    const i = columns.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= columns.length) return;
    const next = arrayMove(columns, i, j);
    const position = between(next[j - 1]?.position, next[j + 1]?.position);
    setColumns(next.map((c) => (c.id === id ? { ...c, position } : c)));
    save(supabase.from("personal_columns").update({ position }).eq("id", id));
  }

  function deleteColumn(id: string) {
    const c = columns.find((x) => x.id === id);
    if (!c || !confirm(t("personal.deleteColumnConfirm", { name: c.title }))) return;
    setColumns((cs) => cs.filter((x) => x.id !== id));
    setCards((ks) => ks.filter((k) => k.column_id !== id));
    save(supabase.from("personal_columns").delete().eq("id", id));
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------
  function addCard(columnId: string, title: string) {
    const inColumn = cards.filter((k) => k.column_id === columnId);
    const card: PCard = {
      id: crypto.randomUUID(),
      column_id: columnId,
      title: title.trim(),
      notes: null,
      due_date: null,
      priority: null,
      label_ids: labelFilter ? [labelFilter] : [],
      checklist: [],
      position: between(inColumn.at(-1)?.position),
    };
    setCards((ks) => [...ks, card]);
    save(supabase.from("personal_cards").insert(card));
  }

  const updateCard = useCallback(
    (id: string, patch: Partial<PCard>) => {
      setCards((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch } : k)));
      save(supabase.from("personal_cards").update(patch).eq("id", id));
    },
    [save, supabase]
  );

  const moveCardTo = useCallback(
    (id: string, columnId: string) => {
      const last = cards.filter((k) => k.column_id === columnId && k.id !== id).at(-1);
      const position = between(last?.position);
      setCards((ks) => [...ks.filter((k) => k.id !== id), { ...ks.find((k) => k.id === id)!, column_id: columnId, position }]);
      save(supabase.from("personal_cards").update({ column_id: columnId, position }).eq("id", id));
    },
    [cards, save, supabase]
  );

  const deleteCard = useCallback(
    (id: string) => {
      setCards((ks) => ks.filter((k) => k.id !== id));
      setOpenCardId(null);
      save(supabase.from("personal_cards").delete().eq("id", id));
    },
    [save, supabase]
  );

  // ---------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------
  const createLabel = useCallback(
    (name: string, color: ColorName) => {
      if (!name.trim()) return null;
      const label: PLabel = { id: crypto.randomUUID(), name: name.trim().slice(0, 30), color };
      setLabels((ls) => [...ls, label]);
      save(supabase.from("personal_labels").insert(label));
      return label;
    },
    [save, supabase]
  );

  const updateLabel = useCallback(
    (id: string, patch: Partial<PLabel>) => {
      setLabels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      save(supabase.from("personal_labels").update(patch).eq("id", id));
    },
    [save, supabase]
  );

  const deleteLabel = useCallback(
    (id: string) => {
      setLabels((ls) => ls.filter((l) => l.id !== id));
      setCards((ks) => ks.map((k) => ({ ...k, label_ids: k.label_ids.filter((x) => x !== id) })));
      setLabelFilter((f) => (f === id ? "" : f));
      save(supabase.from("personal_labels").delete().eq("id", id));
    },
    [save, supabase]
  );

  function changeBackground(b: Background) {
    setBackground(b);
    save(
      supabase
        .from("personal_settings")
        .upsert({ background: b, updated_at: new Date().toISOString() }, { onConflict: "owner_id" })
    );
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const matches = (k: PCard) =>
    (!labelFilter || k.label_ids.includes(labelFilter)) &&
    (!q ||
      k.title.toLowerCase().includes(q) ||
      (k.notes ?? "").toLowerCase().includes(q) ||
      k.checklist.some((i) => i.text.toLowerCase().includes(q)));

  // ---------------------------------------------------------------------------
  // Drag and drop: columns sideways, cards within and between columns.
  // ---------------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Press and hold to drag on touch screens; a normal swipe scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnOf = (id: string) =>
    id.startsWith(COL) ? id.slice(COL.length) : cards.find((k) => k.id === id)?.column_id;

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(COL)) setActive({ type: "column", id: id.slice(COL.length) });
    else {
      setActive({ type: "card", id });
      dragFrom.current = cards.find((k) => k.id === id)?.column_id ?? null;
    }
  }

  // While dragging a card over another column, move it there on screen.
  function onDragOver(e: DragOverEvent) {
    if (active?.type !== "card" || !e.over) return;
    const overId = String(e.over.id);
    const from = columnOf(active.id);
    const to = columnOf(overId);
    if (!from || !to || from === to) return;
    setCards((ks) => {
      const moving = ks.find((k) => k.id === active.id);
      if (!moving) return ks;
      const rest = ks.filter((k) => k.id !== active.id);
      const moved = { ...moving, column_id: to };
      const overIndex = overId.startsWith(COL) ? -1 : rest.findIndex((k) => k.id === overId);
      if (overIndex === -1) return [...rest, moved];
      return [...rest.slice(0, overIndex), moved, ...rest.slice(overIndex)];
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const current = active;
    setActive(null);
    if (!current || !e.over) return;
    const overId = String(e.over.id);

    if (current.type === "column") {
      const from = columns.findIndex((c) => c.id === current.id);
      const to = columns.findIndex((c) => COL + c.id === overId || c.id === columnOf(overId));
      if (from < 0 || to < 0 || from === to) return;
      const next = arrayMove(columns, from, to);
      const position = between(next[to - 1]?.position, next[to + 1]?.position);
      setColumns(next.map((c) => (c.id === current.id ? { ...c, position } : c)));
      save(supabase.from("personal_columns").update({ position }).eq("id", current.id));
      return;
    }

    // Card: reorder within its (possibly new) column, then save its place.
    let next = cards;
    if (!overId.startsWith(COL) && overId !== current.id) {
      const a = cards.findIndex((k) => k.id === current.id);
      const b = cards.findIndex((k) => k.id === overId);
      if (a >= 0 && b >= 0 && cards[a].column_id === cards[b].column_id) next = arrayMove(cards, a, b);
    }
    const card = next.find((k) => k.id === current.id);
    if (!card) return;
    const siblings = next.filter((k) => k.column_id === card.column_id);
    const i = siblings.findIndex((k) => k.id === card.id);
    const position = between(siblings[i - 1]?.position, siblings[i + 1]?.position);
    const unchanged = card.column_id === dragFrom.current && position === card.position;
    setCards(next.map((k) => (k.id === card.id ? { ...k, position } : k)));
    if (!unchanged) {
      save(supabase.from("personal_cards").update({ column_id: card.column_id, position }).eq("id", card.id));
    }
  }

  // ---------------------------------------------------------------------------

  const api: BoardApi = { labels, columns, updateCard, moveCardTo, deleteCard, createLabel, updateLabel, deleteLabel };
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const openCard = cards.find((k) => k.id === openCardId) ?? null;
  const activeCard = active?.type === "card" ? cards.find((k) => k.id === active.id) : null;
  const activeColumn = active?.type === "column" ? columns.find((c) => c.id === active.id) : null;

  return (
    <div className={cn("flex h-[calc(100dvh-53px)] flex-col sm:h-[calc(100dvh-61px)]", BOARD_BG[background])}>
      <main className="flex min-h-0 flex-1 flex-col p-4 pb-0 sm:p-6 sm:pb-0">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-2">
            <h1 className="text-xl font-semibold tracking-tight">{t("personal.title")}</h1>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden /> {t("personal.private")}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("personal.search")}
              aria-label={t("personal.search")}
              className="h-8 w-44 bg-background pl-8 sm:w-52"
            />
          </div>
          <Select
            aria-label={t("personal.labels")}
            className="h-8 w-auto min-w-36 bg-background"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
          >
            <option value="">{t("personal.allLabels")}</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <LabelsManager api={api} />
          <BackgroundPicker value={background} onChange={changeBackground} />
          <div className="ml-auto">
            <Button onClick={addColumn}>
              <Plus /> {t("personal.addColumn")}
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActive(null);
            reload();
          }}
        >
          <SortableContext items={columns.map((c) => COL + c.id)} strategy={horizontalListSortingStrategy}>
            <div className="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-4 overflow-x-auto overflow-y-hidden px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0">
              {columns.map((c, i) => (
                <ColumnView
                  key={c.id}
                  column={c}
                  cards={cards.filter((k) => k.column_id === c.id && matches(k))}
                  labelById={labelById}
                  isFirst={i === 0}
                  isLast={i === columns.length - 1}
                  onRename={(title) => updateColumn(c.id, { title })}
                  onColor={(color) => updateColumn(c.id, { color })}
                  onMove={(dir) => moveColumn(c.id, dir)}
                  onDelete={() => deleteColumn(c.id)}
                  onAddCard={(title) => addCard(c.id, title)}
                  onOpenCard={setOpenCardId}
                />
              ))}
              <button
                onClick={addColumn}
                className="flex h-12 w-[85vw] shrink-0 snap-center items-center sm:w-72 justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                <Plus className="size-4" /> {t("personal.addColumn")}
              </button>
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeCard && <CardFace card={activeCard} labelById={labelById} overlay />}
            {activeColumn && (
              <div className={cn("w-72 rounded-xl border-t-4 p-3 opacity-90 shadow-lg", COLUMN_BG[col(activeColumn.color)], COLUMN_TOP[col(activeColumn.color)])}>
                <h2 className="text-sm font-semibold">{activeColumn.title}</h2>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </main>

      <CardEditor card={openCard} api={api} onClose={() => setOpenCardId(null)} />

      {error && (
        <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg bg-destructive px-4 py-3 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Column
// -----------------------------------------------------------------------------
function ColumnView({
  column,
  cards,
  labelById,
  isFirst,
  isLast,
  onRename,
  onColor,
  onMove,
  onDelete,
  onAddCard,
  onOpenCard,
}: {
  column: PColumn;
  cards: PCard[];
  labelById: Map<string, PLabel>;
  isFirst: boolean;
  isLast: boolean;
  onRename: (title: string) => void;
  onColor: (color: ColorName) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  onOpenCard: (id: string) => void;
}) {
  const { t } = useT();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: COL + column.id,
  });
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const color = col(column.color);
  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  function toggleMenu(button: HTMLElement) {
    if (menu) return setMenu(false);
    const r = button.getBoundingClientRect();
    const width = 208; // w-52
    setMenuPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
    });
    setMenu(true);
  }

  useEffect(() => {
    if (!menu) return;
    const inside = (n: Node) => menuRef.current?.contains(n) || popupRef.current?.contains(n);
    const close = (e: PointerEvent) => !inside(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const hide = () => setMenu(false); // the menu is pinned to the screen, so close it on scroll/resize
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, [menu]);

  function commitRename() {
    setRenaming(false);
    const next = title.trim().slice(0, 60);
    if (next && next !== column.title) onRename(next);
    else setTitle(column.title);
  }

  function submitCard() {
    if (draft.trim()) onAddCard(draft);
    setDraft("");
  }

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={column.title}
      className={cn(
        "flex max-h-full w-[85vw] shrink-0 snap-center flex-col rounded-xl border-t-4 p-3 sm:w-72",
        COLUMN_BG[color],
        COLUMN_TOP[color],
        isDragging && "opacity-40"
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        {renaming ? (
          <Input
            autoFocus
            aria-label={t("personal.columnName")}
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setTitle(column.title);
                setRenaming(false);
              }
            }}
            className="h-7 bg-background"
          />
        ) : (
          <h2
            {...attributes}
            {...listeners}
            onDoubleClick={() => setRenaming(true)}
            className="min-w-0 flex-1 cursor-grab truncate px-1 text-sm font-semibold active:cursor-grabbing"
            title={column.title}
          >
            {column.title}
          </h2>
        )}
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {cards.length}
        </span>
        <div ref={menuRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("personal.columnMenu")}
            aria-expanded={menu}
            onClick={(e) => toggleMenu(e.currentTarget)}
          >
            <MoreHorizontal />
          </Button>
          {menu && menuPos && createPortal(
            <div
              ref={popupRef}
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-50 w-52 space-y-1 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
            >
              <MenuButton onClick={() => { setMenu(false); setRenaming(true); }}>{t("personal.rename")}</MenuButton>
              <p className="px-2 pt-1 text-xs text-muted-foreground">{t("personal.colour")}</p>
              <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={t(`personal.colors.${c}`)}
                    title={t(`personal.colors.${c}`)}
                    aria-pressed={color === c}
                    onClick={() => onColor(c)}
                    className={cn("size-6 rounded-full", DOT[c], color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-popover")}
                  />
                ))}
              </div>
              <MenuButton disabled={isFirst} onClick={() => onMove(-1)}>
                <ChevronLeft className="size-4" /> {t("personal.moveLeft")}
              </MenuButton>
              <MenuButton disabled={isLast} onClick={() => onMove(1)}>
                <ChevronRight className="size-4" /> {t("personal.moveRight")}
              </MenuButton>
              <MenuButton danger onClick={() => { setMenu(false); onDelete(); }}>
                <Trash2 className="size-4" /> {t("personal.deleteColumn")}
              </MenuButton>
            </div>,
            document.body
          )}
        </div>
      </header>

      <SortableContext items={cards.map((k) => k.id)} strategy={verticalListSortingStrategy}>
        <div className="-mx-1 flex min-h-12 flex-col gap-2 overflow-y-auto px-1 pb-1">
          {cards.map((k) => (
            <SortableCard key={k.id} card={k} labelById={labelById} onOpen={() => onOpenCard(k.id)} />
          ))}
          {cards.length === 0 && !adding && (
            <p className="py-3 text-center text-xs text-muted-foreground">{t("personal.emptyColumn")}</p>
          )}
        </div>
      </SortableContext>

      {adding ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitCard();
          }}
        >
          <Input
            autoFocus
            value={draft}
            maxLength={200}
            placeholder={t("personal.cardPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setDraft(""))}
            onBlur={() => !draft.trim() && setAdding(false)}
            className="bg-background"
          />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={!draft.trim()}>
              {t("personal.add")}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setAdding(false); setDraft(""); }}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          <Plus className="size-4" /> {t("personal.addCard")}
        </button>
      )}
    </section>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40",
        danger && "text-destructive"
      )}
    >
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------------
function SortableCard({
  card,
  labelById,
  onOpen,
}: {
  card: PCard;
  labelById: Map<string, PLabel>;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Enter opens; Space is used by the keyboard drag sensor.
        if (e.key === "Enter") onOpen();
        listeners?.onKeyDown?.(e);
      }}
      className={cn("cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <CardFace card={card} labelById={labelById} />
    </div>
  );
}

const PRIORITY_EDGE = {
  low: "border-l-zinc-300",
  medium: "border-l-amber-400",
  high: "border-l-red-500",
} as const;

function CardFace({
  card,
  labelById,
  overlay,
}: {
  card: PCard;
  labelById: Map<string, PLabel>;
  overlay?: boolean;
}) {
  const { t } = useT();
  const cardLabels = card.label_ids.map((id) => labelById.get(id)).filter((l): l is PLabel => Boolean(l));
  const done = card.checklist.filter((i) => i.done).length;
  const total = card.checklist.length;

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-3 shadow-xs",
        card.priority ? cn("border-l-4", PRIORITY_EDGE[card.priority]) : "",
        overlay && "w-66 rotate-2 shadow-lg"
      )}
    >
      {cardLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {cardLabels.map((l) => (
            <span key={l.id} className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", CHIP[col(l.color)])}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm leading-snug font-medium break-words">{card.title}</p>
      {(card.due_date || total > 0 || card.notes) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {card.due_date && <DueDate date={card.due_date} done={total > 0 && done === total} />}
          {total > 0 && (
            <span className={cn("inline-flex items-center gap-1", done === total && "text-green-700 dark:text-green-400")}>
              <CheckSquare className="size-3.5" aria-hidden />
              {done}/{total}
              <span className="sr-only">{t("personal.checklist")}</span>
            </span>
          )}
          {card.notes && <MessageSquare className="size-3.5" aria-label={t("personal.notes")} />}
        </div>
      )}
    </article>
  );
}

// -----------------------------------------------------------------------------
// Background
// -----------------------------------------------------------------------------
function BackgroundPicker({ value, onChange }: { value: Background; onChange: (b: Background) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" className="bg-background" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={cn("size-3.5 rounded-full border", BOARD_SWATCH[value])} />
        {t("personal.background")}
      </Button>
      {open && (
        <div className="absolute z-30 mt-1 grid w-56 grid-cols-4 gap-2 rounded-lg border bg-popover p-3 shadow-lg">
          {BACKGROUNDS.map((b) => (
            <button
              key={b}
              title={t(`personal.backgrounds.${b}`)}
              aria-label={t(`personal.backgrounds.${b}`)}
              aria-pressed={value === b}
              onClick={() => {
                onChange(b);
                setOpen(false);
              }}
              className={cn(
                "h-9 rounded-md border",
                BOARD_SWATCH[b],
                value === b && "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

