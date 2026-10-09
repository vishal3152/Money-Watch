# Product coherence QA

Use this when doing manual UI/QA review, writing UI test cases, or reviewing a form that exposes domain operations. Spec compliance and money-integrity checks are necessary but not sufficient.

## Competing affordance

A **competing affordance** is two (or more) UI paths that claim to do the same lifecycle job, or a free-choice control that offers an option whose correct use already has a dedicated entry point.

For every select, radio group, checkbox cluster, or action row on a form:

1. Name each option/action in one short phrase.
2. Answer: *when is this the correct choice, and how does the user arrive here?*
3. If the answer is “only from another screen / only once / only if checkbox X was skipped,” that option must not sit as a peer choice on the generic form — deep-link or hide it.
4. If two screens both offer the same job with different defaults, flag it: one path should own the job.

**Example that must fail this check:** generic `/transfers/new` offering “Opening deposit” next to “Top up” when opening is already owned by FD create (`debitNow`) and “Record opening debit.”

## Lifecycle gate

A **lifecycle gate** is a one-time or state-machine transition (open, mature, close, first funding). On a generic create form:

- Prefer a dedicated CTA from the entity that owns that lifecycle.
- Do not present the gate as one value in an “operation type” dropdown alongside ongoing operations (top-up, withdraw, transfer).

## Dual verdict

Every UI test case / manual pass records two verdicts:

| Axis | Question |
| --- | --- |
| Spec | Does behavior match `docs/specs/` / ADRs? |
| Coherence | Would a user who never read the ADR pick the right control without a trap? |

A case can be **Spec PASS / Coherence FAIL**. Coherence FAIL is a product bug to file even when the purpose enum in the domain is intentional.

## Minimum checklist (forms)

- [ ] Every dropdown option has a real user story that starts on *this* screen.
- [ ] One-time lifecycle actions are not peers of repeatable operations.
- [ ] If a detail page already has a named CTA for the job, the generic form does not re-offer it as a free choice.
- [ ] Defaults match the most common ongoing job (e.g. Account→FD ⇒ top-up), not the rarest.
- [ ] Labels distinguish entities the user must choose between (no identical option text).
- [ ] After a field-level validation error, previously entered values remain (React 19 resets forms on fulfilled actions — use `withPersistedFormState` + `formKey`/`defaultValue`).

## Form value wipe

Submitting a Server Action that returns `{ fieldErrors }` still fulfills the promise, so React 19 clears uncontrolled inputs. Treat a wiped form on validation error as a product bug. Fix via `src/app/form-persistence.ts`.
