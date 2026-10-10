"use client";

/**
 * useReturnTo(fallback) — the validated `?returnTo=` for a form page.
 * Back, Cancel and post-save navigation all use this value.
 */
import { useSearchParams } from "next/navigation";
import { safeReturnTo } from "@/lib/nav/return-to";

export function useReturnTo(fallback: string): string {
  const searchParams = useSearchParams();
  return safeReturnTo(searchParams.get("returnTo"), fallback);
}
