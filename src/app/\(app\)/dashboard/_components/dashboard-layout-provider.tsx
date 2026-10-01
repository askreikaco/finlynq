"use client";

import { useEffect, useState } from "react";

export interface DashboardLayout {
  order: string[];
  hidden: string[];
}

interface DashboardLayoutContextType {
  layout: DashboardLayout;
  isLoading: boolean;
  saveLayout: (layout: DashboardLayout) => Promise<void>;
  resetLayout: () => void;
}

import { createContext, useContext } from "react";

const DashboardLayoutContext = createContext<DashboardLayoutContextType | undefined>(
  undefined
);

const DEFAULT_LAYOUT: DashboardLayout = {
  order: [
    "net-worth",
    "health-score",
    "this-month",
    "budget-progress",
    "recent-transactions",
    "action-center",
    "insights",
    "income-expense-chart",
    "spending-category-chart",
    "weekly-recap",
    "available-to-spend",
    "quick-import",
    "key-metrics",
    "tips",
  ],
  hidden: [],
};

export function DashboardLayoutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/dashboard-layout")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setLayout(data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const saveLayout = async (newLayout: DashboardLayout) => {
    try {
      const response = await fetch("/api/settings/dashboard-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLayout),
      });
      if (response.ok) {
        const saved = await response.json();
        setLayout(saved);
      }
    } catch (error) {
      console.error("Failed to save dashboard layout:", error);
      throw error;
    }
  };

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT);
    saveLayout(DEFAULT_LAYOUT);
  };

  return (
    <DashboardLayoutContext.Provider
      value={{ layout, isLoading, saveLayout, resetLayout }}
    >
      {children}
    </DashboardLayoutContext.Provider>
  );
}

export function useDashboardLayout() {
  const context = useContext(DashboardLayoutContext);
  if (!context) {
    throw new Error(
      "useDashboardLayout must be used within DashboardLayoutProvider"
    );
  }
  return context;
}
