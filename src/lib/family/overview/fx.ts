/**
 * Viewer-currency conversion for the overview. Uses the existing FX engine (getRateToUsdDetailed,
 * triangulated through USD) with the VIEWER's id, so the viewer's own fx_overrides apply and the
 * owner's never do (plan 7b).
 *
 * Contract: NEVER a silent 1:1. getRateToUsdDetailed returns `{rate:1, source:"fallback"}` on a
 * total miss for a non-USD currency; that is treated as "no rate": convert() returns null and the
 * caller flags the member partial. convertWithRateMap (rate ?? 1) is only ever fed resolved rates.
 */
import { getRateToUsdDetailed, convertWithRateMap } from "@/lib/fx-service";

const norm = (c: string | null | undefined, fallback: string) => (c ?? fallback).trim().toUpperCase();

/**
 * Currency codes come from the OWNER's rows. Only plain 3-5 letter codes are ever looked up (the FX
 * engine may call an external provider per code), and at most MAX_LOOKUPS per request: anything else
 * stays unresolved (-> null + partial), so an owner cannot make a viewer's request fan out.
 */
const CODE_RE = /^[A-Z]{3,5}$/;
const MAX_LOOKUPS = 25;

export class FxContext {
  readonly display: string;
  private readonly rates = new Map<string, number>();
  private readonly tried = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();
  /** lookup timings ("CODE=Nms/source", never rates) for the [family] timing log */
  readonly lookups: string[] = [];
  private displayLeg: ReturnType<typeof getRateToUsdDetailed> | undefined;

  constructor(
    private readonly viewerId: string,
    display: string,
    private readonly today: string,
  ) {
    this.display = display.trim().toUpperCase();
    this.rates.set(this.display, 1);
  }

  /** Resolved rates only (code -> display). Safe to pass to convertWithRateMap / buildNetWorthHistory. */
  get map(): Map<string, number> {
    return this.rates;
  }

  /**
   * Resolve every currency (idempotent). Unresolvable codes stay absent from the map.
   * Concurrency-safe: sections build in parallel, so a code already being looked up is
   * awaited rather than treated as done (which would read as a missing rate).
   */
  async prepare(codes: Iterable<string | null | undefined>): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const c of codes) {
      if (!c) continue;
      const code = norm(c, this.display);
      const inFlight = this.pending.get(code);
      if (inFlight) {
        waits.push(inFlight);
        continue;
      }
      if (this.tried.has(code)) continue;
      this.tried.add(code);
      if (!CODE_RE.test(code) || this.pending.size >= MAX_LOOKUPS) continue; // never resolved
      const p = this.resolve(code);
      this.pending.set(code, p);
      waits.push(p);
    }
    await Promise.all(waits);
  }

  private async resolve(code: string): Promise<void> {
    if (code === this.display) return;
    const displayLeg = await (this.displayLeg ??= this.timedLookup(this.display));
    const displayOk = this.display === "USD" || !isTotalMiss(this.display, displayLeg);
    if (!displayOk || displayLeg.rate === 0) return;
    const leg = await this.timedLookup(code);
    if (isTotalMiss(code, leg)) return;
    this.rates.set(code, leg.rate / displayLeg.rate);
  }

  private async timedLookup(code: string) {
    const t0 = Date.now();
    const leg = await getRateToUsdDetailed(code, this.today, this.viewerId);
    this.lookups.push(`${code}=${Date.now() - t0}ms/${leg.source}`);
    return leg;
  }

  rate(code: string | null | undefined): number | null {
    return this.rates.get(norm(code, this.display)) ?? null;
  }

  /** from -> to cross rate through the display currency; null if either leg is unresolved. */
  cross(from: string, to: string): number | null {
    const f = this.rate(from);
    const t = this.rate(to);
    if (f == null || t == null || t === 0) return null;
    return f / t;
  }

  /** Amount in `code` -> display currency (rounded like convertWithRateMap); null without a real rate. */
  convert(amount: number | null | undefined, code: string | null | undefined): number | null {
    if (amount == null) return null;
    if (this.rate(code) == null) return null;
    return convertWithRateMap(amount, norm(code, this.display), this.rates);
  }
}

function isTotalMiss(code: string, leg: { rate: number; source: string }): boolean {
  return code !== "USD" && leg.source === "fallback" && leg.rate === 1;
}
