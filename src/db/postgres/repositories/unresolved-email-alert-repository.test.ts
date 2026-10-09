import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { DatabaseConstraintError } from "@/db/errors";
import { PgUnresolvedEmailAlertRepository } from "@/db/postgres/repositories/unresolved-email-alert-repository";
import type { EmailAlertDraft } from "@/domain/email-alert";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

const draft: EmailAlertDraft = {
  direction: "credit",
  amount: "1282.05",
  currencyCode: "INR",
  occurredAt: "2026-09-09",
  accountNumberSuffix: "1602",
  institutionName: "RBL Bank",
  description: "NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES",
  reference: "NEFT/IN22625213464969",
  balance: "468531.58"
};

function alertFor(id: string) {
  return {
    id,
    mailbox: "inbox@example.com",
    messageUid: "1757000000:121",
    detectedAt: "2026-09-09T15:02:13.000Z",
    failureReason: "no-match (RBL Bank …1602)",
    draft,
    invalidFields: [] as string[]
  };
}

describe("PgUnresolvedEmailAlertRepository", () => {
  it("lists nothing before any alert has been recorded", async () => {
    const repository = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, randomUUID());

    expect(await repository.listAll()).toEqual([]);
  });

  it("stores an alert with its draft and the fields the owner still has to fix", async () => {
    const repository = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, randomUUID());
    const alert = { ...alertFor(randomUUID()), invalidFields: ["amount", "occurredAt"] };

    await repository.save(alert);

    expect(await repository.listAll()).toEqual([alert]);
  });

  it("rejects recording the same mailbox/messageUid pair twice", async () => {
    const repository = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, randomUUID());
    await repository.save(alertFor(randomUUID()));

    await expect(repository.save(alertFor(randomUUID()))).rejects.toThrow(DatabaseConstraintError);
  });

  it("reads one alert back by id and drops it once resolved", async () => {
    const repository = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, randomUUID());
    const alert = alertFor(randomUUID());
    await repository.save(alert);

    expect(await repository.getById(alert.id)).toEqual(alert);
    expect(await repository.delete(alert.id)).toBe(true);
    expect(await repository.getById(alert.id)).toBeNull();
    expect(await repository.delete(alert.id)).toBe(false);
  });

  it("never returns another Owner's unresolved alerts", async () => {
    const ownerId = randomUUID();
    const owner = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, ownerId);
    const otherOwner = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, randomUUID());
    const alert = alertFor(randomUUID());
    await owner.save(alert);

    expect(await otherOwner.listAll()).toEqual([]);
    expect(await otherOwner.getById(alert.id)).toBeNull();
    expect(await otherOwner.delete(alert.id)).toBe(false);
    expect(await owner.getById(alert.id)).not.toBeNull();
  });

  it("still surfaces a row recorded before drafts existed, reading its parsed alert as the draft", async () => {
    const ownerId = randomUUID();
    const repository = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, ownerId);
    const id = randomUUID();
    await admin`
      insert into processed_email_alerts (id, owner_id, mailbox, message_uid, status, processed_at, parsed_alert_json)
      values (${id}, ${ownerId}, 'inbox@example.com', 'uid-legacy', 'unresolved', '2026-09-08T09:00:00.000Z', ${JSON.stringify(draft)})
    `;

    expect(await repository.getById(id)).toEqual({
      id,
      mailbox: "inbox@example.com",
      messageUid: "uid-legacy",
      detectedAt: "2026-09-08T09:00:00.000Z",
      failureReason: null,
      draft,
      invalidFields: []
    });
  });

  it("never lists a matched row recorded by an older poll", async () => {
    const ownerId = randomUUID();
    const repository = new PgUnresolvedEmailAlertRepository(CONNECTION_STRING, ownerId);
    await admin`
      insert into processed_email_alerts (id, owner_id, mailbox, message_uid, status, processed_at)
      values (${randomUUID()}, ${ownerId}, 'inbox@example.com', 'uid-legacy-matched', 'matched', '2026-09-08T09:00:00.000Z')
    `;

    expect(await repository.listAll()).toEqual([]);
  });
});
