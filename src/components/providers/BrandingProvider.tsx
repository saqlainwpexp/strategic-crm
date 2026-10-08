"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setCurrency } from "@/lib/currency";
import type { Branding } from "@/lib/branding";
import { themeVars } from "@/lib/theme";

type Ctx = {
  /** Saved branding. */
  saved: Branding;
  /** What the UI shows right now: the live preview while editing, otherwise saved. */
  branding: Branding;
  setPreview: (b: Branding | null) => void;
  markSaved: (b: Branding) => void;
};

const BrandingCtx = createContext<Ctx | null>(null);

export function useBranding() {
  const ctx = useContext(BrandingCtx);
  if (!ctx) throw new Error("useBranding must be used inside <BrandingProvider>");
  return ctx;
}

function applyVars(b: Branding) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(b))) root.style.setProperty(k, v);
}

export function BrandingProvider({ initial, children }: { initial: Branding; children: React.ReactNode }) {
  const [saved, setSaved] = useState(initial);
  const [preview, setPreviewState] = useState<Branding | null>(null);

  // Server re-render after a save brings a new `initial`.
  useEffect(() => setSaved(initial), [initial]);

  const branding = preview ?? saved;
  // Formatting helpers read this synchronously, so set it during render (server and client).
  setCurrency(branding.currency);
  useEffect(() => {
    applyVars(branding);
  }, [branding]);

  const setPreview = useCallback((b: Branding | null) => setPreviewState(b), []);
  const markSaved = useCallback((b: Branding) => {
    setSaved(b);
    setPreviewState(null);
  }, []);

  const value = useMemo(() => ({ saved, branding, setPreview, markSaved }), [saved, branding, setPreview, markSaved]);
  return (
    <BrandingCtx.Provider value={value}>
      {/* Remount when the saved currency changes so memoised amounts re-format. Keyed on the
          saved value (not the live preview) so the branding editor keeps its draft while editing. */}
      <Fragment key={saved.currency}>{children}</Fragment>
    </BrandingCtx.Provider>
  );
}
