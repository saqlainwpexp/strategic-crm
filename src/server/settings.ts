// Agency-wide configuration stored in the `Setting` table:
//   "branding" → white-label look (name, logo, colours, font, currency, timezone)
//   "settings" → CRM behaviour (lead temperature thresholds, dialer, reminder timing)

import { cache } from "react";
import { readFileSync } from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from "@/lib/branding";
import type { DialerScheme, Settings } from "@/lib/types";

const DIALERS: DialerScheme[] = ["zoomphonecall://", "tel:", "callto:"];
const REMINDER_MINUTES = [10, 15, 30, 45, 60];

export const DEFAULT_SETTINGS: Settings = {
  hotThreshold: 75,
  warmThreshold: 40,
  dialerScheme: "zoomphonecall://",
  reminderMinutes: 30,
  currency: DEFAULT_BRANDING.currency,
  timezone: DEFAULT_BRANDING.timezone,
};

/** Merge stored/untrusted input over the defaults, dropping anything invalid. */
export function normalizeSettings(input: unknown): Settings {
  const s = (input && typeof input === "object" ? input : {}) as Partial<Settings>;
  const int = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  const hot = int(s.hotThreshold, 2, 100, DEFAULT_SETTINGS.hotThreshold);
  const warm = int(s.warmThreshold, 1, 99, DEFAULT_SETTINGS.warmThreshold);
  return {
    hotThreshold: hot > warm ? hot : DEFAULT_SETTINGS.hotThreshold,
    warmThreshold: hot > warm ? warm : DEFAULT_SETTINGS.warmThreshold,
    dialerScheme: DIALERS.includes(s.dialerScheme as DialerScheme) ? (s.dialerScheme as DialerScheme) : DEFAULT_SETTINGS.dialerScheme,
    reminderMinutes: REMINDER_MINUTES.includes(s.reminderMinutes as number) ? (s.reminderMinutes as number) : DEFAULT_SETTINGS.reminderMinutes,
    currency: DEFAULT_SETTINGS.currency,
    timezone: DEFAULT_SETTINGS.timezone,
  };
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

// Branding saved before the database existed (Admin → Branding wrote this file).
const LEGACY_BRANDING_FILE = path.join(process.cwd(), "data", "branding.json");
function legacyBranding(): Branding | null {
  try {
    return normalizeBranding(JSON.parse(readFileSync(LEGACY_BRANDING_FILE, "utf8")));
  } catch {
    return null;
  }
}

/** Saved branding (one DB read per request). Falls back gracefully if the DB is unreachable. */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "branding" } });
    if (row) return normalizeBranding(row.value);
    // First run: adopt branding saved locally before the database was connected.
    const legacy = legacyBranding();
    if (legacy) {
      await prisma.setting.create({ data: { key: "branding", value: json(legacy) } });
      return legacy;
    }
  } catch (e) {
    console.error("[branding] database unavailable — using defaults", e instanceof Error ? e.message : e);
    return legacyBranding() ?? DEFAULT_BRANDING;
  }
  return DEFAULT_BRANDING;
});

export async function saveBrandingRow(b: Branding) {
  await prisma.setting.upsert({ where: { key: "branding" }, create: { key: "branding", value: json(b) }, update: { value: json(b) } });
}

export const getSettings = cache(async (): Promise<Settings> => {
  const [row, branding] = await Promise.all([prisma.setting.findUnique({ where: { key: "settings" } }), getBranding()]);
  return { ...normalizeSettings(row?.value), currency: branding.currency, timezone: branding.timezone };
});

export async function saveSettingsRow(s: Settings) {
  const { currency: _c, timezone: _t, ...rest } = s;
  await prisma.setting.upsert({ where: { key: "settings" }, create: { key: "settings", value: json(rest) }, update: { value: json(rest) } });
}
