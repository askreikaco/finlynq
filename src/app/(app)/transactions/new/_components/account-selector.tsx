"use client";

import React, { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Check, Wallet } from "lucide-react";

export interface Account {
  id: string | number;
  name: string;
  type?: string | null;
  currency?: string;
  isInvestment?: boolean;
  archived?: boolean;
}

interface AccountSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onSelect: (accountId: string) => void;
  selectedAccountId?: string;
  title?: string;
}

export function AccountSelector({
  open,
  onOpenChange,
  accounts,
  onSelect,
  selectedAccountId,
  title = "Select Account",
}: AccountSelectorProps) {
  const [search, setSearch] = useState("");

  const filteredAccounts = useMemo(() => {
    const nonArchived = accounts.filter((a) => !a.archived);
    if (!search.trim()) return nonArchived;
    const term = search.toLowerCase();
    return nonArchived.filter(
      (acc) =>
        acc.name.toLowerCase().includes(term) ||
        (acc.type && acc.type.toLowerCase().includes(term)) ||
        (acc.currency && acc.currency.toLowerCase().includes(term))
    );
  }, [accounts, search]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    filteredAccounts.forEach((acc) => {
      const typeName = acc.type || "Other";
      if (!groups[typeName]) {
        groups[typeName] = [];
      }
      groups[typeName].push(acc);
    });
    return groups;
  }, [filteredAccounts]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[82vh] flex flex-col p-0 rounded-t-3xl bg-zinc-950 border-t border-zinc-800 text-white"
      >
        <SheetHeader className="px-5 py-4 border-b border-zinc-900 shrink-0">
          <SheetTitle className="text-white text-lg font-semibold">{title}</SheetTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.keys(groupedAccounts).length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No accounts found
            </div>
          ) : (
            Object.entries(groupedAccounts).map(([type, accs]) => (
              <div key={type} className="space-y-2.5">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
                  {type}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {accs.map((acc) => {
                    const isSelected = String(acc.id) === selectedAccountId;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          onSelect(String(acc.id));
                          onOpenChange(false);
                          setSearch("");
                        }}
                        className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                          isSelected
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                            : "bg-zinc-900/90 border-zinc-800 hover:bg-zinc-800 text-zinc-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                            <Wallet className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate">
                              {acc.name}
                            </span>
                            {acc.currency && (
                              <span className="text-xs text-zinc-500">
                                {acc.currency}
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-indigo-400 shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
