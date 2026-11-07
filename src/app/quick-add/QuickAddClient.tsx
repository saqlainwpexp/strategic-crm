"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PlatformIcon } from "@/components/outreach/PlatformIcon";
import { detectPlatform, nameFromPageTitle } from "@/lib/outreach/normalize";
import { STAGE_LABEL, platformLabel, type OutreachStage } from "@/lib/outreach/platforms";

type Result = { created: boolean; platform: string; leadId: string; threadId: string; name: string; stage: OutreachStage };

export function QuickAddClient({ url, title }: { url: string; title: string }) {
  const platform = detectPlatform(url);
  const [name, setName] = useState(() => nameFromPageTitle(title));
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name: name || undefined, title: jobTitle || undefined, company: company || undefined }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Couldn't add this profile.");
      else setResult(json);
    } catch {
      setError("Couldn't reach the CRM.");
    } finally {
      setBusy(false);
    }
  }

  if (!platform)
    return (
      <div className="rounded-[20px] bg-white p-6">
        <CircleAlert className="h-6 w-6 text-rose-500" />
        <h1 className="mt-4 text-[18px] font-medium">Not a profile page</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-500">
          Open someone&apos;s LinkedIn, Facebook, Instagram, Threads, X or TikTok profile, then click the bookmark again.
        </p>
        <p className="mt-4 break-all text-[12px] text-neutral-400">{url || "No page address was sent."}</p>
      </div>
    );

  if (result)
    return (
      <div className="rounded-[20px] bg-white p-6">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        <h1 className="mt-4 text-[19px] font-medium">{result.created ? "Added to the CRM" : "Already in the CRM"}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-500">
          {result.name} · {platformLabel(result.platform)} · {STAGE_LABEL[result.stage]}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`/loadboard?tab=social&lead=${result.leadId}`} target="_blank" rel="noreferrer">
            <Button variant="brand" size="sm">
              Open in CRM <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
          <Button variant="ghost" size="sm" onClick={() => window.close()}>
            Close
          </Button>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit} className="rounded-[20px] bg-white p-6">
      <div className="flex items-center gap-3">
        <PlatformIcon platform={platform} size={32} />
        <div className="min-w-0">
          <h1 className="text-[18px] font-medium">Add {platformLabel(platform)} lead</h1>
          <p className="truncate text-[12px] text-neutral-400">{url}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-5">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Jane Doe" />
        </Field>
        <Field label="Job title">
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {error && <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>}
      <Button type="submit" variant="brand" className="mt-6 w-full" disabled={busy}>
        {busy ? "Adding…" : "Add to CRM"}
      </Button>
      <p className="mt-3 text-center text-[12px] text-neutral-400">If this profile is already in the CRM you&apos;ll get the existing lead.</p>
    </form>
  );
}
