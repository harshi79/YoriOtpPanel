"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { signOut } = useClerk();
  return <button type="button" onClick={() => void signOut({ redirectUrl: "/" })} className="btn-secondary min-h-9 px-3 py-2 text-xs"><LogOut size={14} /> Sign out</button>;
}
