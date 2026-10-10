"use client";

/**
 * /settings/categorization — Category Management ONLY. The list, add and
 * rename pages are shared with the merged categories hub: this screen renders
 * CategoryManagement, and add/rename go to /categories/new and
 * /categories/[id]/edit (returnTo = this page).
 *
 * FINLYNQ-84 (2026-05-21) moved Transaction Rules out of this page into the
 * dedicated `/settings/rules` sub-page.
 */

import { SectionPage } from "@/components/templates";
import { CategoryManagement } from "@/app/(app)/categories/_components/category-management";

export default function CategorizationSettingsPage() {
  return (
    <SectionPage
      id="settings-categorization"
      title="Categories"
      subtitle={<>Manage transaction categories. Auto-categorization rules live in <a href="/settings/rules" className="underline hover:text-foreground">Rules</a>.</>}
      padBottom="none"
      minW0={false}
      suspense={false}
    >
      <CategoryManagement returnTo="/settings/categorization" />
    </SectionPage>
  );
}
