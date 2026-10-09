# Demo seed data

Deterministic fixture used to populate a local Paisa-Watch database for UI/manual testing.

## Contents (`public/demo-data/seed-data.json`)

| Entity | Count | Notes |
| --- | --- | --- |
| Institutions (banks) | 10 | Named after common Indian banks |
| Accounts | 100 | 10 per bank: 5 INR, 3 USD, 2 AED |
| FixedDeposits | 100 | 1 per Account, opening debit recorded |
| Transactions | 600 | 6 per Account (3 Income + 3 Expense) |
| Transfers | 600 | 6 per Account as source → same-currency peer |

Load order: Institutions → Accounts → Transactions (fund) → FixedDeposits (debit) → Transfers.

## Commands

```bash
pnpm demo:generate   # regenerate public/demo-data/seed-data.json
pnpm dev             # start the app
pnpm demo:seed       # open /dev/seed in the browser, then click Load
```

Or open `http://localhost:3000/dev/seed` yourself and click **Load seed data**.

The loader refuses to run if any seed Institution id already exists, and is disabled in production builds.
