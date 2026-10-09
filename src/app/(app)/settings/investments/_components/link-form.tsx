"use client";

/**
 * Link form. Two modes, one form (was the "Add to an account" / "Add a security"
 * dialog):
 *  - "account":  pick an account for a fixed security  (securities/[id]/link)
 *  - "security": pick a security for a fixed account   (accounts/[id]/link)
 * POST /api/securities {securityId, accountId} creates an empty position.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseSaveError } from "@/lib/save-error";
import { FormCard, FormFooter, FormRow } from "./form-rows";
import { descriptionOf, symbolLabel, type Account, type Security } from "./shared";

export type LinkMode = "account" | "security";

export function LinkForm({
  mode,
  fixedId,
  securities,
  accounts,
  onCancel,
  onSaved,
}: {
  mode: LinkMode;
  /** mode "account": the security id. mode "security": the account id. */
  fixedId: number;
  securities: Security[];
  accounts: Account[];
  onCancel: () => void;
  onSaved: (notice: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);

  const eligible = useMemo(() => {
    if (mode === "account") {
      const sec = securities.find((s) => s.id === fixedId);
      const taken = new Set(sec?.accounts.map((a) => a.accountId) ?? []);
      return accounts
        .filter((a) => a.isInvestment && !a.archived && !taken.has(a.id))
        .map((a) => ({ value: String(a.id), label: `${a.name} (${a.currency})` }));
    }
    const heldHere = new Set(
      securities.filter((s) => s.accounts.some((a) => a.accountId === fixedId)).map((s) => s.id),
    );
    return securities
      .filter((s) => !heldHere.has(s.id))
      .map((s) => {
        const d = descriptionOf(s);
        return { value: String(s.id), label: `${symbolLabel(s)}${d ? ` — ${d}` : ""} (${s.currency})` };
      });
  }, [mode, fixedId, securities, accounts]);

  const items = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of eligible) m[e.value] = e.label;
    return m;
  }, [eligible]);

  async function submit() {
    const picked = parseInt(value, 10);
    if (!Number.isFinite(picked) || picked <= 0) {
      setError(mode === "account" ? "Pick an account" : "Pick a security");
      return;
    }
    const securityId = mode === "account" ? fixedId : picked;
    const accountId = mode === "account" ? picked : fixedId;
    setLinking(true);
    try {
      const res = await fetch("/api/securities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityId, accountId }),
      });
      if (!res.ok) {
        setError(await parseSaveError(res, "Failed to link"));
        return;
      }
      onSaved("linked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLinking(false);
    }
  }

  const isAccount = mode === "account";
  const label = isAccount ? "Account" : "Security";
  const placeholder = isAccount ? "Choose an account" : "Choose a security";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormCard>
        <FormRow
          label={label}
          error={error || undefined}
          hint={
            isAccount
              ? "Choose an account to hold this security. Quantity and cost basis come from a transaction."
              : "Choose a security to add to this account. Quantity and cost basis come from a transaction."
          }
        >
          <Select items={items} value={value} onValueChange={(v) => setValue(v ?? "")}>
            <SelectTrigger aria-label={label}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {eligible.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  {isAccount ? "No eligible accounts" : "No eligible securities"}
                </SelectItem>
              ) : (
                eligible.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </FormRow>
      </FormCard>
      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={linking}>
          Cancel
        </Button>
        <Button type="submit" disabled={linking}>
          {linking ? "Adding…" : "Add"}
        </Button>
      </FormFooter>
    </form>
  );
}
