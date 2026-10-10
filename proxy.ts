import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/admin") ||
  pathname.startsWith("/api/provider") ||
  pathname.startsWith("/api/admin");

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtected(request.nextUrl.pathname)) await auth.protect();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  if (!configured) {
    if (!isProtected(request.nextUrl.pathname)) return NextResponse.next();
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, code: "auth_not_configured", error: "Google sign-in is not configured for this deployment." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("setup", "required");
    return NextResponse.redirect(signIn);
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
