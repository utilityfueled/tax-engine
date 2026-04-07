import type { HostedPlanId } from "@tax-engine/contracts";

export type HostedBillingWebhookStatus =
  | "checkout-pending"
  | "active"
  | "past-due"
  | "canceled";

export interface HostedBillingSubscriptionChange {
  customerId: string | null;
  workspaceOwnerId: string | null;
  subscriptionId: string | null;
  planId: HostedPlanId | null;
  status: HostedBillingWebhookStatus;
}

export interface HostedBillingSubscriptionRecord {
  subscriptionId: string;
  customerId: string | null;
  workspaceOwnerId: string | null;
  planId: HostedPlanId | null;
  status: HostedBillingWebhookStatus;
  lastEventId: string;
  lastEventType: string;
  updatedAt: string;
}

export interface HostedBillingSubscriptionStore {
  get(subscriptionId: string): HostedBillingSubscriptionRecord | null;
  save(record: HostedBillingSubscriptionRecord): HostedBillingSubscriptionRecord;
  list(): HostedBillingSubscriptionRecord[];
}

class InMemoryHostedBillingSubscriptionStore implements HostedBillingSubscriptionStore {
  readonly #records = new Map<string, HostedBillingSubscriptionRecord>();

  constructor(initialRecords: HostedBillingSubscriptionRecord[] = []) {
    for (const record of initialRecords) {
      this.#records.set(record.subscriptionId, record);
    }
  }

  get(subscriptionId: string) {
    return this.#records.get(subscriptionId) ?? null;
  }

  save(record: HostedBillingSubscriptionRecord) {
    this.#records.set(record.subscriptionId, record);
    return record;
  }

  list() {
    return Array.from(this.#records.values());
  }
}

export function createInMemoryHostedBillingSubscriptionStore(
  initialRecords: HostedBillingSubscriptionRecord[] = []
): HostedBillingSubscriptionStore {
  return new InMemoryHostedBillingSubscriptionStore(initialRecords);
}

export const hostedBillingSubscriptionStore = createInMemoryHostedBillingSubscriptionStore();

interface PersistHostedBillingSubscriptionChangeOptions {
  eventId: string;
  eventType: string;
  updatedAt: string;
}

export function persistHostedBillingSubscriptionChange(
  store: HostedBillingSubscriptionStore,
  change: HostedBillingSubscriptionChange,
  options: PersistHostedBillingSubscriptionChangeOptions
): HostedBillingSubscriptionRecord | null {
  if (!change.subscriptionId) {
    return null;
  }

  const existingRecord = store.get(change.subscriptionId);
  const record: HostedBillingSubscriptionRecord = {
    subscriptionId: change.subscriptionId,
    customerId: change.customerId ?? existingRecord?.customerId ?? null,
    workspaceOwnerId: change.workspaceOwnerId ?? existingRecord?.workspaceOwnerId ?? null,
    planId: change.planId ?? existingRecord?.planId ?? null,
    status: change.status,
    lastEventId: options.eventId,
    lastEventType: options.eventType,
    updatedAt: options.updatedAt
  };

  return store.save(record);
}
