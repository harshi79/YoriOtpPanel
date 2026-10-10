import type { Metadata } from "next";
import { NumbersPanel } from "@/components/dashboard/numbers-panel";

export const metadata: Metadata = { title: "Number sessions" };
export default function NumbersPage() { return <NumbersPanel />; }
