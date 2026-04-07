"use client";

import { useState } from "react";
import { publicHostedPlanCatalog, type HostedPlanId } from "@tax-engine/contracts";
import type { HostedAiBudgetSnapshot } from "@/lib/hosted-ai-usage-db";
import type { HostedBillingWebhookStatus } from "@/lib/hosted-billing-state";

function extractErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }
  }

  return fallback;
}

export function hasManagedBillingSubscription(
  currentPlanId: HostedPlanId | null,
  currentStatus: HostedBillingWebhookStatus | null
) {
  return currentPlanId !== null
    && currentStatus !== null
    && currentStatus !== "canceled";
}

export function BillingPagePanel({
  currentPlanId,
  currentStatus,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  aiBudget,
  aiTopUpPriceCents,
  aiTopUpCreditCents,
  aiTopUpEnabled
}: {
  currentPlanId: HostedPlanId | null;
  currentStatus: HostedBillingWebhookStatus | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  aiBudget: HostedAiBudgetSnapshot | null;
  aiTopUpPriceCents: number;
  aiTopUpCreditCents: number;
  aiTopUpEnabled: boolean;
}) {
  const [pendingPlan, setPendingPlan] = useState<HostedPlanId | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [topUpPending, setTopUpPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasExistingManagedSubscription = hasManagedBillingSubscription(currentPlanId, currentStatus);
  const starterDisabled = pendingPlan !== null || hasExistingManagedSubscription;
  const plusDisabled = pendingPlan !== null || hasExistingManagedSubscription;
  const billingPlanEyebrows: Record<HostedPlanId, string> = {
    starter: "Best for synced workspaces",
    plus: "For reminders and continuity",
    review: "Unavailable"
  };

  async function startCheckout(planId: HostedPlanId) {
    setPendingPlan(planId);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          planId,
          successUrl: `${window.location.origin}/billing?checkout=success`,
          cancelUrl: `${window.location.origin}/billing?checkout=cancel`
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(
          extractErrorMessage(payload, "Could not open Stripe Checkout.")
        );
      }

      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open Stripe Checkout.");
    } finally {
      setPendingPlan(null);
    }
  }

  async function openPortal() {
    setPortalPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/billing`
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.url) {
        throw new Error(
          extractErrorMessage(payload, "Could not open the Stripe billing portal.")
        );
      }

      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the Stripe billing portal.");
    } finally {
      setPortalPending(false);
    }
  }

  async function startAiTopUpCheckout() {
    setTopUpPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/ai-credits/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/billing?checkout=ai-top-up-success`,
          cancelUrl: `${window.location.origin}/billing?checkout=ai-top-up-cancel`
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(
          extractErrorMessage(payload, "Could not open Stripe Checkout for AI helper credits.")
        );
      }

      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open Stripe Checkout for AI helper credits.");
    } finally {
      setTopUpPending(false);
    }
  }

  function formatUsd(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  return (
    <>
      <section className="panel" aria-labelledby="billing-status-heading">
        <div className="panel-header">
          <span className="eyebrow" aria-hidden="true">BILLING</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h1 className="panel-title" id="billing-status-heading">Hosted Plans</h1>
        <p className="panel-text">
          Starter unlocks hosted workspace sync, the paid AI helper, and privacy-safe workspace shells. Plus adds reminder and planning workflow tools. Paid plans buy hosted software features only, not tax advice, tax preparation, or professional review.
        </p>
        <div className="summary-grid section-heading">
          <article className="summary-stat">
            <p className="summary-label">current plan</p>
            <strong>{currentPlanId ?? "none"}</strong>
          </article>
          <article className="summary-stat">
            <p className="summary-label">status</p>
            <strong>{currentStatus ?? "not subscribed"}</strong>
          </article>
          <article className="summary-stat">
            <p className="summary-label">renewal</p>
            <strong>
              {currentPeriodEnd
                ? `${cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(currentPeriodEnd).toLocaleDateString()}`
                : "n/a"}
            </strong>
          </article>
        </div>
        {aiBudget ? (
          <section className="panel inset-panel section-heading" aria-labelledby="ai-budget-heading">
            <h2 className="panel-title" id="ai-budget-heading">AI Helper Budget</h2>
            <div className="summary-grid section-heading">
              <article className="summary-stat">
                <p className="summary-label">included remaining</p>
                <strong>{formatUsd(aiBudget.includedRemainingCents)}</strong>
              </article>
              <article className="summary-stat">
                <p className="summary-label">top-up remaining</p>
                <strong>{formatUsd(aiBudget.purchasedRemainingCents)}</strong>
              </article>
              <article className="summary-stat">
                <p className="summary-label">total remaining</p>
                <strong>{formatUsd(aiBudget.totalRemainingCents)}</strong>
              </article>
            </div>
            <p className="panel-text">
              Your active plan includes up to {formatUsd(aiBudget.includedBudgetCents)} of AI helper usage each billing cycle. Extra AI credit packs stay available after purchase until they are consumed.
            </p>
            {aiTopUpEnabled ? (
              <div className="inline-actions section-heading">
                <button
                  type="button"
                  className="launch-button"
                  onClick={() => {
                    void startAiTopUpCheckout();
                  }}
                  disabled={!hasExistingManagedSubscription || topUpPending}
                >
                  {topUpPending
                    ? "Opening Checkout..."
                    : `Buy ${formatUsd(aiTopUpCreditCents)} AI credit pack for ${formatUsd(aiTopUpPriceCents)}`}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
        <div className="billing-plan-grid section-heading">
          {publicHostedPlanCatalog.map((plan) => {
            const disabled = plan.id === "starter" ? starterDisabled : plusDisabled;
            const pending = pendingPlan === plan.id;

            return (
              <article className={`hosted-plan-card hosted-plan-card-${plan.id} billing-plan-card`} key={plan.id}>
                <div className="hosted-plan-card-shell billing-plan-card-shell">
                  <div className="hosted-plan-card-header">
                    <div className="hosted-plan-copy">
                      <p className="hosted-plan-kicker">
                        {billingPlanEyebrows[plan.id] ?? "Hosted tax filing"}
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
                    <button
                      type="button"
                      className="launch-button hosted-plan-cta"
                      onClick={() => {
                        void startCheckout(plan.id);
                      }}
                      disabled={disabled}
                    >
                      {pending
                        ? "Opening Checkout..."
                        : hasExistingManagedSubscription
                          ? "Manage Existing Subscription"
                          : `Choose ${plan.name}`}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="inline-actions section-heading">
          <button
            type="button"
            className="utility-button"
            onClick={() => {
              void openPortal();
            }}
            disabled={portalPending || !currentPlanId}
          >
            {portalPending ? "Opening Portal..." : "Manage Billing"}
          </button>
        </div>
        {message ? (
          <p className="answer-note" role="status">{message}</p>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="billing-privacy-heading">
        <div className="panel-header">
          <span className="eyebrow" aria-hidden="true">RETENTION</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h2 className="panel-title" id="billing-privacy-heading">Privacy And Data Retention</h2>
        <ul className="stack-list section-heading">
          <li>The database stores account identity, Stripe subscription metadata, workspace shells, and reminder settings.</li>
          <li>Hosted mode does not durably store raw tax forms, OCR text, extracted source JSON, SSNs, or bank details.</li>
          <li>Self-host remains free and keeps the full return local to your browser.</li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="future-features-heading">
        <div className="panel-header">
          <span className="eyebrow" aria-hidden="true">ROADMAP</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h2 className="panel-title" id="future-features-heading">Future Features</h2>
        <ul className="stack-list section-heading">
          <li>Email reminders for quarterly estimated taxes, deadlines, and extensions.</li>
          <li>Deadline dashboard and ICS calendar feeds for tax deadlines and milestone tracking.</li>
          <li>Continuous engine hardening, rule-change notes, and support expansions.</li>
          <li>What changed this quarter summaries when tax rules shift.</li>
          <li>Tax mail checklist guidance and deadline trackers.</li>
          <li>Smarter checklist and review prompts over time.</li>
        </ul>
      </section>
    </>
  );
}
