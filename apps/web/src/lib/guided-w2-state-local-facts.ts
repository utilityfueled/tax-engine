import type { W2StateLocalSourceContext } from "@/engine/forms/w2-state-local";
import { W2StateLocalSourcesSchema, type W2StateLocalSources } from "@/models/w2-state-local";
import { calculateW2StateLocalSources } from "@/engine/forms/w2-state-local";
export function emptyGuidedW2StateLocalSources(): W2StateLocalSources {
  return { sourceTaxYear: null, sourceReference: "", sourceFactsConfirmed: null, owner: { accountHolder: "" },
    currentUncorrectedNonvoidOriginalConfirmed: null, allOriginalBoxesKnownConfirmed: null, singleOriginalWithoutContinuationConfirmed: null, allOriginalPagesAndCopiesCheckedConfirmed: null,
    stateReporting: "", localReporting: "", legacyScalarProjection: "", stateRows: [], localRows: [] };
}
export function updateGuidedW2StateLocalSources(source: W2StateLocalSources, patch: Partial<W2StateLocalSources>): W2StateLocalSources {
  return { ...source, ...patch, sourceFactsConfirmed: null };
}
/** Only an explicit user action may replace actual privately retained originals. */
export function confirmGuidedW2StateLocalSources(input: W2StateLocalSourceContext, index: number, draft: unknown): W2StateLocalSources {
  const source = W2StateLocalSourcesSchema.parse(draft), w2 = input.w2s[index];
  const owner = source.owner.accountHolder === "primary" ? input.taxpayer.primary : source.owner.accountHolder === "spouse" ? input.taxpayer.spouse : undefined;
  if (!w2 || !owner) throw new Error("W-2 actual row sources require the actual current original and selected owner");
  const candidate: W2StateLocalSources = { ...source, sourceFactsConfirmed: true,
    owner: { ...source.owner, originalTaxpayer: { firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn } },
    originalW2: structuredClone(Object.fromEntries(Object.entries(w2).filter(([key]) => key !== "stateLocalSources"))) };
  const current = { ...input, w2s: input.w2s.map((row, i) => i === index ? { ...row, stateLocalSources: candidate } : row) };
  calculateW2StateLocalSources(current, index, candidate); return candidate;
}
export function buildGuidedW2StateLocalSources(input: W2StateLocalSourceContext, index: number, draft: unknown): W2StateLocalSources {
  const source = W2StateLocalSourcesSchema.parse(draft);
  calculateW2StateLocalSources(input, index, source); return source;
}
