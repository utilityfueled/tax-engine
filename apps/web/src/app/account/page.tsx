import type { Metadata } from "next";
import Link from "next/link";
import { RetroShell } from "@/components/retro-shell";
import { HostedAuthPanel } from "@/components/hosted-auth-panel";
import { resolveDeploymentMode } from "@/lib/deployment-mode";

export const metadata: Metadata = {
  title: "Account — Viva La Tax"
};

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = params.mode === "sign-up" ? "sign-up" : "sign-in";
  const deploymentMode = resolveDeploymentMode();

  if (deploymentMode !== "hosted") {
    return (
      <div className="workspace-grid account-page-grid">
        <section className="hero account-hero">
          <p className="hero-kicker">LOCAL MODE</p>
          <h1>No account required.</h1>
          <p className="hero-copy">
            This local deployment stores your workspace in this browser by
            default. You can start building a draft return immediately without
            signing in or creating a hosted account.
          </p>
          <div className="hero-actions">
            <Link className="launch-button workspace-link" href="/returns/new">
              Start Local Return
            </Link>
            <Link className="utility-button workspace-link" href="/">
              Back To Home
            </Link>
          </div>
        </section>

        <RetroShell title="Local Data Boundary" eyebrow="PRIVACY" panelId="local-privacy-shell">
          <ul className="stack-list section-heading">
            <li>Your answers, uploads, and completed returns stay in your browser on this device.</li>
            <li>No hosted account, billing profile, or synced cloud workspace is required in local mode.</li>
            <li>Optional AI features may send selected data to providers you configure.</li>
            <li>Clear browser storage if you want to remove local return data.</li>
          </ul>
        </RetroShell>
      </div>
    );
  }

  return (
    <div className="workspace-grid account-page-grid">
      <HostedAuthPanel initialMode={mode} />
      <RetroShell title="Hosted Data Boundary" eyebrow="PRIVACY" panelId="privacy-shell">
        <ul className="stack-list section-heading">
          <li>The database stores account identity, subscription state, reminder settings, and workspace shells.</li>
          <li>Raw tax forms, OCR text, extracted source JSON, SSNs, and bank details are not saved in durable hosted storage.</li>
          <li>Self-host mode remains free and keeps durable return storage local to your device by default.</li>
        </ul>
      </RetroShell>
    </div>
  );
}
