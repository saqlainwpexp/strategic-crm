// Public unsubscribe page linked from every marketing email. Unsubscribing needs a button press
// (a plain GET would let link scanners unsubscribe people by accident).

import { revalidatePath } from "next/cache";
import { CheckCircle2, MailX } from "lucide-react";
import { prisma } from "@/server/db";
import { getBranding } from "@/server/settings";
import { readUnsubscribeToken } from "@/server/email/tokens";
import { unsubscribeLead } from "@/server/email/unsubscribe";
import { Logo } from "@/components/layout/Logo";

export const dynamic = "force-dynamic";

function mask(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "your address";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const leadId = readUnsubscribeToken(token);
  const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId }, select: { email: true, emailOptOut: true } }) : null;
  const branding = await getBranding();

  async function confirm() {
    "use server";
    const id = readUnsubscribeToken(token);
    if (id) await unsubscribeLead(id);
    revalidatePath(`/unsubscribe/${token}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-16 text-ink">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-[24px] bg-white p-10 text-center">
          {!lead ? (
            <>
              <MailX className="mx-auto h-10 w-10 text-neutral-400" strokeWidth={1.5} />
              <h1 className="mt-6 text-[22px] font-medium tracking-[-0.015em]">This link isn't valid</h1>
              <p className="mt-3 text-[14px] leading-relaxed text-neutral-500">
                It may be incomplete. Reply to the email you received and ask to be removed, and we'll take care of it.
              </p>
            </>
          ) : lead.emailOptOut ? (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-[#1F9D4C]" strokeWidth={1.5} />
              <h1 className="mt-6 text-[22px] font-medium tracking-[-0.015em]">You're unsubscribed</h1>
              <p className="mt-3 text-[14px] leading-relaxed text-neutral-500">
                {mask(lead.email ?? "")} won't receive marketing emails from {branding.agencyName || branding.appName} again.
              </p>
            </>
          ) : (
            <>
              <MailX className="mx-auto h-10 w-10 text-ink" strokeWidth={1.5} />
              <h1 className="mt-6 text-[22px] font-medium tracking-[-0.015em]">Unsubscribe from our emails?</h1>
              <p className="mt-3 text-[14px] leading-relaxed text-neutral-500">
                {mask(lead.email ?? "")} will stop receiving marketing emails from {branding.agencyName || branding.appName}.
              </p>
              <form action={confirm} className="mt-8">
                <button className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-6 text-[15px] text-white transition-colors hover:bg-ink-muted">
                  Unsubscribe
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
