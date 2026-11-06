import { emptySchedule1AData, type Schedule1AData } from "@/lib/guided-schedule-1-a-facts";
import { vehicleRefinancingFixture } from "./vehicle-refinancing";
import { startCompleteInterview } from "../guided-interview/complete-facts";
export function guidedVehicleRefinancingFixture(year = 2025) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["additional-deductions"], stateCode: null }); state.taxYear = year;
  const loan = vehicleRefinancingFixture(year);
  const data: Schedule1AData = { ...emptySchedule1AData, employeeTips: [], businessTips: [], overtime: [], seniorOwners: [], sourceTaxYear: String(year), sourceReference: "Synthetic actual deduction sources", sourceFactsConfirmed: true, allSourcesIncluded: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", vehicleLoans: [{ ...loan, sourceTaxYear: String(year), grossVehicleWeightRating: String(loan.grossVehicleWeightRating), refinancingSources: { ...loan.refinancingSources, sourceTaxYear: String(year) } }] };
  return { state, data };
}
