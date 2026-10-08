// Display currency for the whole app (white-label setting, saved with branding).
// Amounts are stored as plain numbers; this only controls how they're shown.

export type CurrencyCode = "PKR" | "USD" | "GBP" | "EUR" | "AED" | "SAR" | "CAD" | "AUD" | "INR";

export const CURRENCIES: { code: CurrencyCode; symbol: string; name: string }[] = [
  { code: "PKR", symbol: "Rs", name: "Pakistani Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
];

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && CURRENCIES.some((c) => c.code === v);
}

let current = CURRENCIES[0];

/** Set by BrandingProvider before anything renders. */
export function setCurrency(code: CurrencyCode) {
  current = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function currency() {
  return current;
}

/** "Rs 1,250" / "AED 1,250" (word symbols get a space) or "$1,250" / "£1,250". */
export function withSymbol(value: string) {
  return /^[A-Za-z]+$/.test(current.symbol) ? `${current.symbol} ${value}` : `${current.symbol}${value}`;
}
