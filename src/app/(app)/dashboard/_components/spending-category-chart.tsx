"use client";

import { PieChart as PieChartIcon } from "lucide-react";
import { SectionCard } from "@/components/mobile/section-card";
import { Chart } from "@/components/chart";
import { useDisplayCurrency } from "@/components/currency-provider";
import { motion } from "framer-motion";
import { useAnimations } from "@/hooks/use-animations";

const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

const noAnimationVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

type SpendingItem = { name: string; value: number };

export function SpendingCategoryChart({ data, currency }: { data: SpendingItem[]; currency?: string }) {
  const { displayCurrency: userDisplayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : userDisplayCurrency;
  const animationsEnabled = useAnimations();

  return (
    <motion.div variants={animationsEnabled ? itemVariants : noAnimationVariants}>
      <SectionCard label="Spending by Category" icon={PieChartIcon} tone="amber" cardClassName="card-hover flex h-full flex-col" className="flex flex-1 flex-col justify-center">
        {/* /api/dashboard defaults to a trailing 12-month window (plus the current
            month), not the current month alone. */}
        <p className="text-xs text-muted-foreground mb-3">Last 12 months breakdown</p>
        <Chart kind="donut" data={data} currency={resolvedCurrency} size="lg" center="total" breakdownList breakdownBars breakdownLimit={6} />
      </SectionCard>
    </motion.div>
  );
}
