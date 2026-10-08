"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Bell, Check, CircleAlert, ImageUp, LayoutGrid, Search, Trash2, UserPlus } from "lucide-react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { BrandMark, LogoMark } from "@/components/layout/Logo";
import { saveBranding } from "@/app/actions";
import {
  DEFAULT_BRANDING,
  FONTS,
  MAX_LOGO_BYTES,
  THEME_PRESETS,
  type BrandColors,
  type Branding,
} from "@/lib/branding";
import { contrastRatio, hexToRgb, luminance } from "@/lib/theme";
import { cn, compactMoney } from "@/lib/utils";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { TIMEZONES } from "@/lib/date";

const COLOR_FIELDS: { key: keyof BrandColors; label: string; hint: string }[] = [
  { key: "brand", label: "Accent", hint: "Charts, highlights, call buttons" },
  { key: "ink", label: "Dark", hint: "Primary buttons, active tabs, text" },
  { key: "page", label: "Background", hint: "Behind the white cards" },
  { key: "header", label: "Header bar", hint: "Bar-style header background" },
];

const same = (a: Branding, b: Branding) => JSON.stringify(a) === JSON.stringify(b);

export function BrandingTab() {
  const { saved, setPreview, markSaved } = useBranding();
  const { notify } = useCrm();
  const [draft, setDraft] = useState<Branding>(saved);
  const [logoError, setLogoError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Live preview: the whole app re-themes while editing; restored on leave.
  useEffect(() => {
    setPreview(same(draft, saved) ? null : draft);
  }, [draft, saved, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const dirty = !same(draft, saved);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setColor = (k: keyof BrandColors, v: string) => setDraft((d) => ({ ...d, presetId: null, colors: { ...d.colors, [k]: v.toUpperCase() } }));

  const onLogo = (file: File) => {
    setLogoError("");
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return setLogoError("Use a PNG, SVG, JPG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError(`That file is ${Math.round(file.size / 1024)} KB — the limit is ${MAX_LOGO_BYTES / 1024} KB.`);
    const reader = new FileReader();
    reader.onload = () => set("logoDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveBranding(draft);
      if (res.ok) {
        markSaved(res.branding);
        setDraft(res.branding);
        notify("Branding saved");
      } else {
        notify(res.error);
      }
    });

  // Contrast checks
  const warnings: string[] = [];
  const white = [255, 255, 255] as [number, number, number];
  if (contrastRatio(hexToRgb(draft.colors.ink), white) < 4.5) warnings.push("The dark colour is too light — white text on buttons will be hard to read.");
  if (luminance(hexToRgb(draft.colors.page)) < 0.6) warnings.push("The background is quite dark — white cards won't stand out. Pick a lighter tint.");
  if (contrastRatio(hexToRgb(draft.colors.brand), white) < 1.6) warnings.push("The accent is very light — charts and highlights may look washed out.");

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Identity */}
        <Card className="p-7">
          <CardHeader title="Identity" subtitle="Your agency's name and logo across the app, browser tab and documents." />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="App name" hint="Shown in the browser tab and header.">
              <Input value={draft.appName} maxLength={40} onChange={(e) => set("appName", e.target.value)} />
            </Field>
            <Field label="Agency name" hint="Fills {agency_name} in call scripts, emails and reminders.">
              <Input value={draft.agencyName} maxLength={40} onChange={(e) => set("agencyName", e.target.value)} />
            </Field>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6">
            <span className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[20px] bg-header text-header-fg">
              <BrandMark className="h-9 w-9 text-header-fg" imgClassName="h-11 max-w-[56px]" />
            </span>
            <span className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[20px] border border-black/[0.06] bg-white text-ink">
              <BrandMark className="h-9 w-9" imgClassName="h-11 max-w-[56px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium">Logo</p>
              <p className="mt-1 text-[12.5px] text-neutral-500">
                PNG, SVG, JPG or WebP · up to {MAX_LOGO_BYTES / 1024} KB · square or transparent works best.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <ImageUp className="h-3.5 w-3.5" /> {draft.logoDataUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {draft.logoDataUrl && (
                  <Button size="sm" variant="secondary" onClick={() => set("logoDataUrl", null)}>
                    <Trash2 className="h-3.5 w-3.5" /> Use built-in mark
                  </Button>
                )}
              </div>
              {logoError && <p className="mt-2 text-[12.5px] text-rose-600">{logoError}</p>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onLogo(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="mt-6">
            <Toggle checked={draft.showNameInHeader} onChange={(v) => set("showNameInHeader", v)} label="Show the app name next to the logo in the bar header" />
          </div>
        </Card>

        {/* Colours */}
        <Card className="p-7">
          <CardHeader title="Colour scheme" subtitle="Start from a preset, then fine-tune any colour." />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {THEME_PRESETS.map((p) => {
              const active = draft.presetId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setDraft((d) => ({ ...d, presetId: p.id, colors: { ...p.colors } }))}
                  className={cn(
                    "rounded-2xl p-3 text-left transition-shadow",
                    active ? "shadow-[0_0_0_2px_rgb(var(--ink))]" : "shadow-[0_0_0_1px_rgba(10,10,10,0.08)] hover:shadow-[0_0_0_1px_rgba(10,10,10,0.2)]"
                  )}
                >
                  <div className="overflow-hidden rounded-xl p-2" style={{ background: p.colors.page }}>
                    <div className="flex h-6 items-center gap-1 rounded-md px-1.5" style={{ background: p.colors.header }}>
                      <span className="h-2.5 w-2.5 rounded-sm bg-white/30" />
                      <span className="h-2.5 w-6 rounded-sm bg-white/30" />
                      <span className="ml-auto h-3 w-7 rounded-sm bg-white/90" />
                    </div>
                    <div className="mt-2 flex items-end gap-1 rounded-md bg-white p-1.5">
                      {[0.45, 0.7, 1].map((h, i) => (
                        <span key={i} className="w-3 rounded-sm" style={{ height: 22 * h, background: p.colors.brand, opacity: 0.55 + i * 0.22 }} />
                      ))}
                      <span className="ml-auto h-3 w-8 rounded-full" style={{ background: p.colors.ink }} />
                    </div>
                  </div>
                  <p className="mt-2.5 flex items-center justify-between px-1 text-[13px]">
                    {p.name}
                    {active && <Check className="h-4 w-4" strokeWidth={2.2} />}
                  </p>
                </button>
              );
            })}
          </div>

          <p className="mb-4 mt-8 text-[13px] font-medium">Custom colours</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <ColorField key={f.key} label={f.label} hint={f.hint} value={draft.colors[f.key]} onChange={(v) => setColor(f.key, v)} />
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="mt-6 space-y-2">
              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}
        </Card>

        {/* Region: timezone + currency */}
        <Card className="p-7">
          <CardHeader title="Region" subtitle="The timezone every date, time, shift and reminder uses, and how amounts are shown." />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Timezone" hint={`Now ${zoneNow(draft.timezone)} there. Daylight saving is handled automatically.`}>
              <Select value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TIMEZONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Display currency" hint="Changes the symbol only — amounts aren't converted.">
              <Select value={draft.currency} onChange={(e) => set("currency", e.target.value as CurrencyCode)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="mt-5 rounded-2xl bg-soft px-5 py-3.5 text-[13px] text-neutral-600">
            Example: <span className="text-ink">{compactMoney(1_250_000)}</span> · <span className="text-ink">{compactMoney(640_000)}</span>
          </p>
        </Card>

        {/* Header style */}
        <Card className="p-7">
          <CardHeader title="Header style" />
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["bar", "Bar", "Coloured bar with page switcher, quick actions and a Create button."],
                ["classic", "Classic", "Logo with a row of tabs on the page background."],
              ] as const
            ).map(([key, title, body]) => {
              const active = draft.headerStyle === key;
              return (
                <button
                  key={key}
                  onClick={() => set("headerStyle", key)}
                  className={cn(
                    "rounded-2xl p-4 text-left transition-shadow",
                    active ? "shadow-[0_0_0_2px_rgb(var(--ink))]" : "shadow-[0_0_0_1px_rgba(10,10,10,0.08)] hover:shadow-[0_0_0_1px_rgba(10,10,10,0.2)]"
                  )}
                >
                  <div className="rounded-xl bg-page p-2.5">
                    {key === "bar" ? (
                      <div className="flex h-9 items-center gap-1.5 rounded-lg bg-header px-1.5">
                        <span className="h-6 w-6 rounded-md bg-header-fg/20" />
                        <span className="h-6 w-14 rounded-md bg-header-fg/20" />
                        <span className="h-6 w-10 rounded-md bg-header-fg/20" />
                        <span className="ml-auto h-6 w-12 rounded-md bg-header-cta" />
                      </div>
                    ) : (
                      <div className="flex h-9 items-center gap-1.5 px-1">
                        <LogoMark className="h-5 w-5 text-ink" />
                        <span className="h-5 w-12 rounded-full bg-ink" />
                        <span className="h-2 w-8 rounded-full bg-neutral-300" />
                        <span className="h-2 w-8 rounded-full bg-neutral-300" />
                        <span className="ml-auto h-6 w-6 rounded-full bg-white" />
                        <span className="h-6 w-6 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <p className="mt-3 flex items-center justify-between text-[14px] font-medium">
                    {title}
                    {active && <Check className="h-4 w-4" strokeWidth={2.2} />}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">{body}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Typography */}
        <Card className="p-7">
          <CardHeader title="Typography" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {FONTS.map((f) => {
              const active = draft.font === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => set("font", f.key)}
                  style={{ fontFamily: `var(${f.cssVar})` }}
                  className={cn(
                    "rounded-2xl p-5 text-left transition-shadow",
                    active ? "shadow-[0_0_0_2px_rgb(var(--ink))]" : "shadow-[0_0_0_1px_rgba(10,10,10,0.08)] hover:shadow-[0_0_0_1px_rgba(10,10,10,0.2)]"
                  )}
                >
                  <span className="block text-[34px] leading-none tracking-[-0.02em]">Aa</span>
                  <span className="mt-4 block text-[13px]">{f.label}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Preview + actions */}
      <div className="xl:sticky xl:top-[116px] xl:self-start">
        <Card className="p-7">
          <CardHeader title="Live preview" subtitle="The whole app updates as you edit. Nothing is saved until you click Save." />
          <div className="rounded-[18px] bg-page p-3">
            <div className="flex h-12 items-center gap-1.5 rounded-[14px] bg-header px-2 text-header-fg">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-header-fg/[0.12]">
                <BrandMark className="h-4 w-4 text-header-fg" imgClassName="h-5 max-w-[24px]" />
              </span>
              <span className="flex h-8 items-center gap-1.5 rounded-[10px] bg-header-fg/[0.12] px-2.5 text-[12px]">
                <LayoutGrid className="h-3.5 w-3.5" /> Dashboard
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-header-fg/[0.12]">
                <Search className="h-3.5 w-3.5" />
              </span>
              <span className="hidden h-8 w-8 place-items-center rounded-[10px] bg-header-fg/[0.12] sm:grid">
                <UserPlus className="h-3.5 w-3.5" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-header-fg/[0.12]">
                <Bell className="h-3.5 w-3.5" />
              </span>
              <span className="ml-auto flex h-9 items-center gap-1.5 rounded-[11px] bg-header-cta px-3 text-[12px] font-medium text-header-cta-fg">
                Create <ArrowRight className="h-3 w-3" />
              </span>
            </div>

            <div className="mt-3 rounded-[14px] bg-white p-4">
              <p className="text-[12px] text-neutral-500">Total Revenue</p>
              <div className="mt-1 flex items-end justify-between">
                <p className="text-[24px] leading-none tracking-[-0.02em] text-ink">{compactMoney(8_400_000)}</p>
                <div className="flex items-end gap-1.5">
                  {[
                    ["--brand-300", 18],
                    ["--brand-500", 30],
                    ["--brand-600", 44],
                  ].map(([v, h]) => (
                    <span key={v} className="w-5 rounded-[4px]" style={{ height: Number(h), background: `rgb(var(${v}))` }} />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-white">Primary</span>
                <span className="rounded-full bg-brand px-3.5 py-1.5 text-[12px] text-brand-fg">Call</span>
                <span className="rounded-full bg-page px-3.5 py-1.5 text-[12px] text-ink">Filter</span>
                <span className="rounded-full bg-brand-50 px-3.5 py-1.5 text-[12px] text-brand-700">Meeting</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <Button size="lg" disabled={!dirty || pending} onClick={save}>
              {pending ? "Saving…" : "Save branding"}
            </Button>
            <Button size="lg" variant="secondary" disabled={!dirty || pending} onClick={() => setDraft(saved)}>
              Discard changes
            </Button>
            <Button variant="link" className="mt-1 self-center text-[13px]" disabled={pending || same(draft, DEFAULT_BRANDING)} onClick={() => setDraft(DEFAULT_BRANDING)}>
              Restore defaults
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-soft p-4">
      <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(10,10,10,0.1)]" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label} colour`} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">{label}</p>
        <p className="truncate text-[12px] text-neutral-500">{hint}</p>
      </div>
      <Input
        value={text}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          setText(v);
          if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
        }}
        className="h-10 w-[104px] font-mono text-[13px] uppercase"
      />
    </div>
  );
}

/** "9:42 PM EDT" in a given timezone. */
function zoneNow(tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date());
}
