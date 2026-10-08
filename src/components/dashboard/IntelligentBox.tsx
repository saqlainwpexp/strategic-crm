"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Building2,
  Copy,
  ExternalLink,
  Mail,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { AgencyIllustration } from "./AgencyIllustration";
import {
  answer,
  draftEmail,
  emailCandidates,
  nextMeeting,
  reminderMessage,
  suggestLeads,
  whatsappLink,
} from "@/lib/assistant";
import { dayKey, dayLabel, formatTime } from "@/lib/date";
import { cn } from "@/lib/utils";

type Mode = "home" | "suggest" | "email" | "reminder" | "answer";

const ACTIONS = [
  { mode: "suggest" as const, icon: Building2, label: "Lead Suggestion", color: "rgb(var(--brand-600))" },
  { mode: "email" as const, icon: Mail, label: "Generate Email", color: "rgb(var(--brand-500))" },
  { mode: "reminder" as const, icon: MessageCircle, label: "Reminder Message", color: "rgb(var(--ink))" },
];

export function IntelligentBox() {
  const { data, viewer, userById, notify } = useCrm();
  const { branding } = useBranding();
  const [mode, setMode] = useState<Mode>("home");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [emailIdx, setEmailIdx] = useState(0);

  const suggestions = useMemo(() => suggestLeads(data, 3), [data]);
  const candidates = useMemo(() => emailCandidates(data), [data]);
  const emailLead = candidates.length ? candidates[emailIdx % candidates.length] : null;
  const email = emailLead ? draftEmail(emailLead, viewer, branding.agencyName) : null;
  const upcoming = useMemo(() => nextMeeting(data), [data]);
  const reminder = upcoming ? reminderMessage(upcoming.meeting, upcoming.lead, userById(upcoming.meeting.userId), branding.agencyName) : null;
  const answers = useMemo(() => (asked ? answer(asked, data) : []), [asked, data]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied to clipboard");
    } catch {
      notify("Couldn't copy — select the text instead");
    }
  };

  const ask = () => {
    if (!question.trim()) return;
    setAsked(question.trim());
    setQuestion("");
    setMode("answer");
  };

  const titles: Record<Exclude<Mode, "home">, string> = {
    suggest: "Who to call next",
    email: "Email draft",
    reminder: "Meeting reminder",
    answer: asked,
  };

  return (
    <section className="flex h-full min-h-[440px] flex-col rounded-[20px] bg-ink p-7 text-white">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Intelligent Box</h2>
        <div className="flex items-center rounded-full bg-[rgb(var(--ink-muted))]">
          <button
            aria-label="Suggest a lead"
            title="Suggest a lead"
            onClick={() => setMode("suggest")}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#3A3A3A] transition-colors hover:bg-brand"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <Link
            href="/leads"
            aria-label="Open leads"
            title="Open leads"
            className="grid h-10 w-[52px] place-items-center rounded-full transition-colors hover:bg-brand"
          >
            <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-[18px] bg-white p-4 text-ink">
        <div className="relative min-h-[170px] flex-1">
          {mode === "home" ? (
            <div className="absolute inset-0 flex items-center">
              <div className="relative z-10 flex flex-col items-start gap-3 pl-2">
                {ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => setMode(a.mode)}
                    className="flex items-center gap-2.5 rounded-full border border-neutral-200 bg-white py-1 pl-1 pr-4 text-[13px] text-neutral-700 transition-colors hover:border-neutral-300 hover:text-ink"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: a.color }}>
                      <a.icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    {a.label}
                  </button>
                ))}
              </div>
              <AgencyIllustration className="pointer-events-none absolute right-1 top-1/2 h-[92%] max-h-[190px] w-auto -translate-y-1/2" />
            </div>
          ) : (
            <div className="scroll-slim absolute inset-0 overflow-y-auto pr-1">
              <div className="mb-4 flex items-center gap-2">
                <button
                  aria-label="Back"
                  onClick={() => setMode("home")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-page hover:bg-neutral-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <p className="truncate text-[13.5px] font-medium">{titles[mode]}</p>
              </div>

              {mode === "suggest" &&
                (suggestions.length ? (
                  <div className="flex flex-col gap-3">
                    {suggestions.map(({ lead, reasons }, i) => (
                      <Link
                        key={lead.id}
                        href={`/leads?lead=${lead.id}`}
                        className={cn("block rounded-2xl p-4 transition-colors", i === 0 ? "bg-brand-50 hover:bg-brand-100" : "bg-soft hover:bg-neutral-100")}
                      >
                        <div className="flex items-center gap-3">
                          <LeadThumb lead={lead} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium">{lead.businessName}</p>
                            <p className="truncate text-[12px] text-neutral-500">{lead.decisionMakerName} · {lead.phone}</p>
                          </div>
                          {i === 0 && <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] text-brand-fg">Call first</span>}
                        </div>
                        <ul className="mt-3 space-y-1 pl-1 text-[12px] text-neutral-600">
                          {reasons.slice(0, 3).map((r) => (
                            <li key={r}>• {r}</li>
                          ))}
                        </ul>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Empty text="No callable leads right now." />
                ))}

              {mode === "email" &&
                (email && emailLead ? (
                  <div>
                    <p className="text-[12px] text-neutral-500">To {emailLead.decisionMakerName} · {emailLead.email}</p>
                    <p className="mt-2 text-[14px] font-medium">{email.subject}</p>
                    <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-soft p-4 font-sans text-[12.5px] leading-relaxed text-neutral-700">
                      {email.body}
                    </pre>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <SmallBtn onClick={() => copy(`Subject: ${email.subject}\n\n${email.body}`)} icon={Copy}>Copy</SmallBtn>
                      <SmallBtn
                        href={`mailto:${emailLead.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                        icon={ExternalLink}
                      >
                        Open in mail
                      </SmallBtn>
                      {candidates.length > 1 && (
                        <SmallBtn onClick={() => setEmailIdx((i) => i + 1)} icon={RotateCcw}>Next lead</SmallBtn>
                      )}
                    </div>
                  </div>
                ) : (
                  <Empty text="No warm leads with an email address yet." />
                ))}

              {mode === "reminder" &&
                (reminder && upcoming ? (
                  <div>
                    <p className="text-[12px] text-neutral-500">
                      {upcoming.lead.businessName} · {dayLabel(dayKey(upcoming.meeting.scheduledAt))} at {formatTime(upcoming.meeting.scheduledAt)}
                    </p>
                    <p className="mt-3 rounded-2xl rounded-tl-md bg-[#E9F8EE] p-4 text-[13px] leading-relaxed text-neutral-800">{reminder}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <SmallBtn onClick={() => copy(reminder)} icon={Copy}>Copy</SmallBtn>
                      <SmallBtn href={whatsappLink(upcoming.lead.phone, reminder)} icon={MessageCircle}>Open WhatsApp</SmallBtn>
                    </div>
                  </div>
                ) : (
                  <Empty text="No upcoming meetings to remind about." />
                ))}

              {mode === "answer" && (
                <div>
                  <ul className="space-y-2">
                    {answers.map((a) => (
                      <li key={a} className="rounded-2xl bg-soft px-4 py-3 text-[13px] text-neutral-800">{a}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] text-neutral-400">Quick answers from your CRM data.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="mt-4 flex items-center gap-2 rounded-full border border-neutral-200 p-1.5 pl-5"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask Anything.."
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-neutral-500"
          />
          <button
            type="submit"
            aria-label="Ask"
            className="grid h-10 w-10 place-items-center rounded-full bg-page text-ink transition-colors hover:bg-ink hover:text-white"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </form>
      </div>
    </section>
  );
}

function SmallBtn({
  children,
  icon: Icon,
  onClick,
  href,
}: {
  children: React.ReactNode;
  icon: typeof Copy;
  onClick?: () => void;
  href?: string;
}) {
  const cls = "inline-flex h-9 items-center gap-2 rounded-full bg-page px-4 text-[12.5px] text-ink transition-colors hover:bg-ink hover:text-white";
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        <Icon className="h-3.5 w-3.5" /> {children}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-soft px-4 py-6 text-center text-[13px] text-neutral-500">{text}</p>;
}
