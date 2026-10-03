# UI Options Integration: LazyView & Animation Toggle

**Repository:** `finlynq`  
**Branch:** `custom`  
**Date:** 2026-10-04  

## 1. Objectives
- **Task 2: Lazyload Cards Under the Fold**
  - Create reusable `LazyView` component (`src/components/ui/lazy-view.tsx`) using native `IntersectionObserver` (`useEffect`).
  - Render a clean skeleton placeholder until `isIntersecting` becomes true. Once intersected, disconnect observer and maintain rendered content.
  - Wrap heavy components (MetricCard sparklines/cards, Dashboard below-the-fold charts) in `LazyView`.
- **Task 4: Animation Toggle (Default OFF)**
  - Add user preference "Enable Chart & Counter Animations" defaulting to `false` (OFF).
  - Persist in localStorage (`pf-animations-enabled`).
  - Add UI switch toggle to Display Preferences on General Settings (`src/app/(app)/settings/general/page.tsx`).
  - Provide global hook `useAnimations(): boolean`.
  - Disable animations / set `duration={0}` in `MetricCard`, `AnimatedNumber`, and Recharts charts when false.
- **Rules & Constraints:**
  - Semantic version bump in `package.json`.
  - Commit to `custom`, do NOT push.
  - Report back to parent agent via `send_message`.
