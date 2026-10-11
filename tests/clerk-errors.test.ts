import { describe, expect, it } from "vitest";
import { clerkErrorEntries, describeClerkError, isAlreadySignedInClerkError } from "@/lib/clerk-errors";

// Shapes below mirror the Clerk Frontend API error envelope: a
// `ClerkAPIResponseError` carries `code: "api_response_error"` while the
// actionable error sits in its nested `errors` array.

describe("Clerk error parsing", () => {
  it("reads the nested error behind the api_response_error envelope", () => {
    const error = {
      code: "api_response_error",
      message: "Session already exists",
      longMessage: "You're already signed in.",
      errors: [{ code: "session_exists", message: "Session already exists", longMessage: "You're already signed in." }],
    };

    expect(clerkErrorEntries(error)).toEqual([
      { code: "session_exists", message: "Session already exists", longMessage: "You're already signed in." },
    ]);
    expect(describeClerkError(error)).toBe("You're already signed in. — Clerk error: session_exists");
  });

  it("treats both single-session codes as an existing session", () => {
    expect(isAlreadySignedInClerkError({ errors: [{ code: "session_exists" }] })).toBe(true);
    expect(isAlreadySignedInClerkError({ errors: [{ code: "identifier_already_signed_in" }] })).toBe(true);
    expect(isAlreadySignedInClerkError({ code: "identifier_already_signed_in" })).toBe(true);
  });

  it("does not blame the session for unrelated OAuth failures", () => {
    const denied = { code: "api_response_error", errors: [{ code: "oauth_access_denied", message: "Access denied" }] };

    expect(isAlreadySignedInClerkError(denied)).toBe(false);
    expect(describeClerkError(denied)).toBe("Access denied — Clerk error: oauth_access_denied");
  });

  it("keeps every code when Clerk reports more than one error", () => {
    const error = {
      code: "api_response_error",
      errors: [
        { code: "session_exists", longMessage: "You're already signed in." },
        { code: "identifier_already_signed_in", message: "Already signed in" },
      ],
    };

    expect(describeClerkError(error)).toBe("You're already signed in. — Clerk error: session_exists, identifier_already_signed_in");
  });

  it("reports the envelope code when there is no nested error", () => {
    expect(describeClerkError({ code: "api_response_error", message: "Request failed" })).toBe("Request failed — Clerk error: api_response_error");
  });

  it("falls back to plain Error messages and a generic description", () => {
    expect(describeClerkError(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(describeClerkError(undefined)).toBe("Clerk returned an unexpected error. Check the browser console for details.");
  });

  it("never throws on unexpected shapes", () => {
    for (const value of [undefined, null, 42, "boom", {}, { errors: null }, { errors: [null, 7, {}] }, new Error("")]) {
      expect(clerkErrorEntries(value)).toEqual([]);
      expect(isAlreadySignedInClerkError(value)).toBe(false);
      expect(typeof describeClerkError(value)).toBe("string");
    }
  });
});
