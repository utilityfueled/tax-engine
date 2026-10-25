import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceHealthInput } from "./marketplace-health.js";
import { actualNolInput } from "./net-operating-loss.js";

/** Independent actual synthetic policy, business and regular/AMT carry ledgers. */
export function marketplaceNolInput(year = 2025) {
  const input = marketplaceHealthInput();
  if (!input.scheduleC || !input.form7206?.persons?.[0] || !input.form8962) throw new Error("Missing synthetic health source");
  input.taxpayer.taxYear = year;
  input.scheduleC.grossReceipts = "100000";
  input.form7206.sourceTaxYear = year;
  input.form7206.persons[0].attainedAgeAtYearEnd = year - 1990;
  input.priorYear = {};
  input.netOperatingLoss = actualNolInput("0").netOperatingLoss;
  if (!input.netOperatingLoss) throw new Error("Missing synthetic NOL source");
  input.netOperatingLoss.sourceTaxYear = year;
  for (const vintage of input.netOperatingLoss.vintages ?? []) vintage.adjustedThroughTaxYear = year - 1;
  for (const policy of input.form1095A) {
    policy.taxYear = year;
    for (const month of policy.monthlyPremiums) month.slcsp = "500";
  }
  for (const month of input.form8962.monthlyReconciliation ?? []) month.slcsp = "500";
  for (const plan of input.form7206.plans ?? []) for (const payment of plan.payments ?? []) {
    payment.coverageTaxYear = year;
    if (!payment.datePaid) throw new Error("Missing synthetic premium date");
    payment.datePaid = payment.datePaid.replace("2026-", `${year}-`);
  }
  return TaxYearInputSchema.parse(input);
}
