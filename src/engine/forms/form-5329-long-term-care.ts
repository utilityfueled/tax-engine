/** Internal 2026 projection. Spec: spec/federal/form-5329-long-term-care-source.yaml. */
import Decimal from "decimal.js";
import { z } from "zod";
import { Form5329LongTermCareSourceSchema, type Form1099R, type TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";
import { isBeforeAge59AndHalfDate } from "@/utils/retirement-age.js";

interface Form5329LongTermCareProjection {
  taxablePensionDistribution: Decimal;
  maximumQualifiedDistribution: Decimal;
  exemptDistribution: Decimal;
  distributionSubjectToAdditionalTax: Decimal;
  additionalTax: Decimal;
  lines: CalculatedLine[];
}

const annualLimit = "2600"; // Notice 2026-33, Q&A B-3.
const tenPercent = "0.10";

function isOrdinaryTaxablePlanPayment(form: Form1099R, distribution: Decimal): boolean {
  return form.iraSepSimple === false && form.distributionCode?.trim() === "1"
    && form.taxableAmountNotDetermined === false && d(form.taxableAmount).eq(distribution)
    && d(form.employeeContributions).isZero()
    && !form.eligibleGovernmental457bPlan && !form.trumpAccount && !form.qualifiedRothDistribution
    && !form.returnedContributionByDueDate && !form.excessContributionReturnedWithoutEarnings
    && !form.disabilityPensionBeforeMinimumRetirementAge
    && !form.separationFromServiceAfterAge55ExceptionApplies
    && !form.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies
    && !form.qualifiedDomesticRelationsOrderExceptionApplies && !form.terminalIllnessExceptionApplies
    && !form.qualifiedLumpSumReporting && !form.qualifiedJointSurvivorAnnuity && !form.militaryPensionOrSurvivorBenefit
    && !form.qcdSource && form.simplifiedMethodCostInPlan === undefined
    && [form.capitalGainIncluded, form.excessContributionEarnings, form.rothConversionAmount, form.rothIraRolledOverAmount,
      form.qualifiedCharitableDistribution, form.retiredPublicSafetyOfficerInsurancePremiums,
      form.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount].every(amount => d(amount).isZero());
}

export function calculateForm5329LongTermCareProjection(
  input: TaxYearInput, sourceFacts: unknown,
): Form5329LongTermCareProjection {
  const actual = Form5329LongTermCareSourceSchema.safeParse(sourceFacts);
  if (!actual.success) throw new Error("Qualified long-term care source requires complete plan, premium, and annual evidence", { cause: actual.error });
  const { data: source } = actual;
  if (input.taxpayer.taxYear !== source.sourceTaxYear || input.taxpayer.filingStatus === "married_filing_jointly") {
    throw new Error("Qualified long-term care source requires a matching nonjoint 2026 return");
  }
  if (input.form5329 || input.form5329FirstHomeSource || input.scheduleA?.medicalMileage || d(input.scheduleA?.medicalExpenses).gt(0)) {
    throw new Error("Qualified long-term care source requires reconciliation of any competing Part I exception");
  }
  if (input.form8915F?.currentYearDistributions?.length) {
    throw new Error("Qualified long-term care source requires reconciliation of current-year disaster distributions");
  }
  if (input.form1099R?.length !== 1) throw new Error("Qualified long-term care source requires one Form 1099-R");
  const [form] = input.form1099R;
  const distribution = d(source.distributionAmount);
  if (form.accountHolder !== source.owner || form.taxYear !== source.sourceTaxYear || form.payer.trim() !== source.payer
    || form.accountReference !== source.accountReference || form.distributionDate !== source.distributionDate
    || !form.distributionDate.startsWith("2026-") || !d(form.grossDistribution).eq(distribution)) {
    throw new Error("Qualified long-term care source must match the actual primary Form 1099-R and its 2026 payment");
  }
  if (!isOrdinaryTaxablePlanPayment(form, distribution)) {
    throw new Error("Qualified long-term care source requires a fully taxable Code 1 employer-plan payment without other treatment");
  }

  const birth = z.iso.date().safeParse(input.taxpayer.primary.dateOfBirth);
  const paymentDate = new Date(`${source.distributionDate}T00:00:00Z`);
  if (!birth.success || birth.data > source.distributionDate
    || !isBeforeAge59AndHalfDate(new Date(`${birth.data}T00:00:00Z`), paymentDate)) {
    throw new Error("Qualified long-term care source requires an actual birth date and an employee under age 59 1/2 at payment");
  }
  const { plan, premiumStatement } = source;
  if (!premiumStatement.filedWithPlanDate.startsWith("2026-") || premiumStatement.filedWithPlanDate > source.distributionDate) {
    throw new Error("Qualified long-term care premium statement must be filed with the plan in the same year on or before payment");
  }

  const premium = d(premiumStatement.premiumPaidOrAssessed);
  const vestedLimit = d(plan.vestedBenefitPresentValue).times(tenPercent);
  const indexedLimit = d(annualLimit);
  const maximumQualifiedDistribution = Decimal.min(premium, vestedLimit, indexedLimit);
  const exemptDistribution = d(plan.qualifiedPortionOfMatchedPayment);
  const ordinaryDistribution = d(plan.ordinaryPortionOfMatchedPayment);
  if (!exemptDistribution.plus(ordinaryDistribution).eq(distribution)) {
    throw new Error("Qualified long-term care and ordinary amounts must reconcile to the actual taxable payment");
  }
  if (exemptDistribution.gt(maximumQualifiedDistribution)) {
    throw new Error("Qualified long-term care amount exceeds the statutory limit");
  }
  const additionalTax = ordinaryDistribution.times(tenPercent);
  const audit = new AuditTrail();
  const label = "Form 5329 long-term care projection";
  audit.record(label, "ltc-limit", "Maximum qualified long-term care distribution", maximumQualifiedDistribution,
    "Least of actual certified premiums, 10% of vested accrued benefit present value, and 2026 indexed limit",
    { "Certified premiums": premium, "Vested benefit limit": vestedLimit, "Indexed limit": indexedLimit });
  audit.record(label, "ltc-tax", "Additional tax on the nonqualified portion", additionalTax,
    "10% of the taxable payment remaining after the documented qualified portion",
    { "Taxable pension distribution": distribution, "Qualified distribution": exemptDistribution, "Remaining distribution": ordinaryDistribution });
  return {
    taxablePensionDistribution: distribution, maximumQualifiedDistribution, exemptDistribution,
    distributionSubjectToAdditionalTax: ordinaryDistribution, additionalTax, lines: audit.getLines(),
  };
}
