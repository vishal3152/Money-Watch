alter table fixed_deposits add constraint fixed_deposits_id_owner_id_key unique (id, owner_id);

create table transfers (
  id text primary key,
  owner_id uuid not null,
  source_account_id text,
  source_fixed_deposit_id text,
  source_amount_minor bigint not null,
  source_currency_code text not null,
  destination_account_id text,
  destination_fixed_deposit_id text,
  destination_amount_minor bigint not null,
  destination_currency_code text not null,
  occurred_at text not null,
  description text not null,
  purpose text not null default 'general' check (
    purpose in ('general', 'fixed-deposit-opening', 'fixed-deposit-top-up', 'fixed-deposit-withdrawal')
  ),
  -- Nullable compound FKs: a NULL in either column skips enforcement for that
  -- row (Postgres MATCH SIMPLE default), which is correct here since exactly
  -- one of {account, fixed deposit} is set per side (domain-layer invariant).
  foreign key (source_account_id, owner_id) references accounts (id, owner_id),
  foreign key (source_fixed_deposit_id, owner_id) references fixed_deposits (id, owner_id),
  foreign key (destination_account_id, owner_id) references accounts (id, owner_id),
  foreign key (destination_fixed_deposit_id, owner_id) references fixed_deposits (id, owner_id)
);

alter table transfers enable row level security;

create policy "owner can access own transfers" on transfers
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on transfers to authenticated;

alter table transfers add constraint transfers_id_owner_id_key unique (id, owner_id);

-- Bootstrap completion: transactions was created without transfer_id (transfers
-- didn't exist yet). Add it back now as a nullable compound FK.
alter table transactions add column transfer_id text;
alter table transactions
  add constraint transactions_transfer_id_owner_id_fkey
  foreign key (transfer_id, owner_id) references transfers (id, owner_id);
