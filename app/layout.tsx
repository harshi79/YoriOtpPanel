import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "YoriOTP Panel", template: "%s · YoriOTP Panel" },
  description: "A secure workspace for authorized SMS verification testing and temporary inbox workflows.",
  applicationName: "YoriOTP Panel",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07100d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const configured = isClerkConfigured();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en">
      <body>
        {configured && publishableKey
          ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
          : children}
      </body>
    </html>
  );
}
