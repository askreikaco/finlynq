import type { DrainFetch, DrainResponse, FetchInit } from "@/lib/local-first/write-path/drain";

interface Row { id: number; [k: string]: unknown }

/** Minimal in-memory /api/transactions: POST, PUT (merge, stamps updatedAt), DELETE (404 when gone), GET ?id= and date range. */
export class FakeServer {
  rows = new Map<number, Row>();
  nextId = 1;
  clock = 1_000_000;
  /** Scripted failures consumed in order: a status number, or "net" for a thrown network error, "lose" to apply then drop the response. */
  script: Array<number | "net" | "lose"> = [];
  log: Array<{ method: string; url: string; key: string | undefined }> = [];

  seed(fields: Record<string, unknown>): number {
    const id = this.nextId++;
    const iso = new Date(this.clock).toISOString();
    this.rows.set(id, { id, ...fields, createdAt: iso, updatedAt: iso });
    return id;
  }

  editDirect(id: number, patch: Record<string, unknown>, at: number): void {
    const r = this.rows.get(id) as Row;
    Object.assign(r, patch, { updatedAt: new Date(at).toISOString() });
  }

  fetch: DrainFetch = async (url: string, init?: FetchInit): Promise<DrainResponse> => {
    const method = init?.method ?? "GET";
    this.log.push({ method, url, key: init?.headers?.["Idempotency-Key"] });
    const fail = this.script.shift();
    if (fail === "net") throw new TypeError("network");
    if (typeof fail === "number") return res(fail, { error: "x" });
    const u = new URL(url, "http://x");
    let out: DrainResponse;
    if (method === "POST") {
      const b = JSON.parse(init?.body ?? "{}");
      const id = this.seed(b);
      this.rows.get(id)!.createdAt = new Date(this.clock).toISOString();
      out = res(201, this.rows.get(id));
    } else if (method === "PUT") {
      const { id, ...patch } = JSON.parse(init?.body ?? "{}");
      const r = this.rows.get(id);
      if (!r) return res(404, { error: "nf" });
      Object.assign(r, patch, { updatedAt: new Date(this.clock).toISOString() });
      out = res(200, r);
    } else if (method === "DELETE") {
      const id = Number(u.searchParams.get("id"));
      if (!this.rows.has(id)) return res(404, { error: "nf" });
      this.rows.delete(id);
      out = res(200, { success: true });
    } else {
      const id = u.searchParams.get("id");
      const d = u.searchParams.get("startDate");
      const data = [...this.rows.values()].filter((r) => (id ? r.id === Number(id) : d ? r.date === d : true));
      out = res(200, { data });
    }
    if (fail === "lose") throw new TypeError("network after apply");
    return out;
  };
}

const res = (status: number, body: unknown): DrainResponse => ({ ok: status >= 200 && status < 300, status, json: async () => body });
