import { Nav } from "@/components/nav";
import { UnlockGate } from "@/components/unlock-gate";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { PromptGate } from "@/components/prompt-gate";
import { CurrencyProvider } from "@/components/currency-provider";
import { DropdownOrderProvider } from "@/components/dropdown-order-provider";
import { LanguageProvider } from "@/components/language-provider";
import { FontProvider } from "@/components/font-provider";
import { AnimationProvider } from "@/components/animation-provider";
import { ReportingRecomputeIndicator } from "@/components/reporting-recompute-indicator";
import { VersionGate } from "@/components/version-gate";
import { DataProvider } from "@/lib/data";
import { WebVitals } from "@/components/web-vitals";
import { QuickAddFAB } from "@/components/quick-add-fab";
import { isQuickAddEnabled } from "@/lib/quick-add/flag";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";
import { isCategoriesMergedEnabled } from "@/lib/categories/flag";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const instanceAdminEnabled = isInstanceAdminEnabled();
  const categoriesMerged = isCategoriesMergedEnabled();
  return (
    <>
    <VersionGate />
    <WebVitals />
    <UnlockGate>
      <DataProvider>
      <CurrencyProvider>
        <DropdownOrderProvider>
        <FontProvider>
        <AnimationProvider>
        <LanguageProvider>
        <div className="relative flex min-h-screen flex-col">
          <AnnouncementBanner />
          <PromptGate />
          <ReportingRecomputeIndicator avoidFab={isQuickAddEnabled()} />
          <div className="flex flex-1">
            <Nav instanceAdminEnabled={instanceAdminEnabled} categoriesMerged={categoriesMerged} />
            <main className={`flex-1 overflow-x-hidden overflow-y-auto min-w-0 ${
              isQuickAddEnabled() ? "pb-[calc(var(--mobile-bar-clearance)+64px)] md:pb-24" : "pb-[var(--mobile-bar-clearance)] md:pb-0"
            } bg-dot-pattern ambient-glow`}>
              {/* FINLYNQ-52: no width cap on the (app) shell — content fills
                  the viewport to the right of the sidebar. Per-page wrappers
                  may still impose their own readability cap (e.g. settings,
                  api-docs); the shell does not. */}
              {/* FAB spacing: When QuickAddFAB is rendered, the main content area
                  needs bottom padding to prevent the FAB from covering the last row.
                  Padding = FAB bottom (clearance - 8px) + FAB height (56px) + gap
                  = var(--mobile-bar-clearance) + 64px on mobile; no padding on desktop (md:pb-0) */}
              <div className="relative z-10 min-w-0 px-4 py-3 sm:px-6 sm:py-8 lg:px-8">
                {children}
              </div>
            </main>
          </div>
          {isQuickAddEnabled() && <QuickAddFAB />}
        </div>
        </LanguageProvider>
        </AnimationProvider>
        </FontProvider>
        </DropdownOrderProvider>
      </CurrencyProvider>
      </DataProvider>
    </UnlockGate>
    </>
  );
}
