/** The feedback pages are in the SPA bundle: the attachment policy they import must carry no node built-ins. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeInlineImageMime, validateFeedbackAttachment } from "@/lib/feedback/attachment-policy";
import * as server from "@/lib/feedback/attachment";

const src = (f: string) => readFileSync(path.resolve(__dirname, "../../src", f), "utf8");

describe("feedback attachment policy split", () => {
  it("attachment-policy.ts has no imports at all (client-safe)", () => {
    expect(src("lib/feedback/attachment-policy.ts")).not.toMatch(/^\s*import\s/m);
  });
  it("client components import the policy module, not the node one", () => {
    for (const f of ["components/feedback-dialog.tsx", "components/feedback/attachment-view.tsx", "app/(app)/feedback/page.tsx", "app/(app)/admin/feedback/page.tsx"]) {
      expect(src(f), f).not.toMatch(/lib\/feedback\/attachment"/);
    }
  });
  it("server module still re-exports the same functions and the path helper", () => {
    expect(server.isSafeInlineImageMime).toBe(isSafeInlineImageMime);
    expect(server.validateFeedbackAttachment).toBe(validateFeedbackAttachment);
    expect(typeof server.feedbackAttachmentPath).toBe("function");
  });
  it("validator behaves", () => {
    expect(validateFeedbackAttachment({ filename: "a.png", mime: "image/png", size: 10 })).toEqual({ ext: "png" });
    expect(validateFeedbackAttachment({ filename: "a.exe", mime: "x", size: 10 })).toMatchObject({ code: "bad_type" });
    expect(isSafeInlineImageMime("image/svg+xml")).toBe(false);
  });
});
