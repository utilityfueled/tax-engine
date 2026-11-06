import type { TipIncomeAccountData } from "@/lib/guided-tip-income-facts";
import { completeW2Entry } from "./complete-facts";
export function actualTipIncome(): TipIncomeAccountData {
  return { accountHolder: "primary", sourceTaxYear: "2025", sourceReference: "Actual annual diary and payroll reconciliation", sourceFactsConfirmed: true, allEmployersIncluded: true, reportingYearTreatmentConfirmed: true,
    railroadRetirementCompensation: "0", noncashTipsNotIncludedInWages: "25.50",
    employers: [{ sourceId: "restaurant", employerName: "Blue Ocean Restaurant", employerEin: "12-3456789", w2SourceIds: ["formW2:0"], cashAndChargeTipsReceived: "7018", tipsReportedToEmployer: "7000", allocatedTips: "0", adequateRecordsSupportUnreportedTips: true,
      railroadRetirementCovered: false, medicareOnlyGovernmentUnreportedTips: "0", medicareOnlyGovernmentQualificationConfirmed: null, reportedTipsNotIncludedInBox7: "0", box7TipsExcludedFromReportedTotal: "0", reportedTipReconciliationReference: "",
      smallTipMonths: [{ month: "6", totalCashAndChargeTips: "18", tipsReportedToEmployer: "0" }] }] };
}
export const actualTipW2 = { ...completeW2Entry, employerName: "Blue Ocean Restaurant", employerEin: "12-3456789", accountHolder: "primary" as const, wages: "17000", socialSecurityWages: "10000", socialSecurityTips: "7000", allocatedTips: "0" };
