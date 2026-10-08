"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { VIEW_AS_COOKIE, getViewer } from "@/lib/viewer";
import { normalizeBranding, DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { writeBranding } from "@/lib/branding.server";

/** Switch the "Preview as" user (demo role switcher). */
export async function setViewAs(userId: string) {
  cookies().set(VIEW_AS_COOKIE, userId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}

/** Save white-label branding. Super Admin only. */
export async function saveBranding(input: Branding | null): Promise<{ ok: true; branding: Branding } | { ok: false; error: string }> {
  if (getViewer().role !== "SUPER_ADMIN") return { ok: false, error: "Only the super admin can change branding." };
  const branding = input === null ? DEFAULT_BRANDING : normalizeBranding(input);
  try {
    await writeBranding(branding);
  } catch {
    return { ok: false, error: "Couldn't save branding on the server." };
  }
  revalidatePath("/", "layout");
  return { ok: true, branding };
}
