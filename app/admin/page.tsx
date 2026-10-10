import type { Metadata } from "next";
import { AdminPanel } from "@/components/dashboard/admin-panel";

export const metadata: Metadata = { title: "Administration" };
export default function AdminPage() { return <AdminPanel />; }
