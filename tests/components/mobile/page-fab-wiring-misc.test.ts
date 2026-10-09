import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FAB_ROUTES } from "@/components/mobile/fab-registry";

// Source-level wiring checks for the per-page FAB handlers on misc pages.
// Rules-of-hooks placement is also enforced by per-file eslint.

interface Wiring {
  file: string; // repo-relative page or component
  key: string; // FabHandlerKey registered by usePageFab
  route: string; // FAB_ROUTES key the handler belongs to
  component: string; // source text that starts the component body
  mustContain?: string[]; // opts or behaviour the wiring must keep
}

const WIRINGS: Wiring[] = [
  {
    file: "src/app/(app)/import/page.tsx",
    key: "import.upload",
    route: "/import",
    component: "function ImportPageInner() {",
    mustContain: ["enabled: account != null"],
  },
  {
    file: "src/app/(app)/feedback/page.tsx",
    key: "feedback.send",
    route: "/feedback",
    component: "export default function FeedbackPage() {",
    mustContain: ["setSendOpen(true)"],
  },
  {
    file: "src/app/(app)/admin/announcements/page.tsx",
    key: "admin.announcements.new",
    route: "/admin/announcements",
    component: "export default function AdminAnnouncementsPage() {",
    mustContain: ["startNew();", "scrollIntoView", "<Card ref={formRef}"],
  },
  {
    file: "src/app/(app)/family/_components/sharing-tab.tsx",
    key: "family.invite",
    route: "/family/share",
    component: "export function SharingTab(",
    mustContain: ["setShowInvite(true)"],
  },
  {
    file: "src/components/manage-accounts.tsx",
    key: "manage-accounts.add",
    route: "/manage-accounts",
    component: "export function ManageAccounts() {",
    mustContain: ["a.handleAdd", "disabled: a.busy !== null || a.atCap"],
  },
];

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe.each(WIRINGS)("page FAB wiring $key", (w) => {
  const src = read(w.file);

  it("imports usePageFab from @/components/mobile/page-fab", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\busePageFab\b[^}]*\}\s*from\s*"@\/components\/mobile\/page-fab"/,
    );
  });

  it(`calls usePageFab("${w.key}") and the registry route uses that handlerKey`, () => {
    expect(src.includes(`usePageFab("${w.key}"`)).toBe(true);
    expect(FAB_ROUTES[w.route]).toMatchObject({ kind: "handler", handlerKey: w.key });
  });

  it("calls the hook before the first early return of its component", () => {
    const start = src.indexOf(w.component);
    expect(start, `component anchor ${w.component}`).toBeGreaterThanOrEqual(0);
    const hookIdx = src.indexOf(`usePageFab("${w.key}"`, start);
    expect(hookIdx, "usePageFab inside the component").toBeGreaterThan(start);
    const early = /^  (if \(|return\b)/m.exec(src.slice(start));
    expect(early, "component has a return path").not.toBeNull();
    expect(hookIdx, "hook must precede the first early return").toBeLessThan(
      start + (early as RegExpExecArray).index,
    );
  });

  it("keeps the wiring details the plan requires", () => {
    for (const s of w.mustContain ?? []) {
      expect(src.includes(s), `missing: ${s}`).toBe(true);
    }
  });
});
