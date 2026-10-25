import Decimal from "decimal.js";
import type { Pool, PoolClient } from "pg";
import { calculateAiCost, type AiTokenUsage } from "@tax-engine/engine/src/ai-pricing";
import { AI_PROFILES, AI_TASKS, type AiProfileId, type AiTask } from "@tax-engine/engine/src/ai-task-registry";

const Money = Decimal.clone({ precision: 80 });

type State = "reserved" | "running" | "reconciliation-required" | "settled" | "cancelled" | "refunded";
interface ReservationRow {
  owner_id: string; request_id: string; payload_digest: string; cycle_key: string;
  included_budget_cents: string; included_reserved_cents: string; purchased_reserved_cents: string;
  included_charge_cents: string; purchased_charge_cents: string; state: State; refund_reference: string | null;
}
interface AttemptRow {
  attempt: number; state: "running" | "unknown" | "accepted" | "rejected";
  model_id: string; started_at: Date; usage: AiTokenUsage | null; provider_cost_usd: string | null;
}
export interface AiReservationIdentity { ownerId: string; requestId: string }
export interface ReserveAiCreditsInput extends AiReservationIdentity {
  payloadDigest: string; cycleKey: string; includedBudgetCents: number; maximumChargeCents: number;
}

function cents(value: Decimal.Value): number {
  const amount = new Money(value);
  if (!amount.isFinite() || amount.isNegative() || !amount.isInteger() || amount.gt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("AI ledger cents must be nonnegative safe integers.");
  }
  return amount.toNumber();
}
function identity(input: AiReservationIdentity) {
  if (!input.ownerId.trim() || !input.requestId.trim() || input.requestId.length > 256) throw new Error("Invalid AI ledger identity.");
}
function view(row: ReservationRow) {
  return { ownerId: row.owner_id, requestId: row.request_id, state: row.state,
    reservedCents: cents(new Money(row.included_reserved_cents).plus(row.purchased_reserved_cents)),
    chargedCents: cents(new Money(row.included_charge_cents).plus(row.purchased_charge_cents)) };
}

/** All balance-changing operations serialize on the owner, across billing cycles and requests. */
export function createHostedAiLedger(pool: Pick<Pool, "connect">) {
  async function transaction<T>(ownerId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2026))", [ownerId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async function row(client: PoolClient, input: AiReservationIdentity) {
    const result = await client.query<ReservationRow>(
      "SELECT * FROM hosted_ai_reservations WHERE owner_id = $1 AND request_id = $2 FOR UPDATE", [input.ownerId, input.requestId]);
    if (!result.rows[0]) throw new Error("AI reservation not found for this owner.");
    return result.rows[0];
  }
  async function balance(client: PoolClient, ownerId: string, cycleKey: string, includedBudgetCents: number) {
    const result = await client.query<{ purchased: string; included_used: string; purchased_used: string }>(`
      SELECT
        (SELECT COALESCE(SUM(credited_budget_cents),0) FROM hosted_ai_credit_purchases WHERE owner_id=$1) AS purchased,
        (SELECT COALESCE(SUM(included_charge_cents),0) FROM hosted_ai_usage_ledger WHERE owner_id=$1 AND cycle_key=$2)
          + (SELECT COALESCE(SUM(included_charge_cents - included_refund_cents + included_reserved_cents),0) FROM hosted_ai_reservations WHERE owner_id=$1 AND cycle_key=$2) AS included_used,
        (SELECT COALESCE(SUM(purchased_charge_cents),0) FROM hosted_ai_usage_ledger WHERE owner_id=$1)
          + (SELECT COALESCE(SUM(purchased_charge_cents - purchased_refund_cents + purchased_reserved_cents),0) FROM hosted_ai_reservations WHERE owner_id=$1) AS purchased_used
    `, [ownerId, cycleKey]);
    const values = result.rows[0];
    return {
      included: Money.max(0, new Money(includedBudgetCents).minus(values.included_used)),
      purchased: Money.max(0, new Money(values.purchased).minus(values.purchased_used)),
    };
  }
  return {
    async reserve(input: ReserveAiCreditsInput) {
      identity(input); cents(input.includedBudgetCents); cents(input.maximumChargeCents);
      if (input.maximumChargeCents === 0 || !/^[a-f0-9]{64}$/.test(input.payloadDigest) || !input.cycleKey.trim()) throw new Error("Invalid AI reservation.");
      return transaction(input.ownerId, async client => {
        const existing = await client.query<ReservationRow>("SELECT * FROM hosted_ai_reservations WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
        if (existing.rows[0]) {
          if (existing.rows[0].payload_digest !== input.payloadDigest) throw new Error("AI idempotency key was reused for different content.");
          return { accepted: true as const, created: false, reservation: view(existing.rows[0]) };
        }
        const available = await balance(client, input.ownerId, input.cycleKey, input.includedBudgetCents);
        if (available.included.plus(available.purchased).lt(input.maximumChargeCents)) return { accepted: false as const, created: false, reservation: null };
        const included = Money.min(available.included, input.maximumChargeCents);
        const purchased = new Money(input.maximumChargeCents).minus(included);
        const result = await client.query<ReservationRow>(`INSERT INTO hosted_ai_reservations
          (owner_id, request_id, payload_digest, cycle_key, included_budget_cents, included_reserved_cents, purchased_reserved_cents, state)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved') RETURNING *`,
        [input.ownerId, input.requestId, input.payloadDigest, input.cycleKey, input.includedBudgetCents, included.toFixed(), purchased.toFixed()]);
        return { accepted: true as const, created: true, reservation: view(result.rows[0]) };
      });
    },
    async start(input: AiReservationIdentity & { attempt: 1 | 2; task: AiTask; profileId: AiProfileId; startedAt: string }) {
      identity(input);
      const profile = AI_PROFILES[input.profileId];
      if (!profile || !AI_TASKS[input.task] || !Number.isFinite(Date.parse(input.startedAt))) throw new Error("Invalid AI attempt.");
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        const previous = await client.query<AttemptRow>("SELECT * FROM hosted_ai_attempts WHERE owner_id=$1 AND request_id=$2 ORDER BY attempt", [input.ownerId, input.requestId]);
        if (previous.rows.some(entry => entry.attempt === input.attempt)) return false;
        if (reservation.state !== "reserved" || previous.rows.length !== input.attempt - 1) throw new Error("AI reservation is not ready for this attempt.");
        if (input.attempt === 2 && (input.profileId !== "sol-high" || previous.rows[0]?.state !== "rejected")) throw new Error("Only one explicit Sol High escalation after known rejection is allowed.");
        await client.query(`INSERT INTO hosted_ai_attempts (owner_id, request_id, attempt, task, profile_id, model_id, state, started_at)
          VALUES ($1,$2,$3,$4,$5,$6,'running',$7::timestamptz)`, [input.ownerId, input.requestId, input.attempt, input.task, input.profileId, profile.model, input.startedAt]);
        await client.query("UPDATE hosted_ai_reservations SET state='running',updated_at=NOW() WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
        return true;
      });
    },
    /** Unknown transport/provider failures retain the hold until authoritative usage is reconciled. */
    async unknown(input: AiReservationIdentity & { attempt: 1 | 2; providerRequestId?: string }) {
      identity(input);
      return transaction(input.ownerId, async client => {
        await row(client, input);
        const result = await client.query("UPDATE hosted_ai_attempts SET state='unknown',provider_request_id=$4 WHERE owner_id=$1 AND request_id=$2 AND attempt=$3 AND state='running' RETURNING attempt", [input.ownerId, input.requestId, input.attempt, input.providerRequestId ?? null]);
        if (result.rowCount) await client.query("UPDATE hosted_ai_reservations SET state='reconciliation-required',updated_at=NOW() WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
      });
    },
    async settle(input: AiReservationIdentity & { attempt: 1 | 2; usage: AiTokenUsage; accepted: boolean; final: boolean; reconciliationReference?: string; providerRequestId?: string }) {
      identity(input);
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        const attempts = await client.query<AttemptRow>("SELECT * FROM hosted_ai_attempts WHERE owner_id=$1 AND request_id=$2 ORDER BY attempt", [input.ownerId, input.requestId]);
        const attempt = attempts.rows.find(entry => entry.attempt === input.attempt);
        if (!attempt) throw new Error("AI attempt was not started.");
        const cost = calculateAiCost(attempt.model_id, attempt.started_at.toISOString(), input.usage);
        if (attempt.provider_cost_usd !== null) {
          if ((attempt.state === "accepted") !== input.accepted) throw new Error("Conflicting AI settlement replay.");
          if (!new Money(attempt.provider_cost_usd).eq(cost.providerCostUsd) || JSON.stringify(attempt.usage) !== JSON.stringify(input.usage)) {
            // JSONB key order is not stable; compare by canonical sorted keys below.
            const canonical = (usage: AiTokenUsage | null) => JSON.stringify(Object.entries(usage ?? {}).sort(([a], [b]) => a.localeCompare(b)));
            if (!new Money(attempt.provider_cost_usd).eq(cost.providerCostUsd) || canonical(attempt.usage) !== canonical(input.usage)) throw new Error("Conflicting AI settlement replay.");
          }
          if (!input.final || reservation.state !== "reserved") return view(reservation);
        }
        if (attempt.state === "unknown" && !input.reconciliationReference?.trim()) throw new Error("Unknown usage requires an authoritative reconciliation reference.");
        if (!input.final && (input.accepted || input.attempt === 2)) throw new Error("Only a rejected first attempt may escalate.");
        if (attempt.provider_cost_usd === null) await client.query(`UPDATE hosted_ai_attempts SET state=$4,usage=$5::jsonb,provider_cost_usd=$6,pricing_effective_from=$7,
          provider_request_id=$8,reconciliation_reference=$9,completed_at=NOW() WHERE owner_id=$1 AND request_id=$2 AND attempt=$3`,
        [input.ownerId, input.requestId, input.attempt, input.accepted ? "accepted" : "rejected", JSON.stringify(input.usage), cost.providerCostUsd,
          cost.pricingEffectiveFrom, input.providerRequestId ?? null, input.reconciliationReference ?? null]);
        if (!input.final) {
          await client.query("UPDATE hosted_ai_reservations SET state='reserved',updated_at=NOW() WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
          return view({ ...reservation, state: "reserved" });
        }
        const totalCost = attempts.rows.reduce((sum, entry) => sum.plus(entry.attempt === input.attempt ? cost.providerCostUsd : entry.provider_cost_usd ?? "0"), new Money(0));
        const retail = Money.max(1, totalCost.times(100).ceil());
        const reserved = new Money(reservation.included_reserved_cents).plus(reservation.purchased_reserved_cents);
        // Provider overruns are retained exactly. Never debit more than the authorized hold.
        const charge = Money.min(reserved, retail);
        const includedCharge = Money.min(reservation.included_reserved_cents, charge);
        const purchasedCharge = charge.minus(includedCharge);
        const result = await client.query<ReservationRow>(`UPDATE hosted_ai_reservations SET
          state=$3,included_reserved_cents=0,purchased_reserved_cents=0,included_charge_cents=$4,purchased_charge_cents=$5,updated_at=NOW()
          WHERE owner_id=$1 AND request_id=$2 RETURNING *`, [input.ownerId, input.requestId, retail.gt(reserved) ? "reconciliation-required" : "settled", includedCharge.toFixed(), purchasedCharge.toFixed()]);
        return view(result.rows[0]);
      });
    },
    /** Only an unstarted reservation is cancellable without provider reconciliation. */
    async cancel(input: AiReservationIdentity) {
      identity(input);
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        if (reservation.state === "cancelled") return view(reservation);
        const attempts = await client.query("SELECT attempt FROM hosted_ai_attempts WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
        if (reservation.state !== "reserved" || attempts.rowCount) throw new Error("Started AI work must be settled or reconciled before release.");
        const result = await client.query<ReservationRow>("UPDATE hosted_ai_reservations SET state='cancelled',included_reserved_cents=0,purchased_reserved_cents=0,updated_at=NOW() WHERE owner_id=$1 AND request_id=$2 RETURNING *", [input.ownerId, input.requestId]);
        return view(result.rows[0]);
      });
    },
    /** Operator-only financial adjustment. Exact provider costs and attempt history remain immutable. */
    async refund(input: AiReservationIdentity & { reference: string }) {
      identity(input);
      if (!input.reference.trim()) throw new Error("Refund authorization reference is required.");
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        if (reservation.state === "refunded") {
          if (reservation.refund_reference !== input.reference) throw new Error("Conflicting refund replay.");
          return view(reservation);
        }
        if (reservation.state !== "settled") throw new Error("Only settled AI usage can be refunded.");
        const result = await client.query<ReservationRow>("UPDATE hosted_ai_reservations SET state='refunded',included_refund_cents=included_charge_cents,purchased_refund_cents=purchased_charge_cents,refund_reference=$3,updated_at=NOW() WHERE owner_id=$1 AND request_id=$2 RETURNING *", [input.ownerId, input.requestId, input.reference]);
        return view(result.rows[0]);
      });
    },
  };
}
