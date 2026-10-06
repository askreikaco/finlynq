"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import { formatCurrency } from "@/lib/currency";
import { useAnimations } from "@/hooks/use-animations";

export function AnimatedNumber({ value, currency }: { value: number; currency?: string }) {
  const animationsEnabled = useAnimations();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!animationsEnabled) {
      node.textContent = formatCurrency(value, currency);
      return;
    }

    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(latest) {
        node.textContent = formatCurrency(latest, currency);
      },
    });

    return () => controls.stop();
  }, [value, currency, animationsEnabled]);

  return <span ref={ref}>{formatCurrency(animationsEnabled ? 0 : value, currency)}</span>;
}
