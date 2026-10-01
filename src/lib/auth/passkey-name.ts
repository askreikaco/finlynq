/**
 * Automatic passkey names (register/verify when the client sends no label).
 * Order: known AAGUID provider -> "<device> · <browser>" from the User-Agent
 * -> "Passkey". Duplicates per user get " (2)", " (3)". Max 60 chars (same
 * limit as rename).
 */

export const PASSKEY_NAME_MAX = 60;
export const FALLBACK_PASSKEY_NAME = "Passkey";

/** Subset of the public community list (passkey-authenticator-aaguids); static, no runtime fetch. */
export const AAGUID_PROVIDERS: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (Managed)",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "771b48fd-d3d4-4f74-9232-fc157ab0507a": "Edge on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "fdb141b2-5d84-443e-8a35-4698c205a502": "KeePassXC",
  "2fc0579f-8113-47ea-b116-bb5a8db9202a": "YubiKey",
};

export function providerFromAaguid(aaguid: string | null | undefined): string | null {
  if (!aaguid) return null;
  return AAGUID_PROVIDERS[aaguid.trim().toLowerCase()] ?? null;
}

export function deviceBrowserFromUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  let device: string | null = null;
  if (/iPhone|iPod/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";
  else if (/CrOS/i.test(ua)) device = "Chromebook";
  else if (/Linux|X11/i.test(ua)) device = "Linux";

  let browser: string | null = null;
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  if (device && browser) return `${device} · ${browser}`;
  return device ?? browser;
}

/** Appends " (2)", " (3)" until the name is unused (case-insensitive). */
export function uniquePasskeyName(base: string, existing: Iterable<string | null | undefined>): string {
  const taken = new Set<string>();
  for (const e of existing) if (e) taken.add(e.trim().toLowerCase());
  const root = base.slice(0, PASSKEY_NAME_MAX).trim() || FALLBACK_PASSKEY_NAME;
  if (!taken.has(root.toLowerCase())) return root;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${root.slice(0, PASSKEY_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function generatePasskeyName(opts: {
  aaguid?: string | null;
  userAgent?: string | null;
  existingLabels: Iterable<string | null | undefined>;
}): string {
  const base = providerFromAaguid(opts.aaguid) ?? deviceBrowserFromUserAgent(opts.userAgent) ?? FALLBACK_PASSKEY_NAME;
  return uniquePasskeyName(base, opts.existingLabels);
}
