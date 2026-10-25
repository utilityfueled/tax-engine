/** Canonical Form8962 income. Spec: spec/federal/premium-tax-credit-return.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { calculateForm8962 } from "./form-8962.js";

export function calculatePremiumTaxCreditReturn(params: {
  input: TaxYearInput;
  agi: Decimal;
  taxExemptInterest: Decimal;
  foreignIncomeReduction: Decimal;
  foreignHousingDeduction: Decimal;
  socialSecurityBenefitsGross: Decimal;
  socialSecurityBenefitsTaxable: Decimal;
}) {
  const { input } = params;
  for (const [name, amount] of Object.entries(params)) {
    if (name === "input") continue;
    if (!Decimal.isDecimal(amount) || !amount.isFinite()) throw new Error("Form8962 canonical income must be finite.");
    if (name !== "agi" && name !== "socialSecurityBenefitsGross" && amount.lt(0)) throw new Error("Form8962 income addbacks must be nonnegative.");
  }
  if (params.socialSecurityBenefitsTaxable.gt(zeroFloor(params.socialSecurityBenefitsGross))) throw new Error("Form8962 taxable SocialSecurity source exceeds actual benefits.");
  const foreign = params.foreignIncomeReduction.plus(params.foreignHousingDeduction);
  const nontaxableBenefits = zeroFloor(params.socialSecurityBenefitsGross.minus(params.socialSecurityBenefitsTaxable));
  const taxpayerMagi = sum(params.agi, params.taxExemptInterest, foreign, nontaxableBenefits);
  const sourceMagi = input.form8962?.taxpayerModifiedAGI;
  if (sourceMagi !== undefined && (!d(sourceMagi).isFinite() || !d(sourceMagi).eq(taxpayerMagi))) throw new Error("Form8962 supplied taxpayer modified income must reconcile with canonical return MAGI.");
  const audit = new AuditTrail();
  audit.record("Form8962 Worksheet1-1", "1", "Actual adjusted gross income", params.agi, "Final Form1040line11");
  audit.record("Form8962 Worksheet1-1", "2", "Actual tax-exempt interest", params.taxExemptInterest, "Form1040line2a");
  audit.record("Form8962 Worksheet1-1", "3", "Foreign exclusion and housing deduction", foreign, "Form2555lines45+50");
  audit.record("Form8962 Worksheet1-1", "4", "Nontaxable SocialSecurity benefits", nontaxableBenefits, "max(0,Form1040line6a-line6b)");
  audit.record("Form8962 Worksheet1-1", "5", "Canonical taxpayer modified income", taxpayerMagi, "Lines1+2+3+4; preserve signed taxpayer income");
  const result = calculateForm8962({
    taxYear: input.taxpayer.taxYear,
    facts: input.form8962 ? { ...input.form8962, taxpayerModifiedAGI: taxpayerMagi.toFixed() } : undefined,
    // Historical unverified preview remains distinct from actual household facts.
    taxFamilySize: input.taxpayer.taxYear === 2025 && !input.form8962 ? 1 + (input.taxpayer.spouse ? 1 : 0) + input.taxpayer.dependents.length : undefined,
    modifiedAGI: input.taxpayer.taxYear === 2025 && !input.form8962 ? taxpayerMagi : undefined,
    filingStatus: input.taxpayer.filingStatus,
    form1095A: input.form1095A,
  });
  return { ...result, lines: [...audit.getLines(), ...result.lines] };
}
