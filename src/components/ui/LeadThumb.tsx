import {
  Briefcase,
  Building2,
  Car,
  Cloud,
  Dumbbell,
  GraduationCap,
  House,
  Plane,
  Scissors,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { hashString } from "@/lib/utils";
import type { Lead } from "@/lib/types";

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  Restaurant: Utensils,
  Clinic: Stethoscope,
  Retail: ShoppingBag,
  Fitness: Dumbbell,
  Automotive: Car,
  "Real Estate": House,
  Education: GraduationCap,
  "Beauty & Salon": Scissors,
  "Home Services": Wrench,
  Technology: Cloud,
  Events: Sparkles,
  Travel: Plane,
  "Professional Services": Briefcase,
};

const TONES = [
  { bg: "rgb(var(--ink-soft))", fg: "rgb(var(--brand-300))" },
  { bg: "rgb(var(--brand-100))", fg: "rgb(var(--brand-700))" },
  { bg: "rgb(var(--ink-muted))", fg: "#FFFFFF" },
  { bg: "#EDEDED", fg: "#3A3A3A" },
  { bg: "rgb(var(--brand-500))", fg: "rgb(var(--brand-fg))" },
];

/** Square tile with the lead's industry icon (stands in for a logo/photo). */
export function LeadThumb({ lead, size = 38 }: { lead: Pick<Lead, "businessName" | "customFields">; size?: number }) {
  const industry = String(lead.customFields?.industry ?? "");
  const Icon = INDUSTRY_ICONS[industry] ?? Building2;
  const tone = TONES[hashString(lead.businessName) % TONES.length];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg }}
    >
      <Icon style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={1.8} />
    </span>
  );
}
