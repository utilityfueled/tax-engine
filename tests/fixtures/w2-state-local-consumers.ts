/** Fictional printed originals and payroll controls fixed before consumer outputs. */
import type { TaxYearInput } from "@/models/inputs.js";
import type { W2StateLocalSources } from "@/models/w2-state-local.js";
import { w2StateLocalFixture } from "./w2-state-local.js";
import { paOrdinaryResidencyFixture } from "./pa-residency-sources.js";
import { paPartYearReciprocityFixture } from "./pa-reciprocity.js";

export function attachActualW2Rows(input: TaxYearInput, firstState: "PA" | "OH" = "PA") {
  const { sources } = w2StateLocalFixture(input.taxpayer.taxYear);
  const w2 = input.w2s[0];
  Object.assign(w2, { federalWithheld: "5000", state: firstState, stateWages: "50000", stateTaxWithheld: firstState === "PA" ? "1535" : "1000", localWages: "50000", localTaxWithheld: "1875", localityName: "Philadelphia" });
  sources.owner.originalTaxpayer = { firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn };
  sources.originalW2 = structuredClone(w2);
  if (firstState === "OH") sources.stateRows.reverse();
  sources.stateRows.forEach((row, index) => { row.printedRow = index + 1; });
  (w2 as typeof w2 & { stateLocalSources?: W2StateLocalSources }).stateLocalSources = sources;
  return sources;
}
export function actualW2ConsumerFixture(year = 2025) {
  const { input } = w2StateLocalFixture(year); const sources = attachActualW2Rows(input); return { input, sources };
}
export function actualPARowConsumerFixture(year = 2025) {
  const f = paOrdinaryResidencyFixture("resident", year); f.input.form1099Int = []; f.sources.interest = [];
  const packet = attachActualW2Rows(f.input, "OH"); f.sources.wages[0].original = structuredClone(f.input.w2s[0]); return { ...f, packet };
}
export function actualReciprocalRowConsumerFixture(year = 2025) {
  const f = paPartYearReciprocityFixture(year); const packet = attachActualW2Rows(f.input, "OH");
  f.residencySources.wages[0].original = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].originalW2 = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].zeroOrOneStateRowOnActualOriginalConfirmed = false;
  return { ...f, packet };
}
