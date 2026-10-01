"use client";

/**
 * /settings/import — old URL kept. Renders Reconciliation in place with the
 * Import settings section open (no redirect). Deep links keep working and are
 * handled by Reconciliation (useOpenSection): ?tab=templates|email|migrate|
 * statements (legacy tab=connect -> migrate), #hash, ?provider=moneypro|
 * wealthposition|generic-csv (opens Migrate). Nav highlights Reconciliation.
 */

export { default } from "../reconciliation/page";
