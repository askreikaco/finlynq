import type { DrainFetch, DrainResponse, FetchInit } from "@/lib/local-first/write-path/drain";

export interface BudgetRow {
  id: number;
  categoryId: number;
  month: string;
  amount: number;
  currency: string;
  updatedAt: string;
}

const res = (status: number, body: unknown): DrainResponse => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * In-memory /api/budgets with the server's idempotency: a POST whose Idempotency-Key was already stored replays the
 * stored response and applies nothing. Scripted failures: a status, "net" (no apply), or "lose" (apply, then the
 * response is lost in the network).
 */
export class BudgetFakeServer {
  rows = new Map<number, BudgetRow>();
  categories = new Set<number>([1, 2]);
  nextId = 1;
  clock = 1_000_000;
  script: Array<number | "net" | "lose"> = [];
  replays = new Map<string, { status: number; body: unknown }>();
  log: Array<{ method: string; url: string; key: string | undefined }> = [];

  seed(categoryId: number, month: string, amount: number, currency = "CAD"): number {
    const id = this.nextId++;
    this.rows.set(id, { id, categoryId, month, amount, currency, updatedAt: new Date(this.clock).toISOString() });
    return id;
  }

  /** A change made by someone else on the server, stamped at `at` (ms). */
  editDirect(id: number, patch: Partial<Pick<BudgetRow, "amount" | "currency">>, at: number): void {
    Object.assign(this.rows.get(id) as BudgetRow, patch, { updatedAt: new Date(at).toISOString() });
  }

  fetch: DrainFetch = async (url: string, init?: FetchInit): Promise<DrainResponse> => {
    const method = init?.method ?? "GET";
    const key = init?.headers?.["Idempotency-Key"];
    this.log.push({ method, url, key });
    const fail = this.script.shift();
    if (fail === "net") throw new TypeError("network");
    if (typeof fail === "number") return res(fail, { error: "x" });
    const u = new URL(url, "http://x");
    let out: DrainResponse;
    if (method === "POST") {
      if (key !== undefined && this.replays.has(key)) {
        const r = this.replays.get(key)!;
        out = res(r.status, r.body);
      } else {
        const b = JSON.parse(init?.body ?? "{}") as { categoryId: number; month: string; amount: number; currency?: string };
        if (!this.categories.has(b.categoryId)) {
          out = res(404, { error: "Not found" });
        } else {
          let row = [...this.rows.values()].find((r) => r.categoryId === b.categoryId && r.month === b.month);
          const at = new Date(this.clock).toISOString();
          if (row) {
            row.amount = b.amount;
            if (b.currency) row.currency = b.currency;
            row.updatedAt = at;
          } else {
            row = { id: this.nextId++, categoryId: b.categoryId, month: b.month, amount: b.amount, currency: b.currency ?? "CAD", updatedAt: at };
            this.rows.set(row.id, row);
          }
          out = res(201, { ...row });
        }
        if (key !== undefined) {
          const body = await out.json();
          this.replays.set(key, { status: out.status, body });
        }
      }
    } else if (method === "GET") {
      const month = u.searchParams.get("month");
      out = res(200, [...this.rows.values()].filter((r) => (month ? r.month === month : true)).map((r) => ({ ...r })));
    } else if (method === "DELETE") {
      const id = Number(u.searchParams.get("id"));
      if (!this.rows.has(id)) out = res(404, { error: "nf" });
      else {
        this.rows.delete(id);
        out = res(200, { success: true });
      }
    } else {
      out = res(405, {});
    }
    if (fail === "lose") throw new TypeError("network after apply");
    return out;
  };
}
