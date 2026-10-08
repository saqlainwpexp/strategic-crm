// Turns a Branding into CSS custom properties (space-separated RGB triplets so Tailwind's
// `bg-brand/40`-style opacity modifiers keep working).

import { FONTS, type Branding } from "./branding";

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

const triplet = (c: Rgb) => c.join(" ");
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** WCAG relative luminance (0–1). */
export function luminance([r, g, b]: Rgb) {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * White unless `bg` is too light for it, then the ink colour. White is preferred (it's
 * the look of the design), so the cut-off is a minimum contrast rather than "whichever wins".
 */
function onColor(bg: Rgb, ink: Rgb, minWhiteContrast: number): Rgb {
  return contrastRatio(bg, WHITE) >= minWhiteContrast ? WHITE : ink;
}

export function themeVars(b: Branding): Record<string, string> {
  const brand = hexToRgb(b.colors.brand);
  const ink = hexToRgb(b.colors.ink);
  const page = hexToRgb(b.colors.page);
  const header = hexToRgb(b.colors.header);
  const headerFg = onColor(header, ink, 3); // header carries small text
  const headerIsDark = headerFg === WHITE;
  const font = FONTS.find((f) => f.key === b.font) ?? FONTS[0];

  return {
    "--brand-50": triplet(mix(brand, WHITE, 0.92)),
    "--brand-100": triplet(mix(brand, WHITE, 0.82)),
    "--brand-200": triplet(mix(brand, WHITE, 0.62)),
    "--brand-300": triplet(mix(brand, WHITE, 0.4)),
    "--brand-400": triplet(mix(brand, WHITE, 0.18)),
    "--brand-500": triplet(brand),
    "--brand-600": triplet(mix(brand, BLACK, 0.12)),
    "--brand-700": triplet(mix(brand, BLACK, 0.26)),
    "--brand-800": triplet(mix(brand, BLACK, 0.42)),
    "--brand-900": triplet(mix(brand, BLACK, 0.6)),
    "--brand-fg": triplet(onColor(brand, ink, 2.2)), // icons & button labels
    "--ink": triplet(ink),
    "--ink-soft": triplet(mix(ink, WHITE, 0.08)),
    "--ink-muted": triplet(mix(ink, WHITE, 0.16)),
    "--page": triplet(page),
    "--soft": triplet(mix(page, WHITE, 0.4)),
    "--header": triplet(header),
    "--header-fg": triplet(headerFg),
    // Primary "Create" button in the bar header: inverse of the bar.
    "--header-cta": triplet(headerIsDark ? WHITE : ink),
    "--header-cta-fg": triplet(headerIsDark ? ink : WHITE),
    "--font-sans": `var(${font.cssVar})`,
  };
}
