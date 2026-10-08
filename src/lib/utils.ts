import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { withSymbol } from "./currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Full amount in the agency's currency: "Rs 1,250,000", "$1,250,000". */
export function formatMoney(amount: number): string {
  return withSymbol(Math.round(amount).toLocaleString("en-US"));
}

/** Compact amount: "Rs 1.25M", "$640K". Pass false to drop the symbol. */
export function compactMoney(amount: number, withPrefix = true): string {
  const n =
    Math.abs(amount) >= 1_000_000
      ? `${trim(amount / 1_000_000)}M`
      : Math.abs(amount) >= 1_000
        ? `${Math.round(amount / 1_000)}K`
        : `${Math.round(amount)}`;
  return withPrefix ? withSymbol(n) : n;
}

function trim(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** Call length: "45s", "4m 05s". */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Working time: "7h 32m". */
export function formatHours(sec: number): string {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28);
}

export function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Percentage a/b, rounded; 0 when b is 0. */
export function pct(a: number, b: number, digits = 0) {
  if (!b) return 0;
  const f = 10 ** digits;
  return Math.round((a / b) * 100 * f) / f;
}

/** "+12.6%" / "-3%" change between two numbers. */
export function deltaLabel(current: number, previous: number) {
  if (!previous) return current ? "+100%" : "0%";
  const d = ((current - previous) / previous) * 100;
  const r = Math.abs(d) >= 10 ? Math.round(d) : Math.round(d * 10) / 10;
  return `${r >= 0 ? "+" : ""}${r}%`;
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) (out[key(it)] ||= []).push(it);
  return out;
}

export function sum(nums: number[]) {
  return nums.reduce((s, n) => s + n, 0);
}
