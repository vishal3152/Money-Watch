-- The cloud cron route (src/app/api/cron/email-sync/route.ts) processes every Owner in one
-- invocation but must bound its own runtime; when it stops partway through, the Owners it never
-- reached must be first in line next time rather than always losing to whichever rows happen to
-- sort first. last_polled_at (nullable — never polled yet) lets listAllEmailSyncCredentials order
-- by it ascending (nulls first) instead of table order.
alter table email_sync_settings add column last_polled_at text;
