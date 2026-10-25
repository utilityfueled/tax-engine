/** Actual source worksheet. Spec: spec/federal/form-7206.yaml. */
import Decimal from "decimal.js";
import type { Form7206Input, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

type Owner = "primary" | "spouse";
type BusinessKind = "self_employed" | "partnership" | "s_corporation";

/** Values computed from the actual return, never user profit overrides. */
export interface Form7206BusinessContext {
  sourceId: string;
  accountHolder: Owner;
  kind: BusinessKind;
  /** Form7206 line4, including actual optional-method amounts when applicable. */
  netIncome?: Decimal;
  ownerPositiveBusinessIncome?: Decimal;
  ownerDeductibleSelfEmploymentTax?: Decimal;
  attributableRetirementDeduction?: Decimal;
  attributableForeignExclusion?: Decimal;
  sCorporationMedicareWages?: Decimal;
}

export interface Form7206BusinessResult {
  businessSourceId: string;
  accountHolder: Owner;
  kind: BusinessKind;
  planIds: string[];
  medicalPremiums: Decimal;
  longTermCarePremiums: Decimal;
  eligiblePremiums: Decimal;
  /** Source premiums for the separate Pub974 worksheet; excluded from line1. */
  specifiedPremiums: Decimal;
  netIncome?: Decimal;
  ownerPositiveBusinessIncome?: Decimal;
  incomeRatio?: Decimal;
  allocatedSelfEmploymentTax?: Decimal;
  incomeAfterSelfEmploymentTax?: Decimal;
  attributableRetirementDeduction?: Decimal;
  incomeAfterRetirement?: Decimal;
  sCorporationMedicareWages?: Decimal;
  attributableForeignExclusion?: Decimal;
  earnedIncomeLimit?: Decimal;
  deduction?: Decimal;
  eligiblePremiumExcess?: Decimal;
}

export interface Form7206Result {
  sourceFactsVerified: true;
  calculationComplete: boolean;
  grossSourcePremiums: Decimal;
  paidSourcePremiums: Decimal;
  marketplaceHandling?: "separate-specified-premiums" | "ordinary-no-ptc";
  businesses: Form7206BusinessResult[];
  sourceRecords: { sourceId: string; planId: string; accountHolder: Owner; businessSourceId: string; personId: string; payer: "owner_after_tax" | "business_paid_or_reimbursed"; amountPaid: Decimal; advancePremiumTaxCredit: Decimal; coverageTaxYear: number; coverageMonth: number; excludedFunding: Decimal; eligiblePremium: Decimal; marketplaceSpecifiedPremium: Decimal }[];
  longTermCarePersons: { personId: string; attainedAge: number; eligiblePremiums: Decimal; annualLimit: Decimal; allowedPremiums: Decimal }[];
  deduction?: Decimal;
  /** Potential review amount only. No automatic ScheduleA qualification. */
  eligiblePremiumExcess?: Decimal;
  lines: CalculatedLine[];
}

function requiredText(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Form7206 requires actual ${name}.`);
  return value.trim();
}
function actualBoolean(value: boolean | undefined, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Form7206 requires actual ${name}; unknown is not false.`);
  return value;
}
function amount(value: string | undefined, name: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error(`Form7206 requires actual nonnegative ${name}; unknown is not zero.`);
  return d(value);
}
function canonical(value: Decimal | undefined, name: string, signed = false): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || (!signed && value.isNegative())) throw new Error(`Form7206 requires actual canonical ${name}.`);
  return value;
}
function validMonth(value: number | undefined): number {
  if (!Number.isInteger(value) || value! < 1 || value! > 12) throw new Error("Form7206 requires an actual coverage month.");
  return value!;
}
function datePaid(value: string | undefined): string {
  const date = requiredText(value, "payment date");
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Form7206 requires an actual calendar payment date.");
  return date;
}
const groupKey = (owner: Owner, source: string) => `${owner}:${source}`;

export function calculateForm7206(options: {
  taxYear: number;
  filingStatus: TaxYearInput["taxpayer"]["filingStatus"];
  facts: Form7206Input;
  businesses?: Form7206BusinessContext[];
  /** Internal worksheet preparation: never itself allows a specified deduction. */
  marketplaceHandling?: "separate-specified-premiums" | "ordinary-no-ptc";
}): Form7206Result {
  const { facts, taxYear } = options;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Form7206 supports actual 2025 and 2026 sources.");
  if (facts.sourceTaxYear !== taxYear) throw new Error("Form7206 source year must match the return.");
  requiredText(facts.sourceReference, "source worksheet reference");
  if (facts.sourceFactsConfirmed !== true || facts.allPlansIncluded !== true) throw new Error("Confirm all actual Form7206 plans and sources after the last edit.");
  if (!facts.persons || !facts.plans) throw new Error("Form7206 requires actual person and plan records, including empty lists for none.");
  const constants = taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(taxYear);
  const people = new Map<string, NonNullable<Form7206Input["persons"]>[number]>();
  const roles = new Set<string>();
  for (const person of facts.persons) {
    const id = requiredText(person.personId, "covered-person ID");
    requiredText(person.name, "covered-person name");
    if (people.has(id)) throw new Error("Duplicate Form7206 covered-person ID.");
    if (!person.householdRole) throw new Error("Form7206 requires the actual covered-person household role.");
    if (person.householdRole !== "other") {
      if (roles.has(person.householdRole)) throw new Error("Duplicate Form7206 taxpayer identity under different person IDs.");
      roles.add(person.householdRole);
    }
    if (person.attainedAgeAtYearEnd !== undefined && (!Number.isInteger(person.attainedAgeAtYearEnd) || person.attainedAgeAtYearEnd < 0 || person.attainedAgeAtYearEnd > 120)) throw new Error("Form7206 requires actual attained age at year end.");
    people.set(id, person);
  }
  const groups = new Map<string, Form7206BusinessResult>();
  const ltc = new Map<string, Map<string, Decimal>>();
  const paymentIds = new Set<string>();
  const planIds = new Set<string>();
  const monthlyEligibility = new Map<string, boolean>();
  const psoExcludedByOwner = new Map<Owner, Decimal>();
  const sourceRecords: Form7206Result["sourceRecords"] = [];
  let grossSourcePremiums = new Decimal(0);
  let paidSourcePremiums = new Decimal(0);
  const audit = new AuditTrail();
  for (const plan of facts.plans) {
    const planId = requiredText(plan.planId, "plan ID");
    requiredText(plan.policyReference, "policy reference");
    if (planIds.has(planId)) throw new Error("Duplicate Form7206 plan ID.");
    planIds.add(planId);
    const owner = plan.accountHolder;
    if (!owner) throw new Error("Form7206 requires an actual plan owner.");
    if (owner === "spouse" && options.filingStatus !== "married_filing_jointly") throw new Error("A spouse-owned Form7206 source requires a joint return.");
    const sourceId = requiredText(plan.businessSourceId, "business source ID");
    const kind = plan.businessKind;
    if (!kind || (kind === "self_employed" && !/^(scheduleC|scheduleF|cryptoBusiness)$/.test(sourceId)) || (kind === "partnership" && !/^scheduleK1:\d+$/.test(sourceId)) || (kind === "s_corporation" && !/^formW2:\d+$/.test(sourceId))) throw new Error("Reconcile the Form7206 actual business kind and source ID.");
    if (!plan.kind || !plan.policyHolder) throw new Error("Form7206 requires actual insurance and policy-holder classifications.");
    const key = groupKey(owner, sourceId);
    let group = groups.get(key);
    if (!group) {
      group = { businessSourceId: sourceId, accountHolder: owner, kind, planIds: [], medicalPremiums: new Decimal(0), longTermCarePremiums: new Decimal(0), eligiblePremiums: new Decimal(0), specifiedPremiums: new Decimal(0) };
      groups.set(key, group);
    } else if (group.kind !== kind) throw new Error("Form7206 plans contradict their shared business source classification.");
    group.planIds.push(planId);
    const established = actualBoolean(plan.establishedUnderBusiness, "plan establishment under the business");
    const qualifiedInsurance = actualBoolean(plan.insuranceQualificationConfirmed, "insurance qualification");
    const shareholder = kind === "s_corporation" ? actualBoolean(plan.moreThanTwoPercentShareholder, "more-than-two-percent shareholder status") : true;
    const marketplace = actualBoolean(plan.marketplaceCoverage, "Marketplace coverage");
    const ptc = actualBoolean(plan.premiumTaxCreditInvolved, "premium tax credit or advance credit involvement");
    if (!marketplace && ptc) throw new Error("Reconcile the Form7206 Marketplace and premium tax credit facts.");
    const clergy = actualBoolean(plan.clergySpecialRules, "clergy special-rule applicability");
    if (!plan.coveredPersons || !plan.months || !plan.payments) throw new Error("Form7206 requires actual covered-person, month and payment records.");
    const covered = new Map<string, boolean>();
    for (const entry of plan.coveredPersons) {
      const id = requiredText(entry.personId, "plan covered-person ID");
      const person = people.get(id);
      if (!person || covered.has(id)) throw new Error("Unlinked or duplicate Form7206 covered-person source.");
      const relationship = entry.relationshipToOwner;
      if (!relationship) throw new Error("Form7206 requires the actual person's relationship to the business owner.");
      let eligible: boolean;
      if (relationship === "self" || relationship === "spouse") {
        const expected = relationship === "self" ? owner : owner === "primary" ? "spouse" : "primary";
        if (person.householdRole !== expected) throw new Error("Reconcile actual Form7206 owner and covered-person identity.");
        eligible = true;
      } else if (relationship === "dependent") {
        if (person.householdRole !== "other") throw new Error("A Form7206 taxpayer cannot be their own dependent source.");
        eligible = actualBoolean(entry.dependencyEligibilityConfirmed, "covered dependent eligibility");
      } else if (relationship === "child_under_27") {
        if (person.householdRole !== "other" || person.attainedAgeAtYearEnd === undefined) throw new Error("Form7206 requires the actual child identity and attained age.");
        eligible = person.attainedAgeAtYearEnd < 27;
      } else eligible = false;
      covered.set(id, eligible);
    }
    const months = new Map<number, boolean>();
    for (const entry of plan.months) {
      const month = validMonth(entry.month);
      if (months.has(month)) throw new Error("Duplicate Form7206 coverage month.");
      const eligible = actualBoolean(entry.employerSubsidizedPlanEligible, "monthly employer-plan eligibility");
      const monthKey = `${owner}:${plan.kind}:${month}`;
      if (monthlyEligibility.has(monthKey) && monthlyEligibility.get(monthKey) !== eligible) throw new Error("Form7206 plans contradict actual same-owner monthly employer eligibility.");
      monthlyEligibility.set(monthKey, eligible);
      months.set(month, eligible);
    }
    for (const payment of plan.payments) {
      const paymentId = requiredText(payment.sourceId, "premium payment source ID");
      if (paymentIds.has(paymentId)) throw new Error("Duplicate Form7206 premium payment source.");
      paymentIds.add(paymentId);
      const paidDate = datePaid(payment.datePaid);
      const coverageYear = payment.coverageTaxYear;
      if (coverageYear === undefined || !Number.isInteger(coverageYear)) throw new Error("Form7206 requires an actual coverage tax year.");
      const month = validMonth(payment.coverageMonth);
      if (!months.has(month)) throw new Error("Form7206 payment lacks actual monthly employer-plan eligibility.");
      const gross = amount(payment.grossPremium, "original premium");
      const ownPaid = amount(payment.ownerOrBusinessPaid, "owner or business paid share");
      const others = amount(payment.otherPersonPaid, "other person's paid share");
      const advance = marketplace && ptc
        ? amount(payment.advancePremiumTaxCredit, "Pub974 Marketplace advance payment")
        : payment.advancePremiumTaxCredit === undefined ? new Decimal(0) : amount(payment.advancePremiumTaxCredit, "advance payment");
      if (advance.gt(0) && (!marketplace || !ptc)) throw new Error("Form7206 advance payments contradict the actual Marketplace source facts.");
      if (!ownPaid.plus(others).plus(advance).eq(gross)) throw new Error("Form7206 paid shares and APTC must reconcile the original premium.");
      if (!payment.personAmounts) throw new Error("Form7206 requires actual covered-person premium allocations.");
      grossSourcePremiums = grossSourcePremiums.plus(gross);
      paidSourcePremiums = paidSourcePremiums.plus(ownPaid);
      const allocatedPersonPayers = new Set<string>();
      let allocated = new Decimal(0), allocatedAdvance = new Decimal(0);
      for (const allocation of payment.personAmounts) {
        const id = requiredText(allocation.personId, "premium allocation person ID");
        const payer = allocation.payer;
        if (!payer) throw new Error("Form7206 requires the actual premium payer; business reimbursement is not personal after-tax payment.");
        const personPayer = `${id}:${payer}`;
        if (!covered.has(id) || allocatedPersonPayers.has(personPayer)) throw new Error("Unlinked or duplicate person and payer allocation in Form7206 premium source.");
        allocatedPersonPayers.add(personPayer);
        const paid = amount(allocation.amountPaid, "person premium share");
        const personAdvance = marketplace && ptc
          ? amount(allocation.advancePremiumTaxCredit, "person advance payment")
          : allocation.advancePremiumTaxCredit === undefined ? new Decimal(0) : amount(allocation.advancePremiumTaxCredit, "person advance payment");
        allocatedAdvance = allocatedAdvance.plus(personAdvance);
        const pso = amount(allocation.excludedPublicSafetyOfficerAmount, "excluded public-safety-officer payments");
        const funded = pso.plus(amount(allocation.otherTaxFreeFunding, "other distinct tax-free funding"));
        if (funded.gt(paid)) throw new Error("Form7206 tax-free funding exceeds the person's actual paid premium.");
        allocated = allocated.plus(paid);
        const currentYear = paidDate.startsWith(`${taxYear}-`) && payment.coverageTaxYear === taxYear;
        if (pso.gt(0)) {
          const officer = allocation.publicSafetyOfficerAccountHolder;
          if (!officer) throw new Error("Form7206 requires the actual public-safety-officer owner identity for excluded payments.");
          if (officer === "spouse" && options.filingStatus !== "married_filing_jointly") throw new Error("Spouse public-safety-officer exclusions require the actual joint return source.");
          if (currentYear) psoExcludedByOwner.set(officer, (psoExcludedByOwner.get(officer) ?? new Decimal(0)).plus(pso));
        }
        // A partner may personally pay a partnership-held policy. Individually
        // held partner policies and all Scorp policies require business payment
        // or reimbursement plus the actual GP/Box1 income inclusion.
        let payerEstablished = true;
        if (kind !== "self_employed") {
          payerEstablished = payer === "owner_after_tax"
            ? kind === "partnership" && plan.policyHolder === "business"
            : actualBoolean(plan.premiumsIncludedInOwnerIncome, "premium inclusion in owner income");
        }
        const otherwiseEligible = currentYear && established && shareholder && payerEstablished && qualifiedInsurance && covered.get(id) && !months.get(month);
        const grossEligiblePremium = otherwiseEligible ? paid.plus(personAdvance).minus(funded) : new Decimal(0);
        const specified = marketplace && ptc;
        if (grossEligiblePremium.gt(0) && specified && options.marketplaceHandling === undefined) throw new Error("Form7206 Marketplace premiums require actual Pub974 premium-tax-credit coordination.");
        if (specified && plan.kind !== "medical") throw new Error("Form7206 specified Marketplace premiums require an actual qualified medical plan.");
        const marketplaceSpecifiedPremium = specified ? grossEligiblePremium : new Decimal(0);
        const eligiblePremium = specified && options.marketplaceHandling !== "ordinary-no-ptc" ? new Decimal(0) : grossEligiblePremium;
        group.specifiedPremiums = group.specifiedPremiums.plus(marketplaceSpecifiedPremium);
        if (grossEligiblePremium.gt(0) && clergy) throw new Error("Form7206 clergy premiums require the actual Pub517 special-rule worksheet.");
        if (plan.kind === "qualified_ltc") {
          const byBusiness = ltc.get(id) ?? new Map<string, Decimal>();
          byBusiness.set(key, (byBusiness.get(key) ?? new Decimal(0)).plus(eligiblePremium));
          ltc.set(id, byBusiness);
        } else group.medicalPremiums = group.medicalPremiums.plus(eligiblePremium);
        sourceRecords.push({ sourceId: paymentId, planId, accountHolder: owner, businessSourceId: sourceId, personId: id, payer, amountPaid: paid, advancePremiumTaxCredit: personAdvance, coverageTaxYear: coverageYear, coverageMonth: month, excludedFunding: funded, eligiblePremium, marketplaceSpecifiedPremium });
        if (specified) audit.record("Pub974 Premium Sources", `${paymentId}:${id}:${payer}`, "Actual specified premium before credit coordination", marketplaceSpecifiedPremium, "Eligible owner/business paid share plus actual APTC less distinct funding; excluded from Form7206line1", { "Plan": planId, "Business": sourceId, "Owner": owner, "Coverage month": String(month), "Actual advance payment": personAdvance });
        audit.record("Form 7206", `${paymentId}:${id}:${payer}`, "Actual eligible premium before annual LTC and business limits", eligiblePremium, "Actual paid person share less distinct funding, subject to actual plan, person, payer, year and month qualification", { "Source": paymentId, "Plan": planId, "Owner": owner, "Business": sourceId, "Payer": payer, "Paid share": paid, "Funding": funded });
      }
      if (!allocated.eq(ownPaid) || !allocatedAdvance.eq(advance)) throw new Error("Form7206 person allocations must reconcile the actual owner/business and advance payment shares separately.");
    }
  }
  for (const excluded of psoExcludedByOwner.values()) if (excluded.gt(3000)) throw new Error("Reconcile the actual public-safety-officer exclusion; annual owner amounts exceed 3000.");
  const explicitLtc = new Map<string, Map<string, Decimal>>();
  for (const entry of facts.longTermCareAllocations ?? []) {
    const person = requiredText(entry.personId, "LTC allocation person ID");
    if (!entry.accountHolder) throw new Error("Form7206 LTC allocation requires its actual owner.");
    const key = groupKey(entry.accountHolder, requiredText(entry.businessSourceId, "LTC allocation business source"));
    if (!ltc.get(person)?.has(key)) throw new Error("Unlinked LTC business allocation.");
    const byBusiness = explicitLtc.get(person) ?? new Map<string, Decimal>();
    if (byBusiness.has(key)) throw new Error("Duplicate LTC business allocation.");
    byBusiness.set(key, amount(entry.allowedPremium, "allocated LTC premium"));
    explicitLtc.set(person, byBusiness);
  }
  const longTermCarePersons: Form7206Result["longTermCarePersons"] = [];
  for (const [id, byBusiness] of ltc) {
    const age = people.get(id)?.attainedAgeAtYearEnd;
    if (age === undefined) throw new Error("Form7206 LTC requires the person's actual attained age at year end.");
    const limits = constants.longTermCarePremiumLimits;
    const cap = age <= 40 ? limits.age40OrUnder : age <= 50 ? limits.age41to50 : age <= 60 ? limits.age51to60 : age <= 70 ? limits.age61to70 : limits.age71OrOlder;
    const total = [...byBusiness.values()].reduce((sum, value) => sum.plus(value), new Decimal(0));
    const allowed = Decimal.min(total, cap);
    const supplied = explicitLtc.get(id);
    if (!supplied && byBusiness.size > 1 && total.gt(cap)) throw new Error("Form7206 requires actual LTC cap allocation between competing businesses.");
    let assigned = new Decimal(0);
    for (const [key, eligible] of byBusiness) {
      const allocation = supplied ? supplied.get(key) : byBusiness.size === 1 ? allowed : eligible;
      if (allocation === undefined || allocation.gt(eligible)) throw new Error("Reconcile actual LTC business allocations with eligible source premiums.");
      assigned = assigned.plus(allocation);
      groups.get(key)!.longTermCarePremiums = groups.get(key)!.longTermCarePremiums.plus(allocation);
    }
    if (!assigned.eq(allowed)) throw new Error("LTC business allocations must reconcile the single person's annual cap.");
    longTermCarePersons.push({ personId: id, attainedAge: age, eligiblePremiums: total, annualLimit: cap, allowedPremiums: allowed });
  }
  for (const group of groups.values()) {
    group.eligiblePremiums = group.medicalPremiums.plus(group.longTermCarePremiums);
    const inputs = { "Owner": group.accountHolder, "Business": group.businessSourceId };
    audit.record("Form 7206", "1", "Eligible medical and voluntary Medicare premiums", group.medicalPremiums, "Sum actual eligible monthly medical premiums", inputs);
    audit.record("Form 7206", "2", "Eligible long-term-care premiums", group.longTermCarePremiums, "Actual source premiums after one annual cap per person", inputs);
    audit.record("Form 7206", "3", "Total eligible premiums", group.eligiblePremiums, "Line 1 plus line 2", inputs);
  }
  const result: Form7206Result = { sourceFactsVerified: true, calculationComplete: false, grossSourcePremiums, paidSourcePremiums, marketplaceHandling: options.marketplaceHandling, businesses: [...groups.values()], sourceRecords, longTermCarePersons, lines: audit.getLines() };
  if (options.businesses === undefined) return result;
  const contexts = new Map<string, Form7206BusinessContext>();
  const ownerValues = new Map<Owner, { positive: Decimal; seTax: Decimal }>();
  for (const context of options.businesses) {
    const key = groupKey(context.accountHolder, context.sourceId);
    if (contexts.has(key)) throw new Error("Duplicate canonical Form7206 business context.");
    contexts.set(key, context);
    if (context.kind !== "s_corporation") {
      const positive = canonical(context.ownerPositiveBusinessIncome, "owner positive business income");
      const seTax = canonical(context.ownerDeductibleSelfEmploymentTax, "owner deductible SE tax");
      const previous = ownerValues.get(context.accountHolder);
      if (previous && (!previous.positive.eq(positive) || !previous.seTax.eq(seTax))) throw new Error("Canonical Form7206 same-owner source totals contradict one another.");
      ownerValues.set(context.accountHolder, { positive, seTax });
    }
  }
  let deduction = new Decimal(0);
  let excess = new Decimal(0);
  const usedPositiveIncome = new Map<Owner, Decimal>();
  for (const [key, group] of groups) {
    const context = contexts.get(key);
    if (!context || context.kind !== group.kind) throw new Error("Form7206 plan lacks its matching canonical business source.");
    const inputs = { "Owner": group.accountHolder, "Business": group.businessSourceId };
    let income: Decimal;
    if (context.kind === "s_corporation") {
      group.sCorporationMedicareWages = canonical(context.sCorporationMedicareWages, "S corporation Medicare wages");
      income = group.sCorporationMedicareWages;
      audit.record("Form 7206", "11", "Actual S corporation Medicare wages", income, "Bound actual Form W2 Box5", inputs);
    } else {
      group.netIncome = canonical(context.netIncome, "source net income", true);
      usedPositiveIncome.set(group.accountHolder, (usedPositiveIncome.get(group.accountHolder) ?? new Decimal(0)).plus(Decimal.max(0, group.netIncome)));
      group.ownerPositiveBusinessIncome = canonical(context.ownerPositiveBusinessIncome, "owner positive business income");
      if (group.netIncome.gt(group.ownerPositiveBusinessIncome)) throw new Error("Canonical positive business income is less than the bound source income.");
      group.incomeRatio = group.netIncome.lte(0) ? new Decimal(0) : group.netIncome.div(group.ownerPositiveBusinessIncome);
      group.allocatedSelfEmploymentTax = canonical(context.ownerDeductibleSelfEmploymentTax, "owner deductible SE tax").times(group.incomeRatio);
      group.incomeAfterSelfEmploymentTax = group.netIncome.minus(group.allocatedSelfEmploymentTax);
      group.attributableRetirementDeduction = canonical(context.attributableRetirementDeduction, "same-business retirement deduction");
      group.incomeAfterRetirement = group.incomeAfterSelfEmploymentTax.minus(group.attributableRetirementDeduction);
      income = group.incomeAfterRetirement;
      audit.record("Form 7206", "4", "Actual business income", group.netIncome, "Canonical business profit or actual optional-method source", inputs);
      audit.record("Form 7206", "5", "Same-owner positive business income", group.ownerPositiveBusinessIncome, "Canonical positive business sources excluding losses", inputs);
      audit.record("Form 7206", "6", "Business share of positive income", group.incomeRatio, "Line4 divided by line5 for positive business income", inputs);
      audit.record("Form 7206", "7", "Allocated deductible SE tax", group.allocatedSelfEmploymentTax, "Owner's Schedule1 line15 times line6", inputs);
      audit.record("Form 7206", "8", "Income after allocated SE deduction", group.incomeAfterSelfEmploymentTax, "Line4 minus line7", inputs);
      audit.record("Form 7206", "9", "Same-business retirement deduction", group.attributableRetirementDeduction, "Actual attributable Schedule1 line16", inputs);
      audit.record("Form 7206", "10", "Income after retirement deduction", income, "Line8 minus line9", inputs);
    }
    group.attributableForeignExclusion = canonical(context.attributableForeignExclusion, "same-business foreign exclusion");
    group.earnedIncomeLimit = Decimal.max(0, income.minus(group.attributableForeignExclusion));
    group.deduction = Decimal.min(group.eligiblePremiums, group.earnedIncomeLimit);
    group.eligiblePremiumExcess = group.eligiblePremiums.minus(group.deduction);
    deduction = deduction.plus(group.deduction);
    excess = excess.plus(group.eligiblePremiumExcess);
    audit.record("Form 7206", "12", "Attributable foreign exclusion", group.attributableForeignExclusion, "Actual Form2555 line45 attributable to line4 or11", inputs);
    audit.record("Form 7206", "13", "Available business income limit", group.earnedIncomeLimit, "max(0,line10 or11 minus line12)", inputs);
    audit.record("Form 7206", "14", "Self-employed health insurance deduction", group.deduction, "min(line3,line13)", inputs);
  }
  for (const [owner, positive] of usedPositiveIncome) {
    if (positive.gt(ownerValues.get(owner)!.positive)) throw new Error("Canonical Form7206 bound business totals exceed the owner's actual positive business income.");
  }
  return { ...result, calculationComplete: true, deduction, eligiblePremiumExcess: excess, lines: audit.getLines() };
}
