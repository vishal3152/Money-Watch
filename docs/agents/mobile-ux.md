# Mobile-first UX

Hard UI standard. Read this before building, changing, or verifying any screen.

**North star:** minimum taps, minimum typing, minimum scrolling, minimum decisions.

**Done when:** every primary workflow on the changed screen works one-handed at a narrow mobile viewport (~375px) against that north star.

## Touch

- Design for touch first, desktop second.
- Keep primary actions within easy thumb reach.
- Minimum touch target: approximately 44×44 px.
- Make entire list rows tappable.
- Every essential action works on tap — never require hover.
- Respect device safe areas.

## Controls

Pick the lightest control that matches the choice:

| Choice | Control |
| --- | --- |
| Binary or frequent | One-tap control, not a dropdown |
| Short mutually exclusive set | Segmented control |
| True on/off setting only | Toggle (not for multi-option or navigation) |
| Mobile selection list or contextual actions | Bottom sheet |

Keep frequent actions in the main chrome. Do not hide them behind a hamburger or overflow menu without a strong reason.

## Input

- Use the matching mobile keyboard / input type (`decimal`, `email`, `tel`, `date`, and so on).
- Money amounts, rates, and other decimal number fields must use `<DecimalInput>` from `src/app/components/decimal-input.tsx` (or call `sanitizeDecimalInput` from `src/app/decimal-field.ts` when wiring a controlled value). Never use a plain `type="text"`/`inputMode="decimal"` input that still accepts letters — strip non-decimal characters on every change. Use `allowNegative` only when the domain value can be signed (e.g. bank-reported balance, Adjustment amount).
- Cut typing with defaults, recent choices, autocomplete, and selection lists.
- Mark every required field with an asterisk (`*`) next to the label. Leave optional fields unmarked so required vs optional is obvious without reading help text.
- Cap free-text fields (names, descriptions) at `TEXT_FIELD_MAX_LENGTH` (60) from `src/app/form-limits.ts` — set `maxLength` on the input and reject over-limit values in the Server Action. Domain-constrained fields keep their own limits (currency ISO-3, money, dates, filesystem paths).

## Workflow

- Keep common workflows short and one-handed.
- Disclose secondary fields progressively.
- Stay on the current surface when the next step can happen in place — skip unnecessary navigation and full-page transitions.
- Keep primary information on a vertical layout — no horizontal scrolling for it.
- Communicate state with label, icon, or text, not color alone.

## Feedback and recovery

- Preserve user input when validation fails.
- Prevent duplicate submissions.
- Give immediate feedback after important actions.
- Prefer Undo for reversible destructive actions.
- Use a confirmation dialog only when the action is genuinely consequential.

## Verification

Before calling the screen complete, walk the primary workflow at ~375px and confirm:

- [ ] Touch-first; primary actions in thumb reach; targets ≥ ~44×44; rows fully tappable; no hover-only essentials; safe areas respected
- [ ] Controls match the table (one-tap / segmented / toggle-only-for-on-off / bottom sheets); frequent actions not buried in menus
- [ ] Correct input types; amount/rate fields use `DecimalInput` (letters blocked); typing minimized via defaults, recents, autocomplete, or lists; required fields marked with `*`, optional unmarked; free-text capped at `TEXT_FIELD_MAX_LENGTH`
- [ ] Short one-handed flow; progressive disclosure; no needless full-page hops; no horizontal scroll for primary info; state not color-only
- [ ] Input preserved on validation error; no double-submit; immediate feedback; Undo preferred over confirm for reversible destroy; confirm only when consequential
- [ ] North star held: fewer taps, less typing, less scrolling, fewer decisions than the obvious desktop-shaped alternative
