import type { Metadata } from "next";
import { MailPanel } from "@/components/dashboard/mail-panel";

export const metadata: Metadata = { title: "Temporary mail" };
export default function MailPage() { return <MailPanel />; }
