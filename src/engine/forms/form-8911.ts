/** Form 8911 personal refueling property credit. Spec: spec/federal/form-8911.yaml. */

import type Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import { Form8911Sources2026Schema, type Form8911Sources2026 } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { form8911AppendixBByCounty } from "@/models/irs-30c-appendix-b.js";

const FORM = "Form 8911";
const SCHEDULE = "Form 8911 Schedule A";
const END_OF_CREDIT = "2026-06-30";

interface Form8911TaxContext {
  taxYear: number;
  filingStatus: FilingStatus;
  spousePresent: boolean;
  incomeTax: Decimal;
  schedule2PartIAdditions: Decimal;
  foreignTaxCredit: Decimal;
  priorAllowableCredits: Decimal;
  tentativeMinimumTax: Decimal;
}

export interface Form8911Result {
  qualifiedCost: Decimal;
  tentativePersonalCredit: Decimal;
  netRegularTax: Decimal;
  tentativeMinimumTax: Decimal;
  personalCredit: Decimal;
  remainingBasis: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm8911(source: Form8911Sources2026, tax: Form8911TaxContext): Form8911Result {
  const facts = Form8911Sources2026Schema.parse(source);
  if (tax.taxYear !== facts.taxYear) throw new Error("Form 8911 property source year must match the 2026 return year.");
  if (facts.owner === "spouse" && (!tax.spousePresent || tax.filingStatus !== "married_filing_jointly")) {
    throw new Error("The documented Form 8911 spouse owner requires a joint return with the spouse present.");
  }
  const { incomeTax, schedule2PartIAdditions, foreignTaxCredit, priorAllowableCredits, tentativeMinimumTax } = tax;
  if ([incomeTax, schedule2PartIAdditions, foreignTaxCredit, priorAllowableCredits, tentativeMinimumTax].some(value => !value.isFinite() || value.lt(0))) {
    throw new Error("Form 8911 requires finite nonnegative original regular tax, other credit and tentative minimum tax amounts.");
  }

  const { censusTractGeoid, placedInServiceDate } = facts;
  const audit = new AuditTrail();
  const eligibleTract = form8911AppendixBByCounty[censusTractGeoid.slice(0, 5)]?.includes(`,${censusTractGeoid.slice(5)},`) === true;
  const timely = placedInServiceDate <= END_OF_CREDIT;
  const eligible = eligibleTract && timely;
  const invoiceCost = d(facts.invoiceGrossCost);
  const nonqualifyingCost = d(facts.nonqualifyingInvoiceCost);
  const basisReductions = d(facts.rebatesAndOtherBasisReductions);
  const netBasis = invoiceCost.minus(nonqualifyingCost).minus(basisReductions);
  const qualifiedCost = eligible ? netBasis : d(0);
  audit.record(SCHEDULE, "5", "Operational by the last eligible date", d(timely ? 1 : 0),
    "Ready for the documented charging use on or before June 30, 2026", { "Date placed in service": placedInServiceDate });
  audit.record(SCHEDULE, "6a", "Eligible 2020 Census tract", d(eligibleTract ? 1 : 0),
    "Exact full GEOID lookup in IRS Appendix B", { "Line 6b Census tract GEOID": censusTractGeoid });
  audit.record(SCHEDULE, "8", "Qualifying charger cost", qualifiedCost, "Invoice less nonqualifying costs and basis reductions for eligible property",
    { "Original invoice": invoiceCost, "Nonqualifying costs": nonqualifyingCost, "Basis reductions": basisReductions });
  audit.record(SCHEDULE, "18", "Qualified personal use net cost", qualifiedCost, "One personal-use charging port at the owner's main home");
  const percentageCredit = audit.record(SCHEDULE, "19", "30% of personal use cost", roundDollar(qualifiedCost.times("0.30")), "Line 18 × 30%, rounded to whole dollars");
  const cap = audit.record(SCHEDULE, "20", "Maximum personal credit per item", d(1000), "IRC 30C(b)(2)");
  const tentativePersonalCredit = audit.record(SCHEDULE, "21", "Tentative personal credit", min(percentageCredit, cap), "Smaller of lines 19 and 20");

  audit.record(FORM, "4", "Tentative personal credit", tentativePersonalCredit, "Schedule A line 21");
  const regularTax = audit.record(FORM, "5", "Regular tax before credits", incomeTax.plus(schedule2PartIAdditions), "Form 1040 line 16 + Schedule 2 line 1z");
  audit.record(FORM, "6a", "Foreign tax credit", foreignTaxCredit, "Schedule 3 line 1");
  audit.record(FORM, "6b", "Certain other allowable credits", priorAllowableCredits, "Form 1040 line 19 and applicable Schedule 3 credits");
  const allPriorCredits = audit.record(FORM, "6c", "Credits reducing regular tax", foreignTaxCredit.plus(priorAllowableCredits), "Lines 6a + 6b");
  const netRegularTax = audit.record(FORM, "7", "Net regular tax", zeroFloor(regularTax.minus(allPriorCredits)), "Line 5 less line 6c, floored at zero");
  audit.record(FORM, "8", "Tentative minimum tax", tentativeMinimumTax, "Form 6251 line 9, including if AMT due is zero");
  const taxLimit = audit.record(FORM, "9", "Net regular tax over tentative minimum tax", zeroFloor(netRegularTax.minus(tentativeMinimumTax)), "Line 7 less line 8, floored at zero");
  const personalCredit = audit.record(FORM, "10", "Allowable personal use credit", min(tentativePersonalCredit, taxLimit), "Smaller of lines 4 and 9, to Schedule 3 line 6j");
  const remainingBasis = audit.record(FORM, "basis", "Remaining charger basis", netBasis.minus(tentativePersonalCredit), "Reduce net basis by Schedule A line 21 before the IRC 30C(d) tax limitation, under IRC 30C(e)(1)");
  return { qualifiedCost, tentativePersonalCredit, netRegularTax, tentativeMinimumTax, personalCredit, remainingBasis, lines: audit.getLines() };
}
