/** P6: FINLYNQ_EMAIL_CAPTURE test hook: captures instead of sending; inert in production. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("@/lib/system-settings", () => ({ loadEmailOverrides: async () => ({}) }));
import { sendEmail } from "@/lib/email";

const msg = { to: "x@fam6.test", subject: "s", html: "<p>h</p>", text: "link ?token=abc" };

afterEach(() => {
  delete process.env.FINLYNQ_EMAIL_CAPTURE;
  vi.unstubAllEnvs();
});

describe("FINLYNQ_EMAIL_CAPTURE", () => {
  it("appends one JSON line per message instead of using a transport", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "fam-mail-")), "m.jsonl");
    process.env.FINLYNQ_EMAIL_CAPTURE = file;
    await sendEmail(msg);
    await sendEmail({ ...msg, to: "y@fam6.test" });
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.to)).toEqual(["x@fam6.test", "y@fam6.test"]);
    expect(lines[0].text).toBe(msg.text);
  });

  it("is ignored in production (falls through to the real transport, which refuses to run unconfigured)", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "fam-mail-")), "m.jsonl");
    process.env.FINLYNQ_EMAIL_CAPTURE = file;
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendEmail(msg)).rejects.toThrow(/Email transport not configured/);
    expect(existsSync(file)).toBe(false);
  });
});
