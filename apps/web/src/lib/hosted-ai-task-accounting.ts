import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { calculateAiCost } from "@tax-engine/engine/src/ai-pricing";
import { AI_PROFILES, AI_TASKS } from "@tax-engine/engine/src/ai-task-registry";
import type { AiTaskExecution } from "./ai-task-adapter";
import { createHostedAiLedger } from "./hosted-ai-ledger";
import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";

/** Bind billing to a server-authenticated owner. No input/response text is stored in the ledger. */
export function hostedAiTaskAccounting(input: {
  ownerId: string; requestId: string; cycleKey: string; includedBudgetCents: number; requestPayload: unknown;
  /** Explicit server-side decision; never inferred from a model refusal or HTTP retry. */
  escalationApprovalReference?: string;
}, env: Record<string, string | undefined>): Pick<AiTaskExecution, "beforeAttempt" | "recordAttempt" | "recordUnknownAttempt"> {
  const identity = { ownerId: input.ownerId, requestId: input.requestId };
  async function ledger() {
    await ensureHostedAppSchema(env);
    return createHostedAiLedger((await getHostedServerDatabase(env)).pool);
  }
  return {
    async beforeAttempt(attempt) {
      const db = await ledger();
      if (attempt.attempt === 2 && !input.escalationApprovalReference?.trim()) throw new Error("A second attempt requires explicit escalation authorization.");
      const escalationBudget = input.escalationApprovalReference?.trim() && attempt.attempt === 1
        ? calculateAiCost(AI_PROFILES["sol-high"].model, attempt.startedAt, {
          inputTokens: AI_TASKS["complex-reconciliation"].maxInputTokens, outputTokens: AI_TASKS["complex-reconciliation"].maxOutputTokens,
        }).retailChargeCents : 0;
      const result = await db.reserve({ ...identity, cycleKey: input.cycleKey, includedBudgetCents: input.includedBudgetCents,
        payloadDigest: createHash("sha256").update(JSON.stringify(input.requestPayload)).digest("hex"),
        maximumChargeCents: new Decimal(attempt.maximumChargeCents).plus(escalationBudget).toNumber() });
      if (!result.accepted) throw new Error("AI credits are exhausted.");
      if (!result.created && attempt.attempt === 1) throw new Error("This AI request was already reserved; it will not be sent again.");
      try {
        if (!await db.start({ ...identity, ...attempt })) throw new Error("AI attempt already started.");
      } catch (error) {
        if (result.created) await db.cancel(identity);
        throw error;
      }
    },
    async recordAttempt(attempt, outcome) {
      await (await ledger()).settle({ ...identity, attempt: attempt.attempt, ...outcome,
        final: outcome.accepted || attempt.attempt === 2 || !input.escalationApprovalReference?.trim() });
    },
    async recordUnknownAttempt(attempt, outcome) {
      await (await ledger()).unknown({ ...identity, attempt: attempt.attempt, ...outcome });
    },
  };
}
