import Link from "next/link";
import { ScanLine } from "lucide-react";

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="YoriOTP Panel home">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-200/20 bg-emerald-300/10 text-emerald-200 shadow-[0_0_28px_rgba(90,226,165,.12)]">
        <ScanLine size={18} strokeWidth={2.2} />
      </span>
      {!compact && <span className="text-[0.98rem] font-bold tracking-[-0.04em] text-[#edf7f1]">Yori<span className="text-[#8bf0c2]">OTP</span></span>}
    </Link>
  );
}
