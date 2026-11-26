import type { TaxYearInput } from "@/models/inputs";
import { PAResidencySourcesSchema, type PAOrdinaryNrk1Source, type PAResidencySources } from "@/models/pa-residency";
import { calculatePAResidencySources } from "@/engine/state/pa-residency-sources";
import { validateGuidedPAUnionDues } from "@/engine/state/pa-guided-union-dues";
import { parseGuidedCurrency } from "./guided-currency";

export function emptyGuidedPAOrdinaryNrk1Source(): PAOrdinaryNrk1Source {
  return {
    sourceTaxYear: null, sourceReference: "", sourceFactsConfirmed: null,
    issuerName: "", issuerEin: "", issuerCity: "", issuerState: "", issuerZip: "",
    recipientFirstName: "", recipientLastName: "", recipientSsn: "",
    ownerType: "", entityType: "", limitedPartner: null, calendarYear: null,
    amended: null, final: null, includedOnConsolidatedReturn: null, eligibleIndividualClaimConfirmed: null,
    allOtherReportableLinesZeroOrBlankConfirmed: null, whollyPennsylvaniaAndNoFederalStateDifferenceConfirmed: null,
    businessIncome: "", nonresidentWithholding: "",
  };
}

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

function normalizeNrk1Amount(value: string): string {
  return value.trim() === "" ? "" : parseGuidedCurrency(value).toFixed();
}

const paResidencyDeclarations = { resident: "full-year", part_year: "part-year", nonresident: "nonresident" } as const;

function validateGuidedPennsylvaniaResidency(input: TaxYearInput, sources: PAResidencySources): void {
  const { residencyStatus } = calculatePAResidencySources(input, sources);
  const { taxYear, stateResidency } = input.taxpayer;
  if (taxYear === 2026 && stateResidency !== undefined && stateResidency !== paResidencyDeclarations[residencyStatus]) {
    throw new Error("The declared Pennsylvania residency conflicts with the confirmed domicile, abode and presence records. Reconcile both answers before continuing.");
  }
}

/** Only an explicit user confirmation may replace the privately retained originals. */
export function confirmGuidedPAResidencySources(input: TaxYearInput, draft: unknown): PAResidencySources {
  const data = PAResidencySourcesSchema.parse(draft);
  if (data.employeeSources?.collectionMethod === "guided_union_dues_2025") validateGuidedPAUnionDues(input, data);
  const owner = data.owner.accountHolder === "primary" ? input.taxpayer.primary
    : data.owner.accountHolder === "spouse" ? input.taxpayer.spouse : undefined;
  if (!owner) throw new Error("PA residency sources require the actual selected taxpayer owner");
  let royaltySources = data.royaltySources;
  if (royaltySources !== undefined) {
    const currentProperties = input.royaltyPropertySources;
    if (currentProperties === undefined) throw new Error("PA residency sources require actual current royalty property originals");
    royaltySources = { ...royaltySources, originalPropertySources: structuredClone(currentProperties),
      originals: royaltySources.originals.map(row => {
        const original = input.form1099Misc[row.originalIndex];
        if (original === undefined) throw new Error("PA residency sources require each actual current royalty statement original");
        return { ...row, original: structuredClone(original) };
      }),
    };
  }
  const candidate: PAResidencySources = {
    ...data, sourceFactsConfirmed: true,
    owner: { accountHolder: data.owner.accountHolder,
      originalTaxpayer: { firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn } },
    ...(royaltySources === undefined ? {} : { royaltySources }),
    ...(data.nrk1Source === undefined ? {} : {
      nrk1Source: {
        ...data.nrk1Source,
        businessIncome: normalizeNrk1Amount(data.nrk1Source.businessIncome),
        nonresidentWithholding: normalizeNrk1Amount(data.nrk1Source.nonresidentWithholding),
        originalFederalK1: structuredClone(input.scheduleK1[0]),
      },
    }),
    ...(data.employeeSources === undefined ? {} : { employeeSources: {
      ...data.employeeSources,
      owner: { accountHolder: data.employeeSources.owner.accountHolder, ...(data.employeeSources.owner.accountHolder === data.owner.accountHolder ? { originalTaxpayer: { firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn } } : {}) },
      employers: data.employeeSources.employers.map(row => ({ ...row, originalW2: row.originalIndex === null ? undefined : structuredClone(input.w2s[row.originalIndex]) })),
    } }),
    ...(data.brokerageSources===undefined?{}:{brokerageSources:{...data.brokerageSources,
      owner:{accountHolder:data.brokerageSources.owner.accountHolder,...(data.brokerageSources.owner.accountHolder===data.owner.accountHolder?{originalTaxpayer:{firstName:owner.firstName,lastName:owner.lastName,ssn:owner.ssn}}:{})},
      statements:data.brokerageSources.statements.map(row=>({...row,original:row.originalIndex===null?undefined:structuredClone(input.form1099B[row.originalIndex]),transactions:row.transactions.map(transaction=>({...transaction,originalTransaction:row.originalIndex===null||transaction.transactionIndex===null?undefined:structuredClone(input.form1099B[row.originalIndex]?.transactions[transaction.transactionIndex])}))})),
      withholdingOriginals:data.brokerageSources.withholdingOriginals.map(row=>({...row,original:row.originalIndex===null?undefined:structuredClone((row.form==='1099-B'?input.form1099B:row.form==='1099-DIV'?input.form1099Div:input.form1099Int)[row.originalIndex])})),
    }}),
    wages: data.wages.map(row => ({ ...row, original: row.originalIndex === null ? undefined : structuredClone(input.w2s[row.originalIndex]) })),
    interest: data.interest.map(row => ({ ...row, original: row.originalIndex === null ? undefined : structuredClone(input.form1099Int[row.originalIndex]) })),
    ...(data.dividends===undefined?{}:{dividends:data.dividends.map(row=>({...row,original:row.originalIndex===null?undefined:structuredClone(input.form1099Div[row.originalIndex])}))}),
    ...(data.businesses===undefined?{}:{businesses:data.businesses.map(row=>({...row,originalScheduleC:input.scheduleC===undefined?undefined:structuredClone(input.scheduleC),necOriginals:row.necOriginals.map(original=>({...original,original:original.originalIndex===null?undefined:structuredClone(input.form1099Nec[original.originalIndex])}))}))}),
  };
  validateGuidedPennsylvaniaResidency(input, candidate);
  return candidate;
}

/** Replays actual current originals; an old confirmation never follows source edits automatically. */
export function buildGuidedPAResidencySources(input: TaxYearInput, draft: unknown): PAResidencySources {
  const data = PAResidencySourcesSchema.parse(draft);
  validateGuidedPennsylvaniaResidency(input, data);
  return data;
}
