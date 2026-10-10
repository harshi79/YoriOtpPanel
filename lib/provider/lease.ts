import "server-only";
import { AppError } from "@/lib/errors";
import { normalizeActiveNumbers, normalizePhone, isSameProviderLease } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";
import type { NumberSessionRecord } from "@/lib/ownership";

export type ProviderLeaseCheck =
  | { status: "current" }
  | { status: "missing" }
  | { status: "changed"; assignedAt: Date };

export async function verifyCurrentProviderLease(session: NumberSessionRecord): Promise<ProviderLeaseCheck> {
  const payload = await providerRequest("/api/my_numbers", { authenticated: true });
  const numbers = normalizeActiveNumbers(payload);
  const current = numbers.find((item) => normalizePhone(item.number) === session.number_key);
  if (!current) return { status: "missing" };
  if (!current.assigned_at) {
    throw new AppError(502, "provider_lease_timestamp_missing", "NumberPanel did not return an assignment timestamp, so this session cannot be safely accessed.");
  }
  const assignedAt = new Date(current.assigned_at);
  if (!Number.isFinite(assignedAt.getTime())) {
    throw new AppError(502, "provider_lease_timestamp_invalid", "NumberPanel returned an invalid assignment timestamp, so this session cannot be safely accessed.");
  }
  return isSameProviderLease(current.assigned_at, session.assigned_at)
    ? { status: "current" }
    : { status: "changed", assignedAt };
}
