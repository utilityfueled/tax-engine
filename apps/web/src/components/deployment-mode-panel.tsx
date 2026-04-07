import { publicHostedPlanCatalog } from "@tax-engine/contracts";
import { RetroShell } from "@/components/retro-shell";
import type { DeploymentModeViewModel } from "@/lib/deployment-mode";

export function DeploymentModePanel({
  modeState,
  title = "Settings",
  eyebrow = "CONFIGURATION"
}: {
  modeState: DeploymentModeViewModel;
  title?: string;
  eyebrow?: string;
}) {
  return (
    <RetroShell title={title} eyebrow={eyebrow}>
      <p className="panel-text">{modeState.summary}</p>
      <div className="summary-grid section-heading">
        <article className="summary-stat">
          <p className="summary-label">storage</p>
          <strong>{modeState.deploymentLabel}</strong>
        </article>
        <article className="summary-stat">
          <p className="summary-label">plans</p>
          <strong>{modeState.planCatalogVisible ? `${publicHostedPlanCatalog.length} available` : "all features free"}</strong>
        </article>
      </div>
      <ul className="stack-list section-heading">
        {modeState.affordances.map((affordance) => (
          <li key={affordance.id}>
            <div className="document-card-top">
              <strong>{affordance.label}</strong>
              <span className={`status-pill status-${affordance.badgeTone}`}>
                {affordance.badgeLabel}
              </span>
            </div>
            <p className="document-meta">{affordance.summary}</p>
          </li>
        ))}
      </ul>
      <ul className="stack-list section-heading">
        {modeState.statusNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {modeState.planCatalogVisible ? (
        <div className="plan-grid section-heading">
          {publicHostedPlanCatalog.map((plan) => (
            <article className="plan-card" key={plan.id}>
              <div className="document-card-top">
                <div>
                  <p className="summary-label">plan</p>
                  <strong>{plan.name}</strong>
                </div>
                <span className={`status-pill status-${plan.id}`}>{plan.priceLabel}</span>
              </div>
              <p className="document-meta">{plan.summary}</p>
              <ul className="stack-list section-heading">
                {plan.featureBullets.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : null}
    </RetroShell>
  );
}
