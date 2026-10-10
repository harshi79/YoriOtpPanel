import "server-only";
import { and, desc, eq, getTableColumns, gt, isNull, lte, sql } from "drizzle-orm";
import { activeNumberLeases, databaseNowMs, mailboxOwnership, mailboxes, numberSessions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getDb, isUniqueConstraintError, withDatabaseErrors, type DatabaseTransaction } from "@/lib/db";
import { normalizePhone } from "@/lib/provider/normalize";
import type { MailboxSummary, ProviderNumberAllocation } from "@/lib/provider/types";

export type NumberSessionRecord = typeof numberSessions.$inferSelect;
export type MailboxRecord = typeof mailboxes.$inferSelect;

async function expireNumberLeases(tx: DatabaseTransaction): Promise<void> {
  const [{ now }] = await tx.all<{ now: number }>(sql`select ${databaseNowMs} as now`);
  const cutoff = new Date(now);
  await tx.update(numberSessions).set({
    released_at: sql`coalesce(${numberSessions.released_at}, ${numberSessions.expires_at})`,
    end_reason: "expired",
  }).where(and(isNull(numberSessions.released_at), lte(numberSessions.expires_at, cutoff)));
  await tx.delete(activeNumberLeases).where(lte(activeNumberLeases.expires_at, cutoff));
}

export async function expireStaleNumberLeases(): Promise<void> {
  await withDatabaseErrors(() => getDb().transaction(expireNumberLeases));
}

export async function listOwnedActiveNumbers(userId: string): Promise<NumberSessionRecord[]> {
  return withDatabaseErrors(async () => {
    await expireStaleNumberLeases();
    return getDb().select(getTableColumns(numberSessions)).from(numberSessions)
      .innerJoin(activeNumberLeases, eq(activeNumberLeases.session_id, numberSessions.id))
      .where(and(eq(activeNumberLeases.clerk_user_id, userId), gt(activeNumberLeases.expires_at, databaseNowMs)))
      .orderBy(desc(numberSessions.created_at));
  });
}

export async function listOwnedNumberHistory(userId: string, limit = 200): Promise<NumberSessionRecord[]> {
  return withDatabaseErrors(async () => {
    await expireStaleNumberLeases();
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
    return getDb().select().from(numberSessions).where(eq(numberSessions.clerk_user_id, userId))
      .orderBy(desc(numberSessions.created_at)).limit(safeLimit);
  });
}

export async function getOwnedActiveNumber(userId: string, sessionId: string): Promise<NumberSessionRecord> {
  return withDatabaseErrors(async () => {
    await expireStaleNumberLeases();
    const [row] = await getDb().select(getTableColumns(numberSessions)).from(numberSessions)
      .innerJoin(activeNumberLeases, eq(activeNumberLeases.session_id, numberSessions.id))
      .where(and(
        eq(numberSessions.id, sessionId.toLowerCase()),
        eq(activeNumberLeases.clerk_user_id, userId),
        gt(activeNumberLeases.expires_at, databaseNowMs),
      )).limit(1);
    if (!row) throw new AppError(404, "resource_not_found", "The requested active number was not found.");
    return row;
  });
}

export async function createNumberOwnership(userId: string, allocation: ProviderNumberAllocation): Promise<NumberSessionRecord> {
  const numberKey = normalizePhone(allocation.number);
  if (!numberKey || numberKey.length < 5) throw new AppError(502, "provider_contract_error", "The provider returned an invalid phone number.");
  const assignedAt = allocation.assigned_at;
  const assignedAtMs = assignedAt.getTime();
  if (!Number.isFinite(assignedAtMs) || Math.abs(Date.now() - assignedAtMs) > 120_000) {
    throw new AppError(502, "provider_contract_error", "The provider returned an invalid or stale assignment timestamp.");
  }
  const expiresAt = new Date(assignedAtMs + 20 * 60 * 1000);
  return withDatabaseErrors(async () => {
    try {
      return await getDb().transaction(async (tx) => {
        await expireNumberLeases(tx);
        const [session] = await tx.insert(numberSessions).values({
          clerk_user_id: userId,
          number: allocation.number,
          number_key: numberKey,
          service: allocation.service ?? "Unknown",
          country: allocation.country ?? null,
          flag: allocation.flag ?? null,
          network: allocation.network ?? null,
          assigned_at: assignedAt,
          expires_at: expiresAt,
        }).returning();
        await tx.insert(activeNumberLeases).values({
          number_key: numberKey, session_id: session.id, clerk_user_id: userId, expires_at: expiresAt,
        });
        return session;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, "provider_number_already_leased", "NumberPanel returned a number already assigned in YoriOTP. It was not shown to this account; contact the owner if the issue persists.");
      }
      throw error;
    }
  });
}

export async function finishNumberOwnership(
  userId: string,
  sessionId: string,
  reason: "released" | "expired",
  endedAt = new Date(),
): Promise<void> {
  await withDatabaseErrors(() => getDb().transaction(async (tx) => {
    // The lease table has session_id, not id. Check ownership in the same write
    // transaction as the release so the check cannot race another release.
    const leaseFilter = and(eq(activeNumberLeases.session_id, sessionId.toLowerCase()), eq(activeNumberLeases.clerk_user_id, userId));
    const [row] = await tx.select({ session_id: activeNumberLeases.session_id }).from(activeNumberLeases).where(leaseFilter).limit(1);
    if (!row) throw new AppError(404, "resource_not_found", "The requested active number was not found.");
    await tx.update(numberSessions).set({ released_at: endedAt, end_reason: reason })
      .where(and(eq(numberSessions.id, sessionId.toLowerCase()), eq(numberSessions.clerk_user_id, userId)));
    await tx.delete(activeNumberLeases).where(leaseFilter);
  }));
}

export async function capNumberHistoryAt(userId: string, sessionId: string, endedAt: Date): Promise<void> {
  if (!Number.isFinite(endedAt.getTime())) throw new AppError(500, "invalid_lease_end", "The provider assignment timestamp is invalid.");
  const endedAtMs = endedAt.getTime();
  await withDatabaseErrors(() => getDb().transaction(async (tx) => {
    await tx.update(numberSessions).set({
      released_at: sql`case when ${numberSessions.released_at} is null or ${numberSessions.released_at} > ${endedAtMs}
        then ${endedAtMs} else ${numberSessions.released_at} end`,
      end_reason: sql`case when ${numberSessions.released_at} is null or ${numberSessions.released_at} > ${endedAtMs}
        then 'expired' else ${numberSessions.end_reason} end`,
    }).where(and(eq(numberSessions.id, sessionId.toLowerCase()), eq(numberSessions.clerk_user_id, userId)));
    await tx.delete(activeNumberLeases)
      .where(and(eq(activeNumberLeases.session_id, sessionId.toLowerCase()), eq(activeNumberLeases.clerk_user_id, userId)));
  }));
}

export async function listOwnedMailboxes(userId: string): Promise<MailboxRecord[]> {
  return withDatabaseErrors(() => getDb().select().from(mailboxes).where(eq(mailboxes.clerk_user_id, userId)).orderBy(desc(mailboxes.created_at)));
}

export async function createMailboxOwnership(userId: string, email: string, domain: string): Promise<MailboxRecord> {
  const emailKey = email.trim().toLowerCase();
  if (!/^.{1,128}@[^\s@]{1,255}$/.test(emailKey)) {
    throw new AppError(502, "provider_contract_error", "The provider returned an invalid email address.");
  }
  return withDatabaseErrors(async () => {
    try {
      return await getDb().transaction(async (tx) => {
        const [mailbox] = await tx.insert(mailboxes).values({
          clerk_user_id: userId, email: email.trim(), email_key: emailKey,
          domain: domain || emailKey.split("@").at(-1) || null,
        }).returning();
        await tx.insert(mailboxOwnership).values({
          email_key: emailKey, provider_email: email.trim(), mailbox_id: mailbox.id, clerk_user_id: userId,
        });
        return mailbox;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, "provider_mailbox_already_owned", "The provider returned an address already registered in YoriOTP. It was not shown to this account.");
      }
      throw error;
    }
  });
}

export async function getOwnedMailbox(userId: string, mailboxId: string): Promise<MailboxRecord> {
  return withDatabaseErrors(async () => {
    const [row] = await getDb().select().from(mailboxes)
      .where(and(eq(mailboxes.id, mailboxId.toLowerCase()), eq(mailboxes.clerk_user_id, userId))).limit(1);
    if (!row) throw new AppError(404, "resource_not_found", "The requested mailbox was not found.");
    return row;
  });
}

export function toMailboxSummary(record: MailboxRecord, providerEmails: Set<string>): MailboxSummary {
  return {
    id: record.id,
    email: record.email,
    domain: record.domain ?? record.email.split("@").at(-1) ?? "",
    createdAt: record.created_at.toISOString(),
    listedUpstream: providerEmails.has(record.email_key),
  };
}

export async function getOwnerOverview(): Promise<{
  users: number;
  activeNumbers: number;
  totalNumbers: number;
  mailboxes: number;
}> {
  return withDatabaseErrors(async () => {
    const db = getDb();
    await expireStaleNumberLeases();
    const [row] = await db.all<{ users: number; active_numbers: number; total_numbers: number; mailboxes: number }>(sql`
      SELECT
        (SELECT COUNT(DISTINCT clerk_user_id) FROM (
          SELECT clerk_user_id FROM number_sessions
          UNION
          SELECT clerk_user_id FROM mailboxes
        ) AS known_users) AS users,
        (SELECT COUNT(*) FROM active_number_leases WHERE expires_at > ${databaseNowMs}) AS active_numbers,
        (SELECT COUNT(*) FROM number_sessions) AS total_numbers,
        (SELECT COUNT(*) FROM mailboxes) AS mailboxes
    `);
    return {
      users: Number(row.users),
      activeNumbers: Number(row.active_numbers),
      totalNumbers: Number(row.total_numbers),
      mailboxes: Number(row.mailboxes),
    };
  });
}
