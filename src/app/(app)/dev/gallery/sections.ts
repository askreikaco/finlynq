/** Gallery catalogue index: id (anchor) + label. page.tsx renders one <section id> per entry; the test checks both. */
export const GALLERY_SECTIONS = [
  { id: "metric", label: "MetricCard" },
  { id: "section-card", label: "SectionCard" },
  { id: "list-row", label: "ListRow" },
  { id: "shadow", label: "Card shadow" },
  { id: "buttons", label: "Buttons / Badges" },
  { id: "forms", label: "Field" },
  { id: "overlays", label: "Overlay" },
  { id: "topbar", label: "Top bar" },
  { id: "toolbar", label: "Page toolbar" },
  { id: "pages", label: "Page patterns" },
  { id: "charts", label: "Sparkline / Progress" },
  { id: "states", label: "Empty / Error / Alert" },
  { id: "controls", label: "Tabs / Toggles / Accordion" },
  { id: "info-tip", label: "InfoTip" },
  { id: "skeleton", label: "Skeleton / Shimmer" },
  { id: "colors", label: "Color tokens" },
  { id: "type", label: "Typography" },
  { id: "scale", label: "Spacing / Radius / Shadow" },
  { id: "grids", label: "Grid helpers" },
  { id: "size-class", label: "Size class" },
] as const;

export const COLOR_TOKENS = [
  "background", "foreground", "card", "popover", "primary", "primary-foreground", "secondary", "muted",
  "muted-foreground", "accent", "border", "input", "ring", "pos", "neg", "destructive", "warning", "info",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "sidebar",
] as const;
