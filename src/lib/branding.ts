// White-label branding: everything an agency can change about how the CRM looks.
// Shared by server (initial render) and client (live preview in Admin → Branding).

import { isCurrencyCode, type CurrencyCode } from "./currency";
import { DEFAULT_TIMEZONE, isTimeZone } from "./date";

export type FontKey = "inter" | "jakarta" | "dmsans" | "manrope";
export type HeaderStyle = "bar" | "classic";

export type BrandColors = {
  /** Accent: charts, highlights, call buttons. */
  brand: string;
  /** Dark colour for primary buttons, active pills and text. */
  ink: string;
  /** Page background behind the white cards. */
  page: string;
  /** Background of the bar-style header. */
  header: string;
};

export type Branding = {
  appName: string;
  /** Used in call scripts, emails and reminders ("…from {agency_name}"). */
  agencyName: string;
  /** Uploaded logo as a data URL (PNG/SVG/JPG/WebP); null = built-in mark. */
  logoDataUrl: string | null;
  showNameInHeader: boolean;
  colors: BrandColors;
  presetId: string | null;
  font: FontKey;
  headerStyle: HeaderStyle;
  /** Display currency for all amounts. */
  currency: CurrencyCode;
  /** IANA timezone for every date and time (DST-aware), e.g. "America/New_York". */
  timezone: string;
};

export const FONTS: { key: FontKey; label: string; cssVar: string }[] = [
  { key: "inter", label: "Inter", cssVar: "--font-inter" },
  { key: "jakarta", label: "Plus Jakarta Sans", cssVar: "--font-jakarta" },
  { key: "dmsans", label: "DM Sans", cssVar: "--font-dmsans" },
  { key: "manrope", label: "Manrope", cssVar: "--font-manrope" },
];

export const THEME_PRESETS: { id: string; name: string; colors: BrandColors }[] = [
  { id: "strategic", name: "Strategic", colors: { brand: "#EA8B5E", ink: "#0A0A0A", page: "#F2F2F2", header: "#0A0A0A" } },
  { id: "rosewood", name: "Rosewood", colors: { brand: "#A6676A", ink: "#2A1B1C", page: "#F4F0EF", header: "#A6676A" } },
  { id: "ocean", name: "Ocean", colors: { brand: "#2563EB", ink: "#0B1220", page: "#F1F4F9", header: "#1E3A8A" } },
  { id: "forest", name: "Forest", colors: { brand: "#16A34A", ink: "#0B1A10", page: "#F1F5F2", header: "#14532D" } },
  { id: "violet", name: "Violet", colors: { brand: "#7C3AED", ink: "#130B21", page: "#F4F2F9", header: "#4C1D95" } },
  { id: "graphite", name: "Graphite", colors: { brand: "#6B7280", ink: "#111111", page: "#F2F2F2", header: "#262626" } },
];

export const DEFAULT_BRANDING: Branding = {
  appName: "Strategic CRM",
  agencyName: "Strategic",
  logoDataUrl: null,
  showNameInHeader: false,
  colors: THEME_PRESETS[0].colors,
  presetId: "strategic",
  font: "inter",
  headerStyle: "bar",
  currency: "PKR",
  timezone: DEFAULT_TIMEZONE,
};

export const MAX_LOGO_BYTES = 400 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

/** Merge stored/untrusted input over the defaults, dropping anything invalid. */
export function normalizeBranding(input: unknown): Branding {
  const b = (input && typeof input === "object" ? input : {}) as Partial<Branding>;
  const c = (b.colors ?? {}) as Partial<BrandColors>;
  const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback);
  const text = (v: unknown, fallback: string, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
  const logo =
    typeof b.logoDataUrl === "string" &&
    /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(b.logoDataUrl) &&
    b.logoDataUrl.length <= MAX_LOGO_BYTES * 1.4
      ? b.logoDataUrl
      : null;
  return {
    appName: text(b.appName, DEFAULT_BRANDING.appName, 40),
    agencyName: text(b.agencyName, DEFAULT_BRANDING.agencyName, 40),
    logoDataUrl: logo,
    showNameInHeader: typeof b.showNameInHeader === "boolean" ? b.showNameInHeader : DEFAULT_BRANDING.showNameInHeader,
    colors: {
      brand: color(c.brand, DEFAULT_BRANDING.colors.brand),
      ink: color(c.ink, DEFAULT_BRANDING.colors.ink),
      page: color(c.page, DEFAULT_BRANDING.colors.page),
      header: color(c.header, DEFAULT_BRANDING.colors.header),
    },
    presetId: typeof b.presetId === "string" && THEME_PRESETS.some((p) => p.id === b.presetId) ? b.presetId : null,
    font: FONTS.some((f) => f.key === b.font) ? (b.font as FontKey) : DEFAULT_BRANDING.font,
    headerStyle: b.headerStyle === "classic" ? "classic" : "bar",
    currency: isCurrencyCode(b.currency) ? b.currency : DEFAULT_BRANDING.currency,
    timezone: isTimeZone(b.timezone) ? b.timezone : DEFAULT_BRANDING.timezone,
  };
}
