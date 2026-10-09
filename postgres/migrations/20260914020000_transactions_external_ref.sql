-- ADR-0014: statement reference number, preferred over date+amount for Suspected Duplicate
-- matching when both the incoming line and an existing Transaction have one.
alter table transactions add column external_ref text;
