"use client";

/**
 * Edit-security form (name, ticker, asset type, pricing mode). Full page at
 * /settings/investments/securities/[id]/edit (was the "Edit security" dialog).
 * Submit logic moved verbatim from the list page: a ticker change is sent as
 * its own PATCH {symbol} (re-cluster) first, then the remaining edits PATCH
 * the security the re-cluster landed on.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseSaveError } from "@/lib/save-error";
import { ASSET_TYPE_LABELS, advisoryFor, type Security } from "./shared";
import { FormCard, FormFooter, FormRow, SegmentedToggle } from "./form-rows";

type PriceSource = "auto" | "manual";

export function EditSecurityForm({
  security,
  onCancel,
  onSaved,
}: {
  security: Security;
  onCancel: () => void;
  /** Called with the notice code after a successful save. */
  onSaved: (notice: string) => void;
}) {
  const [name, setName] = useState(security.name ?? "");
  // Ticker. Changing it RE-CLUSTERS (PATCH {symbol}) — the fix for a mistyped or
  // provider-unknown symbol surfaced by the `unpriced` advisory.
  const [symbol, setSymbol] = useState(security.symbol ?? "");
  const [assetType, setAssetType] = useState(security.assetType || "stock");
  const [priceSource, setPriceSource] = useState<PriceSource>(security.priceSource ?? "auto");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const nextName = name.trim();
    if (!nextName) {
      setErrors({ name: "Name is required" });
      return;
    }
    const nextSymbol = symbol.trim();
    const symbolChanged =
      !security.isCash && nextSymbol !== "" && nextSymbol !== (security.symbol ?? "").trim();
    setErrors({});
    setSaving(true);
    try {
      // A ticker change is a RE-CLUSTER and the server handles it EXCLUSIVELY —
      // PATCH {symbol} returns before it looks at name/assetType/priceSource. So
      // send it as its own request FIRST, then fold the remaining edits into the
      // usual PATCH against whichever security the re-cluster landed on (an
      // existing security for the new ticker is reused = a legitimate merge, and
      // that target's id is what the rest of the edits must address).
      let targetId = security.id;
      if (symbolChanged) {
        const symRes = await fetch("/api/securities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: security.id, symbol: nextSymbol }),
        });
        if (!symRes.ok) {
          setErrors({ symbol: await parseSaveError(symRes, "Failed to change ticker") });
          return;
        }
        const symJson = await symRes.json().catch(() => null);
        const newId = symJson?.data?.newSecurityId;
        if (typeof newId === "number") targetId = newId;
      }

      // Send the asset type only when the user changed it (FINLYNQ-201). It's a
      // cosmetic, user-settable override — the server never re-clusters on it.
      const body: { id: number; name: string; assetType?: string; priceSource?: PriceSource } = {
        id: targetId,
        name: nextName,
      };
      if (assetType && assetType !== security.assetType) {
        body.assetType = assetType;
      }
      if (priceSource !== security.priceSource) {
        body.priceSource = priceSource;
      }
      const res = await fetch("/api/securities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await parseSaveError(res, "Failed to update security");
        setErrors({ name: msg });
        return;
      }
      onSaved(symbolChanged ? "ticker-changed" : "security-updated");
    } catch (e) {
      setErrors({ name: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSaving(false);
    }
  }

  const isCash = security.isCash;
  const isCrypto = security.isCrypto;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormCard>
        {/* Ticker. Hidden for cash sleeves — their symbol IS a currency code and is
            structural, not a lookup key. Changing it re-points every position (and
            its full history) at the new ticker; the server reuses an existing
            security for that symbol if there is one. */}
        {!isCash && (
          <FormRow
            label="Ticker"
            htmlFor="edit-symbol"
            error={errors.symbol}
            hint={
              errors.symbol
                ? undefined
                : advisoryFor(security)
                  ? "This ticker can't be priced. Correct it here, or switch Pricing to Manual below."
                  : "Changing this re-points the holding and its history to the new ticker."
            }
          >
            <Input
              id="edit-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. AMZN"
              className="font-mono"
            />
          </FormRow>
        )}
        <FormRow label="Display name" htmlFor="edit-name" error={errors.name}>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apple Inc."
          />
        </FormRow>
        {/* Asset type override is meaningful only for tradable securities (the eq:
            stock/etf bucket). Changing it is purely a display override (never
            re-clusters). */}
        {!isCash && !isCrypto && (
          <FormRow
            label="Asset type"
            hint="Overrides the automatic classification (from Yahoo) for the badge."
          >
            <Select
              items={ASSET_TYPE_LABELS}
              value={assetType}
              onValueChange={(v) => setAssetType(v ?? "stock")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Asset type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Stock</SelectItem>
                <SelectItem value="etf">ETF</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
        )}
        {/* Pricing mode — manual securities are excluded from the market price API
            and valued off the prices you enter. Hidden for cash sleeves (always 1). */}
        {!isCash && (
          <FormRow
            label="Pricing"
            hint={
              priceSource === "manual"
                ? "Not fetched from the market — set prices under “Prices”."
                : "Prices are fetched automatically from Yahoo/CoinGecko."
            }
          >
            <SegmentedToggle<PriceSource>
              options={["auto", "manual"]}
              value={priceSource}
              onChange={setPriceSource}
              labels={{ auto: "Auto-fetch", manual: "Manual" }}
            />
          </FormRow>
        )}
      </FormCard>
      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </FormFooter>
    </form>
  );
}
