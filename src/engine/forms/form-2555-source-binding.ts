/** Actual original-source binding for one Form2555. Spec: form-2555-source-binding.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";

/** Only actual consumed source fields; callers need not manufacture taxpayer IDs. */
export interface Form2555SourceContext {
  taxpayer: Pick<TaxYearInput["taxpayer"], "taxYear" | "filingStatus"> & { spouse?: object };
  form2555?: TaxYearInput["form2555"];
  w2s: { employer: { name: string; ein: string }; accountHolder?: string; taxYear?: number; wages?: string }[];
  scheduleC?: { accountHolder?: string; businessName?: string; ein?: string; grossReceipts?: string; returnsAndAllowances?: string; costOfGoodsSold?: string; otherIncome?: string };
  form1099Nec: { accountHolder?: string; nonemployeeCompensation?: string }[];
  scheduleK1?: { accountHolder?: string; taxYear?: number; partnershipName?: string; partnershipEIN?: string; selfEmploymentEarnings?: string; section199AQBI?: string; section199AW2Wages?: string; section199AUBIA?: string }[];
}
const incomeKeys = ["foreignEmploymentIncomeIncludedOnW2", "foreignEmploymentIncomeNotOnW2", "foreignBusinessIncomeAlreadyReported", "foreignPartnershipIncomeAlreadyReported", "otherForeignIncomeAlreadyReported"] as const;
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !value.trim()) throw new Error(`Form2555 requires actual ${label}, including known zero`);
  const result = new Decimal(value);
  if (!result.isFinite() || result.isNegative()) throw new Error(`Form2555 ${label} must be finite and nonnegative`);
  return result;
}
const sameName = (left: string, right: string | undefined) => !!right?.trim() && left.trim().replace(/\s+/g, " ").toLowerCase() === right.trim().replace(/\s+/g, " ").toLowerCase();
const ein = (value: string | undefined) => value?.replace(/-/g, "");

export function resolveForm2555Sources(input: Form2555SourceContext) {
  const audit = new AuditTrail();
  const facts = input.form2555;
  const qbiForeignProfit: { sourceId: string; amount: Decimal; receipts: Decimal; capitalMaterial: boolean }[] = [];
  const scheduleCForeignShare: { foreign: Decimal; grossIncome: Decimal; capitalMaterialEarned?: Decimal; earned: Decimal; foreignBusinessExpenses?: Decimal }[] = [];
  const empty = { sourceFactsVerified: false, currentForeignIncome: new Decimal(0), priorYearIncomeReceived: new Decimal(0), qbiForeignProfit, scheduleCForeignShare, lines: audit.getLines() };
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
  if (mapped.otherForeignIncomeAlreadyReported.gt(0)) throw new Error("Form2555 positive other mappings require their separate original-source method");
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
      if (typeof row.capitalMaterialIncomeFactor !== "boolean") throw new Error("Form2555 business capital classification is unknown");
      const capital = row.capitalMaterialIncomeFactor;
      const foreignBusinessExpenses = row.foreignBusinessExpenses === undefined ? undefined : amount(row.foreignBusinessExpenses, "foreign business expenses");
      if (foreignBusinessExpenses !== undefined && (row.foreignBusinessExpensesConfirmed !== true || !row.foreignBusinessExpenseSourceReference?.trim())) throw new Error("Form2555 actual foreign business expenses need their confirmed original source");
      if (!capital && foreignBusinessExpenses?.gt(combined)) throw new Error("Form2555 actual foreign business expenses exceed foreign receipts; a foreign business loss needs its separate method");
      // Spec: business-capital-limit. The 30 percent limit runs in federal.ts, where the deduction exists.
      if (capital && row.allBusinessIncomeForeignConfirmed !== true) throw new Error("Form2555 a mixed U.S. and foreign business with capital as a material factor needs a separate method");
      if (capital && (row.reasonableAllowanceConfirmed !== true || row.reasonableServicesAllowance === undefined
        || combined.gt(amount(row.reasonableServicesAllowance, "reasonable allowance for services")))) throw new Error("Form2555 business receipts need a confirmed reasonable allowance for the services");
      if (capital && priorReceived.gt(0)) throw new Error("Form2555 prior business services with capital as a material factor require their separate method");
      // With capital material, receipts are only the earned part, and all the foreign profit is outside QBI.
      if (capital && grossIncome.lte(0)) throw new Error("Form2555 a business with no gross income where capital is material needs a separate method");
      if (capital || combined.gt(0)) scheduleCForeignShare.push(capital ? { foreign: grossIncome, grossIncome, capitalMaterialEarned: combined, earned: current, foreignBusinessExpenses } : { foreign: combined, grossIncome, earned: current, foreignBusinessExpenses });
      key = "foreignBusinessIncomeAlreadyReported";
    } else if (/^scheduleK1:(0|[1-9]\d*)$/.test(row.sourceId)) {
      // Spec: partnership-services. Box14 code A exists only for active service.
      const original = input.scheduleK1?.[Number(row.sourceId.slice("scheduleK1:".length))];
      if (!original || original.accountHolder !== owner || original.taxYear !== year) throw new Error("Form2555 original Schedule K-1 owner or year is unknown or conflicting");
      if (!sameName(row.payerName, original.partnershipName) || !/^\d{9}$/.test(ein(row.payerEin) ?? "") || ein(row.payerEin) !== ein(original.partnershipEIN)) throw new Error("Form2555 original Schedule K-1 identity does not reconcile");
      if (row.partnerPerformedServicesConfirmed !== true || typeof row.capitalMaterialIncomeFactor !== "boolean") throw new Error("Form2555 partner services and capital answers are unknown");
      // Spec: partnership-capital-limit. The 30 percent limit runs in federal.ts, where the deduction exists.
      if (row.capitalMaterialIncomeFactor && (row.reasonableAllowanceConfirmed !== true || row.reasonableServicesAllowance === undefined
        || combined.gt(amount(row.reasonableServicesAllowance, "reasonable allowance for services")))) throw new Error("Form2555 partnership receipts need a confirmed reasonable allowance for the services");
      if (priorReceived.gt(0)) throw new Error("Form2555 prior partnership services require their separate current-income source method");
      if (combined.gt(amount(original.selfEmploymentEarnings, "Schedule K-1 Box 14 code A"))) throw new Error("Form2555 partnership receipts exceed Schedule K-1 Box 14 code A");
      // Spec: qbi-foreign-profit. A K-1 statement may already omit this income from QBI.
      const foreignProfit = amount(row.qbiForeignProfit, "foreign profit inside QBI");
      // With capital material, receipts are only the earned part, and all the foreign profit is outside QBI.
      if (!row.capitalMaterialIncomeFactor && foreignProfit.gt(combined)) throw new Error("Form2555 foreign profit inside QBI exceeds the foreign receipts");
      if (foreignProfit.gt(new Decimal(original.section199AQBI ?? 0))) throw new Error("Form2555 foreign profit inside QBI exceeds the Schedule K-1 QBI");
      if (foreignProfit.isZero() && new Decimal(original.section199AQBI ?? 0).gt(0) && row.k1QbiExcludesForeignConfirmed !== true) throw new Error("Form2555 confirm that the Schedule K-1 QBI already omits this foreign profit");
      if (foreignProfit.gt(0) && (new Decimal(original.section199AW2Wages ?? 0).gt(0) || new Decimal(original.section199AUBIA ?? 0).gt(0))) throw new Error("Form2555 foreign profit inside K-1 QBI needs its wages and UBIA apportioned");
      qbiForeignProfit.push({ sourceId: row.sourceId, amount: foreignProfit, receipts: combined, capitalMaterial: row.capitalMaterialIncomeFactor });
      key = "foreignPartnershipIncomeAlreadyReported";
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
  return { sourceFactsVerified: true, currentForeignIncome: current, priorYearIncomeReceived: prior, qbiForeignProfit, scheduleCForeignShare, lines: audit.getLines() };
}
