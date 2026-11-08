/** "just now", "5 minutes ago", "yesterday"… in the given language; a date for older times. */
export function timeAgo(iso: string, locale: string, justNow: string, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return justNow;
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A YYYY-MM-DD date as "12 Nov" (or "12 Nov 2027" outside the current year).
 * Month names come from the dictionary, not Intl, so the server and the
 * browser always render the same text (some runtimes lack Uzbek month names).
 */
export function formatDay(date: string, monthsShort: string) {
  const [y, m, d] = date.split("-").map(Number);
  const month = monthsShort.split(",")[m - 1] ?? String(m);
  return y === new Date().getFullYear() ? `${d} ${month}` : `${d} ${month} ${y}`;
}
