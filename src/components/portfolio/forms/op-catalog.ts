import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Globe2,
  Receipt,
  Send,
  ShoppingCart,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

/** Operation keys. `transfer` is the in-kind transfer (legacy `?op=transfer` links). */
export type OpKey =
  | "buy"
  | "sell"
  | "swap"
  | "transfer"
  | "income-expense"
  | "fx-conversion"
  | "deposit"
  | "withdrawal";

export type OpGroupKey = "trades" | "transfers" | "income";

export interface OpDef {
  key: OpKey;
  /** Route segment: /portfolio/new/<slug>. */
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: OpGroupKey;
}

export const OP_GROUPS: { key: OpGroupKey; label: string }[] = [
  { key: "trades", label: "Trades" },
  { key: "transfers", label: "Transfers" },
  { key: "income", label: "Income and other" },
];

export const OPS: OpDef[] = [
  { key: "buy", slug: "buy", title: "Buy", description: "Acquire shares, debits the cash sleeve", icon: ShoppingCart, group: "trades" },
  { key: "sell", slug: "sell", title: "Sell", description: "Realize a position, proceeds to cash", icon: TrendingDown, group: "trades" },
  { key: "swap", slug: "swap", title: "Swap", description: "Sell one holding, buy another", icon: ArrowRightLeft, group: "trades" },
  { key: "transfer", slug: "in-kind-transfer", title: "In-kind transfer", description: "Move shares between investment accounts", icon: Send, group: "transfers" },
  { key: "deposit", slug: "deposit", title: "Deposit", description: "Fund a brokerage cash sleeve", icon: ArrowDownToLine, group: "transfers" },
  { key: "withdrawal", slug: "withdrawal", title: "Withdrawal", description: "Move cash out of a brokerage sleeve", icon: ArrowUpFromLine, group: "transfers" },
  { key: "income-expense", slug: "income-expense", title: "Income / expense", description: "Dividends, interest, custodial fees", icon: Receipt, group: "income" },
  { key: "fx-conversion", slug: "fx-conversion", title: "FX conversion", description: "Convert one cash currency to another", icon: Globe2, group: "income" },
];

export const NEW_OP_HREF = "/portfolio/new";

export function isOpKey(v: string | null | undefined): v is OpKey {
  return !!v && OPS.some((o) => o.key === v);
}

export function opDef(key: OpKey): OpDef {
  const def = OPS.find((o) => o.key === key);
  if (!def) throw new Error(`unknown op ${key}`);
  return def;
}

/** Route for an op key, keeping any extra query (editId, account, holding ...). */
export function opHref(key: OpKey, query = ""): string {
  return `${NEW_OP_HREF}/${opDef(key).slug}${query}`;
}
