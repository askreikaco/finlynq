/**
 * Client check for "is this browser a trusted device". Lives outside src/lib/local-first so that the
 * local-first modules never name an app API route (tests/local-first/importer-isolation.test.ts).
 */
export async function fetchTrustedDeviceId(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/device-current", { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown } | null;
    return typeof body?.id === "string" && body.id !== "" ? body.id : null;
  } catch {
    return null;
  }
}
