// PROPOSED test-only setup adapter; never import from a product. It preserves
// old route-forwarding/error spy assertions, not SQL transaction evidence.
import type { PersistHostedStripeSubscriptionInput, getHostedSubscriptionByCustomerId } from "../../apps/web/src/lib/hosted-billing-db";

export type HostedBillingRouteCustomer = NonNullable<Awaited<ReturnType<typeof getHostedSubscriptionByCustomerId>>>;

type Environment = Record<string, string | undefined>;
type Input = PersistHostedStripeSubscriptionInput & { livemode: boolean };
interface ForwardingSpies {
  persistSubscription: (env: Environment, input: PersistHostedStripeSubscriptionInput) => Promise<unknown>;
  markEventProcessed: (env: Environment, event: { id: string; type: string; createdAt: string }) => Promise<unknown>;
  getExistingPersistedSubscriptionByCustomerId?: (
    env: Environment, customerId: string
  ) => Promise<{ subscriptionId: string; status: string } | null>;
  deletePersistedSubscription?: (env: Environment, subscriptionId: string) => Promise<unknown>;
}

export function createHostedBillingRouteForwardingAdapter(spies: ForwardingSpies) {
  return async (env: Environment, value: Input) => {
    const { livemode, ...input } = value;
    void livemode;
    if (input.stripeCustomerId && input.status !== "canceled") {
      const existing = await spies.getExistingPersistedSubscriptionByCustomerId?.(env, input.stripeCustomerId);
      if (existing && existing.subscriptionId !== input.stripeSubscriptionId && existing.status === "canceled") {
        await spies.deletePersistedSubscription?.(env, existing.subscriptionId);
      }
    }
    await spies.persistSubscription(env, input);
    await spies.markEventProcessed(env, { id: input.eventId, type: input.eventType, createdAt: input.eventCreatedAt });
    return { outcome: "applied" as const };
  };
}
