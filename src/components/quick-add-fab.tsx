"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { QUICK_ADD_FAB_PATHS } from "@/lib/quick-add/flag";

/**
 * Quick-add FAB (Floating Action Button)
 * Bottom-right, safe-area inset, hidden when keyboard is shown.
 * Only appears on /dashboard and /transactions paths.
 * Rendered conditionally by server component based on FINLYNQ_QUICK_ADD flag.
 */
export function QuickAddFAB() {
  const pathname = usePathname();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Check if we're on a page where FAB should appear
  const isVisible = QUICK_ADD_FAB_PATHS.includes(pathname);

  // Handle keyboard visibility changes on mobile
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      // On mobile, keyboard visibility can be detected via window height changes
      // This is a common pattern but not perfectly reliable
      // For now, we'll use a simple heuristic: hide if any input is focused
      const activeElement = document.activeElement as HTMLElement;
      const isInputFocused =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA";
      setIsKeyboardVisible(isInputFocused);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("focus", handleResize, true);
    window.addEventListener("blur", handleResize, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("focus", handleResize, true);
      window.removeEventListener("blur", handleResize, true);
    };
  }, []);

  if (!isVisible || isKeyboardVisible) {
    return null;
  }

  return (
    <Link
      href="/transactions/new"
      className="fixed bottom-[calc(var(--mobile-bar-clearance)-8px)] right-4 z-40 md:bottom-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      aria-label="Add transaction"
    >
      <Plus className="h-6 w-6" />
    </Link>
  );
}
