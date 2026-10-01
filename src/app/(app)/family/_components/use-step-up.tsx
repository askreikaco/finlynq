"use client";

import { useCallback, useRef, useState } from "react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { StepUpDialog } from "./step-up-dialog";
import { isStepUpRequired } from "./api";

type Call = (currentPassword?: string) => Promise<Response>;
interface Pending {
  call: Call;
  resolve: (res: Response | null) => void;
}

/**
 * Step-up flow for sensitive family calls (invite, widen, accept with share-back).
 *
 *   execute(call): runs call() without a password. A 401 {code:"step_up_required"} opens the
 *   password dialog; each submit performs exactly ONE retry with currentPassword. A second
 *   step-up 401 means "wrong password": the dialog shows the error and waits for the user (no
 *   automatic loop). Resolves with the final Response, or null when the user cancels.
 */
export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);

  const finish = useCallback((res: Response | null) => {
    const p = pending.current;
    pending.current = null;
    setOpen(false);
    setBusy(false);
    setError(null);
    p?.resolve(res);
  }, []);

  const execute = useCallback(async (call: Call): Promise<Response | null> => {
    const first = await call(undefined);
    if (!(await isStepUpRequired(first))) return first;
    return new Promise<Response | null>((resolve) => {
      pending.current = { call, resolve };
      setError(null);
      setBusy(false);
      setOpen(true);
    });
  }, []);

  const submit = useCallback(
    async (password: string) => {
      const p = pending.current;
      if (!p) return;
      setBusy(true);
      setError(null);
      let res: Response;
      try {
        res = await p.call(password);
      } catch {
        setBusy(false);
        setError(FAMILY_STRINGS.error_network);
        return;
      }
      if (await isStepUpRequired(res)) {
        setBusy(false);
        setError(FAMILY_STRINGS.step_up_error);
        return;
      }
      // success, 429 (attempt limit) or any other error: hand it to the caller, never loop here
      finish(res);
    },
    [finish],
  );

  const dialog = (
    <StepUpDialog isOpen={open} busy={busy} error={error} onCancel={() => finish(null)} onSubmit={submit} />
  );

  return { execute, dialog, open };
}
