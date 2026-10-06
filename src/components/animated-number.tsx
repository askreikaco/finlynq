"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import { formatCurrency } from "@/lib/currency";
import { useAnimations } from "@/hooks/use-animations";
import { useDisplayCurrency } from "@/components/currency-provider";

export function AnimatedNumber({ value, currency }: { value: number; currency?: string }) {
  const animationsEnabled = useAnimations();
  const { displayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency ?? displayCurrency;
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!animationsEnabled) {
      node.textContent = formatCurrency(value, resolvedCurrency);
      return;
    }

    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(latest) {
        node.textContent = formatCurrency(latest, resolvedCurrency);
      },
    });

    return () => controls.stop();
  }, [value, resolvedCurrency, animationsEnabled]);

  return <span ref={ref}>{formatCurrency(animationsEnabled ? 0 : value, resolvedCurrency)}</span>;
}
