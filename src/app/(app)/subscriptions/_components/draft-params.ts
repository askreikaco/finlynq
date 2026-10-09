import { isValidIsoDate, normalizeFrequency } from "@/lib/subscriptions/schedule";
import { EMPTY_DRAFT, type SubscriptionDraft } from "./subscription-form";

const DIGITS = /^\d+$/;
const AMOUNT = /^\d+(\.\d+)?$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * Prefill for /subscriptions/new from a detected recurring payment ("Review").
 * Each param is validated on its own; anything malformed falls back to blank,
 * so a hand-edited URL can't seed an invalid draft.
 */
export function draftFromSearchParams(sp: URLSearchParams): SubscriptionDraft {
  const pick = (key: string, ok: (v: string) => boolean): string => {
    const v = sp.get(key) ?? "";
    return ok(v) ? v : "";
  };
  const frequency = normalizeFrequency(sp.get("frequency"));
  return {
    ...EMPTY_DRAFT,
    name: (sp.get("name") ?? "").slice(0, 200),
    amount: pick("amount", (v) => AMOUNT.test(v) && parseFloat(v) > 0),
    currency: pick("currency", (v) => CURRENCY.test(v)),
    frequency: frequency ?? EMPTY_DRAFT.frequency,
    categoryId: pick("categoryId", (v) => DIGITS.test(v)),
    accountId: pick("accountId", (v) => DIGITS.test(v)),
    nextDate: pick("nextDate", (v) => isValidIsoDate(v)),
  };
}

/** Query string for the Review link: the detected row, rolled forward to `nextDate`. */
export function draftSearchParams(d: {
  name: string; amount: string; currency: string; frequency: string;
  categoryId: string; accountId: string; nextDate: string;
}, returnTo: string): string {
  const p = new URLSearchParams();
  p.set("name", d.name);
  p.set("amount", d.amount);
  p.set("currency", d.currency);
  p.set("frequency", d.frequency);
  if (d.categoryId) p.set("categoryId", d.categoryId);
  if (d.accountId) p.set("accountId", d.accountId);
  if (d.nextDate) p.set("nextDate", d.nextDate);
  p.set("returnTo", returnTo);
  return `/subscriptions/new?${p.toString()}`;
}
