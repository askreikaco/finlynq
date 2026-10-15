/**
 * A category GROUP (parent) as a selectable id, for `?sel=<id>` and the `/categories/<id>` route.
 * A group is only a name on its categories, so its id is derived: `g-<type>-<slug>` (E = spending, I = income).
 * The slug is the name lowercased with every run of non-alphanumerics as `_`; it fits the split view's id token
 * (letters, digits, `_`, `-`, <= 64). Pure (no React): resolution takes the category list the page already has.
 */

export const GROUP_ID_PREFIX = "g-";
const MAX_SLUG = 48;

export function groupSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, MAX_SLUG) || "group";
}

/** `g-E-housing` for the spending group "Housing". */
export function groupSelId(type: "E" | "I", group: string): string {
  return `${GROUP_ID_PREFIX}${type}-${groupSlug(group)}`;
}

export function isGroupSelId(id: string | null | undefined): boolean {
  return !!id && /^g-[EI]-[A-Za-z0-9_]+$/.test(id);
}

export interface GroupLike {
  type: string;
  group: string;
}

/** The group a selection id names (real name + type), or null when no category has such a group. */
export function resolveGroupSelId(id: string, categories: readonly GroupLike[]): { type: "E" | "I"; name: string } | null {
  if (!isGroupSelId(id)) return null;
  const type = id.charAt(2) as "E" | "I";
  const slug = id.slice(4);
  for (const c of categories) {
    if (c.type === type && c.group && groupSlug(c.group) === slug) return { type, name: c.group };
  }
  return null;
}
