import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BillingPagePanel } from "@/components/billing-page-panel";
import { getHostedAiBudgetSnapshot } from "@/lib/hosted-ai-usage-db";
import {
  resolveHostedAiBudgetCycleKey,
  resolveHostedAiIncludedBudgetCents,
  resolveHostedAiTopUpCreditCents,
  resolveHostedAiTopUpPriceCents
} from "@/lib/hosted-ai-helper-billing";
import { resolveHostedWorkspaceActor } from "@/lib/hosted-auth";
import { getHostedEntitlementByOwnerId } from "@/lib/hosted-billing-db";
import { resolveDeploymentMode } from "@/lib/deployment-mode";

export const metadata: Metadata = {
  title: "Billing — Viva La Tax"
};

export default async function BillingPage() {
  const deploymentMode = resolveDeploymentMode();

  if (deploymentMode !== "hosted") {
    return (
      <div className="workspace-grid">
        <section className="panel">
          <div className="panel-header">
            <span className="eyebrow" aria-hidden="true">LOCAL</span>
            <span className="window-led" aria-hidden="true" />
          </div>
          <h1 className="panel-title">Hosted Billing Is Disabled</h1>
          <p className="panel-text">
            This deployment is running in self-host mode. All features remain free and local-first on your device by default.
          </p>
        </section>
      </div>
    );
  }

  const requestHeaders = await headers();
  const actor = await resolveHostedWorkspaceActor({
    requestHeaders
  });

  if (!actor) {
    return (
      <div className="workspace-grid">
        <section className="panel">
          <div className="panel-header">
            <span className="eyebrow" aria-hidden="true">ACCOUNT</span>
            <span className="window-led" aria-hidden="true" />
          </div>
          <h1 className="panel-title">Sign In Required</h1>
          <p className="panel-text">
            Sign in before you manage hosted billing or choose a paid plan.
          </p>
          <div className="inline-actions section-heading">
            <Link className="launch-button" href="/account?mode=sign-in">
              Sign In
            </Link>
            <Link className="utility-button" href="/account?mode=sign-up">
              Create Account
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { subscription } = await getHostedEntitlementByOwnerId(process.env, actor.id);
  const aiBudget = subscription?.planId
    ? await getHostedAiBudgetSnapshot(process.env, {
        ownerId: actor.id,
        cycleKey: resolveHostedAiBudgetCycleKey({
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
        }),
        includedBudgetCents: resolveHostedAiIncludedBudgetCents(subscription.planId, process.env)
      })
    : null;

  return (
    <div className="workspace-grid">
      <BillingPagePanel
        currentPlanId={subscription?.planId ?? null}
        currentStatus={subscription?.status ?? null}
        cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
        currentPeriodEnd={subscription?.currentPeriodEnd ?? null}
        aiBudget={aiBudget}
        aiTopUpPriceCents={resolveHostedAiTopUpPriceCents(process.env)}
        aiTopUpCreditCents={resolveHostedAiTopUpCreditCents(process.env)}
        aiTopUpEnabled={Boolean(process.env.STRIPE_PRICE_ID_AI_HELPER_TOP_UP?.trim())}
      />
    </div>
  );
}
