"use client";

// Leads → Import social CSV. Column mapping with presets for Sales Navigator, Phantombuster
// and Apify exports; duplicates are matched on the normalised profile URL/handle.

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { importSocialAction } from "@/server/outreach/actions";
import { PLATFORMS } from "@/lib/outreach/platforms";
import { detectPlatform } from "@/lib/outreach/normalize";

type Row = Record<string, string>;
type Target = "profile" | "firstName" | "lastName" | "name" | "title" | "company" | "location" | "industry" | "email" | "phone" | "website" | "connectionDegree" | "followerCount";

const TARGETS: { key: Target; label: string; aliases: string[] }[] = [
  { key: "profile", label: "Profile URL / handle *", aliases: ["profileurl", "linkedinprofileurl", "linkedinurl", "defaultprofileurl", "profilelink", "url", "linkedin", "instagram", "username", "handle", "facebookurl", "salesnavigatorurl", "leadurl", "profile"] },
  { key: "firstName", label: "First name", aliases: ["firstname", "first"] },
  { key: "lastName", label: "Last name", aliases: ["lastname", "last"] },
  { key: "name", label: "Full name", aliases: ["fullname", "name", "profilename"] },
  { key: "title", label: "Job title", aliases: ["title", "jobtitle", "headline", "position", "occupation"] },
  { key: "company", label: "Company", aliases: ["company", "companyname", "currentcompany", "organization", "account"] },
  { key: "location", label: "Location", aliases: ["location", "city", "geography", "region"] },
  { key: "industry", label: "Industry", aliases: ["industry", "companyindustry"] },
  { key: "email", label: "Email", aliases: ["email", "emailaddress", "mail"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile"] },
  { key: "website", label: "Website", aliases: ["website", "companywebsite", "companyurl"] },
  { key: "connectionDegree", label: "Connection degree", aliases: ["connectiondegree", "degree", "connection"] },
  { key: "followerCount", label: "Followers", aliases: ["followers", "followercount", "followerscount"] },
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(headers: string[]): Partial<Record<Target, string>> {
  const out: Partial<Record<Target, string>> = {};
  for (const t of TARGETS) {
    const hit = t.aliases.map((a) => headers.find((h) => norm(h) === a)).find(Boolean);
    if (hit) out[t.key] = hit;
  }
  // Fall back to any column whose values look like profile links.
  return out;
}

const PRESETS: { id: string; label: string; source: string }[] = [
  { id: "auto", label: "Detect automatically", source: "" },
  { id: "salesnav", label: "Sales Navigator", source: "Sales Navigator" },
  { id: "phantom", label: "Phantombuster", source: "Phantombuster" },
  { id: "apify", label: "Apify", source: "Apify" },
  { id: "other", label: "Other CSV", source: "" },
];

export function SocialImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, act } = useOutreach();
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<Target, string>>>({});
  const [preset, setPreset] = useState("auto");
  const [platform, setPlatform] = useState("linkedin");
  const [campaignId, setCampaignId] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setFileName("");
    setMapping({});
    setSummary(null);
    setError("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = (file: File) => {
    setError("");
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length || !res.data.length) return setError("That file has no rows.");
        const m = autoMap(hs);
        if (!m.profile) {
          const linky = hs.find((h) => res.data.slice(0, 20).some((r) => detectPlatform(r[h] ?? "")));
          if (linky) m.profile = linky;
        }
        setHeaders(hs);
        setRows(res.data);
        setMapping(m);
        setFileName(file.name);
        const first = m.profile ? res.data.map((r) => detectPlatform(r[m.profile!] ?? "")).find(Boolean) : null;
        if (first) setPlatform(first);
        const guess = /phantom/i.test(file.name) ? "phantom" : /apify/i.test(file.name) ? "apify" : /sales|nav/i.test(file.name) ? "salesnav" : "auto";
        setPreset(guess);
        setSource(PRESETS.find((p) => p.id === guess)?.source || data.leadSources[0] || "");
      },
      error: (e) => setError(e.message),
    });
  };

  const mapped = useMemo(() => {
    const get = (r: Row, k: Target) => (mapping[k] ? (r[mapping[k]!] ?? "").trim() : "");
    return rows.map((r) => {
      const full = get(r, "name") || [get(r, "firstName"), get(r, "lastName")].filter(Boolean).join(" ");
      const followers = get(r, "followerCount").replace(/[^\d]/g, "");
      return {
        profile: get(r, "profile"),
        name: full || undefined,
        title: get(r, "title") || undefined,
        company: get(r, "company") || undefined,
        location: get(r, "location") || undefined,
        industry: get(r, "industry") || undefined,
        email: get(r, "email") || undefined,
        phone: get(r, "phone") || undefined,
        website: get(r, "website") || undefined,
        connectionDegree: get(r, "connectionDegree") || undefined,
        followerCount: followers ? Math.min(Number(followers), 1e10) : null,
      };
    });
  }, [rows, mapping]);
  const withProfile = mapped.filter((m) => m.profile).length;

  const run = async () => {
    setBusy(true);
    const res = await act(importSocialAction(mapped, { platform, campaignId: campaignId || null, source: source || undefined }), (s) => `Import done: ${s.created} created, ${s.updated} updated, ${s.skipped} skipped`);
    setBusy(false);
    if (res.ok) setSummary(res.data);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      className="max-w-[760px]"
      title="Import social leads"
      subtitle="CSV exports from Sales Navigator, Phantombuster, Apify or any sheet with profile links. Profiles already in the CRM aren't duplicated."
      footer={
        summary ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="brand" disabled={!rows.length || !mapping.profile || busy} onClick={run}>
              {busy ? "Importing…" : `Import ${withProfile} rows`}
            </Button>
          </>
        )
      }
    >
      {summary ? (
        <div>
          <div className="grid grid-cols-3 gap-4">
            {[
              ["Created", summary.created],
              ["Updated", summary.updated],
              ["Skipped", summary.skipped],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-soft p-5">
                <p className="text-[13px] text-neutral-500">{k}</p>
                <p className="mt-2 text-[28px] tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-neutral-500">Updated = existing lead that got blank fields filled in. Skipped = already in the CRM unchanged, or no usable profile.</p>
          {summary.errors.length > 0 && (
            <ul className="mt-4 max-h-40 overflow-y-auto rounded-2xl bg-rose-50 px-5 py-3 text-[12.5px] text-rose-700">
              {summary.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      ) : !rows.length ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/[0.1] px-6 py-14 text-center hover:bg-soft">
          <Upload className="h-6 w-6 text-neutral-400" />
          <span className="text-[14px]">Choose a CSV file</span>
          <span className="text-[12.5px] text-neutral-400">Up to 5,000 rows</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          {error && <span className="text-[13px] text-rose-600">{error}</span>}
        </label>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-[13px] text-neutral-500">
            {fileName} · {rows.length} rows · {withProfile} with a profile
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Export from">
              <Select
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  const src = PRESETS.find((p) => p.id === e.target.value)?.source;
                  if (src) setSource(src);
                }}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Platform" hint="Used when a row has a bare handle instead of a link.">
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Attach to campaign">
              <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">No campaign</option>
                {data.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lead source">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">—</option>
                {[...new Set([...data.leadSources, source].filter(Boolean))].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <h3 className="mb-3 text-[14px] font-medium">Column mapping</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TARGETS.map((t) => (
                <div key={t.key} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-[13px] text-neutral-600">{t.label}</span>
                  <Select value={mapping[t.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [t.key]: e.target.value || undefined }))} className="flex-1">
                    <option value="">— skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-soft p-4">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-neutral-400">
                <tr>
                  <th className="pb-2 pr-4 font-normal">Profile</th>
                  <th className="pb-2 pr-4 font-normal">Name</th>
                  <th className="pb-2 pr-4 font-normal">Title</th>
                  <th className="pb-2 font-normal">Company</th>
                </tr>
              </thead>
              <tbody>
                {mapped.slice(0, 5).map((m, i) => (
                  <tr key={i} className="border-t border-black/[0.05]">
                    <td className="max-w-[220px] truncate py-2 pr-4">{m.profile || <span className="text-rose-500">missing</span>}</td>
                    <td className="py-2 pr-4">{m.name}</td>
                    <td className="py-2 pr-4">{m.title}</td>
                    <td className="py-2">{m.company}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="Start over">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="pt-2.5" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
