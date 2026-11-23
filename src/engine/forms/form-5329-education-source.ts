import Decimal from "decimal.js";
import { Form5329EducationSourceSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { iraEducationOwnerFingerprint } from "@/utils/ira-education-owner.js";
import { isBeforeAge59AndHalfDate } from "@/utils/retirement-age.js";

/** Resolve the finite 2026 tuition proof without overriding aggregate Form 5329 inputs. */
export function resolveForm5329EducationSource(input: TaxYearInput, iraTaxable: Decimal) {
  if (input.form5329EducationSource === undefined) return undefined;
  const source = Form5329EducationSourceSchema.parse(input.form5329EducationSource);
  const { taxpayer } = input;
  if (taxpayer.taxYear !== source.sourceTaxYear || taxpayer.filingStatus === "married_filing_jointly"
    || iraEducationOwnerFingerprint(taxpayer.primary) !== source.ownerFingerprint) {
    throw new Error("Form 5329 education source must match the actual primary taxpayer and 2026 nonjoint return.");
  }
  if (input.form5329 || input.form5329FirstHomeSource || input.form8606 || input.form8606ByOwner || input.iraBasisSources
    || input.educationExpenses || input.qualifiedEducationExpenses || input.form1099Q?.length || input.savingsBondRedemptions?.length) {
    throw new Error("Form 5329 education source requires separate reconciliation of other retirement or education worksheets.");
  }
  const original = input.form1099R?.[0];
  const { distribution, tuition } = source;
  if (input.form1099R?.length !== 1 || !original || original.taxYear !== source.sourceTaxYear || original.accountHolder !== source.owner
    || original.payer.trim() !== distribution.payerName || original.payerTin?.trim().replaceAll("-", "") !== distribution.payerTin
    || original.accountReference?.trim() !== distribution.accountReference || original.distributionDate !== distribution.receiptDate
    || !distribution.receiptDate.startsWith("2026-")) {
    throw new Error("Form 5329 education source must match one actual 2026 Form 1099-R payer, owner, account and receipt date.");
  }
  const taxableDistribution = d(distribution.amount);
  if (original.iraSepSimple !== true || original.distributionCode?.trim() !== "1" || original.eligibleGovernmental457bPlan
    || original.trumpAccount !== false || original.excessContributionEarnings === undefined || !d(original.excessContributionEarnings).isZero()
    || original.returnedContributionByDueDate || original.excessContributionReturnedWithoutEarnings || !d(original.rothConversionAmount).isZero()
    || original.iraBasisConfirmedZero !== true || !d(original.employeeContributions).eq(distribution.employeeContributions)
    || original.taxableAmountNotDetermined !== false || !taxableDistribution.eq(d(original.grossDistribution))
    || !taxableDistribution.eq(d(original.taxableAmount)) || !taxableDistribution.eq(iraTaxable)) {
    throw new Error("Form 5329 education source requires a fully taxable ordinary Code 1 IRA distribution with no basis.");
  }
  const birthDate = new Date(`${taxpayer.primary.dateOfBirth}T00:00:00Z`);
  const receiptDate = new Date(`${distribution.receiptDate}T00:00:00Z`);
  if (!Number.isFinite(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== taxpayer.primary.dateOfBirth
    || receiptDate < birthDate || !isBeforeAge59AndHalfDate(birthDate, receiptDate)) {
    throw new Error("Form 5329 education source requires a primary taxpayer under age 59 1/2 on receipt.");
  }
  if (!tuition.paymentDate.startsWith("2026-") || tuition.billAccountReference.toLowerCase() !== tuition.receiptAccountReference.toLowerCase()
    || !d(tuition.billedAmount).eq(d(tuition.paidAmount))) {
    throw new Error("Form 5329 education source requires a matching college tuition bill and payment in the distribution year.");
  }
  return { exceptionAmount: Decimal.min(taxableDistribution, d(tuition.paidAmount)), taxableDistribution };
}
