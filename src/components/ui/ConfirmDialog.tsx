"use client";

import { useCallback, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Overlay";

type Ask = { title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean; run: () => void | Promise<unknown> };

/** `const { confirm, dialog } = useConfirm()` — render `dialog` once, call `confirm({...})` anywhere. */
export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => !busy && setAsk(null), [busy]);

  const dialog = (
    <Modal
      open={!!ask}
      onClose={close}
      title={ask?.title ?? ""}
      className="max-w-[460px]"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={ask?.danger ? "danger" : "primary"}
            disabled={busy}
            onClick={async () => {
              if (!ask) return;
              setBusy(true);
              try {
                await ask.run();
              } finally {
                setBusy(false);
                setAsk(null);
              }
            }}
          >
            {busy ? "Working…" : ask?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      {ask?.body && <div className="text-[14px] leading-relaxed text-neutral-600">{ask.body}</div>}
    </Modal>
  );

  return { confirm: setAsk as (a: Ask) => void, dialog };
}
