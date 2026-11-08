// Colour choices for the personal board. Class names are written out in full
// so Tailwind keeps them.

export const COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const;
export type ColorName = (typeof COLORS)[number];

export const BACKGROUNDS = ["none", "sky", "mint", "sand", "rose", "lavender", "slate"] as const;
export type Background = (typeof BACKGROUNDS)[number];

export const isColor = (c: string): c is ColorName => (COLORS as readonly string[]).includes(c);
export const isBackground = (b: string): b is Background => (BACKGROUNDS as readonly string[]).includes(b);

/** Solid dot / swatch. */
export const DOT: Record<ColorName, string> = {
  gray: "bg-zinc-400",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

/** Column body tint. */
export const COLUMN_BG: Record<ColorName, string> = {
  gray: "bg-zinc-100 dark:bg-zinc-900",
  blue: "bg-blue-50 dark:bg-blue-950/40",
  green: "bg-green-50 dark:bg-green-950/40",
  yellow: "bg-yellow-50 dark:bg-yellow-950/30",
  orange: "bg-orange-50 dark:bg-orange-950/40",
  red: "bg-red-50 dark:bg-red-950/40",
  purple: "bg-purple-50 dark:bg-purple-950/40",
  pink: "bg-pink-50 dark:bg-pink-950/40",
};

/** Column top stripe. */
export const COLUMN_TOP: Record<ColorName, string> = {
  gray: "border-t-zinc-400",
  blue: "border-t-blue-500",
  green: "border-t-green-500",
  yellow: "border-t-yellow-400",
  orange: "border-t-orange-500",
  red: "border-t-red-500",
  purple: "border-t-purple-500",
  pink: "border-t-pink-500",
};

/** Label chip. */
export const CHIP: Record<ColorName, string> = {
  gray: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
};

/** Whole-board background. */
export const BOARD_BG: Record<Background, string> = {
  none: "",
  sky: "bg-gradient-to-br from-sky-100 to-blue-50 dark:from-sky-950/60 dark:to-slate-950",
  mint: "bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-950/50 dark:to-slate-950",
  sand: "bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-950/40 dark:to-stone-950",
  rose: "bg-gradient-to-br from-rose-100 to-pink-50 dark:from-rose-950/50 dark:to-slate-950",
  lavender: "bg-gradient-to-br from-violet-100 to-indigo-50 dark:from-violet-950/50 dark:to-slate-950",
  slate: "bg-gradient-to-br from-slate-200 to-zinc-100 dark:from-slate-900 dark:to-zinc-950",
};

export const BOARD_SWATCH: Record<Background, string> = {
  none: "bg-background",
  sky: "bg-sky-200",
  mint: "bg-emerald-200",
  sand: "bg-amber-200",
  rose: "bg-rose-200",
  lavender: "bg-violet-200",
  slate: "bg-slate-300",
};
