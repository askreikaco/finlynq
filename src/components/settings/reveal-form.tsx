"use client";

/**
 * Button-first pattern for credential cards (Settings > Account): while closed
 * only `trigger` is rendered (no inputs); the parent owns `open` and clears its
 * field state in onCancel/success.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function RevealForm({
  open,
  onOpen,
  buttonLabel,
  variant = "outline",
  children,
}: {
  open: boolean;
  onOpen: () => void;
  buttonLabel: string;
  variant?: "outline" | "destructive" | "default";
  children: ReactNode;
}) {
  if (open) return <>{children}</>;
  return (
    <Button variant={variant} onClick={onOpen}>
      {buttonLabel}
    </Button>
  );
}
