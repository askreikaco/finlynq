"use client";

/**
 * Settings shell: wraps every /settings/* sub-page (src/app/(app)/settings/layout.tsx) and /connect.
 *
 * The shell draws no top bar. Every page renders its own global PageHeader, which is the one top bar at
 * every size: a sticky glass bar below regular, opaque from regular, centred title and subtitle, right
 * actions, and the automatic back to the parent (nav registry: /settings is the parent of each sub-page)
 * or the page's explicit backHref. The hub (/settings) is level 2 too, so its bar backs to /more.
 * No side nav and no pill strip at any size: the settings hub is the only section switcher.
 */

import * as React from "react";

export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-slot="settings-content" className="min-w-0">
      {/* No scroll container here at any size: the page's sticky PageHeader pins to the page scroller. */}
      <div className="overflow-x-clip">{children}</div>
    </div>
  );
}
