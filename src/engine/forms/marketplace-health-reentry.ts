/** RevProc2014-41 alternative calculation. Spec: marketplace-health-reentry.yaml. */
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8962Result } from "./form-8962.js";
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { calculateMarketplaceHealthDeduction, type MarketplaceHealthDeductionResult } from "./marketplace-health-deduction.js";
import { AuditTrail } from "@/utils/audit.js";
import { sum } from "@/utils/decimal.js";

export function calculateMarketplaceHealthReentry(params: {
  input: TaxYearInput;
  groups: MarketplaceHealthPremiumGroup[];
  credit: Form8962Result;
  ordinaryDeduction: MarketplaceHealthDeductionResult;
}): MarketplaceHealthDeductionResult {
  const { input, groups, credit, ordinaryDeduction } = params;
  if (input.taxpayer.taxYear !== 2026 || ordinaryDeduction.method !== "ordinary-no-ptc-2026"
    || ordinaryDeduction.historicalLimit || !credit.taxpayerEligible || credit.orderedDeductionInterim) {
    throw new Error("Pub974 alternative re-entry requires actual2026 renewed eligibility without an interim percentage or historical repayment ceiling.");
  }
  const deduction = calculateMarketplaceHealthDeduction({ input, groups, credit });
  const ordinaryMaximum = sum(...deduction.businesses.map(row => row.ordinaryDeduction));
  if (!ordinaryDeduction.specifiedDeduction.eq(ordinaryMaximum)
    || !ordinaryDeduction.maximumSpecifiedDeduction.eq(deduction.maximumSpecifiedDeduction)
    || !ordinaryDeduction.nonspecifiedDeduction.eq(deduction.nonspecifiedDeduction)
    || !ordinaryMaximum.eq(deduction.maximumSpecifiedDeduction)) {
    throw new Error("Pub974 alternative re-entry requires an actual initial deduction equal to the verified combined maximum; differing business limits need their separate method.");
  }
  const audit = new AuditTrail();
  audit.record("Pub974 Alternative Reentry", "initial-health", "Actual initial health deduction",
    ordinaryMaximum.plus(deduction.nonspecifiedDeduction), "RevProc2014-41 section5.02 step1: verified maximum plus ordinary nonspecified deduction");
  audit.record("Pub974 Alternative Reentry", "initial-household-income", "Actual initial household income", credit.modifiedAGI,
    "Refigure all AGI-sensitive claims using actual initial health; no retained simplified worksheet or auxiliary400");
  audit.record("Pub974 Alternative Reentry", "initial-credit", "Actual initial premium tax credit", credit.ptcAllowed,
    "RevProc2014-41 section5.02 step2: actual initial household income and coverage");
  // Reuse verified monthly source allocation and earned-income limits, while
  // naming this separate alternative method rather than printed Simplified lines.
  const lines = deduction.lines.map(line => ({ ...line, form: line.form.replace("Pub974 Simplified", "Pub974 Alternative Reentry") }));
  return { ...deduction, method: "pub974-alternative-reentry-2026", lines: [...audit.getLines(), ...lines] };
}
