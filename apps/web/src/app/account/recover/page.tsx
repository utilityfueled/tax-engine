import type { Metadata } from "next";
import Link from "next/link";
import { HostedAccountRecovery } from "@/components/hosted-account-recovery";
import { resolveDeploymentMode } from "@/lib/deployment-mode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account recovery — Viva La Tax", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AccountRecoveryPage() {
  if (resolveDeploymentMode() !== "hosted") return <section className="hero account-hero">
    <h1>No account required.</h1><p>This local deployment does not use hosted account recovery. Restore browser-only tax facts from your encrypted return backup.</p>
    <Link href="/" className="utility-button workspace-link">Back to returns</Link>
  </section>;
  return <div className="workspace-grid account-page-grid"><HostedAccountRecovery /></div>;
}
