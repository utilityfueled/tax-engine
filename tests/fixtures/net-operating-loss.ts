import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

export function actualNolInput(wages: string, extra: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages, federalWithheld: "20000" }],
    priorYear: { shortTermCapitalLoss: "-3000" },
    netOperatingLoss: {
      sourceTaxYear: 2025, sourceReference: "Actual filed carry packet", sourceFactsConfirmed: true,
      allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: "continuous_individual",
      membershipUnchangedConfirmed: true, primaryName: "Jane Doe", primaryTaxpayerIdLast4: "6789",
      vintages: [{ sourceId: "loss2021", lossTaxYear: 2021, sourceReference: "Filed2021loss", originKind: "individual_nol",
        originalLoss: "100000", openingCarryforward: "100000", carrybackTreatment: "not_required",
        adjustedThroughTaxYear: 2024, historySourceReference: "Filed2024carry", allHistoryIncluded: true,
        farmingLossIncluded: false, history: [], section1411OriginalLoss: "0" }],
      alternativeTax: { sourceReference: "Actual independent AMT carry worksheet", sourceFactsConfirmed: true,
        allCarryoversIncluded: true, specialDisasterCarryIncluded: false, currentYearAdjustmentsCompleteConfirmed: true,
        regularBasisAndLossLimitsSameAsAlternativeConfirmed: true, vintages: [] },
    }, ...extra });
}
