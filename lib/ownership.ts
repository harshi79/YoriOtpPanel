import "server-only";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { normalizePhone } from "@/lib/provider/normalize";
import type { MailboxSummary, ProviderNumberAllocation } from "@/lib/provider/types";

export interface NumberSessionRecord {
  id: string;
  clerk_user_id: string;
  number: string;
  number_key: string;
  service: string;
  country: string | null;
  flag: string | null;
  network: string | null;
  assigned_at: Date;
  expires_at: Date;
  released_at: Date | null;
  end_reason: string | null;
  created_at: Date;
}

export interface MailboxRecord {
  id: string;
  clerk_user_id: string;
  email: string;
  email_key: string;
  domain: string | null;
  created_at: Date;
}

export async function expireStaleNumberLeases(): Promise<void> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE number_sessions
      SET released_at = COALESCE(released_at, expires_at), end_reason = 'expired'
      WHERE released_at IS NULL AND expires_at <= now()
    `;
    await tx`DELETE FROM active_number_leases WHERE expires_at <= now()`;
  });
}

export async function listOwnedActiveNumbers(userId: string): Promise<NumberSessionRecord[]> {
  await expireStaleNumberLeases();
  const sql = getDb();
  return sql<NumberSessionRecord[]>`
    SELECT s.*
    FROM number_sessions AS s
    INNER JOIN active_number_leases AS l ON l.session_id = s.id
    WHERE l.clerk_user_id = ${userId} AND l.expires_at > now()
    ORDER BY s.created_at DESC
  `;
}

export async function listOwnedNumberHistory(userId: string, limit = 200): Promise<NumberSessionRecord[]> {
  await expireStaleNumberLeases();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  const sql = getDb();
  return sql<NumberSessionRecord[]>`
    SELECT * FROM number_sessions
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
}

export async function getOwnedActiveNumber(userId: string, sessionId: string): Promise<NumberSessionRecord> {
  await expireStaleNumberLeases();
  const sql = getDb();
  const [row] = await sql<NumberSessionRecord[]>`
    SELECT s.*
    FROM number_sessions AS s
    INNER JOIN active_number_leases AS l ON l.session_id = s.id
    WHERE s.id = ${sessionId}::uuid
      AND l.clerk_user_id = ${userId}
      AND l.expires_at > now()
    LIMIT 1
  `;
  if (!row) throw new AppError(404, "resource_not_found", "The requested active number was not found.");
  return row;
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
  const sql = getDb();
  try {
    return await sql.begin(async (tx) => {
      await tx`
        UPDATE number_sessions
        SET released_at = COALESCE(released_at, expires_at), end_reason = 'expired'
        WHERE released_at IS NULL AND expires_at <= now()
      `;
      await tx`DELETE FROM active_number_leases WHERE expires_at <= now()`;
      const [session] = await tx<NumberSessionRecord[]>`
        INSERT INTO number_sessions
          (clerk_user_id, number, number_key, service, country, flag, network, assigned_at, expires_at)
        VALUES
          (${userId}, ${allocation.number}, ${numberKey}, ${allocation.service ?? "Unknown"},
           ${allocation.country ?? null}, ${allocation.flag ?? null}, ${allocation.network ?? null},
           ${assignedAt}, ${expiresAt})
        RETURNING *
      `;
      await tx`
        INSERT INTO active_number_leases (number_key, session_id, clerk_user_id, expires_at)
        VALUES (${numberKey}, ${session.id}::uuid, ${userId}, ${expiresAt})
      `;
      return session;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new AppError(409, "provider_number_already_leased", "NumberPanel returned a number already assigned in YoriOTP. It was not shown to this account; contact the owner if the issue persists.");
    }
    throw error;
  }
}

export async function finishNumberOwnership(
  userId: string,
  sessionId: string,
  reason: "released" | "expired",
  endedAt = new Date(),
): Promise<void> {
  const sql = getDb();
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM active_number_leases
    WHERE session_id = ${sessionId}::uuid AND clerk_user_id = ${userId}
    LIMIT 1
  `;
  if (!row) throw new AppError(404, "resource_not_found", "The requested active number was not found.");
  await sql.begin(async (tx) => {
    await tx`
      UPDATE number_sessions
      SET released_at = ${endedAt}, end_reason = ${reason}
      WHERE id = ${sessionId}::uuid AND clerk_user_id = ${userId}
    `;
    await tx`DELETE FROM active_number_leases WHERE session_id = ${sessionId}::uuid AND clerk_user_id = ${userId}`;
  });
}

export async function capNumberHistoryAt(userId: string, sessionId: string, endedAt: Date): Promise<void> {
  if (!Number.isFinite(endedAt.getTime())) throw new AppError(500, "invalid_lease_end", "The provider assignment timestamp is invalid.");
  const sql = getDb();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE number_sessions
      SET released_at = CASE
            WHEN released_at IS NULL OR released_at > ${endedAt} THEN ${endedAt}
            ELSE released_at
          END,
          end_reason = CASE
            WHEN released_at IS NULL OR released_at > ${endedAt} THEN 'expired'
            ELSE end_reason
          END
      WHERE id = ${sessionId}::uuid AND clerk_user_id = ${userId}
    `;
    await tx`DELETE FROM active_number_leases WHERE session_id = ${sessionId}::uuid AND clerk_user_id = ${userId}`;
  });
}

export async function listOwnedMailboxes(userId: string): Promise<MailboxRecord[]> {
  const sql = getDb();
  return sql<MailboxRecord[]>`
    SELECT * FROM mailboxes
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function createMailboxOwnership(userId: string, email: string, domain: string): Promise<MailboxRecord> {
  const emailKey = email.trim().toLowerCase();
  if (!/^.{1,128}@[^\s@]{1,255}$/.test(emailKey)) {
    throw new AppError(502, "provider_contract_error", "The provider returned an invalid email address.");
  }
  const sql = getDb();
  try {
    return await sql.begin(async (tx) => {
      const [mailbox] = await tx<MailboxRecord[]>`
        INSERT INTO mailboxes (clerk_user_id, email, email_key, domain)
        VALUES (${userId}, ${email.trim()}, ${emailKey}, ${domain || emailKey.split("@").at(-1) || null})
        RETURNING *
      `;
      await tx`
        INSERT INTO mailbox_ownership (email_key, provider_email, mailbox_id, clerk_user_id)
        VALUES (${emailKey}, ${email.trim()}, ${mailbox.id}::uuid, ${userId})
      `;
      return mailbox;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new AppError(409, "provider_mailbox_already_owned", "The provider returned an address already registered in YoriOTP. It was not shown to this account.");
    }
    throw error;
  }
}

export async function getOwnedMailbox(userId: string, mailboxId: string): Promise<MailboxRecord> {
  const sql = getDb();
  const [row] = await sql<MailboxRecord[]>`
    SELECT * FROM mailboxes WHERE id = ${mailboxId}::uuid AND clerk_user_id = ${userId} LIMIT 1
  `;
  if (!row) throw new AppError(404, "resource_not_found", "The requested mailbox was not found.");
  return row;
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
  const sql = getDb();
  await expireStaleNumberLeases();
  const [row] = await sql<{ users: number; active_numbers: number; total_numbers: number; mailboxes: number }[]>`
    SELECT
      (SELECT COUNT(DISTINCT clerk_user_id) FROM (
        SELECT clerk_user_id FROM number_sessions
        UNION
        SELECT clerk_user_id FROM mailboxes
      ) AS known_users) AS users,
      (SELECT COUNT(*) FROM active_number_leases WHERE expires_at > now()) AS active_numbers,
      (SELECT COUNT(*) FROM number_sessions) AS total_numbers,
      (SELECT COUNT(*) FROM mailboxes) AS mailboxes
  `;
  return {
    users: Number(row.users),
    activeNumbers: Number(row.active_numbers),
    totalNumbers: Number(row.total_numbers),
    mailboxes: Number(row.mailboxes),
  };
}
