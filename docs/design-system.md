# Design System: Tokens and Adaptive Sizing

## Design Tokens

Defined in `src/app/globals.css` (@theme directive, lines 7-51). These are read by Tailwind and exposed as CSS custom properties:

### Color Palette
- **Primary**: Amber (#f5a623 light theme, adjusted dark) for interactive elements
- **Destructive/Negative**: Coral/Red for alerts and loss indicators
- **Chart colors**: 5-value palette (chart-1 through chart-5) for data visualization
- **Semantic**: Muted, secondary, accent, sidebar colors

### Spacing & Sizing
- **Radius**: Base 0.5rem with scaled variants (sm: 60%, md: 80%, lg: 100%, xl: 140%, 2xl: 180%, 3xl: 220%, 4xl: 260%)
- **Safe-area insets**: Applied via Tailwind `safe-area-*` utilities (iOS status bar, notches)

## Adaptive Container Sizing (SizeClass)

The `useSizeClass(ref)` hook (from `src/components/ui/size-class.ts`) measures container width via ResizeObserver and returns a `SizeClass`:

- **compact** (`<640px`): Mobile portrait, smartphones
- **regular** (`640–1024px`): Tablets, mobile landscape, responsive desktop
- **wide** (`>1024px`): Desktop, large displays

Use this for layout toggling instead of media queries or `window.innerWidth` checks. See `src/components/mobile/*` for examples.

## Patterns

### Pages, Not Modals
Pages in `/app/(app)/*` are full-screen views that adapt to container width. Dialogs for inline edits; pages for navigation.

### List vs. Card Toggle
- **Compact**: Mobile-optimized lists (ListRow, detailed sidebar items)
- **Wide**: Card grids, multi-column layouts; hide list details

## Ratchet: Guarding Against Adaptive Regressions

The `design-system-guard.test.ts` scans for banned patterns in `src/app/**` and `src/components/**`:
- `isMobile` (removed primitive; use SizeClass)
- `md:hidden` / `hidden md:` (breakpoint-driven hiding; replace with SizeClass logic)
- `window.innerWidth` (SSR-unsafe; use ResizeObserver hook)

Baseline recorded in `tests/fixtures/adaptive-baseline.json`. The ratchet **fails** on:
1. New files containing patterns (regression)
2. Increased count in existing files
3. Stale entries (removed usage, baseline not updated)

### Shrinking the Baseline
When removing a banned pattern from a file:
1. Remove the usage from the file
2. Update the count in `adaptive-baseline.json` (decrement or delete the entry if 0)
3. Push to PR; the ratchet will pass

Target: reduce baseline to 0 over multiple PRs (migrate all pages to SizeClass).
