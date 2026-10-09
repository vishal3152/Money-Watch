# Money Watch brand

Display name for the product (repo/package remain `paisa-watch`).

## Positioning

Classic personal finance register energy — your ledger across institutions, reconciled against what the bank claims. Not a budget app; the mark reads as **checkbook / register**, not a bank logo or stock chart.

## Logo

| Asset | Use |
| --- | --- |
| `public/brand/logo-mark.svg` | App icon source, favicon (`src/app/icon.svg`), header mark |
| `public/brand/logo-lockup.svg` | README, docs, marketing width |
| `public/brand/logo-mark.png` / `logo-lockup.png` | Contexts that require raster (regenerate from SVG when the mark changes) |

### Mark

- **Cover:** Ink Strong `#17191c`, spine `#0d0f12`
- **Page:** White `#ffffff`
- **Register lines:** `rgba(20, 28, 46, 0.14)`
- **Check stroke:** Wealth Blue `#387ed1` (2.25px at 40×40)

Do not rotate, add gradients, or replace the check with a currency symbol.

### Wordmark

- **Spelling:** `Money Watch` (two words)
- **Split color:** `Money` in `#387ed1` (or `--pw-accent-text` on UI), `Watch` in `#17191c` / `--pw-ink-strong`
- **Accent rule:** Optional 4px rounded bar under `Watch` only (see lockup SVG)
- **Type:** Inter Tight 700 in-app; system UI sans in standalone SVG lockup

## UI tokens

Unchanged from [DESIGN.md](../../DESIGN.md): paper `#f2f2f2`, Wealth Blue actions `#387ed1`, ink `#141c2e`. The rebrand is name + mark, not a new palette.

## Tagline (optional)

*Your ledger across banks and currencies — reconcile when their balance isn’t yours.*
