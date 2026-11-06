import { actualNolInput } from "./net-operating-loss.js";

export function charitableNolInput(wages = "100000", amount = "60000", year = 2025) {
  const input = actualNolInput(wages, { priorYear: {}, donations: [{ organization: "Actual public charity", type: "cash", amount,
    dateOfDonation: `${year}-05-01`, qualifiedOrganization: true, isPrivateFoundation: false,
    supportingOrganization: false, donorAdvisedFund: false }] });
  input.taxpayer.taxYear = year;
  if (!input.netOperatingLoss?.vintages?.[0]) throw new Error("Missing synthetic actual loss");
  input.netOperatingLoss.sourceTaxYear = year;
  input.netOperatingLoss.vintages[0].adjustedThroughTaxYear = year - 1;
  return input;
}
