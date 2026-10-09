/**
 * Canonical JSON: sorted object keys (UTF-16 code unit order), no whitespace, finite numbers only.
 * Rejects NaN, +/-Infinity, undefined, functions, symbols, bigint, non-plain objects and cycles.
 */

function enc(v: unknown, stack: object[]): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "string":
      return JSON.stringify(v);
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) throw new TypeError(`canon: non-finite number ${String(v)}`);
      return JSON.stringify(v);
    case "undefined":
      throw new TypeError("canon: undefined is not allowed");
    case "object":
      break;
    default:
      throw new TypeError(`canon: unsupported type ${typeof v}`);
  }
  const obj = v as object;
  if (stack.includes(obj)) throw new TypeError("canon: cycle detected");
  stack.push(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        if (!(i in obj)) throw new TypeError("canon: sparse array is not allowed");
        parts.push(enc(obj[i], stack));
      }
      return "[" + parts.join(",") + "]";
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) throw new TypeError("canon: only plain objects allowed");
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(JSON.stringify(k) + ":" + enc((obj as Record<string, unknown>)[k], stack));
    }
    return "{" + parts.join(",") + "}";
  } finally {
    stack.pop();
  }
}

export function canonicalJson(value: unknown): string {
  return enc(value, []);
}
