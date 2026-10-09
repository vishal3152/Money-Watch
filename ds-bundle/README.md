# Paisa Watch UI conventions

This design system is a **CSS class vocabulary**, not a utility framework or
a prop-driven component library. Every visual variant — buttons, fields,
list rows, status pills — is a semantic `pw-*` class applied directly to
plain HTML elements (`<div>`, `<li>`, `<button>`) alongside the 7 imported
components. The components themselves carry almost no visual props; styling
comes from the classes you put on the markup you write around them.

## Setup

No provider or theme wrapper needed. `styles.css` defines everything at
`:root` — colors, radius, shadows, and the two font-family variables
(`--font-inter-tight`, `--font-inter`) — the moment it's imported once at
the app root. Don't wrap components in anything.

## The class vocabulary

Real class families from `styles.css` (verified against the shipped
stylesheet — use these names, don't invent new ones):

| Purpose | Classes |
|---|---|
| Form field wrapper | `pw-field` (wraps a `<label>` + input/select + optional `pw-field-error` / `pw-field-help`), `pw-field-row`, `pw-fieldset` / `pw-field-legend` |
| Buttons | `pw-button` (primary, blue gradient), `pw-button-secondary` (white/bordered), `pw-button-danger` (solid red, no gradient) |
| Cards / sections | `pw-card`, `pw-section`, `pw-section-heading` (+ `pw-section-heading-actions`, `pw-section-action`, `pw-section-count`, `pw-section-note`) |
| Lists | `pw-list` — see the gotcha below |
| Status / tags | `pw-badge`, `pw-category-tag`, `pw-trust-status` (`--confirmed` / `--imported` modifiers), `pw-amount-direction` (`--credit` / `--debit`) |
| Balance display | `pw-balance`, `pw-balance-figure`, `pw-balance-value`, `pw-balance-currency` |
| Empty / loading / banners | `pw-empty`, `pw-loading`, `pw-spinner`, `pw-banner-error`, `pw-banner-success` |
| Required field marker | `<span className="pw-required-mark" aria-hidden="true">*</span>` (pair with the input's own `required` attribute — never rely on color alone) |

**Critical gotcha**: `.pw-list > li > a, .pw-list > li > span` only applies
its row layout (flex, padding, hover) to a **direct** `<a>` or `<span>`
child of `<li>`. Content placed straight inside `<li>`, or wrapped in some
other element first, renders unstyled with no visible error. Always shape
list rows as `<li><a>...</a></li>` or `<li><span>...</span></li>`.

## Where the truth lives

- `styles.css` (imported once) — all tokens and every `pw-*` rule.
- Each component's `<Name>.prompt.md` — real usage extracted from the app.
- `<Name>.d.ts` — the prop contract.

## Example: a required money field

```tsx
import { DecimalInput } from "@paisa-watch/ui";

<div className="pw-field">
  <label htmlFor="principal">
    Principal
    <span className="pw-required-mark" aria-hidden="true">*</span>
  </label>
  <DecimalInput id="principal" name="principal" placeholder="0.00" required />
</div>
```

# PaisaWatchUI (@paisa-watch/ui@0.1.0)

This design system is the published @paisa-watch/ui React library, bundled as a single
browser global. All 7 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.PaisaWatchUI`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.PaisaWatchUI.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { CollapsibleSectionList } = window.PaisaWatchUI;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<CollapsibleSectionList />);
```

## Tokens

33 CSS custom properties from @paisa-watch/ui. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (4): `--pw-bg-deep`, `--pw-surface`, `--pw-surface-2`, …
- **typography** (3): `--font-inter-tight`, `--font-inter`, `--pw-font`
- **radius** (2): `--pw-radius`, `--pw-radius-sm`
- **shadow** (3): `--pw-shadow`, `--pw-shadow-sm`, `--pw-shadow-pop`
- **other** (21): `--pw-bg`, `--pw-ink`, `--pw-ink-strong`, …

## Components

### general
- `CollapsibleSectionList`
- `DecimalInput` — Text input that only accepts decimal digits (optional leading - when
- `DeleteConfirmForm`
- `LedgerFilter`
- `SegmentedControl`
- `SheetSelect`
- `ToggleField`
