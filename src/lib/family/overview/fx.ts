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

  /** Resolve every currency (idempotent). Unresolvable codes stay absent from the map. */
  async prepare(codes: Iterable<string | null | undefined>): Promise<void> {
    const todo = new Set<string>();
    for (const c of codes) {
      if (!c) continue;
      const code = norm(c, this.display);
      if (this.tried.has(code)) continue;
      if (!CODE_RE.test(code) || this.tried.size + todo.size >= MAX_LOOKUPS) {
        this.tried.add(code); // never resolved
        continue;
      }
      todo.add(code);
    }
    if (todo.size === 0) return;
    const displayLeg = await getRateToUsdDetailed(this.display, this.today, this.viewerId);
    const displayOk = this.display === "USD" || !isTotalMiss(this.display, displayLeg) ;
    for (const code of todo) {
      this.tried.add(code);
      if (code === this.display) continue;
      if (!displayOk || displayLeg.rate === 0) continue;
      const leg = await getRateToUsdDetailed(code, this.today, this.viewerId);
      if (isTotalMiss(code, leg)) continue;
      this.rates.set(code, leg.rate / displayLeg.rate);
    }
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
