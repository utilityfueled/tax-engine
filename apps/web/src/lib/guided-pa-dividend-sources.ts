import { PAOrdinaryDividendSourceSchema, type PAOrdinaryDividendSource } from "@/models/pa-ordinary-investment-sources";

/** The existing strict canonical schema also retains incomplete source drafts. */
export const GuidedPADividendSourceSchema = PAOrdinaryDividendSourceSchema;

export function emptyGuidedPADividendCredit(): PAOrdinaryDividendSource["credits"][number] {
  return { sourceReference: "", creditedOn: "", ordinaryDividends: "", capitalGainDistributions: "" };
}

/** No original, year, amount, date or classification is inferred from another field. */
export function emptyGuidedPADividendSource(): PAOrdinaryDividendSource {
  return {
    originalIndex: null, sourceTaxYear: null, sourceReference: "", sourceFactsConfirmed: null,
    ordinaryPersonalDividendIncomeConfirmed: null,
    capitalDistributionsFromRegulatedInvestmentCompanyConfirmed: null,
    noOtherPADividendAdjustmentsConfirmed: null,
    currentUncorrectedNonvoidOriginalConfirmed: null, allOriginalBoxesKnownConfirmed: null,
    credits: [],
  };
}

/** Editing facts never refreshes a snapshot or retains an earlier source confirmation. */
export function updateGuidedPADividendSource(
  row: PAOrdinaryDividendSource, patch: Partial<PAOrdinaryDividendSource>,
): PAOrdinaryDividendSource {
  const confirmationOnly = Object.keys(patch).length === 1 && Object.hasOwn(patch, "sourceFactsConfirmed");
  return GuidedPADividendSourceSchema.parse({
    ...row, ...patch, sourceFactsConfirmed: confirmationOnly ? patch.sourceFactsConfirmed : null,
  });
}
