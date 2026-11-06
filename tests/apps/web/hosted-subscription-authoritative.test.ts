import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn(), schema: vi.fn(), retrieve: vi.fn(), key: vi.fn() }));
vi.mock("../../../apps/web/src/lib/hosted-server-db", async (original) => ({
  ...await original<typeof import("../../../apps/web/src/lib/hosted-server-db")>(),
  ensureHostedAppSchema: mocks.schema,
  getHostedServerDatabase: async () => ({ pool: { connect: mocks.connect } })
}));
vi.mock("../../../apps/web/node_modules/stripe", async (original) => {
  const actual = await original<typeof import("../../../apps/web/node_modules/stripe")>();
  return { ...actual, default: class {
    static webhooks = actual.default.webhooks;
    webhooks = actual.default.webhooks;
    subscriptions = { retrieve: mocks.retrieve };
    constructor(key: string) { mocks.key(key); }
  } };
});
import { createHostedBillingWebhookRouteHandlers, signHostedBillingWebhookPayload } from "../../../apps/web/src/lib/hosted-billing-webhook";

// spec/federal/hosted-subscription-authoritative.yaml. Actual route+reconciler,
// synthetic Stripe/SQL boundaries only. Real transaction proof is a separate PG suite.
describe("hosted authoritative subscription reconciliation", () => {
  let client: EventEmitter;
  const now = 1_800_000_000;
  const secret = "whsec_authoritative_synthetic";
  const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", TAX_ENGINE_BILLING_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_synthetic", STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter", STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus",
    STRIPE_PRICE_ID_REVIEW: "price_review", DATABASE_URL: "postgresql://localhost:1/unused" };
  function subscription(status = "active", id = "sub_current") {
    return { object: "subscription", id, customer: "cus_current", livemode: false, status,
      cancel_at_period_end: false, metadata: { hostedOwnerId: "owner-current", planId: "starter" },
      items: { data: [{ price: { id: "price_starter" }, current_period_end: now + 86400 }] } };
  }
  function payload(id = "evt_current", created = now, status = "active", sub = "sub_current") {
    return JSON.stringify({ id, livemode: false, type: status === "canceled" ? "customer.subscription.deleted" : "customer.subscription.updated",
      created, data: { object: subscription(status, sub) } });
  }
  function request(raw: string, timestamp = now, original = raw) {
    return new Request("https://synthetic.invalid/api/billing/webhook", { method: "POST", body: raw,
      headers: { "content-type": "application/json", "stripe-signature": signHostedBillingWebhookPayload(original, secret, timestamp) } });
  }
  const post = (raw: string) => createHostedBillingWebhookRouteHandlers({ env }).POST(request(raw));
  function savedStateWrites() {
    return mocks.query.mock.calls.filter((args) => /INSERT INTO hosted_billing_subscriptions/.test(String(args[0])));
  }
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now * 1000);
    client = Object.assign(new EventEmitter(), { query: mocks.query, release: mocks.release });
    mocks.connect.mockResolvedValue(client);
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: /INSERT INTO hosted_billing_events/.test(sql) ? [{ event_id: "evt_current" }] : [],
      rowCount: /INSERT INTO hosted_billing_events/.test(sql) ? 1 : 0
    }));
    mocks.retrieve.mockResolvedValue(subscription());
  });
  afterEach(() => vi.useRealTimers());

  it("uses current state for a delayed active snapshot", async () => {
    mocks.retrieve.mockResolvedValue(subscription("past_due"));
    expect((await post(payload("evt_delayed", now - 86400))).status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith("sub_current", {}, { timeout: 2000, maxNetworkRetries: 0 });
    const writes = savedStateWrites(); expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toEqual(["sub_current", "owner-current", "cus_current", "starter", "past-due",
      new Date((now + 86400) * 1000).toISOString(), false, "evt_delayed", new Date((now - 86400) * 1000).toISOString(), new Date(now * 1000).toISOString()]);
  });
  it("reconciles distinct same-second event IDs", async () => {
    expect((await post(payload("evt_z"))).status).toBe(200);
    expect((await post(payload("evt_a"))).status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledTimes(2); expect(savedStateWrites()).toHaveLength(2);
  });
  it("does not retrieve a durably processed duplicate", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect((await post(payload())).status).toBe(200);
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(savedStateWrites()).toEqual([]);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("discards a client lost while the provider callback is pending", async () => {
    mocks.retrieve.mockImplementationOnce(async () => {
      client.emit("error", new Error("synthetic checked-out connection loss"));
      return subscription();
    });
    await expect(post(payload())).rejects.toThrow("synthetic checked-out connection loss");
    expect(savedStateWrites()).toEqual([]);
    expect(mocks.release).toHaveBeenCalledWith(true);
    expect(client.listenerCount("error")).toBe(0);
  });
  it.each(["401", "403", "404", "timeout", "network"])("keeps retrieval failures retryable (%s)", async (fault) => {
    mocks.retrieve.mockRejectedValueOnce(new Error(`synthetic provider ${fault}`));
    await expect(post(payload())).rejects.toThrow(`synthetic provider ${fault}`);
    expect(savedStateWrites()).toEqual([]);
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK"); expect(mocks.release).toHaveBeenCalledTimes(1);
    expect((await post(payload())).status).toBe(200); expect(savedStateWrites()).toHaveLength(1);
  });
  it.each(["subscription", "customer", "owner", "mode"])("rejects contradictory retrieved identity (%s)", async (field) => {
    const current = subscription();
    if (field === "subscription") current.id = "sub_other";
    if (field === "customer") current.customer = "cus_other";
    if (field === "owner") current.metadata.hostedOwnerId = "owner-other";
    if (field === "mode") current.livemode = true;
    mocks.retrieve.mockResolvedValue(current);
    await expect(post(payload())).rejects.toThrow(/identity|mode|subscription|customer|owner/i);
    expect(savedStateWrites()).toEqual([]); expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it.each(["unknown-price", "conflicting-plan", "missing-owner", "unknown-status", "unknown-cancel", "bad-period"])("rejects unknown authoritative plan metadata (%s)", async (field) => {
    const current: Record<string, unknown> = subscription();
    if (field === "unknown-price") current.items = { data: [{ price: { id: "price_unknown" } }] };
    if (field === "conflicting-plan") current.metadata = { hostedOwnerId: "owner-current", planId: "plus" };
    if (field === "missing-owner") current.metadata = { planId: "starter" };
    if (field === "unknown-status") current.status = "made-up";
    if (field === "unknown-cancel") delete current.cancel_at_period_end;
    if (field === "bad-period") current.items = { data: [{ price: { id: "price_starter" }, current_period_end: -1 }] };
    mocks.retrieve.mockResolvedValue(current);
    await expect(post(payload())).rejects.toThrow(/invalid|unknown|unsupported|metadata|owner|period/i);
    expect(savedStateWrites()).toEqual([]); expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("does not eclipse an active replacement with canceled history", async () => {
    mocks.retrieve.mockResolvedValue(subscription("canceled", "sub_old"));
    mocks.query.mockImplementation(async (sql: string) => ({ rows: /INSERT INTO hosted_billing_events/.test(sql) ? [{ event_id: "evt_late" }]
      : /FROM hosted_billing_subscriptions/.test(sql) ? [{ stripe_subscription_id: "sub_current", stripe_customer_id: "cus_current", owner_id: "owner-current", status: "active" }] : [], rowCount: 1 }));
    expect((await post(payload("evt_late", now - 200, "canceled", "sub_old"))).status).toBe(200);
    expect(savedStateWrites()).toEqual([]);
    expect(mocks.query.mock.calls.some((call) => /DELETE FROM hosted_billing_subscriptions/.test(String(call[0])))).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith("COMMIT");
  });
  it.each(["signature", "stale-signature", "event-mode", "key-mode", "missing-key", "missing-customer", "created", "future", "self-host"])("preserves pre-retrieval route guards (%s)", async (guard) => {
    let raw = payload(); const facts = { ...env }; let timestamp = now; let original: string | undefined;
    if (guard === "signature") { original = raw; raw = raw.replace("owner-current", "owner-tampered"); }
    if (guard === "stale-signature") timestamp -= 301;
    if (guard === "event-mode") raw = raw.replaceAll('"livemode":false', '"livemode":true');
    if (guard === "key-mode") facts.STRIPE_SECRET_KEY = "sk_live_synthetic";
    if (guard === "missing-key") facts.STRIPE_SECRET_KEY = "";
    if (guard === "missing-customer") raw = raw.replace('"customer":"cus_current"', '"customer":null');
    if (guard === "created") raw = raw.replace(`"created":${now}`, '"created":-1');
    if (guard === "future") raw = payload("evt_future", now + 61);
    if (guard === "self-host") facts.TAX_ENGINE_DEPLOYMENT_MODE = "self-host";
    const outcome = createHostedBillingWebhookRouteHandlers({ env: facts }).POST(request(raw, timestamp, original));
    if (guard === "missing-key" || guard === "missing-customer") await expect(outcome).rejects.toThrow(/key|customer|configuration/i);
    else expect((await outcome).status).toBe(guard === "self-host" ? 200 : guard === "key-mode" ? 503 : 400);
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(savedStateWrites()).toEqual([]);
    expect(mocks.query.mock.calls.some((call) => /INSERT INTO hosted_billing_events/.test(String(call[0])))).toBe(false);
  });
});
