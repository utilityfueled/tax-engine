import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureHostedAppSchema, getHostedServerDatabase, getHostedServerDatabaseConfig } from "./hosted-server-db";
import { isPositiveHostedCreditCents } from "./hosted-ai-helper-billing";

type Environment = Record<string, string | undefined>;
export const HOSTED_AI_CREDIT_KIND = "ai-credit-issuance-v1";
const REFERENCE_PREFIX = "tax_ai_credit_";
export const hasHostedAiCreditReference = (value: unknown): value is string => typeof value === "string" && value.startsWith(REFERENCE_PREFIX);
export const isHostedCheckoutSessionId = (value: unknown): value is string => typeof value === "string" && /^cs_[A-Za-z0-9_]{1,255}$/.test(value);
export const isIssuedHostedCheckoutSessionId = (value: unknown, livemode: boolean): value is string =>
  isHostedCheckoutSessionId(value) && value.startsWith(livemode ? "cs_live_" : "cs_test_");
export function isHostedCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string" || /\s/.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value);
    // The URL comes from Stripe, not a request parameter. Stripe supports custom
    // Checkout domains; HTTPS and no embedded credentials apply to either host.
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
export interface HostedAiCreditTerms {
  ownerId: string;
  stripeCustomerId: string;
  livemode: boolean;
  amountPaidCents: number;
  creditedBudgetCents: number;
}
export interface HostedAiCreditIssuance extends HostedAiCreditTerms {
  issuanceId: string;
  checkoutSessionId: string | null;
  expiresAt: number;
}
export interface HostedAiCreditCheckoutProof {
  clientReferenceId: string | null;
  livemode: boolean;
  created: number;
  expiresAt: number;
  amountSubtotal: number | null;
  metadata: Record<string,string> | null;
}
interface IssuanceRow {
  issuance_id: string; checkout_session_id: string | null; owner_id: string; stripe_customer_id: string;
  livemode: boolean; amount_paid_cents: number; credited_budget_cents: number; expires_at: Date;
}
function fromRow(row: IssuanceRow): HostedAiCreditIssuance {
  return { issuanceId: row.issuance_id, checkoutSessionId: row.checkout_session_id, ownerId: row.owner_id,
    stripeCustomerId: row.stripe_customer_id, livemode: row.livemode, amountPaidCents: row.amount_paid_cents,
    creditedBudgetCents: row.credited_budget_cents, expiresAt: row.expires_at.getTime()/1000 };
}
function validTerms(terms: HostedAiCreditTerms) {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(terms.ownerId) && /^cus_[A-Za-z0-9_]{1,255}$/.test(terms.stripeCustomerId)
    && typeof terms.livemode === "boolean" && isPositiveHostedCreditCents(terms.amountPaidCents)
    && isPositiveHostedCreditCents(terms.creditedBudgetCents);
}
async function lookup(client: Pick<PoolClient,"query">, sessionId: string, reference: string | null, lock: boolean) {
  const { rows } = await client.query<IssuanceRow>(`SELECT * FROM hosted_ai_credit_issuances
    WHERE checkout_session_id = $1 OR issuance_id = $2 ${lock ? "FOR UPDATE" : ""}`, [sessionId,reference]);
  if (rows.length > 1) throw new Error("Checkout issuance conflict.");
  if (!rows[0]) {
    if (hasHostedAiCreditReference(reference)) throw new Error("Unknown Checkout issuance.");
    return null;
  }
  const original = fromRow(rows[0]);
  if ((reference !== null && reference !== original.issuanceId)
    || (original.checkoutSessionId !== null && original.checkoutSessionId !== sessionId)) throw new Error("Checkout issuance conflict.");
  return original;
}
export async function findHostedAiCreditIssuance(env: Environment, sessionId: string, reference: string | null) {
  if (!getHostedServerDatabaseConfig(env).databaseUrl) {
    if (hasHostedAiCreditReference(reference)) throw new Error("Checkout issuance storage unavailable.");
    return null;
  }
  await ensureHostedAppSchema(env);
  const {pool}=await getHostedServerDatabase(env);
  return lookup(pool,sessionId,reference,false);
}
export async function pruneHostedAiCreditIssuances(env: Environment) {
  await ensureHostedAppSchema(env);
  const {pool}=await getHostedServerDatabase(env);
  const result=await pool.query(`WITH abandoned AS (
    SELECT issuance_id FROM hosted_ai_credit_issuances WHERE checkout_session_id IS NULL
      AND expires_at < NOW()-INTERVAL '32 days' ORDER BY expires_at,issuance_id LIMIT 100 FOR UPDATE SKIP LOCKED
    ) DELETE FROM hosted_ai_credit_issuances i USING abandoned a
      WHERE i.issuance_id=a.issuance_id AND i.checkout_session_id IS NULL RETURNING i.issuance_id`);
  return result.rowCount ?? 0;
}
export async function createHostedAiCreditIssuance(env: Environment, terms: HostedAiCreditTerms): Promise<HostedAiCreditIssuance> {
  if (!validTerms(terms)) throw new Error("Invalid Checkout issuance terms.");
  await ensureHostedAppSchema(env);
  await pruneHostedAiCreditIssuances(env);
  const {pool}=await getHostedServerDatabase(env);
  const {rows}=await pool.query<IssuanceRow>(`INSERT INTO hosted_ai_credit_issuances
    (issuance_id,owner_id,stripe_customer_id,livemode,amount_paid_cents,credited_budget_cents,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,to_timestamp(floor(extract(epoch FROM clock_timestamp()))+3600)) RETURNING *`,
    [`${REFERENCE_PREFIX}v1_${randomUUID()}`,terms.ownerId,terms.stripeCustomerId,terms.livemode,terms.amountPaidCents,terms.creditedBudgetCents]);
  return fromRow(rows[0]);
}
export interface HostedAiCreditSettlementTerms {
  checkoutSessionId: string; ownerId: string; stripeCustomerId: string | null;
  amountPaidCents: number; creditedBudgetCents: number; currency: string;
  checkoutProof?: HostedAiCreditCheckoutProof;
}
// Called inside the grant/receipt transaction, including replay. A read used to
// route the webhook never substitutes for this locked comparison.
export async function validateAndBindHostedAiCreditIssuance(client: PoolClient, input: HostedAiCreditSettlementTerms) {
  const proof=input.checkoutProof;
  const original=await lookup(client,input.checkoutSessionId,proof?.clientReferenceId ?? null,true);
  if (!original) {
    if (proof?.metadata?.purchaseKind === HOSTED_AI_CREDIT_KIND) throw new Error("Unknown Checkout issuance.");
    return; // Existing unmarked legacy terms remain the authenticated authority.
  }
  const metadata=proof?.metadata;
  if (!proof || !isIssuedHostedCheckoutSessionId(input.checkoutSessionId, original.livemode)
    || original.ownerId!==input.ownerId || original.stripeCustomerId!==input.stripeCustomerId
    || original.livemode!==proof.livemode || original.amountPaidCents!==input.amountPaidCents
    || original.creditedBudgetCents!==input.creditedBudgetCents || input.currency!=="usd"
    || proof.amountSubtotal!==original.amountPaidCents || proof.expiresAt!==original.expiresAt
    || !Number.isSafeInteger(proof.created) || proof.created<=0 || proof.created>=original.expiresAt
    || (metadata?.purchaseKind !== undefined && metadata.purchaseKind!==HOSTED_AI_CREDIT_KIND)
    || (metadata?.hostedOwnerId !== undefined && metadata.hostedOwnerId!==original.ownerId)
    || (metadata?.workspaceOwnerId !== undefined && metadata.workspaceOwnerId!==original.ownerId)
    || (metadata?.aiCreditCents !== undefined && metadata.aiCreditCents!==String(original.creditedBudgetCents))) {
    throw new Error("Checkout issuance facts conflict with the original terms.");
  }
  if (original.checkoutSessionId===null) await client.query(`UPDATE hosted_ai_credit_issuances SET checkout_session_id=$2 WHERE issuance_id=$1`,[original.issuanceId,input.checkoutSessionId]);
}
export interface HostedAiCreditCreatedSession {
  id: string; object: string; mode: string | null; customer: unknown; client_reference_id: string | null;
  livemode: boolean; currency: string | null; amount_subtotal: number | null; amount_total: number | null;
  created: number; expires_at: number; metadata: Record<string,string> | null; url: string | null;
}
export async function bindHostedAiCreditIssuance(env: Environment, issuanceId: string, session: HostedAiCreditCreatedSession) {
  if (!isIssuedHostedCheckoutSessionId(session.id, session.livemode) || !isHostedCheckoutUrl(session.url)
    || session.object!=="checkout.session" || session.mode!=="payment" || session.client_reference_id!==issuanceId) {
    throw new Error("Invalid issued Checkout Session.");
  }
  await ensureHostedAppSchema(env);
  const {pool}=await getHostedServerDatabase(env);const client=await pool.connect();let discard=false;
  const lost=()=>{discard=true;};client.on("error",lost);
  try {
    await client.query("BEGIN");
    const original=await lookup(client,session.id,issuanceId,true);
    if (!original || session.customer!==original.stripeCustomerId) throw new Error("Checkout issuance customer conflict.");
    await validateAndBindHostedAiCreditIssuance(client,{checkoutSessionId:session.id,ownerId:original.ownerId,
      stripeCustomerId:original.stripeCustomerId,amountPaidCents:session.amount_total ?? -1,
      creditedBudgetCents:original.creditedBudgetCents,currency:session.currency ?? "",
      checkoutProof:{clientReferenceId:session.client_reference_id,livemode:session.livemode,created:session.created,
        expiresAt:session.expires_at,amountSubtotal:session.amount_subtotal,metadata:session.metadata}});
    if(discard)throw new Error("Checkout issuance connection lost.");
    await client.query("COMMIT");
  } catch(error) {try {await client.query("ROLLBACK");}catch {discard=true;}throw error;}
  finally {try {client.release(discard);}finally {client.removeListener("error",lost);}}
}

// Preserve a verified unpaid completion after response loss so bounded abandoned
// intent cleanup cannot discard a real Session awaiting delayed payment.
export async function retainHostedAiCreditCheckout(env: Environment, input: HostedAiCreditSettlementTerms) {
  await ensureHostedAppSchema(env);
  const {pool}=await getHostedServerDatabase(env);const client=await pool.connect();let discard=false;
  const lost=()=>{discard=true;};client.on("error",lost);
  try {
    await client.query("BEGIN");
    if (!input.checkoutProof) throw new Error("Missing original Checkout proof.");
    await validateAndBindHostedAiCreditIssuance(client,input);
    if(discard)throw new Error("Checkout issuance connection lost.");
    await client.query("COMMIT");
  } catch(error) {try {await client.query("ROLLBACK");}catch {discard=true;}throw error;}
  finally {try {client.release(discard);}finally {client.removeListener("error",lost);}}
}
