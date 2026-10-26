/** Canonical owner/business binding. Spec: spec/federal/form-7206-return.yaml. */
import Decimal from "decimal.js";
import type { MarketplaceReportedRepaymentPayment } from "./marketplace-reported-repayment-payment.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";
import { calculateForm7206, type Form7206BusinessContext } from "./form-7206.js";
import type { QBIDeductionSourceAmount } from "./qbi-source-deductions.js";
import { calculateMarketplaceHealthPremiums } from "./marketplace-health-premiums.js";
import type { MarketplaceHealthDeductionResult } from "./marketplace-health-deduction.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateMarketplaceHealthLimit, type MarketplaceHealthLimitResult } from "./marketplace-health-limit.js";
import { calculateMarketplaceOwnerDeductions } from "./marketplace-health-owners.js";
import { calculateMarketplaceNonspecifiedStop } from "./marketplace-nonspecified-stop.js";

type Owner = "primary" | "spouse";
interface Params {
  input: TaxYearInput;
  scheduleCProfit: Decimal;
  scheduleFProfit: Decimal;
  cryptoBusinessProfit: Decimal;
  selfEmploymentDeductions: { accountHolder?: Owner; amount: Decimal }[];
  foreignIncomeExclusion: Decimal;
  selfEmploymentSourcesVerified: boolean;
  /** Engine-computed Pub974 stage; not a taxpayer amount or source fact. */
  marketplace?: { stage: "full-repayment"; reportedPayment?: MarketplaceReportedRepaymentPayment } | { stage: "worksheet-w" } | { stage: "maximum"; historicalLimit?: MarketplaceHealthLimitResult } | { stage: "final" | "ordered"; deduction: MarketplaceHealthDeductionResult };
  /** Canonical gross income, never a taxpayer supplied profit override. */
  businessGrossIncomes?: { sourceId: string; amount: Decimal }[];
}
const name = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
function attainedAge(date: string, year: number): number {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || date > `${year}-12-31`) throw new Error("Form7206 requires the covered person's actual valid birth date.");
  return year - parsed.getUTCFullYear() + (date.slice(5) === "01-01" ? 1 : 0);
}
function sourceAmount(value: string | undefined): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error("Form7206 income allocations require actual finite nonnegative amounts, including known zero.");
  return d(value);
}
export function calculateForm7206Return(params: Params) {
  const { input } = params;
  const facts = input.form7206;
  if (!facts) throw new Error("Canonical Form7206 requires actual source facts.");
  const year = input.taxpayer.taxYear, joint = input.taxpayer.filingStatus === "married_filing_jointly";
  if (input.seHealthInsuranceWorksheet || !d(input.adjustments?.selfEmployedHealthInsurance).isZero()) throw new Error("Reconcile legacy health-insurance amounts with actual Form7206; duplicate claim representations are unsupported.");
  const reportedPayment = params.marketplace?.stage === "full-repayment" ? params.marketplace.reportedPayment : undefined;
  const marketplaceHandling = params.marketplace?.stage === "full-repayment" ? (reportedPayment ? "reported-advance-repayment" as const : "full-advance-repayment" as const)
    : params.marketplace ? "separate-specified-premiums" as const : undefined;
  const source = calculateForm7206({ taxYear: year, filingStatus: input.taxpayer.filingStatus, facts, marketplaceSourceInput: input, marketplaceHandling, reportedPayment });
  if (source.businesses.some(row => row.kind !== "s_corporation") && !params.selfEmploymentSourcesVerified) throw new Error("Actual Form7206 requires verified business and payroll sources for the canonical SE deduction.");
  const householdName = (person: { firstName: string; lastName: string }) => name(`${person.firstName} ${person.lastName}`);
  for (const person of facts.persons ?? []) {
    const supplied = name(person.name ?? "");
    let household = person.householdRole === "primary" ? input.taxpayer.primary : person.householdRole === "spouse" ? input.taxpayer.spouse : undefined;
    if (person.householdRole === "other") {
      if (supplied === householdName(input.taxpayer.primary) || (input.taxpayer.spouse && supplied === householdName(input.taxpayer.spouse))) throw new Error("Form7206 actual taxpayer identity cannot use an other-person alias.");
      const matches = input.taxpayer.dependents.filter(dependent => householdName(dependent) === supplied);
      if (matches.length > 1) throw new Error("Form7206 covered-person household identity is ambiguous.");
      if (matches.length === 0) continue;
      household = matches[0];
    }
    if (!household || supplied !== householdName(household)) throw new Error("Form7206 covered-person name must match the actual household identity.");
    if (person.attainedAgeAtYearEnd !== attainedAge(household.dateOfBirth, year)) throw new Error("Form7206 attained age must reconcile the actual household birth date and return year.");
  }
  const owner = (value: Owner | undefined, label: string): Owner => {
    if (value === "spouse" && (!joint || !input.taxpayer.spouse)) throw new Error(`Form7206 ${label} spouse owner requires the actual joint household.`);
    if (!value && joint) throw new Error(`Form7206 ${label} requires the actual business owner.`);
    return value ?? "primary";
  };
  const businesses: Form7206BusinessContext[] = [];
  const add = (sourceId: string, amount: Decimal, accountHolder: Owner | undefined, kind: "self_employed" | "partnership") => {
    if (!amount.isFinite()) throw new Error("Form7206 canonical business income must be finite.");
    businesses.push({ sourceId, accountHolder: owner(accountHolder, sourceId), kind, netIncome: amount,
      attributableRetirementDeduction: d(0), attributableForeignExclusion: d(0) });
  };
  const necOwners = new Set(input.form1099Nec.filter(row => !d(row.nonemployeeCompensation).isZero()).map(row => row.accountHolder));
  const cOwner = input.scheduleC?.accountHolder ?? (necOwners.size === 1 ? [...necOwners][0] : undefined);
  if (necOwners.size > 1 || [...necOwners].some(value => value !== undefined && cOwner !== undefined && value !== cOwner)) throw new Error("Form7206 ScheduleC source contains contradictory owners.");
  if (input.scheduleC || !params.scheduleCProfit.isZero()) add("scheduleC", params.scheduleCProfit, cOwner, "self_employed");
  if (input.scheduleF || !params.scheduleFProfit.isZero()) add("scheduleF", params.scheduleFProfit, input.scheduleF?.accountHolder, "self_employed");
  if (!params.cryptoBusinessProfit.isZero() || facts.plans?.some(plan => plan.businessSourceId === "cryptoBusiness")) add("cryptoBusiness", params.cryptoBusinessProfit, input.cryptoIncome?.businessAccountHolder, "self_employed");
  input.scheduleK1.forEach((k1,index) => {
    if (k1.entityType === "s_corporation") return;
    if (k1.selfEmploymentFactsConfirmed !== true || k1.selfEmploymentEarnings === undefined || k1.selfEmploymentNetEarningsAfterAdjustments === undefined || k1.selfEmploymentIncomeType === undefined) throw new Error("Actual Form7206 requires confirmed K1 Box14 and adjusted business earnings before allocating the owner's income.");
    add(`scheduleK1:${index}`, d(k1.selfEmploymentNetEarningsAfterAdjustments), k1.accountHolder, "partnership");
  });
  const seByOwner = { primary: d(0), spouse: d(0) };
  for (const row of params.selfEmploymentDeductions) {
    if (!row.amount.isFinite() || row.amount.lt(0)) throw new Error("Form7206 canonical SE deduction must be finite and nonnegative.");
    if (row.amount.isZero()) continue;
    const holder = owner(row.accountHolder, "SE deduction"); seByOwner[holder] = seByOwner[holder].plus(row.amount);
  }
  for (const business of businesses) {
    business.ownerPositiveBusinessIncome = sum(...businesses.filter(row => row.accountHolder === business.accountHolder).map(row => Decimal.max(0, row.netIncome ?? d(0))));
    business.ownerDeductibleSelfEmploymentTax = seByOwner[business.accountHolder];
  }
  const corporationIds = new Set((facts.plans ?? []).filter(plan => plan.businessKind === "s_corporation").map(plan => plan.businessSourceId));
  for (const id of corporationIds) {
    const index = /^formW2:(\d+)$/.exec(id ?? "")?.[1];
    if (index !== undefined && id !== `formW2:${Number(index)}`) throw new Error("Form7206 requires canonical source identity; W2 index aliases cannot create another income limit.");
    const w2 = index === undefined ? undefined : input.w2s[Number(index)];
    if (!id || !w2 || w2.medicareWages === undefined) throw new Error("Form7206 shareholder business source requires actual W2 Box5.");
    businesses.push({ sourceId: id, accountHolder: owner(w2.accountHolder, id), kind: "s_corporation", sCorporationMedicareWages: d(w2.medicareWages), attributableForeignExclusion: d(0) });
  }
  const contextById = new Map(businesses.map(row => [row.sourceId,row]));
  for (const group of source.businesses) {
    const business = contextById.get(group.businessSourceId);
    if (!business || business.accountHolder !== group.accountHolder || business.kind !== group.kind) throw new Error("Form7206 plan must match an actual business source and owner on this return.");
    const paid = sum(...source.sourceRecords.filter(row => row.businessSourceId === group.businessSourceId && row.payer === "business_paid_or_reimbursed").map(row => row.amountPaid));
    if (business.kind === "s_corporation") {
      const index = Number(business.sourceId.slice("formW2:".length));
      if (paid.gt(d(input.w2s[index].wages))) throw new Error("Form7206 included shareholder premiums exceed actual W2 Box1 wages.");
    } else if (business.kind === "partnership") {
      const index = Number(business.sourceId.slice("scheduleK1:".length));
      if (paid.gt(d(input.scheduleK1[index].guaranteedPayments))) throw new Error("Form7206 partnership-paid premiums exceed actual included guaranteed payments.");
    }
  }
  const retirement = d(input.adjustments?.seRetirementContributions), foreign = params.foreignIncomeExclusion;
  if (!retirement.isFinite() || retirement.lt(0) || !foreign.isFinite() || foreign.lt(0)) throw new Error("Form7206 canonical retirement and foreign amounts must be finite and nonnegative.");
  const allocation = facts.incomeDeductions;
  const retirementSources: QBIDeductionSourceAmount[] = [];
  if (!allocation && (retirement.gt(0) || foreign.gt(0))) throw new Error("Form7206 needs actual business attribution of positive retirement and foreign deductions.");
  if (allocation) {
    if (!allocation.sourceReference?.trim() || allocation.sourceFactsConfirmed !== true || !allocation.allocations) throw new Error("Confirm actual Form7206 income allocations and their source reference.");
    const seen = new Set<string>(); let assignedRetirement = d(0), assignedForeign = sourceAmount(allocation.otherForeignExclusion);
    for (const row of allocation.allocations) {
      const business = row.businessSourceId ? contextById.get(row.businessSourceId) : undefined;
      if (!business || !row.accountHolder || row.accountHolder !== business.accountHolder || seen.has(business.sourceId)) throw new Error("Reconcile Form7206 allocation source identity and owner; duplicate entries are unsupported.");
      seen.add(business.sourceId);
      const retire = sourceAmount(row.retirementDeduction), excluded = sourceAmount(row.foreignExclusion);
      if (business.kind === "s_corporation" && !retire.isZero()) throw new Error("Form7206 shareholder wages cannot receive a Schedule1 retirement allocation.");
      if (excluded.gt(Decimal.max(0,business.netIncome ?? business.sCorporationMedicareWages ?? d(0)))) throw new Error("Reconcile Form7206 foreign allocation with its actual business income.");
      business.attributableRetirementDeduction = retire; business.attributableForeignExclusion = excluded;
      assignedRetirement = assignedRetirement.plus(retire); assignedForeign = assignedForeign.plus(excluded);
      retirementSources.push({ sourceId: business.sourceId, accountHolder: business.accountHolder, amount: retire });
    }
    if (!assignedRetirement.eq(retirement) || !assignedForeign.eq(foreign)) throw new Error("Form7206 income allocations must reconcile actual allowed retirement and Form2555line45 totals.");
    if (foreign.gt(0)) {
      const mapping = input.form2555?.incomeSources;
      if (!mapping || input.form2555?.incomeSourceMappingConfirmed !== true) throw new Error("Form7206 foreign attribution requires the confirmed Form2555 income source mapping.");
      const capacities = { self_employed: sourceAmount(mapping.foreignBusinessIncomeAlreadyReported),
        partnership: sourceAmount(mapping.foreignPartnershipIncomeAlreadyReported),
        s_corporation: sourceAmount(mapping.foreignEmploymentIncomeIncludedOnW2) };
      for (const kind of ["self_employed", "partnership", "s_corporation"] as const) {
        const attributed = sum(...businesses.filter(row => row.kind === kind).map(row => row.attributableForeignExclusion ?? d(0)));
        if (attributed.gt(capacities[kind])) throw new Error("Form7206 foreign allocation contradicts the actual Form2555 income source class.");
      }
    }
  }
  const form7206 = calculateForm7206({ taxYear: year, filingStatus: input.taxpayer.filingStatus, facts, marketplaceSourceInput: input, businesses, marketplaceHandling, reportedPayment });
  if (form7206.deduction === undefined) throw new Error("Canonical Form7206 deduction is incomplete.");
  const marketplacePremiums = params.marketplace && params.marketplace.stage !== "full-repayment" ? calculateMarketplaceHealthPremiums({ input, healthInsurance: form7206 }) : undefined;
  const result = params.marketplace?.stage === "final" || params.marketplace?.stage === "ordered" ? params.marketplace.deduction : undefined;
  const marketplaceAudit = new AuditTrail();
  const healthSources: QBIDeductionSourceAmount[] = form7206.businesses.map(row => ({ sourceId: row.businessSourceId,
    accountHolder: row.accountHolder, amount: row.deduction ?? d(0), nonQbi: row.kind === "s_corporation" }));
  let deductionToSchedule1: Decimal;
  if (marketplacePremiums) {
    const groups = marketplacePremiums.groups;
    const specified = groups.filter(row => row.months.length > 0 && row.includedInEarnedIncomeLimit !== false);
    const nonspecifiedStop = calculateMarketplaceNonspecifiedStop(groups);
    const multipleOwners = new Set(specified.map(row => row.accountHolder)).size > 1;
    const uncappedMaximum = nonspecifiedStop ? d(0) : multipleOwners
      ? calculateMarketplaceOwnerDeductions({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups, stage: { kind: "maximum" } }).specifiedDeduction
      : Decimal.min(sum(...specified.map(row => row.specifiedPremiums)), Decimal.max(0,sum(...specified.map(row => row.remainingEarnedIncome))));
    const suppliedLimit = params.marketplace?.stage === "maximum" ? params.marketplace.historicalLimit : result?.historicalLimit;
    const historicalLimit = year === 2025 && !nonspecifiedStop ? calculateMarketplaceHealthLimit({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups,
      stage: params.marketplace?.stage === "worksheet-w" ? "w" : "complete", householdIncomeAfterW: suppliedLimit?.householdIncomeAfterW, federalPovertyLine: suppliedLimit?.federalPovertyLine, orderedDeductions: suppliedLimit?.orderedDeductions }) : undefined;
    const maximum = historicalLimit?.maximumSpecifiedDeduction ?? uncappedMaximum;
    if (suppliedLimit && (!historicalLimit || !suppliedLimit.maximumSpecifiedDeduction.eq(historicalLimit.maximumSpecifiedDeduction))) throw new Error("Pub974 maximum must reconcile the actual historical worksheet.");
    if (result && result.method.startsWith("pub974-nonspecified-stop-") !== nonspecifiedStop) throw new Error("Pub974 stopping method must reconcile the actual completed business limits.");
    const attributeSpecified = (amount: Decimal) => {
      // The published stop retains each completed nonspecified business claim;
      // there is no specified deduction to reallocate among its owner's sources.
      if (nonspecifiedStop) {
        if (!amount.isZero()) throw new Error("Pub974 nonspecified stop cannot contain a specified deduction.");
        return;
      }
      const selectedAllocation = specified.some(group => group.creditAllocationMethod !== undefined);
      if (amount.isZero() && !multipleOwners && !selectedAllocation) return;
      if (!specified.length) throw new Error("Pub974 health deduction has no attributable earned-income source.");
      let allocations = [{ groups: specified, amount }];
      if (multipleOwners) {
        const stage = params.marketplace?.stage === "worksheet-w" ? { kind: "worksheet-w" as const }
          : params.marketplace?.stage === "maximum" ? { kind: "maximum" as const }
            : result ? { kind: "final" as const, businesses: result.businesses } : undefined;
        if (!stage) throw new Error("Pub974 owner attribution requires its actual canonical calculation stage.");
        const ownerCalculation = calculateMarketplaceOwnerDeductions({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups, stage, specifiedDeduction: amount });
        marketplaceAudit.merge(ownerCalculation.lines);
        allocations = ownerCalculation.owners.map(row => ({ groups: specified.filter(group => group.accountHolder === row.accountHolder), amount: row.specifiedDeduction }));
      }
      for (const allocation of allocations) {
        const ownerGroups = allocation.groups.some(group => group.creditAllocationMethod !== undefined)
          ? [...allocation.groups].sort((left, right) => left.businessSourceId.localeCompare(right.businessSourceId, "en"))
          : allocation.groups;
        const combinedClaim = ownerGroups.some(group => group.creditAllocationMethod !== undefined);
        const attributable = combinedClaim ? allocation.amount.plus(sum(...ownerGroups.map(group => group.nonspecifiedDeduction))) : allocation.amount;
        if (combinedClaim) {
          if (roundDollar(attributable).lt(0)) throw new Error("Pub974 actual owner combined deduction needs its separate stop-worksheet method.");
          for (const group of ownerGroups) {
            const target = healthSources.find(row => row.sourceId === group.businessSourceId && row.accountHolder === group.accountHolder);
            if (!target) throw new Error("Pub974 combined QBI deduction has no matching actual business source.");
            // These businesses' nonspecified claims and signed Step3 amount
            // form one allowable owner deduction. Do not allocate a negative
            // intermediate as though it were a separate QBI deduction.
            target.amount = target.amount.minus(group.nonspecifiedDeduction);
          }
        }
        if (attributable.isZero()) continue;
        const gross = ownerGroups.map(row => {
          if (ownerGroups.length === 1) return d(1); // One actual income source needs no allocation denominator.
          const actual = params.businessGrossIncomes?.filter(item => item.sourceId === row.businessSourceId);
          if (actual?.length !== 1 || !actual[0].amount.isFinite() || actual[0].amount.lt(0)) throw new Error("Pub974 QBI allocation requires actual gross income for every business counted in its deduction.");
          return actual[0].amount;
        });
        const denominator = sum(...gross);
        if (denominator.lte(0)) throw new Error("Pub974 positive deduction requires actual positive gross income for QBI attribution.");
        let remaining = attributable;
        ownerGroups.forEach((group,index) => {
          const target = healthSources.find(row => row.sourceId === group.businessSourceId && row.accountHolder === group.accountHolder);
          if (!target) throw new Error("Pub974 QBI deduction has no matching actual business source.");
          const share = index === ownerGroups.length - 1 ? remaining : attributable.times(gross[index]).div(denominator);
          target.amount = target.amount.plus(share); remaining = remaining.minus(share);
          marketplaceAudit.record("Pub974 QBI Allocation", group.businessSourceId, combinedClaim ? "Combined allowable health deduction attributable to this income source" : "Specified deduction attributable to this income source", share,
            ownerGroups.length === 1 ? "Only actual business income used in the owner's deduction" : combinedClaim ? "Owner combined allowable health deduction times actual same-owner business gross income / same-owner combined gross income;199A only" : "Owner specified deduction times actual same-owner business gross income / same-owner combined gross income;199A only",
            { "Owner": group.accountHolder, "Combined deduction": attributable,
              ...(ownerGroups.length === 1 ? {} : { "Gross income numerator": gross[index], "Gross income denominator": denominator }) });
        });
      }
    };
    let specifiedDeduction: Decimal;
    if (params.marketplace?.stage === "maximum" || params.marketplace?.stage === "worksheet-w") {
      // Statutory NOL/AMT replays may need QBI at this fixed temporary amount.
      // These allocations are internal to this context; final output is recomputed.
      specifiedDeduction = maximum;
      attributeSpecified(maximum);
    } else {
      if (!result || result.businesses.length !== groups.length || new Set(result.businesses.map(row => row.businessSourceId)).size !== groups.length
        || !result.maximumSpecifiedDeduction.eq(maximum) || !result.nonspecifiedDeduction.eq(form7206.deduction)) throw new Error("Pub974 computed deduction must reconcile the actual combined business worksheets.");
      for (const group of groups) {
        const recorded = result.businesses.find(row => row.businessSourceId === group.businessSourceId);
        if (!recorded || recorded.accountHolder !== group.accountHolder || !recorded.specifiedPremiums.eq(group.specifiedPremiums)
          || !recorded.remainingEarnedIncome.eq(group.remainingEarnedIncome) || !recorded.nonspecifiedDeduction.eq(group.nonspecifiedDeduction)) throw new Error("Pub974 computed deduction contradicts actual business sources.");
      }
      const limit = result.method.startsWith("ordinary-no-ptc-") ? sum(...result.businesses.map(row => row.ordinaryDeduction)) : maximum;
      if (!result.specifiedDeduction.isFinite() || roundDollar(result.specifiedDeduction.plus(form7206.deduction)).lt(0) || result.specifiedDeduction.gt(limit)) throw new Error("Pub974 specified deduction exceeds the actual method limit.");
      specifiedDeduction = result.specifiedDeduction;
      if (result.method.startsWith("ordinary-no-ptc-")) {
        for (const group of result.businesses) {
          const target = healthSources.find(row => row.sourceId === group.businessSourceId);
          if (!target) throw new Error("Ordinary health deduction has no actual business source.");
          target.amount = target.amount.plus(group.ordinaryDeduction);
        }
      } else attributeSpecified(result.specifiedDeduction);
    }
    deductionToSchedule1 = roundDollar(form7206.deduction.plus(specifiedDeduction));
    // Allocate the single printed-dollar transfer without manufacturing another deduction.
    const exact = sum(...healthSources.map(row => row.amount));
    if (!exact.eq(form7206.deduction.plus(specifiedDeduction))) throw new Error("Pub974 QBI sources do not conserve the allowed health deduction.");
    // Signed source cents can round to a zero total when the printed credit
    // covers the full premium. A zero transfer has no QBI deduction to allocate.
    if (deductionToSchedule1.isZero()) for (const row of healthSources) row.amount = d(0);
    let remainder = deductionToSchedule1;
    const selectedAllocation = specified.some(group => group.creditAllocationMethod !== undefined);
    const positive = healthSources.filter(row => row.amount.gt(0));
    // Stable source identity, rather than plan-entry order, assigns the final
    // printed-dollar residual. Exact source and proportional amounts stay above.
    if (selectedAllocation || nonspecifiedStop) positive.sort((left, right) => `${left.accountHolder}:${left.sourceId}`.localeCompare(`${right.accountHolder}:${right.sourceId}`, "en"));
    const roundingWeight = selectedAllocation ? sum(...positive.map(row => row.amount)) : exact;
    if (selectedAllocation) for (const row of healthSources) if (row.amount.lt(0)) row.amount = d(0);
    positive.forEach((row,index) => {
      row.amount = index === positive.length - 1 ? remainder : Decimal.min(remainder, roundDollar(deductionToSchedule1.times(row.amount).div(roundingWeight)));
      remainder = remainder.minus(row.amount);
    });
  } else {
    for (const row of healthSources) row.amount = roundDollar(row.amount);
    deductionToSchedule1 = sum(...healthSources.map(row => row.amount));
  }
  const printed = result?.method.startsWith("ordinary-no-ptc-")
    ? calculateForm7206({ taxYear: year, filingStatus: input.taxpayer.filingStatus, facts, marketplaceSourceInput: input, businesses, marketplaceHandling: "ordinary-no-ptc" }) : form7206;
  if (result?.method.startsWith("ordinary-no-ptc-") && (printed.deduction === undefined || !roundDollar(printed.deduction).eq(deductionToSchedule1))) throw new Error("Ordinary no-PTC Form7206 must reconcile the final source deduction.");
  return { form7206: { ...printed, lines: [...printed.lines, ...marketplaceAudit.getLines()], deductionToSchedule1 }, healthSources, retirementSources, marketplacePremiums };
}
