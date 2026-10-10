import type { Metadata } from "next";
import { SettingsPanel } from "@/components/dashboard/settings-panel";

export const metadata: Metadata = { title: "Settings" };
export default function SettingsPage() { return <SettingsPanel />; }
