/**
 * Static audit of every <PageHeader> call site (TypeScript AST, no rendering).
 *
 * Phone bar rules (src/components/mobile/page-header.tsx):
 *  - the LAST phone-visible action is the primary; it collapses to an icon-only 44pt circle.
 *    Any other phone-visible action must be icon-only (no text), or the 9.5rem capsule overflows.
 *  - no phone-visible `lead`: a lead must carry HEADER_DESKTOP_ONLY (or be a hidden spacer).
 *
 * Hidden on phones: className containing max-regular:hidden, HEADER_SECONDARY or HEADER_DESKTOP_ONLY (alias), className="hidden",
 * or a FromMd element. Non-visual roots (Dialog, DropdownMenu) render no element of their own:
 * their *Trigger children (rendered via `render={...}` or the trigger itself) are the actions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import * as ts from "typescript";

const SRC = join(process.cwd(), "src");
const NON_VISUAL_ROOTS = new Set(["Dialog", "DropdownMenu", "AlertDialog"]);

interface Site {
  file: string;
  line: number;
  el: ts.JsxOpeningLikeElement;
  decls: Map<string, ts.Expression>;
}

interface Act {
  open: ts.JsxOpeningLikeElement;
  kids: ts.Node[];
  hidden: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function collectSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf-8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const decls = new Map<string, ts.Expression>();
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        decls.set(node.name.text, node.initializer);
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "PageHeader") {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        sites.push({ file: relative(process.cwd(), file), line, el: node, decls });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}

function getAttr(el: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function unwrap(e: ts.Node): ts.Node {
  let cur = e;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

function openOf(node: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function hiddenOnPhone(el: ts.JsxOpeningLikeElement): boolean {
  if (el.tagName.getText() === "FromMd") return true;
  const cls = getAttr(el, "className")?.initializer?.getText() ?? "";
  return /max-regular:hidden|max-md:hidden|HEADER_SECONDARY|HEADER_DESKTOP_ONLY/.test(cls) || /^(\{\s*)?["']hidden["'](\s*\})?$/.test(cls);
}

function outermostJsx(node: ts.Node, out: ts.Node[] = []): ts.Node[] {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    out.push(node);
    return out;
  }
  ts.forEachChild(node, (c) => {
    outermostJsx(c, out);
  });
  return out;
}

/** True when a node renders visible text on phones (hidden subtrees and icon-only elements do not count). */
function hasPhoneText(node: ts.Node): boolean {
  if (ts.isJsxText(node)) return /\S/.test(node.getText());
  if (ts.isJsxExpression(node)) {
    if (!node.expression) return false;
    const jsx = outermostJsx(node.expression);
    // a non-JSX expression (string, template, identifier) renders text
    if (jsx.length === 0) return true;
    return jsx.some(hasPhoneText);
  }
  if (ts.isJsxSelfClosingElement(node)) return false;
  if (ts.isJsxElement(node)) {
    if (hiddenOnPhone(node.openingElement)) return false;
    return node.children.some(hasPhoneText);
  }
  if (ts.isJsxFragment(node)) return node.children.some(hasPhoneText);
  return false;
}

function triggerAct(trigger: ts.JsxElement | ts.JsxSelfClosingElement): Act {
  const topen = openOf(trigger);
  const renderAttr = getAttr(topen, "render");
  const renderExpr = renderAttr?.initializer && ts.isJsxExpression(renderAttr.initializer) && renderAttr.initializer.expression
    ? unwrap(renderAttr.initializer.expression)
    : undefined;
  const kids: ts.Node[] = ts.isJsxElement(trigger) ? [...trigger.children] : [];
  if (renderExpr && (ts.isJsxElement(renderExpr) || ts.isJsxSelfClosingElement(renderExpr))) {
    const ropen = openOf(renderExpr);
    if (ts.isJsxElement(renderExpr)) kids.push(...renderExpr.children);
    return { open: ropen, kids, hidden: hiddenOnPhone(ropen) || hiddenOnPhone(topen) };
  }
  return { open: topen, kids, hidden: hiddenOnPhone(topen) };
}

/** Flatten an actions expression into the action elements it can render. */
function collectActs(expr: ts.Node | undefined, decls: Map<string, ts.Expression>, out: Act[] = []): Act[] {
  if (!expr) return out;
  const e = unwrap(expr);
  if (ts.isConditionalExpression(e)) {
    collectActs(e.whenTrue, decls, out);
    collectActs(e.whenFalse, decls, out);
    return out;
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return collectActs(e.right, decls, out);
  }
  if (ts.isIdentifier(e)) {
    const d = decls.get(e.text);
    return d ? collectActs(d, decls, out) : out;
  }
  if (ts.isJsxFragment(e)) {
    for (const c of e.children) {
      if (ts.isJsxExpression(c) && c.expression) collectActs(c.expression, decls, out);
      else if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) collectActs(c, decls, out);
    }
    return out;
  }
  if (ts.isJsxElement(e) && NON_VISUAL_ROOTS.has(e.openingElement.tagName.getText())) {
    for (const c of e.children) {
      if ((ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) && openOf(c).tagName.getText().endsWith("Trigger")) {
        out.push(triggerAct(c));
      }
    }
    return out;
  }
  if (ts.isJsxElement(e)) {
    out.push({ open: e.openingElement, kids: [...e.children], hidden: hiddenOnPhone(e.openingElement) });
    return out;
  }
  if (ts.isJsxSelfClosingElement(e)) {
    out.push({ open: e, kids: [], hidden: hiddenOnPhone(e) });
  }
  return out;
}

/** A phone-visible lucide-style icon (self-closing, capitalised). The primary needs one: its text is hidden on phones. */
function hasPhoneIcon(node: ts.Node): boolean {
  if (ts.isJsxSelfClosingElement(node)) {
    const name = node.tagName.getText();
    return /^[A-Z]/.test(name) && !["CompactOnly", "FromMd", "Badge"].includes(name) && !hiddenOnPhone(node);
  }
  if (ts.isJsxElement(node)) return !hiddenOnPhone(node.openingElement) && node.children.some(hasPhoneIcon);
  if (ts.isJsxFragment(node)) return node.children.some(hasPhoneIcon);
  if (ts.isJsxExpression(node) && node.expression) return outermostJsx(node.expression).some(hasPhoneIcon);
  return false;
}

function rel(site: Site): string {
  return `${site.file}:${site.line}`;
}

const sites = collectSites();

describe("PageHeader call sites (phone bar)", () => {
  it("scans every PageHeader call site (vacuity guard)", () => {
    const withActionsOrLead = sites.filter(
      (s) => getAttr(s.el, "actions") || getAttr(s.el, "lead"),
    ).length;
    expect(sites.length).toBeGreaterThanOrEqual(55);
    expect(withActionsOrLead).toBeGreaterThanOrEqual(25);
  });

  it("at most one phone-visible text action per header, and it is the last visible one (secondaries icon-only)", () => {
    const violations: string[] = [];
    for (const s of sites) {
      const actionsAttr = getAttr(s.el, "actions");
      const expr = actionsAttr?.initializer && ts.isJsxExpression(actionsAttr.initializer)
        ? actionsAttr.initializer.expression
        : undefined;
      const visible = collectActs(expr, s.decls).filter((a) => !a.hidden);
      const texty = visible.filter((a) => a.kids.some(hasPhoneText));
      // every phone-visible action is icon-only or the primary; a bare control (no icon) is a wide secondary
      if (visible.some((a) => !a.kids.some(hasPhoneIcon))) {
        violations.push(`${rel(s)}: phone-visible action without an icon (wide bare control in the capsule)`);
      }
      // a bare <div> wrapper is taken as one action (the primary); its buttons are not seen. Use a fragment.
      if (visible.some((a) => a.open.tagName.getText() === "div")) {
        violations.push(`${rel(s)}: phone-visible <div> wrapper groups actions (use a fragment)`);
      }
      if (texty.length > 1) {
        violations.push(`${rel(s)}: ${texty.length} phone-visible text actions (only the last may be text)`);
      } else if (texty.length === 1 && texty[0] !== visible[visible.length - 1]) {
        violations.push(`${rel(s)}: phone-visible text action is not the last visible action (would be a wide secondary)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no PageHeader has a phone-visible lead", () => {
    const violations: string[] = [];
    for (const s of sites) {
      const leadAttr = getAttr(s.el, "lead");
      if (!leadAttr?.initializer || !ts.isJsxExpression(leadAttr.initializer) || !leadAttr.initializer.expression) continue;
      const e = unwrap(leadAttr.initializer.expression);
      if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) {
        if (!hiddenOnPhone(openOf(e))) violations.push(`${rel(s)}: phone-visible lead (add HEADER_DESKTOP_ONLY or use backHref)`);
      } else {
        violations.push(`${rel(s)}: lead is not a JSX element, cannot prove it is hidden on phones`);
      }
    }
    expect(violations).toEqual([]);
  });
});
