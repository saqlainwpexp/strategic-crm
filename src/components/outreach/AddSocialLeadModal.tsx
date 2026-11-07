"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PlatformIcon } from "./PlatformIcon";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { quickAddAction } from "@/server/outreach/actions";
import { detectPlatform } from "@/lib/outreach/normalize";
import { platformLabel } from "@/lib/outreach/platforms";

/** Paste a profile URL → lead + thread (or the existing ones, if the profile is known). */
export function AddSocialLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { act } = useOutreach();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const platform = detectPlatform(url);

  const submit = async () => {
    setBusy(true);
    const res = await act(quickAddAction({ url, name: name || undefined, title: title || undefined, company: company || undefined }), (d) =>
      d.created ? `${d.name} added` : `${d.name} is already in the CRM`
    );
    setBusy(false);
    if (res.ok) {
      setUrl("");
      setName("");
      setTitle("");
      setCompany("");
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add social lead"
      subtitle="Paste a profile link. If it's already in the CRM you'll get the existing lead instead of a duplicate."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!platform || busy} onClick={submit}>
            {busy ? "Adding…" : "Add lead"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Profile URL" required hint={url && !platform ? "Use a LinkedIn, Facebook, Instagram, Threads, X or TikTok link." : undefined}>
          <div className="relative">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" autoFocus className={platform ? "pl-12" : undefined} />
            {platform && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2" title={platformLabel(platform)}>
                <PlatformIcon platform={platform} size={26} />
              </span>
            )}
          </div>
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Job title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Company">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
