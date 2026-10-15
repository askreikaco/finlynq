"use client";

/**
 * /settings/backfill — wizard that creates a backfill run.
 *
 * Step 1: pick mode (refuse_orphans vs synthesize_orphans, the S8 preflight).
 * Step 2: pick scope (all accounts vs specific accounts vs date range).
 * Step 3: POST /api/settings/backfill, redirect to /settings/backfill/<runId>.
 *
 * Live feature doc: pf-app/docs/architecture/backfill.md.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, Coins, Loader2, SlidersHorizontal, Target } from "lucide-react";
import { Field } from "@/components/ui/field";
import { SectionPage } from "@/components/templates";

type Mode = "refuse_orphans" | "synthesize_orphans";
type ScopeChoice = "all" | "accounts" | "date_range";

interface AccountOption {
  accountId: number;
  name: string;
  isInvestment: boolean;
}

export default function BackfillWizardPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>("all");
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // /api/accounts returns raw Drizzle rows passed through decryptNamedRows
    // — the PK field is `id`, not `accountId`. The wizard normalizes to
    // `accountId` locally because the planner POST body expects
    // `scope.accountIds[]`.
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        const list = arr
          .filter((a: { isInvestment?: boolean; id?: unknown }) =>
            a.isInvestment === true && typeof a.id === "number" && Number.isFinite(a.id),
          )
          .map((a: { id: number; name?: string }) => ({
            accountId: a.id,
            name: a.name ?? `account #${a.id}`,
            isInvestment: true,
          }));
        setAccounts(list);
      })
      .catch(() => setAccounts([]));
  }, []);

  async function handleSubmit() {
    if (!mode) {
      setError("Pick a mode first.");
      return;
    }
    if (scopeChoice === "accounts") {
      if (accountIds.length === 0) {
        setError("Select at least one account, or switch to 'All accounts'.");
        return;
      }
    }
    setSubmitting(true);
    setError("");
    const scope: { accountIds?: number[]; dateFrom?: string; dateTo?: string } = {};
    if (scopeChoice === "accounts") {
      // Defensive: filter out any null/undefined ids that might have crept in
      // from a malformed account list (the API guards against this but the
      // UI shouldn't trust it blindly).
      const cleanIds = accountIds.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
      if (cleanIds.length === 0) {
        setError("Selected account ids are invalid — refresh and try again.");
        return;
      }
      scope.accountIds = cleanIds;
    }
    if (scopeChoice === "date_range") {
      if (dateFrom) scope.dateFrom = dateFrom;
      if (dateTo) scope.dateTo = dateTo;
    }
    try {
      const res = await fetch("/api/settings/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, scope }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      router.push(`/settings/backfill/${data.runId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setSubmitting(false);
    }
  }

  return (
    <SectionPage
      id="settings-backfill"
      width="report"
      center
      className="p-6"
      title="Backfill"
      padBottom="none"
      minW0={false}
      suspense={false}
    >

      <CashSleeveSymbolFix />

      <Card
        title="1. Mode"
        icon={SlidersHorizontal}
        tone="indigo"
        info="One-time fix so realized gains and lot tracking work; account balances are unchanged. Choose how to handle stock legs with no matching cash leg: flag them for manual fixing, or fabricate a paired cash leg."
        infoLabel="About mode"
        className="space-y-3"
      >
        <ModeCard
          label="I import cash transactions separately"
          selected={mode === "refuse_orphans"}
          onSelect={() => setMode("refuse_orphans")}
        />
        <ModeCard
          label="I only track investments here"
          warning="Fabricates a paired cash leg; the bank-side balance will diverge by that amount."
          selected={mode === "synthesize_orphans"}
          onSelect={() => setMode("synthesize_orphans")}
        />
      </Card>

      <Card
        title="2. Scope"
        icon={Target}
        tone="cyan"
        info="Narrow which transactions the planner looks at."
        infoLabel="About scope"
        className="space-y-4"
      >
        <div className="flex gap-2 flex-wrap">
          <ScopeChip label="All accounts" selected={scopeChoice === "all"} onSelect={() => setScopeChoice("all")} />
          <ScopeChip label="Specific accounts" selected={scopeChoice === "accounts"} onSelect={() => setScopeChoice("accounts")} />
          <ScopeChip label="Date range" selected={scopeChoice === "date_range"} onSelect={() => setScopeChoice("date_range")} />
        </div>

        {scopeChoice === "accounts" && (
          <div className="space-y-1">
            {accounts.length === 0 && <p className="text-sm text-muted-foreground" data-keep="empty">No investment accounts.</p>}
            {accounts.map((a) => (
              <Field
                key={a.accountId}
                label={a.name}
                control="checkbox"
                checked={accountIds.includes(a.accountId)}
                onChange={(e) => {
                  setAccountIds((prev) =>
                    e.target.checked ? [...prev, a.accountId] : prev.filter((id) => id !== a.accountId),
                  );
                }}
              />
            ))}
          </div>
        )}

        {scopeChoice === "date_range" && (
          <div className="flex gap-3 items-center">
            <Field
              label="From:"
              control="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="ml-1"
            />
            <Field
              label="To:"
              control="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="ml-1"
            />
          </div>
        )}
      </Card>

      {error && (
        <div className="border border-destructive bg-destructive/10 text-destructive rounded p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={!mode || submitting}>
          {submitting ? (<><Loader2 className="size-4 animate-spin mr-2" /> Computing…</>) : (<>Compute <ArrowRight className="size-4 ml-2" /></>)}
        </Button>
      </div>
    </SectionPage>
  );
}

function ModeCard({
  label,
  selected,
  warning,
  onSelect,
}: {
  label: string;
  selected: boolean;
  /** Visible warning shown under the label. */
  warning?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`mt-1 size-3 rounded-full ${selected ? "bg-primary" : "border border-border"}`} />
        <div className="flex-1">
          <div className="font-medium text-sm">{label}</div>
          {warning && (
            <div className="text-xs text-warning mt-1 flex items-start gap-1">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function ScopeChip({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-full px-3 py-1 text-sm border ${
        selected ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Phase 4a — Cash-sleeve symbol fix.
 *
 * Cash sleeves (portfolio_holdings.is_cash=true) commonly ship with the
 * Symbol field blank because users name them like "CL - CAD" or
 * "Fidelity - CAD" without filling the separate symbol field. This card
 * surfaces a one-click fix: POST to the server-side endpoint which sets
 * symbol = currency for every cash sleeve missing one (using the user's
 * DEK to encrypt the symbol value).
 *
 * Idempotent — clicking again after a successful fix returns 0.
 */
function CashSleeveSymbolFix() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ fixed: number; total: number } | null>(null);
  const [error, setError] = useState<string>("");

  async function handleFix() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/settings/backfill/fix-cash-sleeve-symbols", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`);
      } else {
        setResult({ fixed: data.fixed ?? 0, total: data.total ?? 0 });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
    setBusy(false);
  }

  return (
    <Card
      title="0. Cash symbols"
      icon={Coins}
      tone="amber"
      info='Sets symbol = currency on cash sleeves with no symbol (a CAD sleeve gets "CAD"). Safe to repeat; only touches missing symbols.'
      infoLabel="About cash symbols"
    >
      <Button variant="outline" onClick={handleFix} disabled={busy}>
        {busy ? <><Loader2 className="size-4 animate-spin mr-2" /> Fixing…</> : "Fix symbols"}
      </Button>
      {result && (
        <div className="text-xs text-muted-foreground mt-2" data-keep="status">
          Fixed {result.fixed} of {result.total}.
        </div>
      )}
      {error && (
        <div className="text-xs text-destructive mt-2">{error}</div>
      )}
    </Card>
  );
}
