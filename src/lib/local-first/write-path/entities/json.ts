/** Canonical JSON (object keys sorted) so two equal values compare equal whatever key order the server returns. */
export function canonicalJson(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as Record<string, unknown>).sort()) out[k] = norm((x as Record<string, unknown>)[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(norm(v));
}

/** Parses a JSON field value back to a value for a request body. Invalid JSON = the original text (the server then refuses it). */
export function parseJsonField(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
