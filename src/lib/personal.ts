import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PCard, PColumn, PLabel, PersonalBoardData } from "@/lib/types";

/** Loads the signed-in user's own board (RLS: owner only), creating starter columns once. */
export async function getPersonalBoard(defaultColumns: string[]): Promise<PersonalBoardData> {
  const supabase = await createClient();
  await supabase.rpc("ensure_personal_board", { p_titles: defaultColumns });

  const [cols, cards, labels, settings] = await Promise.all([
    supabase.from("personal_columns").select("id, title, color, position").order("position").returns<PColumn[]>(),
    supabase
      .from("personal_cards")
      .select("id, column_id, title, notes, due_date, priority, label_ids, checklist, position")
      .order("position")
      .returns<PCard[]>(),
    supabase.from("personal_labels").select("id, name, color").order("created_at").returns<PLabel[]>(),
    supabase.from("personal_settings").select("background").maybeSingle<{ background: string }>(),
  ]);

  if (cols.error) throw new Error(cols.error.message);
  if (cards.error) throw new Error(cards.error.message);

  return {
    columns: cols.data ?? [],
    cards: cards.data ?? [],
    labels: labels.data ?? [],
    background: settings.data?.background ?? "none",
  };
}
