"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Search, Settings } from "lucide-react";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { filterRecent } from "@/lib/transactions/recent-picks";

/**
 * Tile-grid picker shared by the New Transaction category and account sheets.
 * Every choice is a big tappable tile in a three-column grid. Selection is by id;
 * no selection state here.
 */

/** Recent rows shown above the groups. */
export const PICKER_RECENT_LIMIT = 5;

/** Bottom sheet on mobile (keyboard-aware); floating panel from sm up. */
export const PICKER_SHEET_CLASS =
  "flex flex-col p-0 pt-0 pb-[var(--sab)] regular:pb-0 rounded-t-3xl bg-background border-t border-border text-foreground data-[side=bottom]:h-auto data-[side=bottom]:max-h-[min(70dvh,calc(100dvh-var(--kb-inset,0px)))] regular:inset-x-auto! regular:left-1/2! regular:bottom-6! regular:h-auto! regular:max-h-[70dvh]! regular:w-[28rem]! regular:max-w-[calc(100vw-2rem)]! regular:-translate-x-1/2! regular:rounded-2xl! regular:border!";

/** Three-column tile grid shared by every picker body. */
const TILE_GRID = "grid grid-cols-3 gap-2";

/**
 * "sections": one labelled tile grid per group (accounts).
 * "expand": top-level grid of group tiles, one open at a time; the open group's
 * children unfold as a full-width band under that group's row (categories).
 */
export type PickerLayout = "sections" | "expand";

export interface PickerEntry {
  id: string;
  name: string;
  /** Group title; tiles are listed under it. */
  group: string;
  /** Secondary text on group tiles (sections layout). */
  groupDetail?: string;
  /** Secondary text on flat tiles (search results and Recent). */
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
  /** How the groups are laid out in the body. */
  layout: PickerLayout;
  onPick: (id: string) => void;
  /** Page that edits this list. Renders a round settings button in the header when set. */
  settingsHref?: string;
  /** Accessible name and tooltip of the settings button. */
  settingsLabel?: string;
}

/** A group with exactly one entry named like the group renders as a plain tile. */
function isPlainGroup(name: string, rows: PickerEntry[]): boolean {
  return (
    rows.length === 1 &&
    rows[0].name.trim().toLowerCase() === name.trim().toLowerCase()
  );
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
  layout,
  onPick,
  settingsHref,
  settingsLabel = "Settings",
}: GroupedPickerPanelProps) {
  const [search, setSearch] = useState("");
  const idBase = useId();
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

  // Expand layout: one open group at a time. The group holding the selection starts open.
  const [openGroup, setOpenGroup] = useState<string | null>(() => selectedGroup);

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
    setOpenGroup((prev) => (prev === name ? null : name));

  /** Expand layout body: group tiles, with the open group's band after its row's last tile. */
  const expandGrid = () => {
    const openIndex = groups.findIndex(
      ([name, rows]) => name === openGroup && !isPlainGroup(name, rows),
    );
    // Three columns: the open group's row ends at the next multiple of 3 (or the last group).
    const bandAfter =
      openIndex < 0
        ? -1
        : Math.min(groups.length - 1, Math.ceil((openIndex + 1) / 3) * 3 - 1);
    const cells: React.ReactNode[] = [];
    groups.forEach(([name, rows], i) => {
      if (isPlainGroup(name, rows)) {
        const e = rows[0];
        cells.push(
          <PickerTile
            key={name}
            label={e.name}
            selected={e.id === selectedId}
            onSelect={() => onPick(e.id)}
          />,
        );
      } else {
        const open = i === openIndex;
        const tileId = `${idBase}-group-${i}`;
        const bandId = `${idBase}-band-${i}`;
        cells.push(
          <PickerGroupTile
            key={name}
            id={tileId}
            title={name}
            open={open}
            controls={open ? bandId : undefined}
            onToggle={() => toggleGroup(name)}
          />,
        );
      }
      if (i === bandAfter) {
        cells.push(
          <div
            key={`band-${openIndex}`}
            id={`${idBase}-band-${openIndex}`}
            role="region"
            aria-labelledby={`${idBase}-group-${openIndex}`}
            className={cn(
              TILE_GRID,
              "col-span-full rounded-xl bg-muted/40 p-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
            )}
          >
            {groups[openIndex][1].map((e) => (
              <PickerTile
                key={e.id}
                label={e.name}
                selected={e.id === selectedId}
                revealOnMount={e.id === selectedId}
                onSelect={() => onPick(e.id)}
              />
            ))}
          </div>,
        );
      }
    });
    return <div className={TILE_GRID}>{cells}</div>;
  };

  const empty = (
    <div className="py-12 text-center text-sm text-muted-foreground">{emptyText}</div>
  );

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-border px-5 py-4">
        {settingsLink ? (
          <div className="flex items-center justify-between gap-3 pr-18">
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
            <div className={TILE_GRID}>
              {hits.map((e) => (
                <PickerTile
                  key={e.id}
                  label={e.name}
                  detail={e.flatDetail}
                  selected={e.id === selectedId}
                  onSelect={() => onPick(e.id)}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <PickerSection title="Recent">
                <div className={TILE_GRID}>
                  {recent.map((e) => (
                    <PickerTile
                      key={`recent-${e.id}`}
                      label={e.name}
                      detail={e.flatDetail}
                      selected={e.id === selectedId}
                      onSelect={() => onPick(e.id)}
                    />
                  ))}
                </div>
              </PickerSection>
            )}
            {groups.length === 0 ? (
              empty
            ) : layout === "expand" ? (
              expandGrid()
            ) : (
              groups.map(([name, rows]) => (
                <PickerSection key={name} title={name}>
                  <div className={TILE_GRID}>
                    {rows.map((e) => (
                      <PickerTile
                        key={e.id}
                        label={e.name}
                        detail={e.groupDetail}
                        selected={e.id === selectedId}
                        revealOnMount={e.id === selectedId}
                        onSelect={() => onPick(e.id)}
                      />
                    ))}
                  </div>
                </PickerSection>
              ))
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

/** Small uppercase section label above a grid. */
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
 * Big tappable tile: centered name (two lines max), optional muted second line.
 * Selected = accent border, accent text, faint accent fill, aria-current="true".
 * `revealOnMount` scrolls the tile into view when it first mounts (jsdom has no
 * scrollIntoView, so the call is optional).
 */
export function PickerTile({
  label,
  detail,
  selected,
  revealOnMount = false,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  revealOnMount?: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (revealOnMount) ref.current?.scrollIntoView?.({ block: "center" });
  }, [revealOnMount]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border bg-card px-2 py-2 text-center text-base text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring active:bg-muted",
        selected ? "border-primary bg-primary/10 text-primary" : "border-border",
      )}
    >
      <span className="line-clamp-2 w-full break-words font-medium leading-snug">{label}</span>
      {detail ? (
        <span className="w-full truncate text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </button>
  );
}

/**
 * Expand-layout group tile: name plus a chevron (down when closed, up when open).
 * Controls the full-width band of its children (`controls` is set only while open).
 */
export function PickerGroupTile({
  id,
  title,
  open,
  controls,
  onToggle,
}: {
  id: string;
  title: string;
  open: boolean;
  controls?: string;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <button
      id={id}
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "flex min-h-14 w-full min-w-0 items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 py-2 text-center text-base font-medium text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring active:bg-muted",
        open && "bg-muted",
      )}
    >
      <span className="line-clamp-2 min-w-0 break-words leading-snug">{title}</span>
      <Chevron aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
