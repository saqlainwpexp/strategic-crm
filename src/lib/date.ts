// Date helpers in the agency's timezone (white-label setting, default US Eastern).
// Handles daylight saving: wall-clock times are converted with the real offset for that date.
// Safe to use on both server and client.

export type TimeZoneOption = { id: string; label: string };

export const TIMEZONES: TimeZoneOption[] = [
  { id: "America/New_York", label: "US Eastern (New York)" },
  { id: "America/Chicago", label: "US Central (Chicago)" },
  { id: "America/Denver", label: "US Mountain (Denver)" },
  { id: "America/Phoenix", label: "US Arizona (Phoenix)" },
  { id: "America/Los_Angeles", label: "US Pacific (Los Angeles)" },
  { id: "America/Toronto", label: "Canada Eastern (Toronto)" },
  { id: "Europe/London", label: "UK (London)" },
  { id: "Europe/Berlin", label: "Central Europe (Berlin)" },
  { id: "Asia/Dubai", label: "Gulf (Dubai)" },
  { id: "Asia/Karachi", label: "Pakistan (Karachi)" },
  { id: "Asia/Kolkata", label: "India (Kolkata)" },
  { id: "Australia/Sydney", label: "Australia Eastern (Sydney)" },
  { id: "UTC", label: "UTC" },
];

export const DEFAULT_TIMEZONE = "America/New_York";

export function isTimeZone(v: unknown): v is string {
  return typeof v === "string" && TIMEZONES.some((t) => t.id === v);
}

let currentTz = DEFAULT_TIMEZONE;

/** Set from branding: on the server before data is built, and by BrandingProvider in the UI. */
export function setTimeZone(tz: string) {
  currentTz = isTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

export function appTimeZone() {
  return currentTz;
}

const pad = (n: number) => String(n).padStart(2, "0");

// Intl formatters are relatively expensive to create — cache per timezone + options.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, tz = currentTz) {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function zonedParts(date: Date = new Date(), tz = currentTz) {
  const parts = fmt(
    { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" },
    tz
  ).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Offset of `tz` from UTC at a given instant, in minutes (e.g. -240 for EDT). */
function offsetMinutes(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function greetingFor(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/** "YYYY-MM-DD" for the given instant, in the agency timezone. */
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

/** "Mon" for a day key (calendar-only, no timezone involved). */
export function weekdayShort(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return fmt({ weekday: "short" }, "UTC").format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Mon 12" for a day key. */
export function weekdayDay(key: string) {
  return `${weekdayShort(key)} ${Number(key.slice(8))}`;
}

/** Mon–Sun day keys of the week containing `key`. */
export function weekKeys(key: string): string[] {
  const start = shiftDayKey(key, -weekdayOf(key));
  return Array.from({ length: 7 }, (_, i) => shiftDayKey(start, i));
}

/** ISO instant for a wall-clock time on a day key in the agency timezone (DST-aware). */
export function zonedISO(key: string, hour: number, minute = 0): string {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let utc = guess - offsetMinutes(new Date(guess), currentTz) * 60000;
  // Re-check with the offset at the resulting instant (matters on DST change days).
  const off2 = offsetMinutes(new Date(utc), currentTz);
  utc = guess - off2 * 60000;
  return new Date(utc).toISOString();
}

/** Minutes since local midnight for an ISO instant. */
export function minuteOfDay(iso: string) {
  const p = zonedParts(new Date(iso));
  return p.hour * 60 + p.minute;
}

/** Short zone name for labels, e.g. "EDT" / "EST" / "PKT"-style "GMT+5". */
export function tzAbbrev(date = new Date()) {
  return fmt({ timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? currentTz;
}

export const formatTime = (iso: string) => fmt({ hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const formatDate = (iso: string) => fmt({ month: "short", day: "numeric" }).format(new Date(iso));
export const formatDateYear = (iso: string) => fmt({ month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
export const formatWeekdayDate = (iso: string) => fmt({ weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

export function formatToday(date = new Date()) {
  return fmt({ month: "short", day: "numeric", year: "numeric" }).format(date);
}

/** Human label for a day key: "Today", "Tomorrow", "Yesterday" or "Thu, Oct 8". */
export function dayLabel(key: string, today = todayKey()) {
  if (key === today) return "Today";
  if (key === shiftDayKey(today, 1)) return "Tomorrow";
  if (key === shiftDayKey(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return fmt({ weekday: "short", month: "short", day: "numeric" }, "UTC").format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "YYYY-MM" month key in the agency timezone. */
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
  return fmt({ month: style }, "UTC").format(new Date(Date.UTC(y, m - 1, 15)));
}

/** Mon–Sun of the current week, flagging today. */
export function currentWeek(date = new Date()) {
  const today = dayKey(date);
  return weekKeys(today).map((key) => ({
    key,
    day: Number(key.slice(8)),
    weekday: weekdayShort(key),
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
