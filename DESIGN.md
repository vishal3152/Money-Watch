---
name: Money Watch
description: Figma Portfolio Global–aligned Operate UI for independent balance verification (Money Watch brand)
colors:
  paper: "#f2f2f2"
  paper-deep: "#f2f2f2"
  surface: "#ffffff"
  surface-soft: "#f2f2f2"
  ink: "#141c2e"
  ink-strong: "#17191c"
  ink-heading: "#141c2e"
  ink-muted: "rgba(20, 28, 46, 0.6)"
  hairline: "rgba(20, 28, 46, 0.1)"
  hairline-strong: "rgba(20, 28, 46, 0.18)"
  accent: "#387ed1"
  accent-light: "#387ed1"
  accent-deep: "#2d6bb8"
  accent-hover: "#2d6bb8"
  accent-soft: "#387ed10f"
  danger: "#b42318"
  danger-soft: "#fef3f2"
  success: "#166534"
  success-soft: "#f0fdf4"
typography:
  display:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "0"
  headline:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "0"
  title:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.15px"
  body-2:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.25px"
  caption:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.1px"
  button:
    fontFamily: "\"Inter Tight\", Inter, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 500
    lineHeight: 1.294
    letterSpacing: "0.43px"
rounded:
  sm: "6px"
  md: "8px"
  xl: "12px"
  card: "16px"
  pill: "999px"
  sheet-top: "1.25rem"
spacing:
  field-gap: "0.55rem"
  field-stack: "1.35rem"
  card-pad: "2.25rem 2rem 1.85rem"
  card-pad-mobile: "1.5rem 1.2rem 1.35rem"
  main-pad: "clamp(2rem, 9vh, 5.5rem) 1.25rem 3rem"
  touch: "2.75rem"
components:
  button-primary:
    backgroundColor: "#387ed1"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "0.8rem 1rem"
    height: "3.25rem"
  button-primary-hover:
    backgroundColor: "#2d6bb8"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.75rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "3.25rem"
  card-task:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.75rem"
    height: "2.75rem"
  badge-alert:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.5rem"
  chip-category:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.5rem"
---

# Design System: Money Watch

## Overview

**Creative North Star: "Portfolio Global Paper"**

Money Watch’s visual world is taken from Figma [Portfolio Tracker Draft → Portfolio Global (`152:2262`)](https://www.figma.com/design/YB80lPHpESKna9q8jmBEvE/Portfolio-Tracker-Draft?node-id=152-2262) — Inter Tight type, solid Wealth Blue `#387ed1` actions, flat warm-gray paper `#f2f2f2`, white cards with soft navy-tinted borders. Product structure stays Operate (task cards, lists, reconciliation), not the marketing/dashboard chrome layout.

Density stays airy. One primary job per viewport. Create flows live in a single elevated form card; list and detail screens reuse the same paper/surface/ink vocabulary.

**Key Characteristics:**
- Flat paper ground (`#f2f2f2`) — no blue/indigo ambient washes
- White surfaces with `rgba(20, 28, 46, 0.1)` hairlines and soft navy-tinted lift
- Ink `#141c2e` / muted `rgba(20, 28, 46, 0.6)`
- Solid primary fill `#387ed1` (not gradient) with inset highlight/shadow
- Inter Tight as the UI face (Inter as fallback)
- Touch-first controls (≥2.75rem) and mobile-tightened padding below 640px

## Colors

### Primary
- **Wealth Blue** (`#387ed1`): Buttons, focus, brand lead word, theme-color. Hover darkens to `#2d6bb8`. Soft wash `#387ed10f` for light tints only.

### Neutral
- **Paper** (`#f2f2f2`): App ground (Figma Paper Elevation-1).
- **Surface** (`#ffffff`): Cards, sheets, inputs.
- **Ink** (`#141c2e`): Body and titles (Figma Typhography/Primary).
- **Ink Strong** (`#17191c`): Brand trailing word, balance figures, code.
- **Ink Muted** (`rgba(20, 28, 46, 0.6)`): Secondary copy (Figma Typhography/Secondary).
- **Hairline** (`rgba(20, 28, 46, 0.1)`): Borders and dividers.

### Status
- **Audit Red** (`#b42318`) on **Soft Audit Wash** (`#fef3f2`)
- **Settle Green** (`#166534`) on **Soft Settle Wash** (`#f0fdf4`)

### Named Rules
**The Wealth Blue Rule.** `#387ed1` is the only accent voice for actions, links, and focus. Do not invent a second CTA color.

**The Status Softness Rule.** Danger and success use tinted washes behind saturated text.

## Typography

**Display / Body:** Inter Tight via `next/font` (`--font-inter-tight`), with Inter (`--font-inter`) then system UI as fallbacks.  
**Mono:** system mono stack for MCP/code blocks; amounts use `font-variant-numeric: tabular-nums`.

### Hierarchy (Figma tokens)
- **Heading-5** (600, `1.5rem` / 24px, lh 32): Page and card titles.
- **Subtitle-1** (400–500, `1.125rem` / 18px, lh 27): Emphasized nav / secondary titles.
- **Body-1** (400, `1rem` / 16px, lh 24): Default UI copy and inputs.
- **Body-2** (400, `0.875rem` / 14px, lh 21): Ledes and secondary copy.
- **Caption / Overline** (400–500, `0.75rem` / 12px): Meta, badges, section labels.
- **Button/Large** (500, `1.0625rem` / 17px, tracking 0.43px): Primary CTAs.

### Named Rules
**The Tabular Money Rule.** Monetary amounts always use tabular numerals.

**The Split Brand Rule.** Brand lockup: lead syllable in Wealth Blue, trailing in Ink Strong (`Check` / `Book`). Mark: ruled register + accent check — see `docs/brand/README.md`.

## Layout

Mobile-first Operate column. Task cards max `32rem`; detail/dashboard max `40rem` by default. From `768px` up, content widens (`48rem` / `72rem`); from `1100px` up, form cards and detail/dashboard use full main width. Header is a full-width frosted bar (`4.5rem`), brand left, actions right.

Spacing: field gap `0.55rem`, field stack `1.35rem`, touch ≥`2.75rem`. Below `640px`, card padding and headings tighten.

### Named Rules
**The One Job Rule.** Create/edit screens are one elevated card, one primary CTA.

## Elevation & Depth

### Shadow Vocabulary
- **Card lift** (`0 4px 12px -2px rgba(20, 28, 46, 0.08)`) — Figma Shadow/Light/md
- **Button pop** (inset white/black rim + soft Wealth Blue outer)
- **Sheet lift** (`0 -8px 28px rgba(0, 0, 0, 0.16)`)
- **Easing** (`cubic-bezier(0.4, 0, 0.2, 1)`)

## Shapes

- Cards: `16px` (Rounded-3xl)
- Primary buttons: `12px` (Rounded-xl)
- Fields / chips: `8px` (Rounded-md)
- Badges: pill `999px`

## Components

### Buttons
- **Primary:** Solid `#387ed1`, white Medium 17px label, `12px` radius, min-height `3.25rem`; inset highlight/shadow; hover to `#2d6bb8`.
- **Secondary:** White fill, hairline border, soft shadow.
- **Danger:** Solid Audit Red.

### Cards
White fill, navy-tinted hairline, `16px` radius, Figma soft lift.

### Inputs
Surface fill, hairline border, `8px` radius, min-height `2.75rem`. Focus: accent border + soft blue halo.

## Do's and Don'ts

### Do:
- Keep Wealth Blue / Paper `#f2f2f2` / Ink `#141c2e` as the core palette.
- Use Inter Tight for UI chrome at the Figma type scale.
- Preserve ≥2.75rem touch targets and safe-area padding.
- Use tabular numerals for money.

### Don't:
- Reintroduce cool blue-gray paper gradients or indigo ambient washes.
- Use blue button gradients — primary is solid `#387ed1`.
- Invent a second CTA color from indigo.
- Paste Figma marketing chrome (sidebar promo, multi-line charts) into Operate screens unless requested.
