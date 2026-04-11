# AutaMedica — Responsive Strategy

> Single source of truth for responsive design decisions across all portals.

## Approach: Mobile-First

**All CSS and Tailwind classes use mobile-first (min-width) breakpoints.** The base styles target the smallest screen; breakpoint prefixes add complexity for larger screens.

```
Base (0px)     → Mobile phone (portrait)
sm:  (640px)   → Large phone (landscape) / small tablet
md:  (768px)   → Tablet — SIDEBAR/BOTTOM-NAV SWAP POINT
lg:  (1024px)  → Desktop — EDITORIAL LAYOUT SWAP POINT
xl:  (1280px)  → Wide desktop (rare usage)
2xl: (1536px)  → Not used
```

## Breakpoint Semantics

| Breakpoint | Role | What Changes |
|---|---|---|
| **Base** | Phone | Single column, bottom nav visible, stacked cards, full-width forms |
| **sm (640px)** | Large phone | 2-column grids for stats/cards, CTA buttons go horizontal |
| **md (768px)** | Tablet | Sidebar appears (doctors), bottom nav hides, 2-column forms |
| **lg (1024px)** | Desktop | Editorial layouts (sidebar + content), wider containers, sticky sidebars |
| **xl (1280px)** | Wide | Dashboard gets fixed sidebar column (`xl:grid-cols-[minmax(0,1fr)_340px]`) |

## Navigation Swap Point: `md` (768px)

All portals follow the same pattern:

- **< md:** Fixed bottom tab bar (`md:hidden`), hamburger menu opens modal sidebar overlay
- **>= md:** Persistent left sidebar (`hidden md:flex`), bottom nav hidden, footer visible

## Container Widths

Use these `max-w-*` values consistently:

| Context | Max Width | Example |
|---|---|---|
| Modals / narrow forms | `max-w-md` (448px) | Login, settings, confirmations |
| Single-column content | `max-w-lg` (512px) or `max-w-2xl` (672px) | Patient dashboard, anamnesis |
| Wide content | `max-w-4xl` (896px) | Doctor patient file, medical history |
| Full dashboard | `max-w-6xl` (1152px) | Pharmacy dashboard, appointment tables |

Always pair with `mx-auto` for centering.

## CSS Rules

1. **Never use `max-width` media queries.** Always `min-width` (Tailwind default).
2. **Never use custom breakpoint values** (e.g., 900px, 480px, 1025px). Use standard Tailwind breakpoints.
3. **`.desktop-only` / `.mobile-only`** utilities exist in `globals.css` at the `lg` (1024px) breakpoint. Prefer Tailwind `hidden md:block` / `md:hidden` in components.
4. **Base styles = mobile styles.** If you write a new CSS class, its default state should look correct on a 375px screen.

## Padding Convention

| Element | Padding |
|---|---|
| Page content area | `px-4 md:px-6` |
| Cards | `p-4` (sm), `p-6` (md via Card component) |
| Section spacing | `py-6 md:py-8` |
| Header | `px-4 sm:px-6` |

## Grid Patterns

```
/* Stats / metric cards */
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3

/* Forms (2-column on tablet+) */
grid-cols-1 sm:grid-cols-2

/* Dashboard with sidebar */
grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]
```

## Checklist for New Components

- [ ] Component renders correctly at 375px width (base)
- [ ] No horizontal scroll at any breakpoint
- [ ] Touch targets >= 44px on mobile
- [ ] Text readable without zooming (min 14px body)
- [ ] Bottom nav padding accounted for on mobile (`pb-20 md:pb-6`)
- [ ] No `max-width` media queries in CSS
- [ ] Breakpoint prefixes cascade up (sm → md → lg), never down
