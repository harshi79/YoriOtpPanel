import "server-only";
import { auth } from "@clerk/nextjs/server";
import { AppError } from "@/lib/http";

export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function isOwnerId(userId: string | null | undefined, ownerId: string | undefined): boolean {
  return Boolean(userId && ownerId && userId === ownerId);
}

export async function requireUserId(): Promise<string> {
  if (!isClerkConfigured()) {
    throw new AppError(503, "auth_not_configured", "Google sign-in is not configured for this deployment.");
  }
  try {
    const session = await auth();
    if (!session.userId) throw new AppError(401, "unauthorized", "Sign in with Google to continue.");
    return session.userId;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "unauthorized", "Sign in with Google to continue.");
  }
}

export async function requireOwnerId(): Promise<string> {
  const userId = await requireUserId();
  if (!isOwnerId(userId, process.env.OWNER_CLERK_USER_ID)) {
    throw new AppError(403, "owner_only", "This area is available to the application owner only.");
  }
  return userId;
}
