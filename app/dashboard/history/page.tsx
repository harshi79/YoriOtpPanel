import type { Metadata } from "next";
import { HistoryPanel } from "@/components/dashboard/history-panel";

export const metadata: Metadata = { title: "OTP history" };
export default function HistoryPage() { return <HistoryPanel />; }
