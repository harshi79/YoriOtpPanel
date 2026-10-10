export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function clientApi<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ClientApiError(0, "network_error", "The panel could not reach its server. Check your connection and retry.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ClientApiError(response.status, "invalid_response", "The panel returned an unexpected response.");
  }
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (!response.ok || data.success === false) {
    throw new ClientApiError(
      response.status,
      typeof data.code === "string" ? data.code : "request_failed",
      typeof data.error === "string" ? data.error : "The request could not be completed.",
      Number(response.headers.get("retry-after")) || undefined,
    );
  }
  return payload as T;
}

export function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function timeRemaining(value: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
