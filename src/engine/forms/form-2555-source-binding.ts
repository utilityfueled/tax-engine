/** Actual original-source binding for one Form2555. Spec: form-2555-source-binding.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";

type SourceInput = Pick<TaxYearInput, "taxpayer" | "form2555" | "w2s" | "scheduleC" | "form1099Nec">;
const incomeKeys = ["foreignEmploymentIncomeIncludedOnW2", "foreignEmploymentIncomeNotOnW2", "foreignBusinessIncomeAlreadyReported", "foreignPartnershipIncomeAlreadyReported", "otherForeignIncomeAlreadyReported"] as const;
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !value.trim()) throw new Error(`Form2555 requires actual ${label}, including known zero`);
  const result = new Decimal(value);
  if (!result.isFinite() || result.isNegative()) throw new Error(`Form2555 ${label} must be finite and nonnegative`);
  return result;
}
const sameName = (left: string, right: string | undefined) => !!right?.trim() && left.trim().replace(/\s+/g, " ").toLowerCase() === right.trim().replace(/\s+/g, " ").toLowerCase();
const ein = (value: string | undefined) => value?.replace(/-/g, "");

export function resolveForm2555Sources(input: SourceInput) {
  const audit = new AuditTrail();
  const facts = input.form2555;
  const empty = { sourceFactsVerified: false, currentForeignIncome: new Decimal(0), priorYearIncomeReceived: new Decimal(0), lines: audit.getLines() };
  if (!facts) return empty;
  const year = input.taxpayer.taxYear;
  const source = facts.sourceMapping;
  if (!source && facts.accountHolder === undefined && year === 2025) return empty;
  if (!source || !source.sourceReference.trim() || source.sourceFactsConfirmed !== true || source.allSourcesIncluded !== true || source.oneOwnerOnlyConfirmed !== true) {
    throw new Error("Form2555 requires complete confirmed original sources for one taxpayer; two-owner claims need separate forms");
  }
  const owner = facts.accountHolder;
  if ((owner !== "primary" && owner !== "spouse") || (owner === "spouse" && (input.taxpayer.filingStatus !== "married_filing_jointly" || !input.taxpayer.spouse))) {
    throw new Error("Form2555 requires its actual owner in the return household");
  }
  if (facts.taxYear !== year) throw new Error("Form2555 original source year must match the actual return");
  if (!facts.incomeSources || facts.incomeSourceMappingConfirmed !== true) throw new Error("Form2555 requires the actual classified income-source amounts");
  const mapped = Object.fromEntries(incomeKeys.map(key => [key, amount(facts.incomeSources?.[key], key)])) as Record<typeof incomeKeys[number], Decimal>;
  if (mapped.foreignPartnershipIncomeAlreadyReported.gt(0) || mapped.otherForeignIncomeAlreadyReported.gt(0)) throw new Error("Form2555 positive partnership or other mappings require their separate original-source method");
  if (!facts.partIV || !amount(facts.partIV.businessPersonalServices, "PartIV business personal services").eq(mapped.foreignBusinessIncomeAlreadyReported)
    || !amount(facts.partIV.partnershipPersonalServices, "PartIV partnership personal services").eq(mapped.foreignPartnershipIncomeAlreadyReported)) {
    throw new Error("Form2555 PartIV business and partnership classifications must reconcile to their actual source categories");
  }
  const sums = Object.fromEntries(incomeKeys.map(key => [key, new Decimal(0)])) as Record<typeof incomeKeys[number], Decimal>;
  let prior = new Decimal(0);
  const seen = new Set<string>();
  const nonW2References = new Set<string>();
  for (const row of source.rows) {
    if (seen.has(row.sourceId)) throw new Error("Form2555 duplicate original income source");
    seen.add(row.sourceId);
    if (row.accountHolder !== owner) throw new Error("Form2555 source owner does not match its taxpayer");
    if (row.sourceTaxYear !== year) throw new Error("Form2555 source reporting year does not match the return");
    if (!row.sourceReference.trim() || !row.payerName.trim()) throw new Error("Form2555 requires original source reference and payer identity");
    const current = amount(row.foreignEarnedIncome, "current foreign receipts");
    const priorReceived = amount(row.priorYearIncomeReceived, "prior-year services received this year");
    const combined = current.plus(priorReceived);
    let key: typeof incomeKeys[number];
    const w2Match = /^formW2:(0|[1-9]\d*)$/.exec(row.sourceId);
    if (w2Match) {
      const original = input.w2s[Number(w2Match[1])];
      if (!original) throw new Error("Form2555 original W2 source does not exist");
      if (original.accountHolder !== owner) throw new Error("Form2555 original W2 owner is unknown or conflicting");
      if (original.taxYear !== year) throw new Error("Form2555 original W2 year is unknown or conflicting");
      if (!sameName(row.payerName, original.employer.name) || !/^\d{9}$/.test(ein(row.payerEin) ?? "") || ein(row.payerEin) !== ein(original.employer.ein)) throw new Error("Form2555 original W2 employer identity does not reconcile");
      if (combined.gt(amount(original.wages, "original W2 Box1 wages"))) throw new Error("Form2555 current and prior foreign receipts exceed the original W2 income");
      key = "foreignEmploymentIncomeIncludedOnW2";
    } else if (row.sourceId === "scheduleC") {
      const business = input.scheduleC;
      if (!business || business.accountHolder !== owner) throw new Error("Form2555 requires the actual ScheduleC owner");
      if (!sameName(row.payerName, business.businessName) || (row.payerEin !== undefined && ein(row.payerEin) !== ein(business.ein))) throw new Error("Form2555 actual business identity does not reconcile");
      // These are the canonical ScheduleC lines1-7 source rules, never a supplied profit.
      // If receipts are already supplied, NECs are included once, not added again.
      const receipts = business.grossReceipts !== undefined ? amount(business.grossReceipts, "ScheduleC gross receipts")
        : input.form1099Nec.reduce((total, entry) => {
          if (entry.accountHolder !== owner) throw new Error("Form2555 included NEC source has an unknown or conflicting business owner");
          return total.plus(amount(entry.nonemployeeCompensation, "original NEC compensation"));
        }, new Decimal(0));
      const returns = amount(row.businessReturnsAndAllowances, "source ScheduleC returns and allowances");
      const cogs = amount(row.businessCostOfGoodsSold, "source ScheduleC cost of goods sold");
      const other = amount(row.businessOtherIncome, "source ScheduleC other income");
      if (!amount(row.businessGrossReceipts, "source ScheduleC gross receipts").eq(receipts)
        || !returns.eq(amount(business.returnsAndAllowances, "ScheduleC returns and allowances"))
        || !cogs.eq(amount(business.costOfGoodsSold, "ScheduleC cost of goods sold"))
        || !other.eq(amount(business.otherIncome, "ScheduleC other income"))) throw new Error("Form2555 original business receipts do not reconcile to canonical ScheduleC income");
      const grossIncome = receipts.minus(returns).minus(cogs).plus(other);
      if (combined.gt(grossIncome)) throw new Error("Form2555 current and prior foreign receipts exceed actual ScheduleC gross income");
      key = "foreignBusinessIncomeAlreadyReported";
    } else if (/^foreignEmployment:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(row.sourceId)) {
      if (row.notIncludedInW2Confirmed !== true) throw new Error("Form2555 separate foreign employment must be confirmed absent from W2 income");
      if (priorReceived.gt(0)) throw new Error("Form2555 prior non-W2 employment requires its separate current-income source method");
      const reference = row.sourceReference.trim();
      if (nonW2References.has(reference)) throw new Error("Form2555 duplicate separate employment source reference");
      nonW2References.add(reference);
      key = "foreignEmploymentIncomeNotOnW2";
    } else throw new Error("Form2555 unsupported or aliased original income source identifier");
    sums[key] = sums[key].plus(current);
    prior = prior.plus(priorReceived);
    audit.record("Form2555 source mapping", row.sourceId, "Actual current foreign receipts already classified by return source", current, "Original one-owner source subset, separately conserved from prior-year services", { owner, sourceId: row.sourceId, priorYearIncomeReceived: priorReceived });
  }
  for (const key of incomeKeys) if (!sums[key].eq(mapped[key])) throw new Error(`Form2555 original sources do not reconcile ${key}`);
  const current = Object.values(sums).reduce((total, value) => total.plus(value), new Decimal(0));
  if (!current.eq(amount(facts.foreignEarnedIncome, "current foreign earned income"))) throw new Error("Form2555 original receipts do not reconcile current foreign earned income");
  const priorExclusion = amount(facts.priorYearIncomeExclusion, "prior-year income exclusion");
  if (facts.priorYearIncomeReceived !== undefined || prior.gt(0) || priorExclusion.gt(0)) {
    if (!prior.eq(amount(facts.priorYearIncomeReceived, "prior-year services received this year"))) throw new Error("Form2555 original sources do not reconcile prior-year income received");
    if (priorExclusion.gt(prior)) throw new Error("Form2555 prior exclusion exceeds income actually included in current gross income");
  }
  return { sourceFactsVerified: true, currentForeignIncome: current, priorYearIncomeReceived: prior, lines: audit.getLines() };
}
