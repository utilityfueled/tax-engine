/** Fictional originals only; the guide never stores a calculated bond exclusion. */
import { guidedSavingsBondReissueState } from "./guided-savings-bond-reissues.js";
import { educatorBondReissueInput } from "./educator-bond-reissues.js";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { emptyEducatorSource, type EducatorSourceData } from "@/lib/guided-educator-facts";

export function guidedEducatorBondReissueState() {
  const state = guidedSavingsBondReissueState(true), input = educatorBondReissueInput();
  state.segmentation.lifeEvents = ["educator-expenses"];
  const records = (value: unknown): unknown => {
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(records);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, records(item)]));
    return value;
  };
  state.sectionData.adjustments = { ...emptyAdjustmentData, educatorExpenseSources: input.adjustments?.educatorExpenseSources?.map(source => ({
    ...emptyEducatorSource, ...records(source) as EducatorSourceData, excludedSavingsBondInterest: "",
  })) };
  state.sectionData.payments = { estimatedPayments: [], extensionPayments: [], priorYearAppliedCredits: [], otherPayments: "0", estimatedTaxFacts: {
    sourceTaxYear: "2025", sourceReference: "Fictional complete prior return and payment history", sourceFactsConfirmed: true, allPaymentRecordsIncluded: true,
    calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
    calculationMethod: "regular", withholdingMethod: "equal-installments", priorYearTaxStatus: "return-filed",
    priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: true,
    priorYearTaxForForm2210: "5000", priorYearAgiForForm2210: "80000", priorYearTaxComputationConfirmed: true,
    withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: false, returnFiledDate: "", returnPaidInFullDate: "",
  } };
  return state;
}
