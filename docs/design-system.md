# Design System: Tokens and Adaptive Sizing

## Design Tokens

Defined in `src/app/globals.css` (@theme directive, lines 7–51). These are read by Tailwind and exposed as CSS custom properties:

### Colors (CSS custom properties in @theme)
- `--color-primary` / `--color-primary-foreground`: oklch(0.75 0.165 70) / oklch(0.18 0.05 70)
- `--color-pos` (gain/income, chart-2): oklch(0.72 0.13 170)
- `--color-neg` (loss/expense, destructive): oklch(0.62 0.19 28)
- `--color-card`, `--color-foreground`, `--color-muted`, `--color-secondary`, `--color-accent`: semantic scale
- `--color-chart-1` through `--color-chart-5`: data visualization palette
- `--color-sidebar*`: sidebar-specific color overrides

### Fonts
- `--font-sans`: system UI stack (`--font-stack-sans`, globals.css); runtime UI font via `--font-ui` set by `[data-font]`
- `--font-mono`: system mono stack (`--font-stack-mono`); no web fonts

### Sizing
- `--radius-sm/md/lg/xl/2xl/3xl/4xl`: 0.3–1.3rem (60% to 260% of base 0.5rem)

### Safe-Area Insets (iOS, notches)
- CSS custom properties: `--sat` (top), `--sab` (bottom), `--sal` (left), `--sar` (right)
- Tailwind utilities: `@utility top-safe`, `@utility pt-safe`, `@utility px-safe` (read vars at globals.css ~521–541)

## Adaptive Container Sizing (SizeClass)

The `useSizeClass(ref)` hook (from `src/components/ui/size-class.ts`) observes a container element and returns a `SizeClass`:

- **compact** (`<640px`): Mobile portrait, smartphones
- **regular** (`640–1024px`): Tablets, mobile landscape, responsive desktop
- **wide** (`>1024px`): Desktop, large displays

**Hook semantics**: Takes a `React.RefObject<HTMLElement>`, observes its `contentRect.width` via ResizeObserver, and returns "compact" on first render (before observer fires; SSR-safe). Returns updated size class on resize. Effect depends on `[ref]`; cleanup on unmount. Use for layout toggling instead of media queries or `window.innerWidth` checks. (Examples coming in WP2.)

## Patterns

### Pages, Not Modals
Pages in `/app/(app)/*` are full-screen views that adapt to container width. Dialogs for inline edits; pages for navigation.

### List vs. Card Toggle
- **Compact**: Mobile-optimized lists (ListRow, detailed sidebar items)
- **Wide**: Card grids, multi-column layouts; hide list details

## Ratchet: Guarding Against Adaptive Regressions

The `design-system-guard.test.ts` scans for banned patterns in `src/app/**` and `src/components/**`:
- `isMobile` (legacy, ratcheted; do not add new uses)
- `md:hidden` / `hidden md:` (breakpoint-driven hiding; replace with SizeClass logic)
- `window.innerWidth` (SSR-unsafe; use ResizeObserver hook)

Baseline recorded in `tests/fixtures/adaptive-baseline.json` (9 files, 31 instances). The ratchet **fails** on:
1. New files containing patterns (regression guard)
2. Increased count in existing files (no new uses)
3. Decreased count without baseline update (enforce migration)
4. Stale entries (file deleted or usage completely removed)

`CompactOnly` / `FromMd` (src/components/mobile/adaptive.tsx) emit the md:hidden / max-md:hidden classes from the sanctioned primitive directory; prefer them over raw classes in new code.

### Shrinking the Baseline
When reducing a banned pattern from a file:
1. Remove or reduce usage in the file
2. Update the count in `adaptive-baseline.json` (lower the count, or delete the entry if usage reaches 0)
3. Push to PR; the ratchet validates the change

Target: reduce baseline to 0 over multiple PRs (migrate all pages to SizeClass).

## Colour tokens (W6, 2026-10-09)
Raw Tailwind palette classes (emerald, rose, amber, sky, indigo, violet, zinc, ...) are banned in src/app and src/components; guard: tests/design-system-palette-guard.test.ts (baseline tests/fixtures/palette-baseline.json, ratchet like the adaptive guard). Scan at 9b731f5: files=0 hits=0.
| meaning | token classes |
|---|---|
| gain / positive / success | text-pos, bg-pos/10, border-pos/30 (--pos: light oklch(0.55 0.11 170), dark oklch(0.75 0.11 170)) |
| loss / negative / error / danger | text-destructive, bg-destructive/10, border-destructive/30 (--color-neg is the same colour) |
| warning / pending / stale | text-warning, bg-warning/10, border-warning/30 (--warning: light oklch(0.56 0.14 60), dark oklch(0.80 0.15 75)) |
| info / neutral highlight | text-info, bg-info/10, border-info/30 (--info: light oklch(0.52 0.13 250), dark oklch(0.74 0.11 245)) |
| brand / selected | text-primary, bg-primary/10 |
| extra category hue | text-chart-5, bg-chart-5/10 |
| neutrals | foreground, muted-foreground, muted, card, background, border |
Tints: bg-<token>/10, borders /30; no dark: variants needed (tokens switch with the theme). Skeletons: animate-shimmer only (animate-pulse is for activity dots). Charts keep chart-1..5.
