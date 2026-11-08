import { cn } from "@/lib/utils";

const COLORS = [
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-card",
        colorFor(id),
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3 }: { people: { id: string; full_name: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1">
      {shown.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.full_name} />
      ))}
      {extra > 0 && (
        <span
          title={people.slice(max).map((p) => p.full_name).join(", ")}
          className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold ring-2 ring-card"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
