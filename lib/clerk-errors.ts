/**
 * Helpers for reading the error shapes Clerk returns to the browser.
 *
 * Clerk throws `ClerkAPIResponseError` for failed Frontend API calls. That
 * object describes the HTTP envelope (`code: "api_response_error"`); the
 * actionable details live in its nested `errors` array — for example
 * `session_exists` when a single-session instance already holds a session,
 * which makes a second Google sign-in fail with "You're already signed in."
 * before Google is ever opened.
 *
 * Reading the nested entries lets the UI explain the real cause and recover
 * from the already-signed-in case instead of showing a dead-end message.
 * This module stays free of React and server-only imports so it can be unit
 * tested directly.
 */

export type ClerkErrorEntry = {
  code?: string;
  message?: string;
  longMessage?: string;
};

/**
 * Codes Clerk returns when the browser already has an active session and the
 * instance only allows one session at a time. There is nothing to sign in to,
 * so the flow can only continue with the existing session or after sign-out.
 */
const ALREADY_SIGNED_IN_CODES = new Set(["session_exists", "identifier_already_signed_in"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

function toEntry(value: unknown): ClerkErrorEntry | null {
  if (!isRecord(value)) return null;
  const entry: ClerkErrorEntry = {
    code: readString(value.code),
    message: readString(value.message),
    longMessage: readString(value.longMessage),
  };
  return entry.code || entry.message || entry.longMessage ? entry : null;
}

/**
 * Every Clerk API error carried by `error`, in the order Clerk returned them.
 * Nested `errors` win over the envelope; a plain error object is its own entry.
 */
export function clerkErrorEntries(error: unknown): ClerkErrorEntry[] {
  if (!isRecord(error)) return [];
  const nested = Array.isArray(error.errors)
    ? error.errors.map(toEntry).filter((entry): entry is ClerkErrorEntry => entry !== null)
    : [];
  if (nested.length > 0) return nested;
  const envelope = toEntry(error);
  return envelope ? [envelope] : [];
}

/** True when Clerk refused the attempt because this client already has a session. */
export function isAlreadySignedInClerkError(error: unknown): boolean {
  return clerkErrorEntries(error).some(({ code }) => code !== undefined && ALREADY_SIGNED_IN_CODES.has(code));
}

/**
 * Human-readable description of a Clerk failure. Prefers the nested long
 * message/code pair, keeps the existing `message — Clerk error: code` format,
 * and never throws on unexpected shapes.
 */
export function describeClerkError(error: unknown): string {
  const entries = clerkErrorEntries(error);
  const codes = [...new Set(entries.map((entry) => entry.code).filter((code): code is string => code !== undefined))];
  const detail =
    entries.map((entry) => entry.longMessage ?? entry.message).find((text): text is string => text !== undefined) ??
    (error instanceof Error ? readString(error.message) : undefined) ??
    readString(isRecord(error) ? error.message : undefined);

  if (detail) return codes.length > 0 ? `${detail} — Clerk error: ${codes.join(", ")}` : detail;
  if (codes.length > 0) return `Clerk error: ${codes.join(", ")}`;
  return "Clerk returned an unexpected error. Check the browser console for details.";
}
