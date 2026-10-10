import { AppTabs } from "@/components/nav";
import { UnlockGate } from "@/components/unlock-gate";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { PromptGate } from "@/components/prompt-gate";
import { NavHistoryTracker } from "@/components/nav-history-tracker";
import { CurrencyProvider } from "@/components/currency-provider";
import { DropdownOrderProvider } from "@/components/dropdown-order-provider";
import { LanguageProvider } from "@/components/language-provider";
import { FontProvider } from "@/components/font-provider";
import { AnimationProvider } from "@/components/animation-provider";
import { ReportingRecomputeIndicator } from "@/components/reporting-recompute-indicator";
import { VersionGate } from "@/components/version-gate";
import { DataProvider } from "@/lib/data";
import { WebVitals } from "@/components/web-vitals";
import { PageFab, PageFabProvider } from "@/components/mobile/page-fab";
import { KeyboardInsetObserver } from "@/components/mobile/keyboard-inset-observer";
import { AppSizeClassProvider } from "@/components/adaptive/size-class-context";
import { AppMainBarFlag } from "@/components/app-main-bar-flag";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
    <VersionGate />
    <WebVitals />
    <KeyboardInsetObserver />
    <UnlockGate>
      <DataProvider>
      <CurrencyProvider>
        <DropdownOrderProvider>
        <FontProvider>
        <AnimationProvider>
        <LanguageProvider>
        <PageFabProvider>
        <AppSizeClassProvider>
        <div className="relative flex min-h-screen flex-col">
          <AnnouncementBanner />
          <PromptGate />
          <ReportingRecomputeIndicator />
          <div className="flex flex-1">
            <AppTabs />
            {/* overflow-x-clip, not overflow-x-hidden: hidden forces overflow-y to auto, which makes <main> a scroll container.
                Its height is content height, so it never scrolls, and the sticky PageHeader inside would never pin to the window. */}
            {/* data-[bar-hidden]: routes without the tab bar (AppMainBarFlag) keep only the safe-area bottom below 640px. */}
            <main className="flex-1 overflow-x-clip min-w-0 pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0 data-[bar-hidden]:max-regular:pb-[var(--sab,0px)] regular:pl-[calc(5rem+var(--sal))] bg-dot-pattern ambient-glow" data-app-main="">
              <AppMainBarFlag />
              <NavHistoryTracker />
              {/* FINLYNQ-52: no width cap on the (app) shell — content fills
                  the viewport to the right of the sidebar. Per-page wrappers
                  may still impose their own readability cap (e.g. settings,
                  api-docs); the shell does not. */}
              {/* PageFab spacing: the per-page FAB sits at clearance + 12px and is 56px tall.
                  80px = 12 gap + 56 FAB + 12 breathing, so the last row clears it.
                  No bottom padding from 640px (regular:pb-0), where the bar and FAB are hidden.
                  From 640px the left padding clears the fixed tab rail (AppTabs). */}
              <div className="relative z-10 min-w-0 px-4 pt-0 pb-3 regular:px-6 regular:py-8 wide:px-8">
                {children}
              </div>
            </main>
          </div>
          <PageFab />
        </div>
        </AppSizeClassProvider>
        </PageFabProvider>
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
