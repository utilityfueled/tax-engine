import Decimal from "decimal.js";
import type { Pool, PoolClient } from "pg";
import { calculateAiCost, maximumAiRequestCost, type AiTokenUsage } from "@tax-engine/engine/src/ai-pricing";
import { AI_PROFILES, AI_TASKS, type AiProfileId, type AiTask } from "@tax-engine/engine/src/ai-task-registry";
import { normalizedReconciliationReferenceSql } from "./hosted-ai-ledger-schema";
import { withHostedAiStorageMode, type StripeBillingMode } from "./hosted-ai-storage-mode";

const Money = Decimal.clone({ precision: 80 });

type State = "reserved" | "running" | "reconciliation-required" | "settled" | "cancelled" | "refunded";
interface ReservationRow {
  owner_id: string; request_id: string; payload_digest: string; cycle_key: string;
  included_budget_cents: string; included_reserved_cents: string; purchased_reserved_cents: string;
  included_charge_cents: string; purchased_charge_cents: string; state: State; refund_reference: string | null;
  reconciliation_reference: string | null;
}
interface AttemptRow {
  attempt: number; state: "running" | "unknown" | "accepted" | "rejected";
  model_id: string; started_at: Date; usage: AiTokenUsage | null; provider_cost_usd: string | null;
  provider_request_id: string | null; reconciliation_reference: string | null;
  undispatched_at: Date | null;
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
function reservedCreditCents(row: ReservationRow) {
  return new Money(row.included_reserved_cents).plus(row.purchased_reserved_cents);
}
function view(row: ReservationRow) {
  return { ownerId: row.owner_id, requestId: row.request_id, state: row.state,
    reservedCents: cents(reservedCreditCents(row)),
    chargedCents: cents(new Money(row.included_charge_cents).plus(row.purchased_charge_cents)) };
}

/** All balance-changing operations serialize on the owner, across billing cycles and requests. */
export function createHostedAiLedger(pool: Pick<Pool, "connect">, mode: StripeBillingMode) {
  async function transaction<T>(ownerId: string, operation: (client: PoolClient) => Promise<T>, initialize = false): Promise<T> {
    return withHostedAiStorageMode(pool, mode, initialize, async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2026))", [ownerId]);
      return operation(client);
    });
  }
  async function row(client: PoolClient, input: AiReservationIdentity) {
    const result = await client.query<ReservationRow>(
      "SELECT * FROM hosted_ai_reservations WHERE owner_id = $1 AND request_id = $2 FOR UPDATE", [input.ownerId, input.requestId]);
    if (!result.rows[0]) throw new Error("AI reservation not found for this owner.");
    return result.rows[0];
  }
  async function attemptsFor(client: PoolClient, input: AiReservationIdentity) {
    const result = await client.query<AttemptRow>(
      "SELECT * FROM hosted_ai_attempts WHERE owner_id=$1 AND request_id=$2 ORDER BY attempt", [input.ownerId, input.requestId]);
    return result.rows;
  }
  async function claimReconciliationReference(client: PoolClient, reference: string) {
    // The two-key lock namespace is separate from the single-key owner locks.
    await client.query("SELECT pg_advisory_xact_lock(2026, hashtext($1))", [reference]);
    const used = await client.query(`SELECT 1 FROM hosted_ai_attempts
      WHERE reconciliation_reference IS NOT NULL
        AND md5(${normalizedReconciliationReferenceSql}) = md5($1::text)
        AND ${normalizedReconciliationReferenceSql} COLLATE "C" = $1 LIMIT 1`, [reference]);
    if (used.rowCount) throw new Error("Authoritative reconciliation reference already verifies another AI attempt.");
  }
  async function finalize(client: PoolClient, reservation: ReservationRow, totalCost: Decimal) {
    const retail = Money.max(1, totalCost.times(100).ceil());
    const reserved = reservedCreditCents(reservation);
    // Provider overruns are retained exactly. Never debit more than the authorized hold.
    const charge = Money.min(reserved, retail);
    const includedCharge = Money.min(reservation.included_reserved_cents, charge);
    const purchasedCharge = charge.minus(includedCharge);
    const result = await client.query<ReservationRow>(`UPDATE hosted_ai_reservations SET
      state=$3,included_reserved_cents=0,purchased_reserved_cents=0,included_charge_cents=$4,purchased_charge_cents=$5,updated_at=NOW()
      WHERE owner_id=$1 AND request_id=$2 RETURNING *`, [reservation.owner_id, reservation.request_id,
      retail.gt(reserved) ? "reconciliation-required" : "settled", includedCharge.toFixed(), purchasedCharge.toFixed()]);
    return view(result.rows[0]);
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
      }, true);
    },
    async start(input: AiReservationIdentity & { attempt: 1 | 2; task: AiTask; profileId: AiProfileId; startedAt: string }) {
      identity(input);
      const profile = AI_PROFILES[input.profileId];
      const policy = AI_TASKS[input.task];
      if (!profile || !policy || !Number.isFinite(Date.parse(input.startedAt))) throw new Error("Invalid AI attempt.");
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        const previous = await attemptsFor(client, input);
        if (previous.some(entry => entry.attempt === input.attempt)) return false;
        const ready = reservation.state === "reserved" && previous.length === input.attempt - 1;
        if (input.attempt === 2 && previous.length === 1) {
          const first = previous[0];
          if (input.profileId !== "sol-high" || first?.state !== "rejected" || first.provider_cost_usd === null
            || first.usage === null || first.undispatched_at) throw new Error("Only one explicit Sol High escalation after known rejection is allowed.");
          const heldCents = reservedCreditCents(reservation);
          if (heldCents.isZero() && (reservation.state === "settled" || reservation.state === "reconciliation-required")) {
            return "insufficient-hold" as const;
          }
          if (ready) {
            const firstCost = new Money(first.provider_cost_usd);
            const secondBound = maximumAiRequestCost(profile.model, input.startedAt, policy.maxInputTokens, policy.maxOutputTokens);
            if (firstCost.plus(secondBound.providerCostUsd).times(100).ceil().gt(heldCents)) {
              await finalize(client, reservation, firstCost);
              return "insufficient-hold" as const;
            }
          }
        }
        if (!ready) throw new Error("AI reservation is not ready for this attempt.");
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
        const values = [input.ownerId, input.requestId, input.attempt];
        const result = await client.query<Pick<AttemptRow, "state" | "provider_request_id">>(
          "SELECT state,provider_request_id FROM hosted_ai_attempts WHERE owner_id=$1 AND request_id=$2 AND attempt=$3", values);
        const attempt = result.rows[0];
        if (!attempt || (attempt.state !== "running" && attempt.state !== "unknown")) return;
        if (input.providerRequestId && attempt.provider_request_id && input.providerRequestId !== attempt.provider_request_id) {
          throw new Error("Conflicting AI provider request identifier.");
        }
        if (attempt.state === "unknown" && (!input.providerRequestId || attempt.provider_request_id)) return;
        await client.query("UPDATE hosted_ai_attempts SET state='unknown',provider_request_id=$4 WHERE owner_id=$1 AND request_id=$2 AND attempt=$3",
          [...values, attempt.provider_request_id ?? input.providerRequestId ?? null]);
        if (attempt.state === "running") {
          await client.query("UPDATE hosted_ai_reservations SET state='reconciliation-required',updated_at=NOW() WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
        }
      });
    },
    async settle(input: AiReservationIdentity & { attempt: 1 | 2; usage: AiTokenUsage; accepted: boolean; final: boolean; reconciliationReference?: string; reconciledModelId?: string; providerRequestId?: string }) {
      identity(input);
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        const attempts = await attemptsFor(client, input);
        const attempt = attempts.find(entry => entry.attempt === input.attempt);
        if (!attempt) throw new Error("AI attempt was not started.");
        if (attempt.undispatched_at) throw new Error("AI attempt was never dispatched.");
        if (input.providerRequestId && attempt.provider_request_id && input.providerRequestId !== attempt.provider_request_id) {
          throw new Error("Conflicting AI provider request identifier.");
        }
        const isReconciliation = attempt.state === "unknown" || (attempt.provider_cost_usd === null
          && (input.reconciliationReference !== undefined || input.reconciledModelId !== undefined));
        const reference = input.reconciliationReference?.trim();
        if (isReconciliation && !reference) {
          throw new Error("Unknown usage requires an authoritative reconciliation reference.");
        }
        if ((isReconciliation || input.reconciledModelId !== undefined) && input.reconciledModelId !== attempt.model_id) {
          throw new Error("Reconciliation evidence must establish the authorized model.");
        }
        const cost = calculateAiCost(attempt.model_id, attempt.started_at.toISOString(), input.usage);
        if (attempt.provider_cost_usd !== null) {
          if (reference !== undefined && reference !== attempt.reconciliation_reference?.trim()) {
            throw new Error("Conflicting AI settlement reconciliation reference.");
          }
          if ((attempt.state === "accepted") !== input.accepted) throw new Error("Conflicting AI settlement replay.");
          if (!new Money(attempt.provider_cost_usd).eq(cost.providerCostUsd) || JSON.stringify(attempt.usage) !== JSON.stringify(input.usage)) {
            // JSONB key order is not stable; compare by canonical sorted keys below.
            const canonical = (usage: AiTokenUsage | null) => JSON.stringify(Object.entries(usage ?? {}).sort(([a], [b]) => a.localeCompare(b)));
            if (!new Money(attempt.provider_cost_usd).eq(cost.providerCostUsd) || canonical(attempt.usage) !== canonical(input.usage)) throw new Error("Conflicting AI settlement replay.");
          }
          if (!input.final || reservation.state !== "reserved") return view(reservation);
        }
        if (!input.final && (input.accepted || input.attempt === 2)) throw new Error("Only a rejected first attempt may escalate.");
        if (attempt.provider_cost_usd === null) {
          if (reference) await claimReconciliationReference(client, reference);
          await client.query(`UPDATE hosted_ai_attempts SET state=$4,usage=$5::jsonb,provider_cost_usd=$6,pricing_effective_from=$7,
            provider_request_id=$8,reconciliation_reference=$9,completed_at=NOW() WHERE owner_id=$1 AND request_id=$2 AND attempt=$3`,
          [input.ownerId, input.requestId, input.attempt, input.accepted ? "accepted" : "rejected", JSON.stringify(input.usage), cost.providerCostUsd,
            cost.pricingEffectiveFrom, attempt.provider_request_id ?? input.providerRequestId ?? null, reference ?? null]);
        }
        if (!input.final) {
          await client.query("UPDATE hosted_ai_reservations SET state='reserved',updated_at=NOW() WHERE owner_id=$1 AND request_id=$2", [input.ownerId, input.requestId]);
          return view({ ...reservation, state: "reserved" });
        }
        const totalCost = attempts.reduce((sum, entry) => sum.plus(entry.attempt === input.attempt ? cost.providerCostUsd : entry.provider_cost_usd ?? "0"), new Money(0));
        return finalize(client, reservation, totalCost);
      });
    },
    /** Only the live dispatch call site can attest that the provider transport was never invoked. */
    async cancelUndispatched(input: AiReservationIdentity & { attempt: 1 | 2 }) {
      identity(input);
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        const attempts = await attemptsFor(client, input);
        const attempt = attempts.find(entry => entry.attempt === input.attempt);
        if (attempt?.undispatched_at) return view(reservation);
        if (reservation.state !== "running" || attempt?.state !== "running" || attempt.provider_request_id
          || attempt.provider_cost_usd !== null || attempts.length !== input.attempt) {
          throw new Error("Potential provider usage must be settled or reconciled before release.");
        }
        const previous = input.attempt === 2 ? attempts[0] : undefined;
        if (input.attempt === 2 && (previous?.state !== "rejected" || previous.undispatched_at
          || previous.provider_cost_usd === null || previous.usage === null)) {
          throw new Error("The first AI attempt requires authoritative usage before release.");
        }
        await client.query(`UPDATE hosted_ai_attempts SET state='rejected',undispatched_at=NOW(),completed_at=NOW(),
          provider_cost_usd=0 WHERE owner_id=$1 AND request_id=$2 AND attempt=$3`, [input.ownerId, input.requestId, input.attempt]);
        if (previous?.provider_cost_usd != null) return finalize(client, reservation, new Money(previous.provider_cost_usd));
        const result = await client.query<ReservationRow>(`UPDATE hosted_ai_reservations SET state='cancelled',
          included_reserved_cents=0,purchased_reserved_cents=0,updated_at=NOW()
          WHERE owner_id=$1 AND request_id=$2 RETURNING *`, [input.ownerId, input.requestId]);
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
    /** Close an investigated provider overrun without charging above the original authorization. */
    async reconcileOverrun(input: AiReservationIdentity & { reference: string }) {
      identity(input);
      if (!input.reference.trim()) throw new Error("Overrun reconciliation reference is required.");
      return transaction(input.ownerId, async client => {
        const reservation = await row(client, input);
        if (reservation.reconciliation_reference) {
          if (reservation.reconciliation_reference !== input.reference) throw new Error("Conflicting overrun reconciliation replay.");
          return view(reservation);
        }
        if (reservation.state !== "reconciliation-required" || !reservedCreditCents(reservation).isZero()) {
          throw new Error("Only a final known-usage overrun can be closed.");
        }
        const dispatched = (await attemptsFor(client, input)).filter(attempt => !attempt.undispatched_at);
        if (!dispatched.length || dispatched.some(attempt => !["accepted", "rejected"].includes(attempt.state)
          || attempt.provider_cost_usd === null || attempt.usage === null)) throw new Error("All provider attempts require final authoritative usage.");
        const result = await client.query<ReservationRow>("UPDATE hosted_ai_reservations SET state='settled',reconciliation_reference=$3,updated_at=NOW() WHERE owner_id=$1 AND request_id=$2 RETURNING *", [input.ownerId, input.requestId, input.reference]);
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
