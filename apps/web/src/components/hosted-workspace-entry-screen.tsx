import Link from "next/link";
import { publicHostedPlanCatalog } from "@tax-engine/contracts";
import type { HostedWorkspaceEntryGate } from "@/lib/hosted-auth";

const hostedPlanEyebrows: Record<string, string> = {
  starter: "Best for synced workspaces",
  plus: "For reminders and continuity",
};

export function HostedWorkspaceEntryScreen({
  gate
}: {
  gate: HostedWorkspaceEntryGate;
}) {
  return (
    <div className="workspace-grid">
      <section className="hero">
        <p className="hero-kicker">ACCOUNT</p>
        <h1>{gate.title}</h1>
        <p className="hero-copy">{gate.summary}</p>
        <div className="hero-actions">
          {gate.state === "hosted-authenticated-preview" ? (
            gate.primaryActionHref && gate.primaryActionLabel ? (
              <Link className="launch-button workspace-link" href={gate.primaryActionHref}>
                {gate.primaryActionLabel}
              </Link>
            ) : (
              <Link className="utility-button workspace-link" href="/">
                Back to Home
              </Link>
            )
          ) : (
            <>
              <Link className="launch-button workspace-link" href="/account?mode=sign-in">
                Sign In
              </Link>
              <Link className="utility-button workspace-link" href="/account?mode=sign-up">
                Create Account
              </Link>
              <Link className="utility-button workspace-link" href="/">
                Back to Home
              </Link>
            </>
          )}
        </div>
      </section>

      {gate.state === "hosted-auth-required" ? (
        <section className="panel" aria-labelledby="hosted-plan-preview-heading">
          <div className="panel-header">
            <span className="eyebrow" aria-hidden="true">PLANS</span>
            <span className="window-led" aria-hidden="true" />
          </div>
          <h2 className="panel-title" id="hosted-plan-preview-heading">Hosted Plans</h2>
          <p className="panel-text">
            Hosted features require an account first. After you sign in, you can choose the plan that fits your software needs.
          </p>
          <div className="hosted-plan-grid section-heading">
            {publicHostedPlanCatalog.map((plan) => (
              <article className={`hosted-plan-card hosted-plan-card-${plan.id}`} key={plan.id}>
                <div className="hosted-plan-card-shell">
                  <div className="hosted-plan-card-header">
                    <div className="hosted-plan-copy">
                      <p className="hosted-plan-kicker">
                        {hostedPlanEyebrows[plan.id] ?? "Hosted tax filing"}
                      </p>
                      <div className="hosted-plan-heading-row">
                        <strong className="hosted-plan-name">{plan.name}</strong>
                        <span className={`status-pill hosted-plan-price status-${plan.id}`}>{plan.priceLabel}</span>
                      </div>
                    </div>
                  </div>
                  <p className="hosted-plan-summary">{plan.summary}</p>
                  <ul className="hosted-plan-features">
                    {plan.featureBullets.map((feature) => (
                      <li key={feature} className="hosted-plan-feature">
                        <span className="hosted-plan-feature-mark" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="hosted-plan-footer">
                    <Link className="utility-button hosted-plan-cta" href="/account?mode=sign-up">
                      Create Account To Continue
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {gate.userLabel ? (
        <section className="panel" aria-labelledby="account-panel-heading">
          <div className="panel-header">
            <span className="eyebrow" aria-hidden="true">YOUR ACCOUNT</span>
            <span className="window-led" aria-hidden="true" />
          </div>
          <h2 className="panel-title" id="account-panel-heading">Signed In</h2>
          <div className="panel-body">
            <p className="panel-text">
              You are signed in as <strong>{gate.userLabel}</strong>.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
