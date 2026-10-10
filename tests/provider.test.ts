import { describe, expect, it } from "vitest";
import {
  countryDisplayName,
  isSameProviderLease,
  isWithinLeaseWindow,
  normalizeActiveNumbers,
  normalizeAllocation,
  normalizeCountries,
  normalizeMailDomains,
  normalizePhone,
  normalizeServices,
  normalizeOtpHistory,
} from "@/lib/provider/normalize";

// Service, country, and OTP contract samples below are copied from the linked NumberPanel developer reference.
// They are unit-test inputs only; the application never serves them as live inventory.

describe("NumberPanel contract normalization", () => {
  it("normalizes service inventory without inventing entries", () => {
    expect(normalizeServices({
      success: true,
      services: [{ name: "Telegram", key: "telegram", count: 42 }],
      generated_at: 1723100000,
    })).toEqual([{ name: "Telegram", key: "telegram", count: 42 }]);
    expect(normalizeServices({ success: true, services: [] })).toEqual([]);
  });

  it("accepts documented country names and currently observed region-code names", () => {
    const documented = normalizeCountries({ success: true, countries: [{ name: "United States", flag: "🇺🇸", count: 15 }] });
    expect(documented[0]?.requestValue).toBe("United States");
    const observed = normalizeCountries({ success: true, countries: [{ name: "NG", flag: "🇳🇬", count: 90 }] });
    expect(observed[0]?.displayName).toBe(countryDisplayName("NG"));
    expect(observed[0]?.requestValue).toBe(countryDisplayName("NG"));
  });

  it("parses the documented allocation timestamp in seconds", () => {
    const allocation = normalizeAllocation({
      success: true,
      number: "+1 (800) 555-0192",
      country: "United States",
      flag: "🇺🇸",
      service: "Telegram",
      network: "Pool",
      assigned_to: "user_abc123",
      assigned_time: 1723100000,
    });
    expect(allocation.number).toBe("+1 (800) 555-0192");
    expect(allocation.assigned_at.toISOString()).toBe("2024-08-08T06:53:20.000Z");
  });

  it("normalizes assignment timestamps from the active-number list", () => {
    expect(normalizeActiveNumbers({ success: true, numbers: [{ number: "+1 (800) 555-0192", assigned_time: 1723100000 }] })[0]?.assigned_at)
      .toBe("2024-08-08T06:53:20.000Z");
  });

  it("fails closed for an allocation without a provider assignment timestamp", () => {
    expect(() => normalizeAllocation({ success: true, number: "+1 (800) 555-0192" })).toThrow(/assignment timestamp/i);
  });

  it("normalizes the documented OTP history field names", () => {
    const result = normalizeOtpHistory({ success: true, otps: [{
      service: "Telegram",
      number: "+1 (800) 555-0192",
      otp_code: "482910",
      full_message: "Your Telegram code is 482910. Don't share it.",
      timestamp: "2026-08-08T05:30:00Z",
      country: "United States",
    }] });
    expect(result[0]?.otp_code).toBe("482910");
    expect(result[0]?.number).toBe("+1 (800) 555-0192");
  });

  it("normalizes phone formats for ownership matching", () => {
    expect(normalizePhone("+1 (800) 555-0192")).toBe("+18005550192");
    expect(normalizePhone("+18005550192")).toBe("+18005550192");
  });

  it("accepts OTP data only when its timestamp belongs to the current lease", () => {
    const assigned = new Date("2026-10-10T10:00:00Z");
    const expires = new Date("2026-10-10T10:20:00Z");
    expect(isWithinLeaseWindow("2026-10-10T10:05:00Z", assigned, expires)).toBe(true);
    expect(isWithinLeaseWindow("2026-10-10T09:59:59Z", assigned, expires)).toBe(false);
    expect(isWithinLeaseWindow(undefined, assigned, expires)).toBe(false);
    expect(isSameProviderLease("2026-10-10T10:00:04Z", assigned)).toBe(true);
    expect(isSameProviderLease("2026-10-10T10:00:06Z", assigned)).toBe(false);
    expect(isSameProviderLease(undefined, assigned)).toBe(false);
  });

  it("fails closed rather than guessing an undocumented mail response shape", () => {
    expect(() => normalizeMailDomains({ success: true, message: "No documented domains field" })).toThrow(/unrecognized mail-domain response/i);
  });
});
