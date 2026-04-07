import type { HostedPlanId } from "@tax-engine/contracts";
import type { HostedBillingWebhookStatus } from "./hosted-billing-state";

export type HostedEntitlementPlan =
  | "self-host"
  | "starter"
  | "plus"
  | "review";

export interface HostedSubscriptionSnapshot {
  planId: HostedPlanId | null;
  status: HostedBillingWebhookStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export interface HostedEntitlementSummary {
  plan: HostedEntitlementPlan;
  workspaceAccess: boolean;
  reminderAutomationAccess: boolean;
  reviewAccess: boolean;
}

export function hasBillableHostedAccess(status: HostedBillingWebhookStatus) {
  return status === "active" || status === "past-due";
}

export function resolveHostedEntitlement(
  subscription: HostedSubscriptionSnapshot | null
): HostedEntitlementSummary {
  if (!subscription || !subscription.planId || !hasBillableHostedAccess(subscription.status)) {
    return {
      plan: "self-host",
      workspaceAccess: false,
      reminderAutomationAccess: false,
      reviewAccess: false
    };
  }

  if (subscription.planId === "review") {
    return {
      plan: "review",
      workspaceAccess: true,
      reminderAutomationAccess: true,
      reviewAccess: true
    };
  }

  if (subscription.planId === "plus") {
    return {
      plan: "plus",
      workspaceAccess: true,
      reminderAutomationAccess: true,
      reviewAccess: false
    };
  }

  return {
    plan: "starter",
    workspaceAccess: true,
    reminderAutomationAccess: false,
    reviewAccess: false
  };
}
