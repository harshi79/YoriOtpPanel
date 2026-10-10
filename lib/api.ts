import { AppError } from "@/lib/errors";

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) throw new AppError(413, "request_too_large", "The request body is too large.");
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "invalid_json", "A valid JSON request body is required.");
  }
}

export function parseObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, "invalid_body", "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function assertUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(404, "resource_not_found", "The requested resource was not found.");
  }
  return value;
}
