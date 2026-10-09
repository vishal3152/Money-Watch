# Email alert sync calls an LLM server-side

The MCP statement importer (`docs/specs/import.md`) is deliberately built "without Paisa-Watch performing any OCR/parsing itself and without Paisa-Watch paying for LLM API calls" — the owner's own AI assistant does the parsing, in conversation, because a human is present at import time to supply and confirm it. Email alert sync (`docs/specs/email-alert-sync.md`) has no such moment: bank debit/credit alert emails arrive continuously and unattended, and there is no assistant conversation to hand them to. To turn each alert into structured data at all, Paisa-Watch itself calls an LLM (via OpenRouter, using an owner-supplied API key) each time a new alert email is fetched.

This is a narrow, named exception to the MCP importer's cost/parsing boundary, not a reversal of it. The MCP flow is unchanged: `stage_import`/`commit_import` still expect the assistant to have parsed the file and still charge the assistant's own LLM usage, not Paisa-Watch's. Email alert sync is a second, independent import path that happens to also produce `ImportBatch`/`Imported` Transaction rows, and carries over the same untrusted-caller invariants as the MCP path (server-side currency-aware decimal parsing, no LLM-guessed Account, advisory-only duplicate flagging) — see `docs/specs/email-alert-sync.md`.

## Considered Options

- Require the owner to manually forward/paste each alert into their AI assistant, same as statement import. Rejected — defeats the point of a periodic, unattended sync; the owner asked for exactly the unattended case.
- Parse alert emails with a hand-written regex/template per bank, no LLM at all. Rejected — brittle against each bank's own wording/format changes and the number of banks the owner holds Accounts at; the LLM cost is small (short plain-text alerts, not statements) and worth the flexibility.
