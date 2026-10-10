import "server-only";
import { AppError } from "@/lib/errors";

export class ProviderError extends AppError {
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(status, code, message, retryAfter);
    this.name = "ProviderError";
  }
}

type ProviderRequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  authenticated?: boolean;
};

function providerBaseUrl(): URL {
  const value = process.env.NUMBERPANEL_API_BASE_URL || "https://numberpanel.tech";
  let base: URL;
  try {
    base = new URL(value);
  } catch {
    throw new AppError(500, "provider_base_url_invalid", "The NumberPanel API base URL is invalid.");
  }
  if (
    base.protocol !== "https:" ||
    base.hostname !== "numberpanel.tech" ||
    (base.port !== "" && base.port !== "443") ||
    base.username !== "" ||
    base.password !== ""
  ) {
    throw new AppError(500, "provider_base_url_invalid", "Only the default HTTPS NumberPanel API host is allowed.");
  }
  return base;
}

export async function providerRequest<T = unknown>(path: string, options: ProviderRequestOptions = {}): Promise<T> {
  const base = providerBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/")) {
    throw new AppError(500, "provider_route_invalid", "The requested provider route is not allowed.");
  }
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.authenticated) {
    const key = process.env.NUMBERPANEL_API_KEY;
    if (!key) throw new AppError(503, "provider_not_configured", "NumberPanel API access is not configured on this server.");
    headers.set("Authorization", `Bearer ${key}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new ProviderError(502, timedOut ? "provider_timeout" : "provider_unreachable", timedOut
      ? "NumberPanel did not respond in time. Please retry shortly."
      : "NumberPanel could not be reached. Please retry shortly.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError(502, "provider_invalid_response", "NumberPanel returned a non-JSON response.");
  }

  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const providerError = typeof data?.error === "string" ? data.error : undefined;
  if (!response.ok || data?.success === false) {
    const status = response.status >= 400
      ? response.status
      : providerError?.toLowerCase().includes("unauthorized")
        ? 401
        : 502;
    const safeStatus = [400, 401, 403, 404, 409, 429, 500, 503].includes(status) ? status : 502;
    const code = safeStatus === 401 ? "provider_unauthorized"
      : safeStatus === 429 ? "provider_rate_limited"
      : safeStatus === 503 ? "provider_maintenance"
      : safeStatus === 400 ? "provider_bad_request"
      : "provider_request_failed";
    const generic = safeStatus === 401 ? "NumberPanel rejected the configured API key."
      : safeStatus === 429 ? "NumberPanel rate-limited this request. Please wait and retry."
      : safeStatus === 503 ? "NumberPanel is under maintenance. Please retry later."
      : safeStatus === 400 ? "NumberPanel rejected the request parameters."
      : "NumberPanel could not complete the request.";
    // Do not forward arbitrary upstream text; it may contain sensitive data.
    throw new ProviderError(safeStatus, code, generic, safeStatus === 429 ? 5 : undefined);
  }
  return payload as T;
}
