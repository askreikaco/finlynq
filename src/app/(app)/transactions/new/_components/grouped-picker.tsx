"use client";

import React, { useId, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, Settings } from "lucide-react";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { filterRecent } from "@/lib/transactions/recent-picks";

/**
 * Compact grouped picker shared by the New Transaction category and account sheets.
 * iOS-style: one inset card per section, 44pt rows, hairline separators, and one
 * collapsed disclosure row per group. Selection is by id; no selection state here.
 */

/** Recent rows shown above the groups. */
export const PICKER_RECENT_LIMIT = 5;

/** Bottom sheet on mobile (keyboard-aware); floating panel from sm up. */
export const PICKER_SHEET_CLASS =
  "flex flex-col p-0 pt-0 pb-[var(--sab)] regular:pb-0 rounded-t-3xl bg-background border-t border-border text-foreground data-[side=bottom]:h-auto data-[side=bottom]:max-h-[min(70dvh,calc(100dvh-var(--kb-inset,0px)))] regular:inset-x-auto! regular:left-1/2! regular:bottom-6! regular:h-auto! regular:max-h-[70dvh]! regular:w-[28rem]! regular:max-w-[calc(100vw-2rem)]! regular:-translate-x-1/2! regular:rounded-2xl! regular:border!";

export interface PickerEntry {
  id: string;
  name: string;
  /** Group title; rows are listed under it. */
  group: string;
  /** Secondary text on group rows. */
  groupDetail?: string;
  /** Secondary text on flat rows (search results and Recent). */
  flatDetail?: string;
  /** Strings a search term is matched against (case-insensitive substring). */
  searchText: string[];
}

export interface GroupedPickerPanelProps {
  title: string;
  placeholder: string;
  emptyText: string;
  entries: PickerEntry[];
  selectedId?: string;
  /** Recently picked ids, most recent first. */
  recentIds?: string[];
  onPick: (id: string) => void;
  /** Page that edits this list. Renders a round settings button in the header when set. */
  settingsHref?: string;
  /** Accessible name and tooltip of the settings button. */
  settingsLabel?: string;
}

/**
 * Header (title + search) and scrolling body. Mounted inside SheetContent, so it
 * unmounts when the sheet closes and every open starts from the seeded state.
 */
export function GroupedPickerPanel({
  title,
  placeholder,
  emptyText,
  entries,
  selectedId,
  recentIds,
  onPick,
  settingsHref,
  settingsLabel = "Settings",
}: GroupedPickerPanelProps) {
  const [search, setSearch] = useState("");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Settings link carries the current page back as returnTo (destinations validate it).
  const currentPath = pathname
    ? `${pathname}${searchParams && searchParams.toString() ? `?${searchParams.toString()}` : ""}`
    : null;
  const settingsLink = settingsHref
    ? currentPath
      ? `${settingsHref}?returnTo=${encodeURIComponent(currentPath)}`
      : settingsHref
    : null;
  const term = search.trim().toLowerCase();

  const selectedGroup = useMemo(
    () => entries.find((e) => e.id === selectedId)?.group ?? null,
    [entries, selectedId],
  );

  // The group holding the current selection starts open; the rest start collapsed.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () => new Set(selectedGroup === null ? [] : [selectedGroup]),
  );

  const groups = useMemo(() => {
    const map = new Map<string, PickerEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.group);
      if (list) list.push(entry);
      else map.set(entry.group, [entry]);
    }
    return [...map.entries()];
  }, [entries]);

  const hits = useMemo(
    () =>
      term === ""
        ? null
        : entries.filter((e) => e.searchText.some((s) => s.toLowerCase().includes(term))),
    [entries, term],
  );

  const recent = useMemo(() => {
    if (!recentIds || recentIds.length === 0) return [];
    const byId = new Map(entries.map((e) => [e.id, e] as const));
    return filterRecent(recentIds, [...byId.keys()])
      .slice(0, PICKER_RECENT_LIMIT)
      .map((id) => byId.get(id))
      .filter((e): e is PickerEntry => e !== undefined);
  }, [entries, recentIds]);

  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const empty = (
    <div className="py-12 text-center text-sm text-muted-foreground">{emptyText}</div>
  );

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-border px-5 py-4">
        {settingsLink ? (
          <div className="flex items-center justify-between gap-3 pr-11">
            <SheetTitle className="text-lg font-semibold text-foreground">{title}</SheetTitle>
            <Link
              href={settingsLink}
              aria-label={settingsLabel}
              title={settingsLabel}
              data-slot="picker-settings"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full glass-capsule text-foreground transition-colors hover:bg-accent"
            >
              <Settings className="size-[18px]" aria-hidden />
            </Link>
          </div>
        ) : (
          <SheetTitle className="text-lg font-semibold text-foreground">{title}</SheetTitle>
        )}
        <div className="relative mt-3">
          <Search
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
          />
          <input
            type="text"
            aria-label={placeholder}
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
          />
        </div>
      </SheetHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-5 p-4">
        {hits !== null ? (
          hits.length === 0 ? (
            empty
          ) : (
            <PickerCard>
              {hits.map((e) => (
                <PickerRow
                  key={e.id}
                  label={e.name}
                  detail={e.flatDetail}
                  selected={e.id === selectedId}
                  onSelect={() => onPick(e.id)}
                />
              ))}
            </PickerCard>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <PickerSection title="Recent">
                <PickerCard>
                  {recent.map((e) => (
                    <PickerRow
                      key={`recent-${e.id}`}
                      label={e.name}
                      detail={e.flatDetail}
                      selected={e.id === selectedId}
                      onSelect={() => onPick(e.id)}
                    />
                  ))}
                </PickerCard>
              </PickerSection>
            )}
            {groups.length === 0 ? (
              empty
            ) : (
              <PickerCard>
                {groups.map(([name, rows]) => (
                  <PickerGroup
                    key={name}
                    title={name}
                    count={rows.length}
                    open={openGroups.has(name)}
                    onToggle={() => toggleGroup(name)}
                    revealOnMount={name === selectedGroup}
                  >
                    {rows.map((e) => (
                      <PickerRow
                        key={e.id}
                        label={e.name}
                        detail={e.groupDetail}
                        selected={e.id === selectedId}
                        onSelect={() => onPick(e.id)}
                      />
                    ))}
                  </PickerGroup>
                ))}
              </PickerCard>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Inset grouped-list card: one rounded surface, hairlines between its children. */
export function PickerCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-xl bg-card divide-y divide-border", className)}>
      {children}
    </div>
  );
}

/** Small uppercase section label above a card. */
export function PickerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** One 44pt selectable row: label, optional secondary line, checkmark when selected. */
export function PickerRow({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-base text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted active:bg-muted"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {detail ? <span className="truncate text-sm text-muted-foreground">{detail}</span> : null}
      </span>
      {selected ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

/**
 * Accordion row for one group: name, count badge, chevron. Panel content mounts only
 * while open. `revealOnMount` scrolls the row into view when it first mounts (the
 * sheet mounts on open, so this runs once per open).
 */
export function PickerGroup({
  title,
  count,
  open,
  onToggle,
  revealOnMount = false,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  revealOnMount?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const headerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView.
    if (revealOnMount) headerRef.current?.scrollIntoView?.({ block: "center" });
  }, [revealOnMount]);

  return (
    <div>
      <button
        ref={headerRef}
        id={`${id}-header`}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="group flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted active:bg-muted"
      >
        <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{title}</span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 group-aria-expanded:rotate-180"
        />
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-header`}
        hidden={!open}
        className={open ? "divide-y divide-border border-t border-border motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" : undefined}
      >
        {open ? children : null}
      </div>
    </div>
  );
}
