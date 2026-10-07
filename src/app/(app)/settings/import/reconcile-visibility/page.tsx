"use client";

/**
 * /settings/import/reconcile-visibility — per-account "hide from reconcile
 * dropdown" management. Renders the full ReconcileHideAccountsCard list UI
 * (fetch + optimistic toggle) so the main /settings/import page can show a
 * compact entry-point card instead of the full list inline.
 *
 * FINLYNQ-241 — collapsed the inline list on /settings/import behind this
 * subpage. Persistence is unchanged: GET/PUT /api/settings/reconcile-hidden-accounts.
 */

import { ReconcileHideAccountsCard } from "@/components/inbox/reconcile-hide-accounts-card";
import { PageHeader } from "@/components/mobile";

export default function ReconcileVisibilityPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <PageHeader title="Reconcile dropdown visibility" titleClassName="text-2xl font-bold tracking-tight" backHref="/settings/import" backLabel="Import settings" />
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose which accounts appear in the account picker on the Import page.
        </p>
      </div>

      <ReconcileHideAccountsCard />
    </div>
  );
}
