import type { DialerScheme } from "./types";

/**
 * Click-to-call link. Default is Zoom Phone's `zoomphonecall://` handler; the scheme is
 * configurable in Admin → Settings (e.g. `tel:` if Zoom is set as the system calling app).
 */
export function dialHref(phone: string, scheme: DialerScheme = "zoomphonecall://") {
  const digits = phone.replace(/[^\d+]/g, "");
  return `${scheme}${digits}`;
}

export const DIALER_OPTIONS: { value: DialerScheme; label: string; hint: string }[] = [
  { value: "zoomphonecall://", label: "Zoom Phone", hint: "Opens the Zoom desktop app and dials the number." },
  { value: "tel:", label: "System default", hint: "Uses whichever app handles phone links on the computer." },
  { value: "callto:", label: "Callto (Skype & others)", hint: "For softphones that register the callto: handler." },
];
