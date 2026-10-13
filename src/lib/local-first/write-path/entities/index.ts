/**
 * Entity adapter registry (local-first L3). Lookup by kind; an entry without `entity` is a transaction.
 * Create offline: transaction, budget, goal, rule. Edit only (no create/delete offline): account, category.
 */
import type { EntityAdapter, EntityKind, OutboxEntry } from "../types";
import { accountAdapter } from "./account";
import { budgetAdapter } from "./budget";
import { categoryAdapter } from "./category";
import { goalAdapter } from "./goal";
import { ruleAdapter } from "./rule";
import { transactionAdapter } from "./transaction";

const REGISTRY: Partial<Record<EntityKind, EntityAdapter>> = {
  transaction: transactionAdapter,
  budget: budgetAdapter,
  goal: goalAdapter,
  rule: ruleAdapter,
  account: accountAdapter,
  category: categoryAdapter,
};

export { accountAdapter, budgetAdapter, categoryAdapter, goalAdapter, ruleAdapter, transactionAdapter };

/** Entity of an entry. Records sealed before the generalisation have no field: they are transactions. */
export function entityOf(e: Pick<OutboxEntry, "entity">): EntityKind {
  return e.entity ?? "transaction";
}

/** Adapter for a kind, or null when the kind has none yet. */
export function adapterFor(kind: EntityKind): EntityAdapter | null {
  return REGISTRY[kind] ?? null;
}

/** Local row id of an entity's server row. Transactions keep the bare id (existing cache rows); others are prefixed. */
export function rowIdFor(kind: EntityKind, serverId: number): string {
  return kind === "transaction" ? String(serverId) : `${kind}:${serverId}`;
}

export function registeredKinds(): EntityKind[] {
  return Object.keys(REGISTRY) as EntityKind[];
}
