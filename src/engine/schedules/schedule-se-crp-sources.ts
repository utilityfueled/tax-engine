/** Cash farm taxable program payments. Spec: spec/federal/schedule-se-crp-cash-farm.yaml. */
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

export function resolveCashFarmCrp(input: Pick<TaxYearInput, "taxpayer" | "scheduleF" | "formSSA1099">) {
  const farm = input.scheduleF;
  const source = farm?.agriculturalPaymentSources;
  const year = input.taxpayer.taxYear;
  const amount = d(farm?.agriculturalProgramPayments);
  const owner = farm?.accountHolder;
  if (!source) {
    const verified = amount.isZero();
    if (!verified && year >= 2026) throw new Error("2026 Schedule F agricultural payments require actual source classification.");
    return { accountHolder: owner, excluded: d(0), verified };
  }
  const joint = input.taxpayer.filingStatus === "married_filing_jointly";
  if ((year !== 2025 && year !== 2026) || source.sourceTaxYear !== year || farm?.accountingMethod !== "cash"
    || farm.materiallyParticipated !== true || farm.qbiMateriallyParticipated === false || farm.agriculturalProgramPayments === undefined
    || source.sourceFactsConfirmed !== true || source.completeTaxablePaymentsConfirmed !== true
    || source.allGrossPaymentsTaxableConfirmed !== true || source.activeDomesticFarmConfirmed !== true
    || !owner || (owner === "spouse" && (!joint || !input.taxpayer.spouse))
    || !amount.isFinite() || amount.lt(0)) {
    throw new Error("Schedule F agricultural payment sources require actual same-year cash-farm facts and an owner.");
  }
  const ids = new Set<string>();
  const references = new Set<string>();
  let taxable = d(0);
  let excluded = d(0);
  for (const row of source.payments) {
    const payment = d(row.taxableAmount);
    const date = new Date(`${row.receivedDate}T00:00:00Z`);
    const sourceId = row.sourceId.trim().toLowerCase();
    const reference = row.sourceReference.trim().replace(/\s+/g, " ").toLowerCase();
    if (!sourceId || !reference || ids.has(sourceId) || references.has(reference) || row.accountHolder !== owner
      || !row.receivedDate.startsWith(`${year}-`) || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== row.receivedDate || !payment.isFinite() || !payment.gt(0)) {
      throw new Error("Schedule F agricultural payment sources require unique original receipts, exact positive amounts and the actual owner.");
    }
    ids.add(sourceId);
    references.add(reference);
    taxable = taxable.plus(payment);
    if (row.program === "crp-annual-rental") {
      const qualifyingBenefit = row.benefitAtReceipt === "ssa-retirement" || row.benefitAtReceipt === "ssa-disability";
      if ((!qualifyingBenefit && row.benefitAtReceipt !== "none") || !row.benefitSourceReference?.trim()
        || row.noAttributableScheduleFDeductionsConfirmed !== true) {
        throw new Error("CRP receipt requires benefit evidence at the payment date and confirmation of zero attributable Schedule F deductions.");
      }
      if (qualifyingBenefit) {
        const annualSourceId = row.annualBenefitStatementSourceId?.trim();
        const originals = annualSourceId ? input.formSSA1099?.filter(original => original.sourceId?.trim() === annualSourceId) : undefined;
        const annual = originals?.[0];
        if (originals?.length !== 1 || annual?.accountHolder !== owner || annual.sourceTaxYear !== year
          || !d(annual.netBenefits).isFinite()) {
          throw new Error("Cash-farm CRP needs the actual unique same-owner annual SSA-1099 and separate evidence of benefits at receipt.");
        }
        excluded = excluded.plus(payment);
      }
    }
  }
  if (!taxable.eq(amount)) throw new Error("Schedule F agricultural source receipts must equal the taxable program payment total.");
  return { accountHolder: owner, excluded, verified: true };
}
