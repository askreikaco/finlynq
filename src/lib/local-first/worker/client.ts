/**
 * Main-thread client for the local-first worker (local-first P1, PKG-10). PROTOTYPE, unreviewed.
 * Throws at construction when Worker is unavailable (e.g. jsdom); callers catch and show status.
 */
import type { LfRequest, LfRequestType, LfResponse, LfResult } from "./protocol";

export class LocalFirstClient {
  private readonly worker: Worker;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (r: LfResult) => void; reject: (e: Error) => void }>();

  constructor() {
    if (typeof Worker === "undefined") throw new Error("Web Workers are not available in this browser");
    this.worker = new Worker(new URL("./local-first.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<LfResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "worker error");
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  request(type: LfRequestType): Promise<LfResult> {
    const id = ++this.seq;
    const req = { id, type } as LfRequest;
    return new Promise<LfResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(req);
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
