// Date helpers pinned to the agency's timezone (Pakistan Standard Time, UTC+5, no DST).
// Safe to use on both server and client.

export const APP_TZ = "Asia/Karachi";
const PKT_OFFSET_H = 5;

const pad = (n: number) => String(n).padStart(2, "0");

export function zonedParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function greetingFor(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/** "YYYY-MM-DD" for the given instant, in PKT. */
export function dayKey(input: string | Date): string {
  const p = zonedParts(typeof input === "string" ? new Date(input) : input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayKey() {
  return dayKey(new Date());
}

export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Weekday of a day key, Monday = 0 … Sunday = 6. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Mon–Sun day keys of the week containing `key`. */
export function weekKeys(key: string): string[] {
  const start = shiftDayKey(key, -weekdayOf(key));
  return Array.from({ length: 7 }, (_, i) => shiftDayKey(start, i));
}

/** ISO instant for a PKT wall-clock time on a given day key. */
export function pktISO(key: string, hour: number, minute = 0): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - PKT_OFFSET_H, minute)).toISOString();
}

/** Minutes since PKT midnight for an ISO instant. */
export function minuteOfDay(iso: string) {
  const p = zonedParts(new Date(iso));
  return p.hour * 60 + p.minute;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, ...opts });

const timeFmt = fmt({ hour: "numeric", minute: "2-digit" });
const dateFmt = fmt({ month: "short", day: "numeric" });
const dateYearFmt = fmt({ month: "short", day: "numeric", year: "numeric" });
const weekdayDateFmt = fmt({ weekday: "short", month: "short", day: "numeric" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateYear = (iso: string) => dateYearFmt.format(new Date(iso));
export const formatWeekdayDate = (iso: string) => weekdayDateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

export function formatToday(date = new Date()) {
  return dateYearFmt.format(date);
}

/** Human label for a day key: "Today", "Tomorrow", "Yesterday" or "Thu, Oct 8". */
export function dayLabel(key: string, today = todayKey()) {
  if (key === today) return "Today";
  if (key === shiftDayKey(today, 1)) return "Tomorrow";
  if (key === shiftDayKey(today, -1)) return "Yesterday";
  return weekdayDateFmt.format(new Date(pktISO(key, 12)));
}

/** "YYYY-MM" month key (PKT). */
export function monthKey(iso: string) {
  return dayKey(iso).slice(0, 7);
}

/** The last `n` month keys ending with the current month, oldest first. */
export function lastMonthKeys(n: number, today = todayKey()): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
  });
}

export function monthLabel(mKey: string, style: "short" | "long" = "short") {
  const [y, m] = mKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 15))
  );
}

/** Mon–Sun of the current week (PKT), flagging today. */
export function currentWeek(date = new Date()) {
  const today = dayKey(date);
  return weekKeys(today).map((key) => ({
    key,
    day: Number(key.slice(8)),
    weekday: new Date(pktISO(key, 12)).toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: APP_TZ,
    }),
    active: key === today,
  }));
}

/** Compact relative time: "in 2h", "3d ago", "just now". */
export function relativeTime(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  let label: string;
  if (min < 1) return "just now";
  if (min < 60) label = `${min}m`;
  else if (min < 60 * 24) label = `${Math.round(min / 60)}h`;
  else label = `${Math.round(min / 1440)}d`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}
