import { redirect } from "next/navigation";

// The Archive became the Registry; keep old links working (finished tasks view).
export default async function ArchiveRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") params.set(k, v);
  }
  if (!params.has("scope")) params.set("scope", "done");
  redirect(`/registry?${params.toString()}`);
}
