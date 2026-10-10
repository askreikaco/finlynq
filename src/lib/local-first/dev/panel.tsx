"use client";

/**
 * Dev panel for the local-first prototype (P1, PKG-10). PROTOTYPE, unreviewed. SYNTHETIC data only.
 * Rendered only by src/app/(proto)/dev/local-first/page.tsx behind FINLYNQ_LOCAL_FIRST_DEV.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LocalFirstClient } from "../worker/client";
import type { RowCounts } from "../store/types";
import type { LfRequestType, ParityReport } from "../worker/protocol";
import { useLocalAccountBalances } from "../read-cache/use-local-balances";
import { isLocalReadCacheEnabled, setLocalReadCacheEnabled } from "../read-cache/optin";

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string } | { kind: "done"; message: string };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function LocalFirstDevPanel() {
  const clientRef = useRef<LocalFirstClient | null>(null);
  const [available, setAvailable] = useState(false);
  const [counts, setCounts] = useState<RowCounts | null>(null);
  const [parity, setParity] = useState<ParityReport | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const readCache = useLocalAccountBalances();
  const [readOn, setReadOn] = useState(false);

  useEffect(() => {
    setReadOn(isLocalReadCacheEnabled());
  }, []);

  async function toggleReadCache() {
    const next = !readOn;
    setLocalReadCacheEnabled(next);
    setReadOn(next);
    await readCache.refresh();
  }

  useEffect(() => {
    let client: LocalFirstClient;
    try {
      client = new LocalFirstClient();
    } catch (err) {
      setStatus({ kind: "error", message: errMessage(err) });
      return;
    }
    clientRef.current = client;
    setAvailable(true);
    client
      .request("counts")
      .then((r) => {
        if (r.type === "counts") setCounts(r.counts);
      })
      .catch((err: unknown) => setStatus({ kind: "error", message: errMessage(err) }));
    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, []);

  async function run(label: string, type: LfRequestType) {
    const client = clientRef.current;
    if (!client) return;
    setStatus({ kind: "busy", label });
    try {
      const r = await client.request(type);
      switch (r.type) {
        case "importFixture":
          setCounts(r.summary.counts);
          setStatus({ kind: "done", message: `imported ${r.summary.ops} ops in ${r.summary.batches} batches` });
          break;
        case "counts":
          setCounts(r.counts);
          setStatus({ kind: "done", message: "counts refreshed" });
          break;
        case "runParity":
          setParity(r.report);
          setStatus({ kind: "done", message: `parity ${r.report.passed}/${r.report.total} passed` });
          break;
        case "wipe":
          setParity(null);
          setCounts({ accounts: 0, categories: 0, transactions: 0 });
          setStatus({ kind: "done", message: `wiped ${r.deleted.length} database(s)` });
          break;
      }
    } catch (err) {
      setStatus({ kind: "error", message: errMessage(err) });
    }
  }

  const busy = status.kind === "busy";
  const disabled = busy || !available;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Local-first prototype (synthetic data)</h1>
        <p className="text-sm text-muted-foreground">Device-only. Dev flag required. Not linked from the app.</p>
      </header>

      <section aria-label="Row counts" className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Accounts</div>
          <div className="text-xl font-semibold text-foreground" data-testid="count-accounts">{counts?.accounts ?? "-"}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Categories</div>
          <div className="text-xl font-semibold text-foreground" data-testid="count-categories">{counts?.categories ?? "-"}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Transactions</div>
          <div className="text-xl font-semibold text-foreground" data-testid="count-transactions">{counts?.transactions ?? "-"}</div>
        </div>
      </section>

      <section aria-label="Actions" className="flex flex-wrap gap-2">
        <Button onClick={() => run("import", "importFixture")} disabled={disabled}>
          Import synthetic fixture
        </Button>
        <Button variant="outline" onClick={() => run("parity", "runParity")} disabled={disabled}>
          Run parity check
        </Button>
        <Button variant="destructive" onClick={() => run("wipe", "wipe")} disabled={disabled}>
          Wipe
        </Button>
      </section>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground" data-testid="status">
        {status.kind === "busy" && `Working: ${status.label}`}
        {status.kind === "done" && status.message}
        {status.kind === "error" && <span className="text-destructive">Error: {status.message}</span>}
      </p>

      <section aria-label="Read cache" className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">In-memory read cache (opt-in, default off, not persisted)</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={toggleReadCache} disabled={!available}>
            Read cache: {readOn ? "on" : "off"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void readCache.refresh()}
            disabled={readCache.status !== "ready" && readCache.status !== "error"}
          >
            Hydrate / refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="read-cache-status">
          status: {readCache.status}
          {readCache.error && <span className="text-destructive"> ({readCache.error})</span>}
        </p>
        {readCache.lastHydrate && (
          <p className="text-sm text-muted-foreground" data-testid="read-cache-counts">
            loaded: {readCache.lastHydrate.loaded.accounts} accounts, {readCache.lastHydrate.loaded.categories} categories,{" "}
            {readCache.lastHydrate.loaded.transactions} transactions; skipped: {readCache.lastHydrate.skipped.accounts} /{" "}
            {readCache.lastHydrate.skipped.categories} / {readCache.lastHydrate.skipped.transactions}; pages:{" "}
            {readCache.lastHydrate.pages}; balances: {readCache.balances.length} accounts
          </p>
        )}
      </section>

      {parity && (
        <section aria-label="Parity checks" className="space-y-2">
          <h2 className="text-sm font-medium text-foreground" data-testid="parity-summary">
            Parity {parity.passed}/{parity.total} passed
          </h2>
          <ul className="space-y-1 text-sm">
            {parity.checks.map((c) => (
              <li key={c.name} className={c.ok ? "text-muted-foreground" : "text-destructive"}>
                {c.ok ? "ok" : "FAIL"} {c.name} ({c.keys} keys)
                {!c.ok && c.mismatches.length > 0 && <span> first mismatches: {c.mismatches.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
