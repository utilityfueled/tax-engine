import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "../../../apps/web/node_modules/pg";
vi.mock("server-only", () => ({}));
import { createHostedAiCreditIssuance, bindHostedAiCreditIssuance, findHostedAiCreditIssuance,
  pruneHostedAiCreditIssuances } from "../../../apps/web/src/lib/hosted-ai-credit-issuance";
import { createHostedBillingWebhookRouteHandlers, signHostedBillingWebhookPayload } from "../../../apps/web/src/lib/hosted-billing-webhook";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";
import { recordHostedAiCreditPurchase } from "../../../apps/web/src/lib/hosted-ai-usage-db";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";

// Spec: federal/hosted-ai-credit-issuance.yaml. Actual disposable PostgreSQL16.16 only.
const originalUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!originalUrl)("immutable AI credit issuance", () => {
  const schema = `issuance_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(originalUrl ?? "postgresql://ai_test@127.0.0.1:1/postgres");
  const adminUrl = url.toString();
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", DATABASE_URL: url.toString() };
  const terms = { ownerId: "original_owner", stripeCustomerId: "cus_original", livemode: false,
    amountPaidCents: 1500, creditedBudgetCents: 1000 };
  let admin: Pool;
  beforeAll(async () => {
    const parsed = new URL(adminUrl);
    if (parsed.hostname !== "127.0.0.1" || parsed.username !== "ai_test" || parsed.password || parsed.search || !parsed.port) throw new Error("Dedicated local database required");
    admin = new Pool({ connectionString: adminUrl, max: 1 });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^16\.16(?:\s|$)/);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await ensureHostedAppSchema(env);
    await admin.query(`INSERT INTO ${schema}.hosted_ai_storage_mode (mode) VALUES ('test')`);
  });
  beforeEach(async () => { await admin.query(`TRUNCATE ${schema}.hosted_ai_credit_purchases, ${schema}.hosted_billing_events, ${schema}.hosted_ai_credit_issuances`); });
  afterAll(async () => {
    const { db } = await getHostedServerDatabase(env); await db.destroy();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  });
  async function original() {
    const issuance = await createHostedAiCreditIssuance(env, terms);
    const session = { id: "cs_test_original", object: "checkout.session", client_reference_id: issuance.issuanceId,
      customer: terms.stripeCustomerId, mode: "payment", livemode: false, currency: "usd",
      amount_subtotal: 1500, amount_total: 1500, created: Math.floor(Date.now()/1000), expires_at: issuance.expiresAt,
      metadata: { purchaseKind: "ai-credit-issuance-v1" }, url: "https://payments.example.invalid/c/pay/cs_test_original" };
    const purchase = { checkoutSessionId: session.id, ...terms, currency: "usd", createdAt: new Date().toISOString(),
      eventId: "evt_original", eventType: "checkout.session.completed" as const, checkoutProof: {
        clientReferenceId: session.client_reference_id, livemode: session.livemode, created: session.created,
        expiresAt: session.expires_at, amountSubtotal: session.amount_subtotal, metadata: session.metadata,
      } };
    return { issuance, session, purchase };
  }
  async function saved() {
    const { rows: issuances } = await admin.query(`SELECT issuance_id,checkout_session_id,owner_id,stripe_customer_id,amount_paid_cents,credited_budget_cents,livemode FROM ${schema}.hosted_ai_credit_issuances ORDER BY issuance_id`);
    const { rows: purchases } = await admin.query(`SELECT * FROM ${schema}.hosted_ai_credit_purchases ORDER BY checkout_session_id`);
    const { rows: events } = await admin.query(`SELECT * FROM ${schema}.hosted_billing_events ORDER BY event_id`);
    return { issuances, purchases, events };
  }
  it("binds one actual Session without rewriting original terms", async () => {
    const { issuance, session } = await original();
    await Promise.all([bindHostedAiCreditIssuance(env, issuance.issuanceId, session), bindHostedAiCreditIssuance(env, issuance.issuanceId, session)]);
    const baseline = await saved();
    expect(baseline.issuances[0]).toMatchObject({ checkout_session_id: session.id, ...{ owner_id: terms.ownerId, amount_paid_cents: 1500, credited_budget_cents: 1000 } });
    await expect(bindHostedAiCreditIssuance(env, issuance.issuanceId, { ...session, id: "cs_test_second" })).rejects.toThrow(/conflict/i);
    for (const change of [{ customer: "cus_other" }, { livemode: true }, { amount_total: 1400 }, { client_reference_id: "tax_ai_credit_v1_unknown" }]) {
      await expect(bindHostedAiCreditIssuance(env, issuance.issuanceId, { ...session, ...change })).rejects.toThrow();
    }
    await expect(admin.query(`UPDATE ${schema}.hosted_ai_credit_issuances SET credited_budget_cents=999`)).rejects.toThrow(/immutable/i);
    expect(await saved()).toEqual(baseline);
  });
  it("recovers a lost create response and grants once across racing paid events", async () => {
    const { issuance, session, purchase } = await original();
    // No response binding exists yet. Signed Session's reference recovers it.
    expect((await findHostedAiCreditIssuance(env, session.id, issuance.issuanceId))?.checkoutSessionId).toBeNull();
    const later = { ...purchase, eventId: "evt_async", eventType: "checkout.session.async_payment_succeeded" as const };
    const values = await Promise.all([purchase,later,purchase,later].map(p => recordHostedAiCreditPurchase(env,p)));
    expect(values.filter(Boolean)).toHaveLength(1);
    await bindHostedAiCreditIssuance(env, issuance.issuanceId, session);
    const state = await saved(); expect(state.purchases).toHaveLength(1);expect(state.events).toHaveLength(2);
    expect(state.issuances[0].checkout_session_id).toBe(session.id);
  });
  it("rolls back a failed outbound binding commit before a successful retry", async () => {
    const { issuance, session } = await original();
    const before = await saved();
    await admin.query(`CREATE FUNCTION ${schema}.fail_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic binding commit fault'; END $$`);
    await admin.query(`CREATE CONSTRAINT TRIGGER binding_fault AFTER UPDATE ON ${schema}.hosted_ai_credit_issuances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_binding()`);
    try {
      await expect(bindHostedAiCreditIssuance(env, issuance.issuanceId, session)).rejects.toThrow(/binding commit fault/);
      expect(await saved()).toEqual(before);
    } finally {
      await admin.query(`DROP TRIGGER binding_fault ON ${schema}.hosted_ai_credit_issuances`);
      await admin.query(`DROP FUNCTION ${schema}.fail_binding()`);
    }
    await bindHostedAiCreditIssuance(env, issuance.issuanceId, session);
    const after = await saved();
    expect(after.issuances[0].checkout_session_id).toBe(session.id);
    expect(after.purchases).toHaveLength(0);
    expect(after.events).toHaveLength(0);
  });
  it("finds retained issuance by Session after metadata removal and rejects forged terms", async () => {
    const { issuance,session,purchase } = await original(); await bindHostedAiCreditIssuance(env,issuance.issuanceId,session);
    expect((await findHostedAiCreditIssuance(env,session.id,null))?.issuanceId).toBe(issuance.issuanceId);
    expect(await recordHostedAiCreditPurchase(env,{...purchase,checkoutProof:{...purchase.checkoutProof,metadata:null,clientReferenceId:null}})).toBe(true);
    const baseline=await saved();
    for (const change of [{ ownerId:"other" },{ stripeCustomerId:"cus_other" },{ amountPaidCents:1499 },{ creditedBudgetCents:999 },
      { checkoutProof:{...purchase.checkoutProof,livemode:true} }, { checkoutProof:{...purchase.checkoutProof,metadata:{purchaseKind:"ai-credit-pack",hostedOwnerId:"other",aiCreditCents:"9999"}} }]) {
      await expect(recordHostedAiCreditPurchase(env,{...purchase,...change,eventId:"evt_conflict"})).rejects.toThrow();
      expect(await saved()).toEqual(baseline);
    }
    await expect(findHostedAiCreditIssuance(env,"cs_test_unknown","tax_ai_credit_v1_00000000-0000-4000-8000-000000000000")).rejects.toThrow(/unknown/i);
  });
  it("rolls back binding grant and receipt on deferred PostgreSQL failure", async () => {
    const {purchase}=await original();const baseline=await saved();
    await admin.query(`CREATE FUNCTION ${schema}.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deferred fault'; END $$`);
    await admin.query(`CREATE CONSTRAINT TRIGGER fault AFTER INSERT ON ${schema}.hosted_billing_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_receipt()`);
    try { await expect(recordHostedAiCreditPurchase(env,purchase)).rejects.toThrow(/synthetic deferred/);expect(await saved()).toEqual(baseline); }
    finally {await admin.query(`DROP TRIGGER fault ON ${schema}.hosted_billing_events`);await admin.query(`DROP FUNCTION ${schema}.fail_receipt()`);}
    expect(await recordHostedAiCreditPurchase(env,purchase)).toBe(true);
  });
  it("preserves an existing historical purchase and draining legacy checkout", async () => {
    const {purchase}=await original(); const {checkoutProof: _proof,...legacy}=purchase;
    await admin.query(`INSERT INTO ${schema}.hosted_ai_credit_purchases(checkout_session_id,owner_id,stripe_customer_id,amount_paid_cents,credited_budget_cents,currency) VALUES($1,$2,$3,$4,$5,'usd')`,[legacy.checkoutSessionId,legacy.ownerId,legacy.stripeCustomerId,1500,1000]);
    expect(await recordHostedAiCreditPurchase(env,legacy)).toBe(false);
    expect(await recordHostedAiCreditPurchase(env,{...legacy,checkoutSessionId:"cs_old_instance",eventId:"evt_old_instance",amountPaidCents:2000,creditedBudgetCents:1700})).toBe(true);
    expect((await saved()).purchases).toHaveLength(2);
  });
  it("reconciles signed paid and unpaid deliveries by immutable Session identity", async () => {
    const {issuance,session}=await original();
    const webhookEnv={...env,STRIPE_WEBHOOK_SECRET:"whsec_issuance_fictional"};
    const handler=createHostedBillingWebhookRouteHandlers({env:webhookEnv,rateLimitStore:createRateLimitStore()});
    const send=(id:string,type:string,object:object)=>{
      const body=JSON.stringify({id,type,livemode:false,created:Math.floor(Date.now()/1000),data:{object}});
      return handler.POST(new Request("https://tax.example/webhook",{method:"POST",headers:{"content-type":"application/json","x-real-ip":"127.0.0.1",
        "stripe-signature":signHostedBillingWebhookPayload(body,webhookEnv.STRIPE_WEBHOOK_SECRET)},body}));
    };
    expect((await send("evt_pending","checkout.session.completed",{...session,payment_status:"unpaid",url:null})).status).toBe(200);
    const pending=await saved();expect(pending.events).toHaveLength(0);expect(pending.purchases).toHaveLength(0);
    expect(pending.issuances[0].checkout_session_id).toBe(session.id);
    expect((await send("evt_paid","checkout.session.async_payment_succeeded",{...session,payment_status:"paid",metadata:null,client_reference_id:null})).status).toBe(200);
    const paid=await saved();expect(paid.purchases).toHaveLength(1);expect(paid.purchases[0].credited_budget_cents).toBe(1000);
    expect((await send("evt_forged","checkout.session.completed",{...session,payment_status:"paid",metadata:{purchaseKind:"ai-credit-pack",hostedOwnerId:"other",aiCreditCents:"100000"}})).status).toBe(503);
    expect(await saved()).toEqual(paid);
    expect((await send("evt_unknown","checkout.session.completed",{...session,id:"cs_test_unknown",client_reference_id:issuance.issuanceId,payment_status:"paid"})).status).toBe(503);
    expect(await saved()).toEqual(paid);
    // A newly signed old event timestamp cannot make an unknown namespace legacy.
    expect((await send("evt_unknown_reference","checkout.session.completed",{...session,id:"cs_test_unissued",created:1,client_reference_id:"tax_ai_credit_v1_unknown",payment_status:"paid",metadata:{purchaseKind:"ai-credit-pack",hostedOwnerId:terms.ownerId,aiCreditCents:"1000"}})).status).toBe(503);
    expect(await saved()).toEqual(paid);
    // Old-instance URLs have no new namespace and keep their signed original
    // terms even after the current offer changes or metadata-schema migration.
    const legacySession={...session,id:"cs_legacy_original",client_reference_id:null,created:1,payment_status:"paid",
      metadata:{purchaseKind:"ai-credit-pack",hostedOwnerId:terms.ownerId,aiCreditCents:"750"},amount_total:1100};
    expect((await send("evt_legacy_original","checkout.session.completed",legacySession)).status).toBe(200);
    expect((await saved()).purchases.find(p=>p.checkout_session_id==="cs_legacy_original")).toMatchObject({amount_paid_cents:1100,credited_budget_cents:750});
  });
  it("retains original intent across a terminated connection and rejects reused event identity", async () => {
    const {purchase}=await original();const baseline=await saved();
    await admin.query(`CREATE FUNCTION ${schema}.disconnect_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER disconnect_credit BEFORE INSERT ON ${schema}.hosted_ai_credit_purchases FOR EACH ROW EXECUTE FUNCTION ${schema}.disconnect_credit()`);
    try {await expect(recordHostedAiCreditPurchase(env,purchase)).rejects.toThrow();expect(await saved()).toEqual(baseline);}
    finally {await admin.query(`DROP TRIGGER disconnect_credit ON ${schema}.hosted_ai_credit_purchases`);await admin.query(`DROP FUNCTION ${schema}.disconnect_credit()`);}
    expect(await recordHostedAiCreditPurchase(env,purchase)).toBe(true);
    const {purchase:second}=await original();const savedBefore=await saved();
    await expect(recordHostedAiCreditPurchase(env,{...second,checkoutSessionId:"cs_test_second"})).rejects.toThrow(/conflict/i);
    expect(await saved()).toEqual(savedBefore);
  });
  it("prunes only a bounded batch of old unbound intents and preserves paid recovery", async () => {
    const {issuance,session,purchase}=await original();await bindHostedAiCreditIssuance(env,issuance.issuanceId,session);
    const {issuance:recent}=await original();
    await admin.query(`INSERT INTO ${schema}.hosted_ai_credit_issuances(issuance_id,owner_id,stripe_customer_id,amount_paid_cents,credited_budget_cents,livemode,created_at,expires_at) SELECT 'tax_ai_credit_v1_' || md5(n::text), 'old_owner','cus_old',1500,1000,false,NOW()-INTERVAL '40 days',NOW()-INTERVAL '39 days' FROM generate_series(1,105) n`);
    expect(await pruneHostedAiCreditIssuances(env)).toBe(100);
    expect((await saved()).issuances).toHaveLength(7);
    expect(await pruneHostedAiCreditIssuances(env)).toBe(5);
    expect((await findHostedAiCreditIssuance(env,session.id,issuance.issuanceId))?.issuanceId).toBe(issuance.issuanceId);
    expect((await findHostedAiCreditIssuance(env,"cs_test_unbound",recent.issuanceId))?.checkoutSessionId).toBeNull();
    expect(await recordHostedAiCreditPurchase(env,purchase)).toBe(true);
    await expect(findHostedAiCreditIssuance(env,"cs_test_unknown","tax_ai_credit_v1_missing")).rejects.toThrow(/unknown/i);
  });
  it("skips a binding lock during cleanup and settles the retained expired Session", async () => {
    const issuanceId = `tax_ai_credit_v1_${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000) - 40 * 24 * 60 * 60;
    const expiresAt = created + 3600;
    await admin.query(`INSERT INTO ${schema}.hosted_ai_credit_issuances
      (issuance_id,owner_id,stripe_customer_id,amount_paid_cents,credited_budget_cents,livemode,created_at,expires_at)
      VALUES ($1,$2,$3,1500,1000,false,to_timestamp($4),to_timestamp($5))`,
    [issuanceId, terms.ownerId, terms.stripeCustomerId, created, expiresAt]);
    const lock = await admin.connect();
    try {
      await lock.query("BEGIN");
      await lock.query(`SELECT issuance_id FROM ${schema}.hosted_ai_credit_issuances WHERE issuance_id=$1 FOR UPDATE`, [issuanceId]);
      expect(await pruneHostedAiCreditIssuances(env)).toBe(0);
      await lock.query(`UPDATE ${schema}.hosted_ai_credit_issuances SET checkout_session_id='cs_test_late' WHERE issuance_id=$1`, [issuanceId]);
      await lock.query("COMMIT");
    } catch (error) {
      await lock.query("ROLLBACK");
      throw error;
    } finally {
      lock.release();
    }
    expect(await pruneHostedAiCreditIssuances(env)).toBe(0);
    expect(await recordHostedAiCreditPurchase(env, {
      ...terms, checkoutSessionId: "cs_test_late", currency: "usd", createdAt: new Date().toISOString(),
      eventId: "evt_late", eventType: "checkout.session.async_payment_succeeded",
      checkoutProof: { clientReferenceId: issuanceId, livemode: false, created, expiresAt, amountSubtotal: 1500, metadata: null }
    })).toBe(true);
    expect((await saved()).purchases).toHaveLength(1);
  });
});
