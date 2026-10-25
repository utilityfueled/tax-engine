import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { latestEngineTargetYear } from "@tax-engine/contracts";
import { RecentWorkspacesPanel } from "@/components/recent-workspaces-panel";
import { StartWorkspaceButton } from "@/components/start-workspace-button";
import { buildNewWorkspaceEntryPath } from "@/lib/new-workspace-entry";
import { TAX_ENGINE_REPO_URL } from "@/lib/project-links";
import {
  shouldPreferLocalWorkspaceDraft
} from "@/lib/hosted-runtime-safety";
import { resolveHostedWorkspaceActor } from "@/lib/hosted-auth";
import { resolveDeploymentMode } from "@/lib/deployment-mode";

export const metadata: Metadata = {
  title: "Viva La Tax — Experimental Tax Engine And Draft Return Builder",
  description: "Open-source experimental tax software for drafting U.S. returns and reviewing calculations. Not tax advice, not a filing service, and not guaranteed accurate."
};

const trustSignals = [
  { label: "Auditable engine", detail: "Inspect how each draft result was calculated" },
  { label: "Local-first storage", detail: "Returns stay in your browser by default in local mode" },
  { label: "Experimental output", detail: "Review everything independently before filing or relying on it" },
  { label: "Hosted plans are software tools", detail: `Sync, reminders, and AI helper budgets for tax year ${latestEngineTargetYear}` }
];

async function readRequestHeadersSafely() {
  try {
    return await headers();
  } catch {
    return new Headers();
  }
}

export default async function HomePage() {
  const actor = await resolveHostedWorkspaceActor({
    requestHeaders: await readRequestHeadersSafely()
  });
  const prefersLocalDraft = shouldPreferLocalWorkspaceDraft() && !actor;
  const deploymentMode = prefersLocalDraft ? "self-host" : resolveDeploymentMode();
  const newWorkspaceHref = buildNewWorkspaceEntryPath({
    localDraft: prefersLocalDraft
  });

  return (
    <div className="workspace-grid">
      <section className="hero home-hero">
        <div className="home-hero-copy">
          <p className="hero-kicker">OPEN-SOURCE TAX SOFTWARE // AUDITABLE ENGINE // LOCAL-FIRST</p>
          <h1>Build draft returns. Verify every step.</h1>
          <p className="hero-copy">
            Use the open-source engine to assemble draft federal and state
            returns, inspect the calculation trail, and export reference PDFs
            for your own review. Do not rely on the software as a substitute
            for licensed tax advice, tax preparation, or independent accuracy
            review.
          </p>
          <div className="hero-actions">
            <StartWorkspaceButton preferLocalDraft={prefersLocalDraft} />
            <a
              href={TAX_ENGINE_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="utility-button home-repo-button"
            >
              Star on GitHub
            </a>
          </div>
          <div className="home-open-source-callout">
            <p className="home-open-source-kicker">OPEN SOURCE MOMENTUM</p>
            <p className="home-open-source-copy">
              If this project helps you, star the repo to boost discovery and bring in more contributors.
            </p>
            <a
              href={TAX_ENGINE_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="home-open-source-link"
            >
              {TAX_ENGINE_REPO_URL.replace(/^https?:\/\//, "")}
            </a>
          </div>
          <div className="hero-bar home-hero-bar" aria-label="Product highlights">
            <span>Federal and state previews</span>
            <span>{latestEngineTargetYear} experimental calculations</span>
            <span>Reference PDFs, not e-file</span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-banner-frame">
            <div className="hero-banner-stage">
              <Image
                src="/brand/logo.png"
                alt=""
                width={1024}
                height={1024}
                priority
                className="hero-banner-image"
              />
            </div>
          </div>
        </div>
      </section>

      <RecentWorkspacesPanel
        deploymentMode={deploymentMode}
        newWorkspaceHref={newWorkspaceHref}
      />

      <section className="trust-signals" aria-labelledby="trust-signals-heading">
        <h2 id="trust-signals-heading" className="sr-only">Why Viva La Tax</h2>
        {trustSignals.map((signal) => (
          <article className="trust-signal-card" key={signal.label}>
            <strong>{signal.label}</strong>
            <p className="trust-signal-detail">{signal.detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
