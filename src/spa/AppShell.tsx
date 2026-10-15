"use client";

/**
 * SPA twin of src/app/(app)/layout.tsx (same providers, same order). The Next layout stays until the
 * (app) routes are removed from Next; keep both in step. Server-only bit replaced: the categoriesMerged
 * prop now comes from useFlags() (GET /api/config/flags).
 */
import { Outlet } from "react-router";
import { AppTabs } from "@/components/nav";
import { UnlockGate } from "@/components/unlock-gate";
import { Notice } from "@/components/notice";
import { PromptGate } from "@/components/prompt-gate";
import { NavHistoryTracker } from "@/components/nav-history-tracker";
import { CurrencyProvider } from "@/components/currency-provider";
import { DropdownOrderProvider } from "@/components/dropdown-order-provider";
import { LanguageProvider } from "@/components/language-provider";
import { FontProvider } from "@/components/font-provider";
import { AnimationProvider } from "@/components/animation-provider";
import { DataProvider } from "@/lib/data";
import { WebVitals } from "@/components/web-vitals";
import { PageFabProvider } from "@/components/mobile/page-fab";
import { KeyboardInsetObserver } from "@/components/mobile/keyboard-inset-observer";
import { AppSizeClassProvider } from "@/components/adaptive/size-class-context";
import { AppMainBarFlag } from "@/components/app-main-bar-flag";
import { useFlags } from "./flags";

export default function AppShell() {
  const { categoriesMerged } = useFlags();
  return (
    <>
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
                          <Notice source="announcement" />
                          <PromptGate />
                          <Notice source="reporting-recompute" />
                          <div className="flex flex-1">
                            <AppTabs categoriesMerged={categoriesMerged} />
                            <main className="flex-1 overflow-x-clip min-w-0 pb-[calc(var(--mobile-bar-clearance)+16px)] regular:pb-0 data-[bar-hidden]:max-regular:pb-[var(--sab,0px)] regular:pl-[calc(5rem+var(--sal))] bg-dot-pattern ambient-glow" data-app-main="">
                              <AppMainBarFlag />
                              <NavHistoryTracker />
                              <div className="relative z-10 min-w-0 px-4 pt-0 pb-3 regular:px-6 regular:pt-0 regular:pb-8 wide:px-8">
                                <Outlet />
                              </div>
                            </main>
                          </div>
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
