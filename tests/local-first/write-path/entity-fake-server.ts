import type { DrainFetch, DrainResponse, FetchInit } from "@/lib/local-first/write-path/drain";

type Row = { id: number; updatedAt: string } & Record<string, unknown>;
const res = (status: number, body: unknown): DrainResponse => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * In-memory list/create/update/delete server for goals, rules, accounts and categories (the four entities the queue
 * edits). Mirrors the routes: GET list (accounts hide archived rows unless includeArchived=1), POST and PUT {id,...},
 * DELETE ?id=, and the Idempotency-Key replay for POST. Rows are stored as the server returns them (booleans, objects).
 */
export class EntityFakeServer {
  tables = new Map<string, Map<number, Row>>();
  nextId = 1;
  clock = 1_000_000;
  replays = new Map<string, DrainResponse>();
  log: Array<{ method: string; url: string; key: string | undefined; body?: unknown }> = [];

  table(path: string): Map<number, Row> {
    if (!this.tables.has(path)) this.tables.set(path, new Map());
    return this.tables.get(path)!;
  }

  seed(path: string, fields: Record<string, unknown>, at = this.clock): number {
    const id = this.nextId++;
    this.table(path).set(id, { id, updatedAt: new Date(at).toISOString(), ...fields } as Row);
    return id;
  }

  /** A change by someone else on the server, stamped at `at` (ms). */
  editDirect(path: string, id: number, patch: Record<string, unknown>, at: number): void {
    Object.assign(this.table(path).get(id) as Row, patch, { updatedAt: new Date(at).toISOString() });
  }

  fetch: DrainFetch = async (url: string, init?: FetchInit): Promise<DrainResponse> => {
    const method = init?.method ?? "GET";
    const key = init?.headers?.["Idempotency-Key"];
    const u = new URL(url, "http://x");
    const path = u.pathname;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    this.log.push({ method, url, key, body });
    const t = this.table(path);
    if (method === "GET") {
      let rows = [...t.values()];
      if (path === "/api/accounts" && u.searchParams.get("includeArchived") !== "1") rows = rows.filter((r) => !r.archived);
      return res(200, rows.map((r) => ({ ...r })));
    }
    if (key !== undefined && method === "POST" && this.replays.has(key)) return this.replays.get(key)!;
    let out: DrainResponse;
    if (method === "POST") {
      const id = this.nextId++;
      t.set(id, { id, updatedAt: new Date(this.clock).toISOString(), ...(body as object) } as Row);
      out = res(201, { ...t.get(id) });
    } else if (method === "PUT") {
      const { id, ...patch } = body as { id: number } & Record<string, unknown>;
      const r = t.get(id);
      if (!r) out = res(404, { error: "nf" });
      else {
        Object.assign(r, patch, { updatedAt: new Date(this.clock).toISOString() });
        out = res(200, { ...r });
      }
    } else if (method === "DELETE") {
      const id = Number(u.searchParams.get("id"));
      if (!t.has(id)) out = res(404, { error: "nf" });
      else {
        t.delete(id);
        out = res(200, { success: true });
      }
    } else {
      out = res(405, {});
    }
    if (method === "POST" && key !== undefined) this.replays.set(key, out);
    return out;
  };
}
