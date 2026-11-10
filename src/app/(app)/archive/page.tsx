import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/i18n/server";
import { ARCHIVE_PAGE_SIZE, parseArchiveQuery, queryArchive } from "@/lib/archive";
import { sortColumns } from "@/lib/board";
import { STAGE_ORDER, type BoardColumn, type Person, type TeamLabel } from "@/lib/types";
import { ArchiveView } from "./archive-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("archive.title")} · ${t("common.appName")}` };
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const query = parseArchiveQuery(await searchParams);
  const supabase = await createClient();

  const [result, peopleRes, labelsRes, columnsRes] = await Promise.all([
    queryArchive(query),
    supabase.from("profiles").select("id, full_name, role, is_active, avatar_url").order("full_name").returns<Person[]>(),
    supabase.from("task_labels").select("id, name, color").order("name").returns<TeamLabel[]>(),
    supabase.from("board_columns").select("id, stage, title, position, is_builtin").returns<BoardColumn[]>(),
  ]);

  const columns = sortColumns(
    columnsRes.error || !columnsRes.data?.length
      ? STAGE_ORDER.map((stage) => ({ id: `builtin-${stage}`, stage, title: null, position: 0, is_builtin: true }))
      : columnsRes.data
  );

  return (
    <ArchiveView
      query={query}
      tasks={result.tasks}
      total={result.total}
      error={result.error ?? null}
      pageSize={ARCHIVE_PAGE_SIZE}
      people={peopleRes.data ?? []}
      labels={labelsRes.error ? [] : (labelsRes.data ?? [])}
      columns={columns}
      me={{ id: profile.id, role: profile.role }}
    />
  );
}
