import type { TaxYearInput } from "@/models/inputs";
import { PAResidencySourcesSchema, type PAResidencySources } from "@/models/pa-residency";
import { calculatePAResidencySources } from "@/engine/state/pa-residency-sources";

/** Empty draft only; no source amount/year/answer is inferred from the current return. */
export function emptyGuidedPAResidencySources(): PAResidencySources {
  return {
    sourceTaxYear: null, sourceReference: "", sourceFactsConfirmed: null,
    owner: { accountHolder: "" },
    residency: { status: "", sourceReference: "", factsConfirmed: null, domicilePeriods: [],
      paPermanentAbodePeriods: [], outsidePAPermanentAbodePeriods: [],
      moveAbandonmentNewDomicileAndPresenceConfirmed: null,
      dec31PrincipalResidenceState: "", schoolDistrictCode: "", schoolDistrictName: "" },
    wages: [], interest: [], otherPAIncomeClassesConfirmedNone: null, otherPAAdjustmentsConfirmedNone: null,
  };
}

export function updateGuidedPAResidencySources(data: PAResidencySources, patch: Partial<PAResidencySources>): PAResidencySources {
  return { ...data, ...patch, sourceFactsConfirmed: null };
}

/** Only an explicit user confirmation may replace the privately retained originals. */
export function confirmGuidedPAResidencySources(input: TaxYearInput, draft: unknown): PAResidencySources {
  const data = PAResidencySourcesSchema.parse(draft);
  const owner = data.owner.accountHolder === "primary" ? input.taxpayer.primary
    : data.owner.accountHolder === "spouse" ? input.taxpayer.spouse : undefined;
  if (!owner) throw new Error("PA residency sources require the actual selected taxpayer owner");
  const candidate: PAResidencySources = {
    ...data, sourceFactsConfirmed: true,
    owner: { accountHolder: data.owner.accountHolder,
      originalTaxpayer: { firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn } },
    wages: data.wages.map(row => ({ ...row, original: row.originalIndex === null ? undefined : structuredClone(input.w2s[row.originalIndex]) })),
    interest: data.interest.map(row => ({ ...row, original: row.originalIndex === null ? undefined : structuredClone(input.form1099Int[row.originalIndex]) })),
    ...(data.dividends===undefined?{}:{dividends:data.dividends.map(row=>({...row,original:row.originalIndex===null?undefined:structuredClone(input.form1099Div[row.originalIndex])}))}),
    ...(data.businesses===undefined?{}:{businesses:data.businesses.map(row=>({...row,originalScheduleC:input.scheduleC===undefined?undefined:structuredClone(input.scheduleC),necOriginals:row.necOriginals.map(original=>({...original,original:original.originalIndex===null?undefined:structuredClone(input.form1099Nec[original.originalIndex])}))}))}),
  };
  calculatePAResidencySources(input, candidate);
  return candidate;
}

/** Replays actual current originals; an old confirmation never follows source edits automatically. */
export function buildGuidedPAResidencySources(input: TaxYearInput, draft: unknown): PAResidencySources {
  const data = PAResidencySourcesSchema.parse(draft);
  calculatePAResidencySources(input, data);
  return data;
}
