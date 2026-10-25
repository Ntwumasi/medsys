# MedSys Design System — "Care"

**Direction:** C · Care — hyperlegible, warm, touch-first. Chosen 2026-10-25 from three explored directions
(Clarity, Precision, Care; canvas: https://claude.ai/artifact/PZwpUVwvk7D9yGJu1eRvZZ).

**Source of truth:** `client/src/styles/design-tokens.json` → `npm run tokens` (in `client/`) generates
`client/src/styles/tokens.css`. Tailwind exposes everything under the `ds` namespace (`bg-ds-surface`,
`text-ds-text-muted`, `rounded-ds-card`, `shadow-ds-card`, `h-ds-control`, `duration-ds-base` …).
White-label colours: `client/src/styles/tenantAccent.ts`.

The **Clinical UI rules** in `CLAUDE.md` apply to every screen and override anything here.

---

## 1. Principles

1. **Readable first.** Atkinson Hyperlegible was designed for low-vision readers. Letterforms are easy to tell apart (Il1, 0O), and that matters when the text is a dose or a lab value.
2. **Calm by default, loud only for danger.** The interface stays quiet so that a critical result or allergy stands out immediately. Colour is never decoration.
3. **Touch is first-class.** Controls are 48 px tall by default and touch targets are never smaller than 44 px. Nurses on tablets get the same app as doctors at desks.
4. **Every client, every country.** There's no regional styling. Each tenant sets one accent colour, and dates, numbers and currency follow the clinic's locale. Layouts survive text that is 30% longer in translation.
5. **Fast on slow connections.** Fonts are self-hosted (woff2), system fallbacks are always declared, there are no icon fonts or web-font icon sets (icons are inline SVG), and skeletons reserve space so nothing jumps.

---

## 2. Colour

Contrast is the WCAG 2.x ratio on the surface where the colour is used. AA requires 4.5:1 for text and 3:1 for UI component boundaries.

### Neutrals (warm stone)

| Token | Light | Dark | Use | Contrast (L / D) |
|---|---|---|---|---|
| `canvas` | `#F6F4F1` | `#141210` | App background | — |
| `surface` | `#FFFFFF` | `#1C1A17` | Cards, panels, inputs | — |
| `subtle` | `#F3EFEA` | `#24211D` | Table headers, wells, skeletons | — |
| `border` | `#E5DED4` | `#353029` | Hairline dividers only (decorative) | 1.3 / 1.3 |
| `border-control` | `#8C857C` | `#766E64` | Input, select and checkbox outlines | 3.7 / 3.5 ✓ |
| `text` | `#1C1917` | `#F5F1EB` | Primary text | 17.5 / 15.4 ✓ |
| `text-secondary` | `#57534E` | `#CBC3B8` | Secondary text | 7.6 / 10.0 ✓ |
| `text-muted` | `#6B6560` | `#A9A095` | Labels, metadata (lowest allowed for text) | 5.7 / 6.7 ✓ |

### Accent (tenant, white-label)

| Token | Light | Dark | Contrast |
|---|---|---|---|
| `accent` | `#0F766E` | `#3CC4B3` | 5.5 / 8.1 on surface ✓ |
| `on-accent` | `#FFFFFF` | `#062420` | 5.5 / 7.6 ✓ |
| `accent-soft` | `#E3F2EF` | `#21312D` | selected nav, chips |
| `accent-text` | `#0B5E57` | `#6FDCCB` | 6.6 / 8.2 on accent-soft ✓ |
| `brand-plum` | `#8E4585` | `#D49BCB` | default brand secondary (avatars, illustration), never status |

**Rules for the accent:**
- The accent marks **interaction and selection**: primary buttons, focus rings, the active nav item and links. It is never used for status.
- A clinic's brand colour goes through `deriveTenantTokens()`. It adjusts lightness until every accent pair passes AA in both modes, and **rejects red/orange brands** (`clashesWithSemantics`), keeping the default teal. A red logo must not make every button look like a critical alarm.
- The clinic's logo sits in the sidebar and top bar. It's a logo slot only; no other brand styling.

### Semantic (fixed, never tenant-controlled)

| Meaning | Fill | Text / on soft | Soft background | Border | Contrast |
|---|---|---|---|---|---|
| **Critical** | `#C8291C` / dark: fill only | `#A8261A` / `#FFA69C` | `#FDF0EE` / `#3A1C17` | `#F7C6BE` / `#7A2E25` | white on fill 5.5; text 6.4 / 8.1 ✓ |
| **Warning** | `#B45309` / `#F8C76B` | `#8A4B07` / `#F8C76B` | `#FEF5E6` / `#38291A` | `#F6D69A` / `#6B4E22` | 6.3 / 8.5 ✓ |
| **Success** | `#18703F` / `#7FD8A4` | `#18703F` / `#7FD8A4` | `#EAF6EE` / `#1F2E23` | — | 5.5 / 8.1 ✓ |
| **Info** | `#1D4ED8` / `#9DB8FF` | `#1D4ED8` / `#9DB8FF` | `#EEF3FF` / `#262838` | — | 6.0 / 7.2 ✓ |

- **Never use colour alone.** Every status also has a word ("CRITICAL", "HIGH", "Paid") and, where it helps, an icon.
- In dark mode the critical *fill* (`#C8291C`, 3.1:1 on surface) is only used behind white text (5.5:1). Critical *text* always uses `critical-text`.
- Info is blue and the default accent is teal. They differ in both hue and lightness, so an info note never looks like a button.

---

## 3. Typography

**Families:**
- **Sans:** Atkinson Hyperlegible Next, falling back to `system-ui, -apple-system, Segoe UI, Roboto, Noto Sans`, then Noto Sans Arabic / Devanagari for those scripts.
- **Mono / data:** Atkinson Hyperlegible Mono, falling back to `ui-monospace, SFMono-Regular, Menlo, Consolas, Noto Sans Mono`.
- Both are self-hosted as woff2 in weights 400/500/700, with latin and latin-ext subsets and `font-display: swap`. Other scripts fall back to the system or Noto fonts, so there's no download cost for scripts a clinic doesn't use.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| Display | 32 / 40 | 700, −0.01em | Patient name in a full chart header |
| Title | 22 / 30 | 700 | Page titles |
| Heading | 17 / 24 | 700 | Card and section headings |
| Body | 16 / 24 | 400 | Default text (16 px base, never smaller for body text) |
| Small | 14 / 20 | 500 | Secondary text, table cells in compact density |
| Caption | 13 / 18 | 500 | Metadata. **Minimum size anywhere is 13 px** |
| Data | 15 / 22 mono | 500, `tabular-nums` | Lab values, doses, money, IDs |

**Translation:** headings and buttons never have fixed widths; labels wrap rather than truncate (except table cells, which truncate and show the full text in a tooltip). Leave 30% slack in every row of controls.

---

## 4. Space, radius, elevation, motion

- **Space (4 px base):** 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Use 16 padding inside cards on phones and 20 on tablet and desktop; 16–24 between cards.
- **Radius:** `ds-sm` 8 (chips, small tags), `ds-control` 12 (buttons, inputs, nav items), `ds-card` 18 (cards, alerts), `ds-sheet` 24 (modals, bottom sheets), `full` for pills and avatars.
- **Elevation:** cards use `shadow-ds-card` (soft) or just a border; overlays use `shadow-ds-overlay`. Tables, list rows and nav have **no** shadow. In dark mode shadows are deeper and borders carry the separation.
- **Motion:** `duration-ds-fast` 150 ms (press, hover), `duration-ds-base` 220 ms (tabs, menus, sheets), `duration-ds-slow` 280 ms (dialogs). Easing is `ease-ds` (out) when entering and `ease-ds-exit` when leaving; exits are faster than entrances. Animate only `opacity` and `transform`. Under `prefers-reduced-motion` every duration drops to about 0 and movement becomes a fade.
- **Sizes:** controls are `h-ds-control` (48). On desktop data screens a compact variant `h-ds-control-compact` (40) is allowed, **but touch targets stay ≥ 44 px** (pad the hit area). Sidebar is 248 px; the patient banner is 72 px tall.
- **Breakpoints:** phone < 768 ≤ tablet < 1024 ≤ desktop; wide ≥ 1440.

---

## 5. Components

Each is specified by its tokens. Build them once in `client/src/components/ui/` (see §8) and use them everywhere.

**Buttons:**
- Height 48 (compact 40 on desktop), `rounded-ds-control`, 16 px horizontal padding, weight 700 label.
- **Primary:** `bg-ds-accent text-ds-on-accent`, hover `bg-ds-accent-hover`. One per area.
- **Secondary:** `bg-ds-surface border border-ds-border-control text-ds-text`.
- **Ghost:** transparent, `text-ds-text-secondary`, hover `bg-ds-subtle`.
- **Danger:** `bg-ds-critical text-white`. Only for destructive actions and critical acknowledgements.
- Loading replaces the label with a spinner plus "Saving…" and the button stays disabled while busy, so it can't be submitted twice.
- Icon-only buttons need an `aria-label` and a 44 px hit area.

**Inputs / selects / textareas:**
- Height 48, `bg-ds-surface border border-ds-border-control rounded-ds-control`, 16 px text, so iOS doesn't zoom on focus.
- The label always sits above the field; placeholders are never used as labels.
- Helper text goes below in `text-ds-text-muted` 13 px; errors go below in `text-ds-critical-text` with an icon and are linked with `aria-describedby`.
- Focus: a 3 px `ring-ds-focus-ring/30` plus a `border-ds-accent` outline.
- Dates, numbers and currency are entered and shown in the clinic's locale (§7).

**Cards:** `bg-ds-surface rounded-ds-card` with `shadow-ds-card` or `border-ds-border`; 20 px padding. Heading 17/24 bold, with any card action top-right as a ghost button or link.

**Tables (data-dense, §6):**
- Header `bg-ds-subtle`, caption-size muted labels, sticky.
- Rows at least 44 px (comfortable 52); hairline dividers, no zebra stripes.
- The only row tint is `bg-ds-critical-soft` for a critical row.
- Wide tables scroll inside their card (`overflow-x-auto`) and the page itself never scrolls sideways.

**Tabs:**
- Underline style: 48 px tall, 2 px `ds-accent` underline on the active tab, bold text for the active tab and regular for the others.
- Optional count badges.
- Scroll horizontally on narrow screens.
- Deep-linkable (`?tab=`).

**Badges:**
- Pill shape, 12 px bold uppercase for statuses (`CRITICAL`, `HIGH`) and sentence case for states (`Paid`, `Pending`).
- Soft background with its matching text colour; critical uses a solid fill.

**Alerts:**
- Use `role="alert"` for critical alerts and `role="status"` for others.
- Layout: icon, title and message, with an optional action on the right.
- **Critical alerts and allergy banners have no close (×) button.** The only way to clear them is the explicit **Acknowledge** action (Clinical rule 4).
- Warning, info and success alerts may be dismissible.

**Modals / dialogs:**
- Centred on desktop and a bottom sheet on phones; `rounded-ds-sheet`, `shadow-ds-overlay`, backdrop `bg-black/40`.
- Focus is trapped inside; Esc closes, except for unsaved clinical data, which asks first.
- Footer: secondary on the left, primary on the right.
- Any modal acting on a chart shows the **patient name and ID in its header** (Clinical rule 1).

**Sidebar navigation:**
- Desktop sidebar is 248 px, `bg-ds-surface`, with the clinic logo slot at the top.
- Items are 48 px with a 20 px icon and a label. The active item uses `bg-ds-accent-soft text-ds-accent-text` in bold.
- Collapses to 72 px icons with tooltips.
- On phones a bottom tab bar (at most 5 items) plus a "More" sheet replaces it.

**Patient banner (every patient-specific screen):**
- **Sticky**, 72 px tall, `bg-ds-surface`, bottom border.
- **Left:** avatar initials, **name** (Title size), **ID** (mono), and **age + sex + DOB**, all always visible (Clinical rule 1).
- **Next to the name:** an allergy chip (critical soft, cannot be removed from the banner) and payer.
- **Right:** encounter context (room, start time) and the primary actions.
- Critical results sit directly under the banner as a non-dismissible critical alert.
- On phones the banner compresses to name, ID, age and the allergy chip; it is never removed.

**Empty states:**
- Centred inside the card: a 56 px icon tile (`bg-ds-accent-soft`), a one-line title, one helpful sentence and at most one action.
- Must be honest about *why* it's empty.
- A **failed load is never shown as an empty state**; it's an error with a "Try again" action.

**Loading skeletons:**
- `bg-ds-subtle` bars matching the final layout's sizes, so nothing shifts when data arrives; a subtle pulse, none under reduced motion.
- When the patient changes, show a skeleton immediately. **Never show the previous patient's data while loading** (Clinical rule 2).

**Toasts:**
- Bottom-centre on phones, top-right on desktop.
- Success toasts for chart saves **name the patient** ("Vitals saved for Ama Owusu") (Clinical rule 3).
- Errors stay on screen until dismissed.

---

## 6. Data-dense screens (lab results, schedules, invoices)

1. **Numbers are mono, tabular and right-aligned.** Units go in their own muted column, so the numbers line up and scan in a straight line.
2. **Flags are words plus colour plus position.** Show a `CRITICAL` / `HIGH` / `LOW` badge in a dedicated column, and colour the value itself (critical-text / warning-text). Normal values stay plain; they shouldn't compete for attention.
3. **Reference ranges sit next to the value**, muted (`12.0–15.5`), so every result reads as "value vs. normal" without a lookup.
4. **One tint, used rarely.** Only critical rows get a background tint; anything louder becomes noise and nothing stands out.
5. **Group, don't paginate, what belongs together.** Panels (FBC, renal) get a header row; at most about 7 columns visible; less important columns hide below 1024 px behind a row expander.
6. **Sticky headers and first column** on long tables; totals rows (invoices) in bold above a top border.
7. **Show time twice:** relative ("2 h ago") with the absolute time in a tooltip, in the clinic's timezone.
8. **Density setting:** comfortable (52 px rows, default) or compact (44 px rows, desktop only). Touch devices are always comfortable.
9. **Schedules:** fixed time-column width, appointments as cards with name, ID and reason; status by badge, not colour fill alone.

---

## 7. Internationalisation and white-label

- **Formats:** use `Intl.DateTimeFormat`, `Intl.NumberFormat` and `Intl.NumberFormat({style:'currency', currency})` with the **clinic's** locale, timezone and currency from tenant config, never hard-coded `GHS` or US formats. Lab values use the locale's decimal separator but keep their unit.
- **Text growth:** budget +30% for all labels; no fixed-width buttons; truncate only inside table cells, with a tooltip.
- **RTL-ready:** use logical properties (`ps-*`/`pe-*`, `ms-*`/`me-*`, `start`/`end`) in new components so Arabic or Hebrew clinics work by setting `dir="rtl"`.
- **Tenant config:** logo, accent colour (validated by `deriveTenantTokens`), locale, timezone and currency. Nothing else is themeable, so clinical meaning stays consistent across every client.

## 8. Dark mode

- Tokens switch under the `.dark` class (Tailwind `darkMode: 'class'`).
- The app sets the class from the user's choice: Light, Dark or **System**, where System follows `prefers-color-scheme` and is the default.
- Every pair above is verified in both modes. Charts and illustrations use tokens, never fixed hex values.

---

## 9. Component library — recommendation

**Recommendation: shadcn/ui on Tailwind.** That means Radix UI primitives for behaviour and accessibility, `class-variance-authority` for variants and `tailwind-merge` for class merging, with the component code copied into `client/src/components/ui/`.

Measured in the codebase today (75k lines of TSX, 44 pages, 83 components): 953 `<button>`s, 522 `<input>`s, 98 tables, **90 hand-built modal overlays** (focus trapping and Esc handling inconsistent), 79 hand-rolled spinners, and 143 uses of the in-house `AppSelect`. MUI was fully removed on 2026-10-25.

| Option | What it means here | Effort | Bundle / runtime | Fit |
|---|---|---|---|---|
| **shadcn/ui + Tailwind** (recommended) | Keeps the existing Tailwind; adds Radix for the hard parts (dialog focus trap, select, menus, tooltip, tabs keyboard nav); components live in our repo, themed directly with the `ds` tokens | **Foundation 2–3 days** (fonts, dark-mode switch, tenant accent wiring). **Core kit 6–8 days** (Button, Input, Select/Combobox replacing AppSelect, Textarea, Dialog/Sheet replacing the 90 modals, Tabs, Table, Badge, Alert, Card, Skeleton, Toast, Tooltip, DropdownMenu, PatientBanner, EmptyState, Sidebar). **Screens 5–7 weeks, incremental** (busiest first: Doctor, Nurse, Pharmacy, Lab, Reception, PatientDetails at 2–3 days each; ~35 smaller pages at ~0.5 day each). Ships screen by screen, no big-bang release | Small: each Radix primitive is ~3–15 kB gzip, only what's used; no CSS-in-JS runtime | Best: same styling system as today, full control, no vendor theme to fight |
| MUI v7 (re-adopt) | Theme MUI with the tokens (`CssVarsProvider`), then rewrite the screens' Tailwind markup into MUI components | Theme 3–4 days, then **12–16 weeks** of rewriting, mixing two styling systems (Emotion + Tailwind) the whole time | Large: about 90–120 kB gzip extra plus the Emotion runtime cost on every render, which hurts slow connections | Poor: undoes the work just done, and Material styling is hard to make feel premium / non-Google |
| Tailwind + Headless UI (no shadcn) | Similar to the recommendation but fewer primitives (no Toast, Tooltip or Combobox parity) and more to build by hand | Core kit about 8–10 days, screens the same | Small | OK, but more custom accessibility work |

**Migration order:**
1. Fonts, dark mode and tenant accent.
2. The core kit plus PatientBanner.
3. **Dialogs first**, because replacing the 90 hand-built modals fixes focus and Esc bugs everywhere.
4. Clinical screens in risk order.
5. Billing and admin.
6. The portal last; it already follows a close variant.

**Each step is styling and layout only (Clinical rule 6)**, behind the existing tests, one screen per PR, verified with screenshots in light, dark, phone and tablet.

## Migrating a screen (how it's been done)

1. Call `useDesignSystemPage()` at the top of the page and pass `designSystem` to `AppLayout`.
2. Convert the page's own colour classes to `ds` tokens. `utils/dsClass.ts` holds the hand-written map and `utils/dsClassMap.generated.ts` the rule-based one. Regenerate it with `node scripts/generate-ds-class-map.mjs` (in `client/`) whenever a screen uses legacy colour classes that aren't mapped yet. Families collapse onto roles: rose/red → critical, orange/amber/yellow → warning, green/emerald → success, blue/indigo/cyan → info, teal/primary → accent, purple/pink → brand plum.
3. Shared child components that other, unmigrated screens also use go through `dsClass()` (translated only while a migrated screen is open) instead of being converted.
4. Never translate markup that a print window copies via `innerHTML`. A printed document keeps its own classes.
5. Text on a solid fill must follow the fill: accent, warning, success, info and plum fills turn light in dark mode, so use `text-ds-on-accent` or `text-white dark:text-ds-canvas`. Critical stays dark, so white is fine there.
6. Red (critical) is for alarms only. A section's decorative colour moves to the accent.
7. Interactive elements are at least 44px tall (`min-h-ds-touch`).
8. Long patient charts use `components/PatientStickyBar` so name, ID and age (and allergies) stay visible while scrolling.
9. Screenshot light, dark and tablet/phone (headless Chrome's minimum width is 500px, so render narrow widths in an iframe, and switch animations off: its virtual clock freezes them).
