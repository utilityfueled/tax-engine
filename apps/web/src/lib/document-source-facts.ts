import Decimal from "decimal.js";
import { z } from "zod";
import { sourceFactSchema, type AiSourceFact } from "@tax-engine/engine/src/ai-application-schemas";

/** Preserve server-validated proposals during local normalization; this never confirms or seeds facts. */
export function normalizeDocumentSourceFacts(candidate: Record<string, unknown>): AiSourceFact[] | undefined {
  const raw = candidate.sourceFacts ?? candidate.facts;
  if (raw === undefined) return undefined;
  if (candidate.sourceFacts !== undefined && candidate.facts !== undefined
    && JSON.stringify(candidate.sourceFacts) !== JSON.stringify(candidate.facts)) throw new Error("Conflicting source proposals.");
  const parsed = z.array(sourceFactSchema).max(100).safeParse(raw);
  if (!parsed.success || new Set(parsed.data.map(fact => fact.name)).size !== parsed.data.length
    || parsed.data.some(fact => fact.value !== null && ((fact.kind === "money" && (!/^-?\d+(?:\.\d+)?$/.test(fact.value) || !new Decimal(fact.value).isFinite()))
      || (fact.kind === "date" && !z.iso.date().safeParse(fact.value).success)))) throw new Error("Invalid source proposals.");
  return parsed.data;
}
