/**
 * Worker request handlers (local-first P1, PKG-10). PROTOTYPE, unreviewed. SYNTHETIC data only.
 * Pure dispatch: the backend is injected, so tests run in-process without a Worker.
 */
import { generate, DEFAULT_N, DEFAULT_SEED, type FixtureDataset } from "../fixture/generate";
import * as ref from "../fixture/reference";
import { importFixture } from "../importer/import-fixture";
import type { LogKeys } from "../crypto/kdf";
import type { LocalStore, BalanceOptions, BalanceRow, RowCounts } from "../store/types";
import { isLfDatabaseName, type LfRequest, type LfResponse, type LfResult, type ParityCheck, type ParityReport } from "./protocol";

/** Everything a handler may touch. The worker supplies the real one; tests supply fakes. */
export interface LfBackend {
  getStore(): Promise<LocalStore>;
  getKeys(): Promise<LogKeys>;
  closeStore(): Promise<void>;
  listDatabases(): Promise<string[]>;
  deleteDatabase(name: string): Promise<void>;
}

export interface HandlerOptions {
  /** Defaults to generate({ seed: DEFAULT_SEED, n: DEFAULT_N }). */
  dataset?: FixtureDataset;
}

/** Only prototype databases are eligible for wipe. */
export function lfDatabasesOnly(names: string[]): string[] {
  return names.filter((n) => isLfDatabaseName(n));
}

const BALANCE_COMBOS: BalanceOptions[] = [
  { includeArchived: false, includeInvisible: false },
  { includeArchived: true, includeInvisible: false },
  { includeArchived: false, includeInvisible: true },
  { includeArchived: true, includeInvisible: true },
];
const SPEND_WINDOWS: ref.DateWindow[] = [
  { from: "2024-01-01", to: "2024-12-31" },
  { from: "2025-03-01", to: "2025-09-30" },
  { from: "2024-01-01", to: "2026-12-31" },
];
const INCOME_WINDOWS: ref.DateWindow[] = [
  { from: "2025-01-01", to: "2025-12-31" },
  { from: "2024-06-01", to: "2026-06-30" },
];

const cents = (x: number): number => Math.round(x * 100);

/** Compares two keyed maps at cents: same key set, same cents per key, non-empty. */
function compareMaps(name: string, local: Map<string, number>, refm: Map<string, number>): ParityCheck {
  const mismatches: string[] = [];
  const keys = new Set([...local.keys(), ...refm.keys()]);
  for (const k of keys) {
    const x = local.get(k);
    const y = refm.get(k);
    if (x === undefined || y === undefined || cents(x) !== cents(y)) mismatches.push(k);
  }
  mismatches.sort();
  return { name, ok: keys.size > 0 && mismatches.length === 0, keys: keys.size, mismatches: mismatches.slice(0, 5) };
}

function add(m: Map<string, number>, k: string, v: number): void {
  m.set(k, (m.get(k) ?? 0) + v);
}

/**
 * In-browser parity: LocalStore (loaded through the importer op path) vs fixture/reference.ts only.
 * The server oracle is test-only and is not used here.
 */
export async function runParity(store: LocalStore, data: FixtureDataset): Promise<ParityReport> {
  const checks: ParityCheck[] = [];
  for (const combo of BALANCE_COMBOS) {
    const local = new Map((await store.accountBalances(combo)).map((r: BalanceRow) => [r.accountId, r.balance] as const));
    const refm = new Map(ref.accountBalances(data, combo).map((r) => [r.accountId, r.balance] as const));
    checks.push(compareMaps(`balances archived=${combo.includeArchived} invisible=${combo.includeInvisible}`, local, refm));
  }
  for (const w of SPEND_WINDOWS) {
    const local = new Map<string, number>();
    for (const r of await store.spendingByCategory(w.from, w.to)) add(local, r.categoryId ?? "null", r.total);
    const refm = new Map<string, number>();
    for (const r of ref.categoryTotalsE(data, w)) add(refm, r.categoryId, r.total);
    checks.push(compareMaps(`spending ${w.from}..${w.to}`, local, refm));
  }
  for (const w of INCOME_WINDOWS) {
    const local = new Map<string, number>();
    for (const r of await store.incomeVsExpenses(w.from, w.to)) add(local, `${r.month}|${r.type}|${r.currency}`, r.total);
    const refm = new Map<string, number>();
    for (const r of ref.incomeVsExpenses(data, w)) add(refm, `${r.month}|${r.type}|${r.currency}`, r.total);
    checks.push(compareMaps(`income ${w.from}..${w.to}`, local, refm));
  }
  // Hero net worth: local balances (archived and invisible included), converted, then summed.
  const heroRows = (await store.accountBalances({ includeArchived: true, includeInvisible: true })).map((r) => ({
    accountType: r.accountType,
    invisible: r.invisible,
    converted: ref.convertWithRateMap(r.balance, r.currency ?? "", ref.FIXED_RATE_MAP),
  }));
  const hero = ref.sumAssetsLiabilities(heroRows, (r) => r.converted);
  const heroRef = ref.heroNetWorth(data);
  checks.push(
    compareMaps(
      "hero net worth",
      new Map([
        ["totalAssets", hero.totalAssets],
        ["totalLiabilities", hero.totalLiabilities],
        ["netWorth", hero.netWorth],
      ]),
      new Map([
        ["totalAssets", heroRef.totalAssets],
        ["totalLiabilities", heroRef.totalLiabilities],
        ["netWorth", heroRef.netWorth],
      ]),
    ),
  );
  return { passed: checks.filter((c) => c.ok).length, total: checks.length, checks };
}

async function handle(req: LfRequest, b: LfBackend, opts: HandlerOptions): Promise<LfResult> {
  const data = opts.dataset ?? generate({ seed: DEFAULT_SEED, n: DEFAULT_N });
  switch (req.type) {
    case "importFixture": {
      const store = await b.getStore();
      const r = await importFixture({ store, keys: await b.getKeys(), dataset: data });
      return { type: "importFixture", summary: { ops: r.ops, batches: r.batches, counts: r.counts, stateHash: r.stateHash } };
    }
    case "counts": {
      const counts: RowCounts = await (await b.getStore()).counts();
      return { type: "counts", counts };
    }
    case "runParity": {
      return { type: "runParity", report: await runParity(await b.getStore(), data) };
    }
    case "wipe": {
      await b.closeStore();
      const targets = lfDatabasesOnly(await b.listDatabases());
      for (const name of targets) await b.deleteDatabase(name);
      return { type: "wipe", deleted: targets };
    }
  }
}

/** Runs one request and never throws: errors come back as { ok: false }. */
export async function dispatch(req: LfRequest, b: LfBackend, opts: HandlerOptions = {}): Promise<LfResponse> {
  try {
    return { id: req.id, ok: true, result: await handle(req, b, opts) };
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
