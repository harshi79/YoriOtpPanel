import { z } from "zod";
import type {
  MailDomain,
  MailMessage,
  ProviderActiveNumber,
  ProviderCountry,
  ProviderNumberAllocation,
  ProviderOtp,
  ProviderOtpResponse,
  ProviderService,
} from "@/lib/provider/types";
import { AppError } from "@/lib/errors";

const serviceSchema = z.object({
  name: z.string(),
  key: z.string(),
  count: z.coerce.number().nonnegative().default(0),
}).passthrough();

const countrySchema = z.object({
  name: z.string(),
  flag: z.string().default("🌐"),
  count: z.coerce.number().nonnegative().default(0),
}).passthrough();

const allocationSchema = z.object({
  success: z.boolean().optional(),
  number: z.string().min(3),
  country: z.string().optional(),
  flag: z.string().optional(),
  service: z.string().optional(),
  network: z.string().optional(),
  assigned_time: z.union([z.number(), z.string()]).optional(),
  assigned_at: z.union([z.number(), z.string()]).optional(),
}).passthrough();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function responseArray(payload: unknown, candidates: string[]): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const root = record(payload);
  if (!root) return null;
  for (const key of candidates) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  const data = record(root.data);
  if (data) {
    for (const key of candidates) if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return null;
}

function parseEpoch(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return parseEpoch(numeric);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : value.trim().toLowerCase();
}

export function isWithinLeaseWindow(receivedAt: string | undefined, assignedAt: Date, endsAt: Date): boolean {
  if (!receivedAt) return false;
  const received = new Date(receivedAt).getTime();
  return Number.isFinite(received) && received >= assignedAt.getTime() && received <= endsAt.getTime();
}

export const PROVIDER_LEASE_TOLERANCE_MS = 5_000;

export function isSameProviderLease(providerAssignedAt: string | undefined, localAssignedAt: Date): boolean {
  if (!providerAssignedAt) return false;
  const providerTime = new Date(providerAssignedAt).getTime();
  return Number.isFinite(providerTime) && Math.abs(providerTime - localAssignedAt.getTime()) <= PROVIDER_LEASE_TOLERANCE_MS;
}

export function countryDisplayName(value: string): string {
  const cleaned = value.trim();
  if (/^[A-Za-z]{2}$/.test(cleaned)) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(cleaned.toUpperCase()) ?? cleaned;
    } catch {
      return cleaned;
    }
  }
  return cleaned;
}

export function normalizeServices(payload: unknown): ProviderService[] {
  const rows = responseArray(payload, ["services"]);
  if (!rows) throw new AppError(502, "provider_contract_error", "The provider returned an unexpected services response.");
  return rows.map((row) => {
    const parsed = serviceSchema.safeParse(row);
    if (!parsed.success) throw new AppError(502, "provider_contract_error", "The provider returned an invalid service entry.");
    return { name: parsed.data.name, key: parsed.data.key, count: parsed.data.count };
  });
}

export function normalizeCountries(payload: unknown): ProviderCountry[] {
  const rows = responseArray(payload, ["countries"]);
  if (!rows) throw new AppError(502, "provider_contract_error", "The provider returned an unexpected countries response.");
  return rows.map((row) => {
    const parsed = countrySchema.safeParse(row);
    if (!parsed.success) throw new AppError(502, "provider_contract_error", "The provider returned an invalid country entry.");
    return {
      ...parsed.data,
      displayName: countryDisplayName(parsed.data.name),
      // The API currently returns ISO-like codes in `name`; the request docs say to send a country name.
      requestValue: countryDisplayName(parsed.data.name),
    };
  });
}

export function normalizeAllocation(payload: unknown): ProviderNumberAllocation {
  const parsed = allocationSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(502, "provider_contract_error", "The provider returned an unexpected number-allocation response.");
  const raw = payload as Record<string, unknown>;
  const assignedAt = parseEpoch(parsed.data.assigned_time ?? parsed.data.assigned_at);
  if (!assignedAt || Number.isNaN(assignedAt.getTime())) {
    throw new AppError(502, "provider_contract_error", "NumberPanel did not return a valid assignment timestamp. The allocation cannot be safely recorded.");
  }
  return {
    number: parsed.data.number,
    country: parsed.data.country,
    flag: parsed.data.flag,
    service: parsed.data.service,
    network: parsed.data.network,
    assigned_at: assignedAt,
    raw,
  };
}

export function normalizeActiveNumbers(payload: unknown): ProviderActiveNumber[] {
  const rows = responseArray(payload, ["numbers"]);
  if (!rows) throw new AppError(502, "provider_contract_error", "The provider returned an unexpected active-numbers response.");
  return rows.flatMap((item) => {
    const row = record(item);
    if (!row || typeof row.number !== "string") return [];
    return [{
      number: row.number,
      service: typeof row.service === "string" ? row.service : undefined,
      network: typeof row.network === "string" ? row.network : undefined,
      country: typeof row.country === "string" ? row.country : undefined,
      flag: typeof row.country_flag === "string" ? row.country_flag : (typeof row.flag === "string" ? row.flag : undefined),
      status: typeof row.status === "string" ? row.status : undefined,
      assigned_at: (() => {
        const assignedAt = parseEpoch(row.assigned_at ?? row.assigned_time);
        return assignedAt && !Number.isNaN(assignedAt.getTime()) ? assignedAt.toISOString() : undefined;
      })(),
      latest_otp: typeof row.latest_otp === "string" ? row.latest_otp : null,
      latest_otp_message: typeof row.latest_otp_message === "string" ? row.latest_otp_message : null,
      raw: row,
    }];
  });
}

export function normalizeOtpResponse(payload: unknown): ProviderOtpResponse {
  const root = record(payload);
  if (!root || typeof root.has_otp !== "boolean") {
    throw new AppError(502, "provider_contract_error", "The provider returned an unexpected OTP response.");
  }
  return {
    has_otp: root.has_otp,
    otp_code: typeof root.otp_code === "string" ? root.otp_code : undefined,
    message: typeof root.message === "string" ? root.message : undefined,
    received_at: typeof root.received_at === "string" ? root.received_at : undefined,
  };
}

export function normalizeOtpHistory(payload: unknown): ProviderOtp[] {
  const rows = responseArray(payload, ["otps"]);
  if (!rows) throw new AppError(502, "provider_contract_error", "The provider returned an unexpected OTP-history response.");
  return rows.flatMap((item) => {
    const row = record(item);
    if (!row || typeof row.number !== "string") return [];
    return [{
      service: typeof row.service === "string" ? row.service : undefined,
      number: row.number,
      otp_code: typeof row.otp_code === "string" ? row.otp_code : undefined,
      full_message: typeof row.full_message === "string" ? row.full_message : undefined,
      timestamp: typeof row.timestamp === "string" ? row.timestamp : undefined,
      country: typeof row.country === "string" ? row.country : undefined,
      raw: row,
    }];
  });
}

function nestedRecords(payload: unknown, keys: string[]): unknown[] | null {
  const direct = responseArray(payload, keys);
  if (direct) return direct;
  const root = record(payload);
  const inbox = root && record(root.inbox);
  if (inbox) {
    for (const key of keys) if (Array.isArray(inbox[key])) return inbox[key] as unknown[];
  }
  return null;
}

export function normalizeMailDomains(payload: unknown): MailDomain[] {
  const values = nestedRecords(payload, ["domains", "items"]);
  if (!values) throw new AppError(502, "provider_contract_error", "The provider returned an unrecognized mail-domain response. Ask the provider for its response schema.");
  const domains = values.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ domain: item.trim() }];
    const row = record(item);
    const domain = row && (typeof row.domain === "string" ? row.domain : typeof row.name === "string" ? row.name : undefined);
    return domain ? [{ domain }] : [];
  });
  if (values.length && !domains.length) throw new AppError(502, "provider_contract_error", "The provider's mail-domain fields are not recognized.");
  return domains;
}

export function normalizeGeneratedEmail(payload: unknown): { email: string; domain: string } {
  const root = record(payload);
  const data = root && record(root.data);
  const inbox = root && record(root.inbox);
  const value = root?.email ?? root?.address ?? data?.email ?? data?.address ?? inbox?.email ?? inbox?.address;
  if (typeof value !== "string" || !value.includes("@")) {
    throw new AppError(502, "provider_contract_error", "The provider created no recognizable email address. No mailbox was shown or stored.");
  }
  return { email: value, domain: value.split("@").at(-1)?.toLowerCase() ?? "" };
}

export function normalizeMailHistory(payload: unknown): Array<{ email: string; domain: string }> {
  const rows = nestedRecords(payload, ["mails", "emails", "mailboxes", "inboxes", "items"]);
  if (!rows) throw new AppError(502, "provider_contract_error", "The provider returned an unrecognized mail-history response. Ask the provider for its response schema.");
  return rows.flatMap((item) => {
    if (typeof item === "string" && item.includes("@")) return [{ email: item, domain: item.split("@").at(-1) ?? "" }];
    const row = record(item);
    const email = row && (typeof row.email === "string" ? row.email : typeof row.address === "string" ? row.address : undefined);
    if (!email || !email.includes("@")) return [];
    const domain = typeof row?.domain === "string" ? row.domain : email.split("@").at(-1) ?? "";
    return [{ email, domain }];
  });
}

export function normalizeMailMessages(payload: unknown): MailMessage[] {
  const rows = nestedRecords(payload, ["messages", "emails", "items"]);
  if (!rows) throw new AppError(502, "provider_contract_error", "The provider returned an unrecognized message response. Ask the provider for its response schema.");
  return rows.flatMap((item, index) => {
    const row = record(item);
    if (!row) return [];
    const value = (...keys: string[]) => {
      for (const key of keys) if (typeof row[key] === "string") return row[key] as string;
      return undefined;
    };
    return [{
      id: value("id", "message_id") ?? `message-${index}`,
      from: value("from", "sender", "from_email"),
      subject: value("subject", "title"),
      receivedAt: value("received_at", "receivedAt", "timestamp", "date"),
      text: value("text", "text_body", "textBody", "body"),
      html: value("html", "html_body", "htmlBody"),
      raw: row,
    }];
  });
}
