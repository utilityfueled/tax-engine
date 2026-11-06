/** Fictional original history and paid receipts; no computed exclusion input. */
import { actualSavingsBondReissueInterview } from "./guided-savings-bond-reissue-fixture";
import { actualEducatorBondInterview } from "./guided-educator-bond-fixture";

export function actualEducatorBondReissueInterview() {
  const state = actualSavingsBondReissueInterview(), adjustments = actualEducatorBondInterview().sectionData.adjustments;
  for (const source of adjustments.educatorExpenseSources) source.expenses[0].amount = "400";
  return { ...state, segmentation: { ...state.segmentation, lifeEvents: ["educator-expenses"] }, sectionData: { ...state.sectionData, adjustments,
    payments: { estimatedPayments: [], extensionPayments: [], priorYearAppliedCredits: [], otherPayments: "0", estimatedTaxFacts: {
      sourceTaxYear: "2025", sourceReference: "Fictional complete prior return and payment history", sourceFactsConfirmed: true, allPaymentRecordsIncluded: true,
      calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
      calculationMethod: "regular", withholdingMethod: "equal-installments", priorYearTaxStatus: "return-filed",
      priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: true,
      priorYearTaxForForm2210: "5000", priorYearAgiForForm2210: "80000", priorYearTaxComputationConfirmed: true,
      withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: false, returnFiledDate: "", returnPaidInFullDate: "",
    } },
  } };
}
