"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface DashboardCard {
  id: string;
  title: string;
  defaultVisible: boolean;
}

const DASHBOARD_CARDS: DashboardCard[] = [
  { id: "net-worth", title: "Net Worth", defaultVisible: true },
  { id: "health-score", title: "Health Score", defaultVisible: true },
  { id: "this-month", title: "This Month", defaultVisible: true },
  { id: "budget-progress", title: "Budget Progress", defaultVisible: true },
  { id: "recent-transactions", title: "Recent Transactions", defaultVisible: true },
  { id: "action-center", title: "Action Center", defaultVisible: true },
  { id: "insights", title: "Insights", defaultVisible: true },
  { id: "income-expense-chart", title: "Income & Expenses Chart", defaultVisible: true },
  { id: "spending-category-chart", title: "Spending by Category", defaultVisible: true },
  { id: "weekly-recap", title: "Weekly Recap", defaultVisible: true },
  { id: "available-to-spend", title: "Available to Spend", defaultVisible: true },
  { id: "quick-import", title: "Quick Import", defaultVisible: true },
  { id: "key-metrics", title: "Key Metrics", defaultVisible: true },
  { id: "tips", title: "Tips", defaultVisible: true },
];

interface CustomizeDashboardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: string[];
  hidden: string[];
  onSave: (order: string[], hidden: string[]) => Promise<void>;
}

export function CustomizeDashboardSheet({
  open,
  onOpenChange,
  order,
  hidden,
  onSave,
}: CustomizeDashboardSheetProps) {
  const [localOrder, setLocalOrder] = useState(order);
  const [localHidden, setLocalHidden] = useState(new Set(hidden));
  const [isSaving, setIsSaving] = useState(false);

  const handleToggleCard = (cardId: string) => {
    setLocalHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newOrder = [...localOrder];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      setLocalOrder(newOrder);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < localOrder.length - 1) {
      const newOrder = [...localOrder];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      setLocalOrder(newOrder);
    }
  };

  const handleReset = async () => {
    if (confirm("Reset dashboard to default layout?")) {
      setLocalOrder(DASHBOARD_CARDS.map((c) => c.id));
      setLocalHidden(new Set());
      try {
        setIsSaving(true);
        await onSave(
          DASHBOARD_CARDS.map((c) => c.id),
          []
        );
        onOpenChange(false);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(localOrder, Array.from(localHidden));
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-sm:inset-0 max-sm:left-0 max-sm:right-0 max-sm:top-0 max-sm:bottom-0 max-sm:w-full max-sm:translate-x-0 max-sm:rounded-none flex flex-col">
        <SheetHeader className="max-sm:mb-4">
          <SheetTitle>Customize Dashboard</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto space-y-2">
          {localOrder.map((cardId, index) => {
            const card = DASHBOARD_CARDS.find((c) => c.id === cardId);
            if (!card) return null;

            const isHidden = localHidden.has(cardId);
            return (
              <div
                key={cardId}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={() => handleToggleCard(cardId)}
                      aria-label={`${isHidden ? "Show" : "Hide"} ${card.title}`}
                    />
                    <span className={`text-sm ${isHidden ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {card.title}
                    </span>
                  </div>
                </div>

                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="h-10 w-10 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Move ${card.title} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === localOrder.length - 1}
                    className="h-10 w-10 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Move ${card.title} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-4 border-t max-sm:flex-col-reverse">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isSaving}
            className="max-sm:w-full"
          >
            Reset to default
          </Button>
          <div className="flex-1 flex gap-2 max-sm:flex-col">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="max-sm:w-full"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="max-sm:w-full"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
