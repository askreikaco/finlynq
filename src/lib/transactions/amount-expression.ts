/**
 * Safe arithmetic for the amount keypad. Pure, no eval / Function / new Function, so it
 * works under the production CSP (no 'unsafe-eval').
 *
 * Grammar (spaces ignored):
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := '-' unary | number
 *   number := digits, optional '.', optional digits (e.g. "5", "5.", ".5", "5.25")
 *
 * Rules:
 * - A trailing binary operator with no right operand is dropped ("100+" -> "100").
 * - Division by zero, parentheses, letters, double decimals, empty input and input longer
 *   than MAX_EXPRESSION_LENGTH return null.
 * - The result is rounded to 2 decimals and printed without trailing zeros ("3.50" -> "3.5").
 * - VND/JPY rounding is the caller's job.
 */

export const MAX_EXPRESSION_LENGTH = 64;
const MAX_ABS_RESULT = 1e15;

type Token = { kind: "num"; value: number } | { kind: "op"; op: "+" | "-" | "*" | "/" };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let j = i;
      let digits = 0;
      let dots = 0;
      while (j < src.length) {
        const c = src[j];
        if (c >= "0" && c <= "9") digits++;
        else if (c === ".") dots++;
        else break;
        j++;
      }
      if (dots > 1 || digits === 0) return null;
      const value = Number(src.slice(i, j));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

/** Recursive descent over the token list. Returns null on any structural error. */
function parse(tokens: Token[]): number | null {
  let pos = 0;

  const peekOp = (): "+" | "-" | "*" | "/" | null => {
    const t = tokens[pos];
    return t && t.kind === "op" ? t.op : null;
  };

  const parseUnary = (): number | null => {
    const t = tokens[pos];
    if (!t) return null;
    if (t.kind === "op") {
      if (t.op !== "-") return null;
      pos++;
      const inner = parseUnary();
      return inner === null ? null : -inner;
    }
    pos++;
    return t.value;
  };

  const parseTerm = (): number | null => {
    let left = parseUnary();
    if (left === null) return null;
    for (let op = peekOp(); op === "*" || op === "/"; op = peekOp()) {
      pos++;
      const right = parseUnary();
      if (right === null) return null;
      if (op === "*") {
        left = left * right;
      } else {
        if (right === 0) return null;
        left = left / right;
      }
    }
    return left;
  };

  let acc = parseTerm();
  if (acc === null) return null;
  for (let op = peekOp(); op === "+" || op === "-"; op = peekOp()) {
    pos++;
    const right = parseTerm();
    if (right === null) return null;
    acc = op === "+" ? acc + right : acc - right;
  }
  return pos === tokens.length ? acc : null;
}

export function evaluateAmountExpression(expr: string): string | null {
  if (typeof expr !== "string") return null;
  const compact = expr.replace(/\s+/g, "");
  if (compact.length === 0 || compact.length > MAX_EXPRESSION_LENGTH) return null;

  // Drop trailing binary operators that have no right operand.
  const trimmed = compact.replace(/[+\-*/]+$/, "");
  if (trimmed.length === 0) return null;

  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;

  const value = parse(tokens);
  if (value === null || !Number.isFinite(value) || Math.abs(value) > MAX_ABS_RESULT) return null;

  // toPrecision(15) strips float noise so 1.005 rounds to 1.01, not 1.00.
  let rounded = Math.round(Number((value * 100).toPrecision(15))) / 100;
  if (Object.is(rounded, -0)) rounded = 0;
  const fixed = rounded.toFixed(2);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}
