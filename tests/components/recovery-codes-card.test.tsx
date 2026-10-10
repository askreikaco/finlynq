/**
 * @vitest-environment jsdom
 * Settings > Account > RecoveryCodesCard: status, generate/regenerate with a
 * password step-up, codes shown ONCE (copy / download / "I saved them"),
 * low-codes warning. fetch is routed.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecoveryCodesCard } from "@/components/settings/recovery-codes-card";

type Reply = { status?: number; body: unknown };
let status: { unused: number; total: number; createdAt: string | null };
let postReply: () => Reply;
let calls: { method: string; url: string; body: Record<string, unknown> }[];

const CODES = Array.from({ length: 10 }, (_, i) => `ABCDE-FGHIJ-KLMNO-PQR${String.fromCharCode(65 + i)}2`);
const posts = () => calls.filter((c) => c.method === "POST");

beforeEach(() => {
  calls = [];
  status = { unused: 10, total: 10, createdAt: "2026-09-01T10:00:00.000Z" };
  postReply = () => ({ body: { codes: CODES, createdAt: "2026-10-01T00:00:00.000Z" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const r: Reply = url !== "/api/settings/recovery-codes" ? { status: 404, body: {} } : method === "POST" ? postReply() : { body: status };
      const st = r.status ?? 200;
      return { ok: st < 400, status: st, json: async () => r.body } as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RecoveryCodesCard status", () => {
  it("shows unused/total and no warning with plenty of codes", async () => {
    render(<RecoveryCodesCard />);
    expect(await screen.findByTestId("recovery-codes-status")).toHaveTextContent("10 of 10 codes unused");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /regenerate recovery codes/i })).toBeInTheDocument();
  });

  it("warns at 2 left, but not at 3", async () => {
    status = { unused: 3, total: 10, createdAt: null };
    const { unmount } = render(<RecoveryCodesCard />);
    expect(await screen.findByTestId("recovery-codes-status")).toHaveTextContent("3 of 10 codes unused");
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();
    status = { unused: 2, total: 10, createdAt: null };
    render(<RecoveryCodesCard />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/only 2 recovery codes left/i);
  });

  it("warns loudly at 0 left and singular at 1", async () => {
    status = { unused: 1, total: 10, createdAt: null };
    const { unmount } = render(<RecoveryCodesCard />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/only 1 recovery code left/i);
    unmount();
    status = { unused: 0, total: 10, createdAt: null };
    render(<RecoveryCodesCard />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/no unused recovery codes/i);
  });

  it("no codes yet: offers Generate (not Regenerate)", async () => {
    status = { unused: 0, total: 0, createdAt: null };
    render(<RecoveryCodesCard />);
    expect(await screen.findByText(/no recovery codes yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^generate recovery codes$/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("RecoveryCodesCard generate (step-up)", () => {
  it("asks for the password FIRST: no POST until it is entered; the POST carries it", async () => {
    const user = userEvent.setup();
    render(<RecoveryCodesCard />);
    await user.click(await screen.findByRole("button", { name: /regenerate recovery codes/i }));
    expect(posts()).toHaveLength(0);
    expect(screen.getByText(/existing codes stop working/i)).toBeInTheDocument();
    const go = screen.getByRole("button", { name: /replace my codes/i });
    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText(/current password/i), "Hunter2!Hunter2");
    await user.click(go);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ currentPassword: "Hunter2!Hunter2" });
  });

  it("wrong password (401): error, no codes, password prompt stays", async () => {
    const user = userEvent.setup();
    postReply = () => ({ status: 401, body: { error: "Your password is incorrect." } });
    render(<RecoveryCodesCard />);
    await user.click(await screen.findByRole("button", { name: /regenerate recovery codes/i }));
    await user.type(screen.getByLabelText(/current password/i), "nope");
    await user.click(screen.getByRole("button", { name: /replace my codes/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/password is incorrect/i);
    expect(screen.queryByText(CODES[0])).toBeNull();
  });

  it.each([
    [423, /unlocked/i],
    [429, /too many/i],
    [500, /could not generate/i],
  ])("status %i shows a clear message", async (st, re) => {
    const user = userEvent.setup();
    postReply = () => ({ status: st, body: {} });
    render(<RecoveryCodesCard />);
    await user.click(await screen.findByRole("button", { name: /regenerate recovery codes/i }));
    await user.type(screen.getByLabelText(/current password/i), "x");
    await user.click(screen.getByRole("button", { name: /replace my codes/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(re);
  });
});

describe("RecoveryCodesCard shows the codes once", () => {
  async function generate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /regenerate recovery codes/i }));
    await user.type(screen.getByLabelText(/current password/i), "Hunter2!Hunter2");
    await user.click(screen.getByRole("button", { name: /replace my codes/i }));
    await screen.findByTestId("recovery-codes-list");
  }

  it("lists all 10 codes, Done stays disabled until 'I saved them', then the codes are gone for good", async () => {
    const user = userEvent.setup();
    render(<RecoveryCodesCard />);
    await generate(user);
    for (const c of CODES) expect(screen.getByText(c)).toBeInTheDocument();
    const done = screen.getByRole("button", { name: /^done$/i });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: /i saved them/i }));
    expect(done).toBeEnabled();
    status = { unused: 10, total: 10, createdAt: "2026-10-01T00:00:00.000Z" };
    await user.click(done);

    await waitFor(() => expect(screen.queryByTestId("recovery-codes-list")).toBeNull());
    for (const c of CODES) expect(screen.queryByText(c)).toBeNull();
    expect(document.body.textContent).not.toContain(CODES[0]);
    expect(await screen.findByTestId("recovery-codes-status")).toHaveTextContent("10 of 10 codes unused");
    // exactly one generation happened; status refreshed via GET only
    expect(posts()).toHaveLength(1);
  });

  it("a fresh mount (reload) never shows codes again and never POSTs by itself", async () => {
    const user = userEvent.setup();
    const first = render(<RecoveryCodesCard />);
    await generate(user);
    first.unmount();
    render(<RecoveryCodesCard />);
    await screen.findByTestId("recovery-codes-status");
    expect(screen.queryByTestId("recovery-codes-list")).toBeNull();
    expect(document.body.textContent).not.toContain(CODES[0]);
    expect(posts()).toHaveLength(1);
  });

  it("Copy all writes every code, one per line", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    render(<RecoveryCodesCard />);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await generate(user);
    await user.click(screen.getByRole("button", { name: /copy all/i }));
    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
    expect(await screen.findByText(/^copied$/i)).toBeInTheDocument();
  });

  it("Download .txt builds finlynq-recovery-codes.txt containing every code", async () => {
    const user = userEvent.setup();
    let blob: Blob | null = null;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => ((blob = b), "blob:x");
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    let downloadName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
    render(<RecoveryCodesCard />);
    await generate(user);
    await user.click(screen.getByRole("button", { name: /download \.txt/i }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloadName).toBe("finlynq-recovery-codes.txt");
    expect(blob).not.toBeNull();
    const text = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(blob!);
    });
    for (const c of CODES) expect(text).toContain(c);
  });
});
