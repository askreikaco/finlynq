/**
 * Generic card layout ({ order, hidden } of card ids) for any page that lets the user show, hide and
 * reorder its cards. Pure (no React, no DB): shared by the useCardLayout hook, the card-layout API route
 * and the dashboard (which keeps its own legacy storage key, see dashboard-layout.ts).
 * A page's card array order IS its default order. `defaultVisible: false` starts a card hidden.
 */

export interface PageCard {
  id: string;
  title: string;
  /** Default true. false = hidden until the user shows it. */
  defaultVisible?: boolean;
  /** Only listed/rendered when the page is in dev mode (the page filters on this). */
  devOnly?: boolean;
}

export interface CardLayout {
  order: string[];
  hidden: string[];
}

/** Per-user storage key of the generic route (the dashboard uses its own legacy key). */
export function cardLayoutKey(pageId: string): string {
  return `card_layout_v1:${pageId}`;
}

/** Page ids: short lowercase slugs only (they become settings keys). */
export const PAGE_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

export function defaultCardLayout(cards: readonly PageCard[]): CardLayout {
  return {
    order: cards.map((c) => c.id),
    hidden: cards.filter((c) => c.defaultVisible === false).map((c) => c.id),
  };
}

function uniqueKnown(list: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of list) {
    if (typeof id === "string" && known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Coerce anything (saved JSON, request body) into a complete layout for `cards`: unknown ids dropped,
 * duplicates removed, cards missing from `order` (added after the user saved) inserted right after their
 * default predecessor (and hidden if they default to hidden). `hidden` is limited to known ids.
 */
export function normalizeCardLayout(raw: unknown, cards: readonly PageCard[]): CardLayout {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const defaultOrder = cards.map((c) => c.id);
  const known = new Set(defaultOrder);
  const order = uniqueKnown(obj.order, known);
  const hidden = uniqueKnown(obj.hidden, known);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (order.includes(card.id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const pos = order.indexOf(defaultOrder[j]);
      if (pos !== -1) {
        at = pos + 1;
        break;
      }
    }
    order.splice(at, 0, card.id);
    if (card.defaultVisible === false && !hidden.includes(card.id)) hidden.push(card.id);
  }
  return { order, hidden };
}
