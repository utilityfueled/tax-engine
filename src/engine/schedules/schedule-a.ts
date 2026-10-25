/**
 * Schedule A — Itemized Deductions
 * Spec: spec/federal/schedule-a.yaml
 *
 * Computes itemized deductions: medical, SALT, mortgage interest,
 * and charitable contributions. Compared against standard deduction.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { d, sum, zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateSALTLimit } from "@/utils/tax-math.js";
import { calculateCharitableContributionWorksheet, type CharitableCategory } from "@/engine/forms/charitable-contribution-worksheet.js";
// calculateDeductibleMortgageInterest is no longer used here — mortgage interest
// is now computed with aggregate debt limits per IRS Pub 936 (see Lines 8a-8d section).

export interface ScheduleAInput {
  medicalExpenses?: Decimal;
  personalPropertyTaxes?: Decimal; // Line 5c: annual value-based taxes
  /** Form 2555 lines 45 + 50, computed by the federal orchestrator. */
  saltMagiAdditions?: Decimal;
  investmentInterestExpense?: Decimal; // Line 9: net investment interest expense
  casualtyLossDeduction?: Decimal; // Line 15: Form 4684 deductible casualty/theft loss
  gamblingWinnings?: Decimal; // Line 21b: gambling winnings (limits gambling loss deduction)
  gamblingLosses?: Decimal; // Wagering losses
  gamblingExpenses?: Decimal; // Otherwise deductible expenses incurred carrying on wagering transactions
  // K-1 Box 13 charitable pass-through amounts
  k1CashCharitable?: Decimal; // Code A: cash/non-capital-gain property (60% AGI limit)
  k1AppreciatedProperty30?: Decimal; // Code B: capital gain property to 50% orgs (30% limit)
  k1AppreciatedProperty20?: Decimal; // Code C: capital gain property to non-50% orgs (20% limit)
  /** Pre-computed sales tax deduction amount from the sales tax worksheet.
   *  When provided, Schedule A compares this to income taxes for Line 5a. */
  salesTaxDeduction?: Decimal;
  /** Whether the taxpayer elected the sales tax deduction (vs income tax).
   *  When autoCompare is true, the engine uses whichever is larger. */
  salesTaxElected?: boolean;
}

/** Per-year carryforward entry for charitable contribution vintage tracking (IRC §170(d)(1)) */
export interface CharitableCarryforwardEntry {
  taxYear: number;
  category?: CharitableCategory;
  amount: Decimal;
}

/** Reconciliation detail for a single carryforward vintage year */
export interface CharitableCarryforwardYearDetail {
  taxYear: number;
  amountAvailable: Decimal;
  amountUsed: Decimal;
  amountExpired: Decimal;
  amountRemaining: Decimal;
}

export interface ScheduleAResult {
  medicalDeduction: Decimal; // Line 4
  saltDeduction: Decimal; // Line 5e
  /** Whether the general sales tax election was used for Line 5a (vs income taxes) */
  salesTaxElected: boolean;
  mortgageInterest: Decimal; // Line 8a
  mortgageInsurancePremiums: Decimal; // Restored for 2026
  investmentInterestDeduction: Decimal; // Line 9
  casualtyLossDeduction: Decimal; // Line 15
  cashCharitable: Decimal; // Line 12
  nonCashCharitable: Decimal; // Line 13
  gamblingLossDeduction: Decimal; // Line 28
  totalItemized: Decimal; // Line 17
  nonitemizerCharitableDeduction: Decimal; // 2026 candidate; federal flow applies only when standard deduction selected
  /** Excess charitable contributions that carry forward to next year (IRC §170(d)) */
  charitableCarryforward: Decimal;
  /** Per-year remaining carryforward after FIFO reconciliation with 5-year expiration */
  charitableCarryforwardByYear: CharitableCarryforwardEntry[];
  /** Total expired carryforward from FIFO reconciliation */
  charitableCarryforwardExpired: Decimal;
  /** Year-by-year reconciliation detail */
  charitableCarryforwardDetail: CharitableCarryforwardYearDetail[];
  lines: CalculatedLine[];
}

/** Charitable carryforwards expire after 5 years per IRC §170(d)(1) */
const CHARITABLE_CARRYFORWARD_YEARS = 5;

const ZERO = new Decimal(0);

/**
 * Resolve per-year carryforward entries from input.
 * If per-year entries are provided, use those (filtered for positive amounts).
 * Otherwise, convert the legacy single aggregate into a single entry from taxYear-1.
 */
function resolveCharitableCarryforwardEntries(
  input: TaxYearInput,
): CharitableCarryforwardEntry[] {
  const byYear = input.priorYear?.charitableCarryforwardByYear ?? [];
  if (byYear.length > 0) {
    return byYear
      .filter((entry) => d(entry.amount).greaterThan(0))
      .map((entry) => ({ taxYear: entry.taxYear, amount: d(entry.amount) }))
      .sort((a, b) => a.taxYear - b.taxYear);
  }

  const legacy = d(input.priorYear?.charitableCarryforward);
  if (legacy.isZero()) {
    return [];
  }

  const currentTaxYear = input.taxpayer.taxYear;
  return [{ taxYear: currentTaxYear - 1, amount: legacy }];
}

/**
 * Apply FIFO ordering to charitable carryforward entries against available capacity.
 * Entries older than 5 years from the current tax year expire (IRC §170(d)(1)).
 */
function reconcileCharitableCarryforward(
  entries: CharitableCarryforwardEntry[],
  currentTaxYear: number,
  availableCapacity: Decimal,
): {
  detail: CharitableCarryforwardYearDetail[];
  totalUsed: Decimal;
  totalExpired: Decimal;
  remaining: CharitableCarryforwardEntry[];
} {
  const detail: CharitableCarryforwardYearDetail[] = [];
  const remaining: CharitableCarryforwardEntry[] = [];
  let capacity = Decimal.max(ZERO, availableCapacity);
  let totalUsed = ZERO;
  let totalExpired = ZERO;

  // Process FIFO — entries already sorted oldest first
  for (const entry of entries) {
    const age = currentTaxYear - entry.taxYear;
    const expired = age > CHARITABLE_CARRYFORWARD_YEARS;

    if (expired) {
      detail.push({
        taxYear: entry.taxYear,
        amountAvailable: entry.amount,
        amountUsed: ZERO,
        amountExpired: entry.amount,
        amountRemaining: ZERO,
      });
      totalExpired = totalExpired.plus(entry.amount);
      continue;
    }

    const used = Decimal.min(entry.amount, capacity);
    const remainder = entry.amount.minus(used);
    capacity = capacity.minus(used);
    totalUsed = totalUsed.plus(used);

    detail.push({
      taxYear: entry.taxYear,
      amountAvailable: entry.amount,
      amountUsed: used,
      amountExpired: ZERO,
      amountRemaining: remainder,
    });

    if (remainder.greaterThan(0)) {
      remaining.push({ taxYear: entry.taxYear, amount: remainder });
    }
  }

  return { detail, totalUsed, totalExpired, remaining };
}

export function calculateScheduleA(
  input: TaxYearInput,
  agi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants,
  extra?: ScheduleAInput
): ScheduleAResult {
  const audit = new AuditTrail();

  // ── Medical (Lines 1-4) ────────────────────────────────
  const medicalExpenses = extra?.medicalExpenses ?? new Decimal(0);
  const medicalThreshold = roundDollar(agi.times(new Decimal(0.075)));
  const medicalDeduction = zeroFloor(medicalExpenses.minus(medicalThreshold));
  audit.record("Sched A", "1", "Medical expenses", medicalExpenses, "Total unreimbursed");
  audit.record("Sched A", "4", "Medical deduction", medicalDeduction,
    `Line 1 - (7.5% × AGI = ${medicalThreshold})`);

  // ── SALT (Lines 5a-5d) ─────────────────────────────────
  // Line 5a: State/local income taxes OR general sales taxes (taxpayer elects)
  const stateTaxes = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.stateTaxWithheld)),
    new Decimal(0)
  );
  const localTaxes = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.localTaxWithheld)),
    new Decimal(0)
  );
  // Per IRS Schedule A Instructions Line 5a, state estimated tax payments
  // made during the year are deductible as state/local income taxes.
  const stateEstimatedPayments = input.adjustments?.estimatedTaxPayments
    ?.filter((p) => p.type === "state")
    .reduce((acc, p) => acc.plus(d(p.amount)), new Decimal(0)) ?? new Decimal(0);
  const stateLocalIncomeTaxes = stateTaxes.plus(localTaxes).plus(stateEstimatedPayments);

  // Determine whether to use income taxes or sales taxes for Line 5a
  const salesTaxAmount = extra?.salesTaxDeduction ?? new Decimal(0);
  const hasSalesTaxElection = salesTaxAmount.greaterThan(0) && (extra?.salesTaxElected ?? false);

  let stateLocalTaxes: Decimal;
  let line5aDescription: string;

  if (hasSalesTaxElection) {
    // Sales tax elected — use sales tax amount
    stateLocalTaxes = salesTaxAmount;
    line5aDescription = `General sales tax deduction $${salesTaxAmount} (elected over income taxes $${stateLocalIncomeTaxes})`;
  } else {
    // Default: income taxes
    stateLocalTaxes = stateLocalIncomeTaxes;
    line5aDescription = `Sum W-2 Box 17 (state ${stateTaxes}) + Box 19 (local ${localTaxes}) + state estimated (${stateEstimatedPayments})`;
    if (salesTaxAmount.greaterThan(0)) {
      line5aDescription += ` (income taxes $${stateLocalIncomeTaxes} used over sales taxes $${salesTaxAmount})`;
    }
  }

  audit.record("Sched A", "5a",
    hasSalesTaxElection ? "State/local general sales taxes" : "State/local income taxes",
    stateLocalTaxes, line5aDescription);

  const personalPropertyTaxes = extra?.personalPropertyTaxes ?? new Decimal(0);
  audit.record("Sched A", "5c", "Personal property taxes", personalPropertyTaxes,
    "Vehicle registration, etc.");

  const propertyTaxes = input.form1098.reduce(
    (acc, f) => acc.plus(d(f.propertyTax)),
    new Decimal(0)
  );
  audit.record("Sched A", "5b", "Real estate taxes", propertyTaxes,
    "Sum Form 1098 property tax");

  // Restore excluded income before applying the 2025 SALT MAGI phase-down.
  if (input.form2555 && extra?.saltMagiAdditions === undefined) {
    throw new Error("Schedule A requires computed Form 2555 exclusions and housing deduction for SALT MAGI.");
  }
  const saltMagi = agi.plus(extra?.saltMagiAdditions ?? ZERO)
    .plus(d(input.scheduleA?.excludedPuertoRicoIncome))
    .plus(d(input.scheduleA?.form4563ExcludedIncome));
  const saltTotal = stateLocalTaxes.plus(personalPropertyTaxes).plus(propertyTaxes);
  const saltCap = calculateSALTLimit(saltMagi, filingStatus, constants);
  const saltDeduction = roundDollar(min(zeroFloor(saltTotal), saltCap));
  audit.record("SALT WS", "4", "MAGI for SALT limitation", saltMagi,
    "AGI + excluded Puerto Rico income + Form 2555 lines 45 and 50 + Form 4563 line 15");
  audit.record("SALT WS", "10-limit", "SALT limit after MAGI phase-down", saltCap,
    "Worksheet line 9, halved after phase-down for MFS");
  audit.record("Sched A", "5d", "State and local taxes before limitation", saltTotal,
    "Line 5a + line 5b + line 5c");
  audit.record("Sched A", "5e", "SALT deduction (capped)", saltDeduction,
    `min(${saltTotal}, $${saltCap})`);

  // ── Mortgage Interest (Lines 8a-8d) ────────────────────
  // Per IRS Pub 936, the debt limit is applied to the AGGREGATE balance
  // of all mortgages, not per-mortgage. Grandfathered (pre-12/16/2017)
  // debt gets priority up to $1M/$500K MFS; post-TCJA fills remaining
  // room under $750K/$375K MFS.
  const TCJA_CUTOFF = "2017-12-15";
  const GRANDFATHERED_LIMIT = new Decimal(1000000);

  let totalGrandfatheredPrincipal = new Decimal(0);
  let totalPostTCJAPrincipal = new Decimal(0);
  let totalMortgageInterest = new Decimal(0);

  for (const f of input.form1098) {
    const principal = d(f.outstandingMortgagePrincipal);
    const interest = d(f.mortgageInterestReceived);
    totalMortgageInterest = totalMortgageInterest.plus(interest);
    const isGrandfathered = f.mortgageOriginationDate !== undefined
      && f.mortgageOriginationDate < TCJA_CUTOFF;
    if (isGrandfathered) {
      totalGrandfatheredPrincipal = totalGrandfatheredPrincipal.plus(principal);
    } else {
      totalPostTCJAPrincipal = totalPostTCJAPrincipal.plus(principal);
    }
  }

  const totalPrincipal = totalGrandfatheredPrincipal.plus(totalPostTCJAPrincipal);
  const mfsHalf = filingStatus === "married_filing_separately" ? new Decimal(2) : new Decimal(1);
  const grandfatheredLimit = GRANDFATHERED_LIMIT.dividedBy(mfsHalf);
  const postTCJAOverallLimit = constants.mortgageInterest.debtLimit.dividedBy(mfsHalf);

  // Step 1: Grandfathered debt limited to $1M/$500K MFS
  const grandfatheredLimited = min(totalGrandfatheredPrincipal, grandfatheredLimit);
  // Step 2: Post-TCJA room = max(0, $750K/$375K - grandfathered used)
  const postTCJARoom = zeroFloor(postTCJAOverallLimit.minus(grandfatheredLimited));
  // Step 3: Post-TCJA limited to remaining room
  const postTCJALimited = min(totalPostTCJAPrincipal, postTCJARoom);
  // Step 4: Total limited debt
  const totalLimited = grandfatheredLimited.plus(postTCJALimited);

  let grossMortgageInterest: Decimal;
  if (totalPrincipal.isZero() || totalPrincipal.lessThanOrEqualTo(totalLimited)) {
    grossMortgageInterest = totalMortgageInterest;
  } else {
    const ratio = totalLimited.dividedBy(totalPrincipal);
    grossMortgageInterest = roundDollar(totalMortgageInterest.times(ratio));
  }

  const refundOfOverpaidInterest = input.form1098.reduce(
    (acc, f) => acc.plus(d(f.refundOfOverpaidInterest)),
    new Decimal(0)
  );
  const mortgageInterest = grossMortgageInterest;
  audit.record("Sched A", "8a", "Mortgage interest", mortgageInterest,
    `Total interest ${totalMortgageInterest}, principal ${totalPrincipal}, limit ${totalLimited}` +
    (totalPrincipal.greaterThan(totalLimited) ? ` → ratio ${totalLimited}/${totalPrincipal}` : "") +
    (refundOfOverpaidInterest.greaterThan(0)
      ? `; Form 1098 Box 3 refund $${refundOfOverpaidInterest} not netted on 2025 Schedule A line 8a`
      : ""));

  // Line 8c: Points paid on purchase of principal residence
  const pointsPaid = input.form1098.reduce(
    (acc, f) => acc.plus(d(f.pointsPaid)),
    new Decimal(0)
  );
  audit.record("Sched A", "8c", "Points paid", pointsPaid,
    "Sum Form 1098 Box 6");

  // Line 8d: Mortgage insurance premiums (PMI)
  const reportedMortgageInsurancePremiums = input.form1098.reduce(
    (acc, f) => acc.plus(d(f.mortgageInsurancePremiums)),
    new Decimal(0)
  );
  let mortgageInsurancePremiums = ZERO;
  if (input.taxpayer.taxYear === 2026) {
    let eligiblePremiums = ZERO;
    for (const mortgage of input.form1098) {
      const reported = d(mortgage.mortgageInsurancePremiums);
      if (!reported.isFinite() || reported.lt(0)) throw new Error("Mortgage insurance premiums must be finite and nonnegative");
      const facts = mortgage.mortgageInsuranceQualification;
      if (!facts) {
        if (reported.gt(0)) throw new Error("Mortgage insurance qualification and current-year allocation are unknown");
        continue;
      }
      const allocated = d(facts.premiumsAllocableToYear);
      if (!allocated.isFinite() || allocated.lt(0)) throw new Error("Allocated mortgage insurance premiums must be finite and nonnegative");
      if (facts.allocationTaxYear !== input.taxpayer.taxYear) throw new Error("Mortgage insurance allocation tax year does not match return");
      const issued = new Date(`${facts.contractIssueDate}T00:00:00Z`);
      if (!Number.isFinite(issued.getTime()) || issued.toISOString().slice(0, 10) !== facts.contractIssueDate || facts.contractIssueDate > `${input.taxpayer.taxYear}-12-31`) throw new Error("Invalid mortgage insurance contract date");
      if (facts.qualifiedProvider && facts.acquisitionDebt && facts.qualifiedResidence && facts.contractIssueDate >= "2007-01-01") eligiblePremiums = eligiblePremiums.plus(allocated);
    }
    if (!agi.isFinite()) throw new Error("Mortgage insurance AGI must be finite");
    const separate = filingStatus === "married_filing_separately";
    const steps = zeroFloor(agi.minus(separate ? "50000" : "100000")).div(separate ? "500" : "1000").ceil();
    const retainedFraction = zeroFloor(new Decimal(1).minus(steps.times("0.10")));
    mortgageInsurancePremiums = roundDollar(eligiblePremiums.times(retainedFraction));
    audit.record("Sched A", "8d", "Qualified mortgage insurance premiums", mortgageInsurancePremiums,
      "Explicit current-year allocations, reduced 10% per complete or partial AGI step", { eligiblePremiums, steps, retainedFraction });
  } else {
    audit.record("Sched A", "8d", "Reserved for future use", mortgageInsurancePremiums,
      reportedMortgageInsurancePremiums.greaterThan(0)
        ? `2025 Schedule A line 8d is reserved for future use; ignored Form 1098 Box 5 PMI $${reportedMortgageInsurancePremiums}`
        : "2025 Schedule A line 8d is reserved for future use");
  }

  // Line 9: Investment interest expense (from Form 4952 or manual input)
  const investmentInterestDeduction = extra?.investmentInterestExpense ?? new Decimal(0);
  audit.record("Sched A", "9", "Investment interest expense", investmentInterestDeduction,
    investmentInterestDeduction.isZero()
      ? "No investment interest expense"
      : "Investment interest expense deduction (Form 4952 or validated manual input)");

  // Line 15: Casualty and theft losses (from Form 4684)
  const casualtyLossDeduction = extra?.casualtyLossDeduction ?? new Decimal(0);
  audit.record("Sched A", "15", "Casualty and theft losses", casualtyLossDeduction,
    casualtyLossDeduction.isZero()
      ? "No casualty or theft losses"
      : "Form 4684 Section A deductible casualty loss (federally declared disaster only, post-TCJA)");

  let nonitemizerCharitableDeduction = ZERO;
  const contributionBase = zeroFloor(agi);
  if (input.taxpayer.taxYear === 2026) {
    let eligibleCash = ZERO;
    for (const donation of input.donations) {
      const amount = d(donation.amount);
      if (!amount.isFinite() || amount.lt(0)) throw new Error("Charitable contribution must be finite and nonnegative");
      const date = new Date(`${donation.dateOfDonation}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== donation.dateOfDonation) throw new Error("Invalid donation date");
      if (!donation.dateOfDonation.startsWith(`${input.taxpayer.taxYear}-`)) throw new Error("Donation date must be in the return tax year");
      if (amount.gt(0) && donation.isPrivateFoundation === undefined) throw new Error("Charitable recipient classification is unknown");
      if (donation.type !== "cash" || amount.isZero()) continue;
      if (donation.qualifiedOrganization === undefined || donation.supportingOrganization === undefined || donation.donorAdvisedFund === undefined) throw new Error("Nonitemizer charitable recipient qualification is unknown");
      if (donation.qualifiedOrganization && !donation.supportingOrganization && !donation.donorAdvisedFund && !donation.isPrivateFoundation) eligibleCash = eligibleCash.plus(amount);
    }
    nonitemizerCharitableDeduction = roundDollar(Decimal.min(eligibleCash, contributionBase.times("0.60"), filingStatus === "married_filing_jointly" ? "2000" : "1000"));
  }
  audit.record("Charitable WS", "nonitemizer", "Nonitemizer charitable deduction candidate", nonitemizerCharitableDeduction,
    "2026 current eligible cash only: min(cash, 60% AGI, 1000 [2000 MFJ]); no floor or carryover");

  let cashCharitable: Decimal;
  let nonCashCharitable: Decimal;
  let charitableCarryforwards: CharitableCarryforwardEntry[];
  let charitableCarryforwardExpired = ZERO;
  let charitableCarryforwardDetail: CharitableCarryforwardYearDetail[] = [];
  if (input.taxpayer.taxYear === 2026) {
    if (d(input.priorYear?.charitableCarryforward).gt(0) || input.priorYear?.charitableCarryforwardByYear.some(entry => d(entry.amount).gt(0))) {
      throw new Error("2026 historical charitable carryover requires supported category and reviewed floor-transition treatment");
    }
    const amounts = { cashPublic: extra?.k1CashCharitable ?? ZERO, noncashPublic: ZERO, capitalGainPublic: extra?.k1AppreciatedProperty30 ?? ZERO, cashPrivate: ZERO, noncashPrivate: ZERO, capitalGainPrivate: extra?.k1AppreciatedProperty20 ?? ZERO };
    for (const donation of input.donations) {
      if (d(donation.amount).isZero()) continue;
      if (donation.qualifiedOrganization === undefined) throw new Error("Charitable recipient qualification is unknown");
      if (!donation.isPrivateFoundation && !donation.qualifiedOrganization) continue;
      let contributionValue = d(donation.amount);
      if (donation.type !== "cash") {
        if (donation.isLongTermCapitalGain === undefined) throw new Error("Charitable property long-term holding status is unknown");
        if (!donation.isLongTermCapitalGain) {
          if (donation.costBasis === undefined || !d(donation.costBasis).isFinite() || d(donation.costBasis).lt(0)) throw new Error("Charitable property cost basis is unknown or invalid");
          contributionValue = min(contributionValue, d(donation.costBasis));
        } else if (donation.isPrivateFoundation && (donation.type !== "appreciated_stock" || donation.qualifiedAppreciatedStock !== true)) {
          throw new Error("Private-foundation capital gain gift requires qualified appreciated stock or separately supported basis-reduction qualification");
        }
      }
      const category = donation.type === "cash"
        ? donation.isPrivateFoundation ? "cashPrivate" : "cashPublic"
        : donation.isLongTermCapitalGain
          ? donation.isPrivateFoundation ? "capitalGainPrivate" : "capitalGainPublic"
          : donation.isPrivateFoundation ? "noncashPrivate" : "noncashPublic";
      amounts[category] = amounts[category].plus(contributionValue);
    }
    const charitable = calculateCharitableContributionWorksheet({ taxYear: 2026, contributionBase, amounts });
    audit.merge(charitable.lines);
    cashCharitable = charitable.cashDeduction;
    nonCashCharitable = charitable.nonCashDeduction;
    charitableCarryforwards = charitable.carryforwards;
    audit.record("Sched A", "12", "Cash charitable after 2026 limitations", cashCharitable, "2026 category worksheet, including 0.5% floor");
    audit.record("Sched A", "13", "Noncash charitable after 2026 limitations", nonCashCharitable, "2026 category worksheet, including 0.5% floor");
  } else {
    // ── Charitable (Lines 12-13) with stacked AGI limits ──
    // Per IRC §170(b)(1), charitable contribution limits interact (stack):
    // Non-cash donations:
    // - LTCG property to supported public charities: 30% of AGI
    // - LTCG property to validated private foundations / second-category orgs:
    //   smallest of 20% of AGI, remaining 30% bucket headroom, and remaining
    //   50% bucket headroom after the supported higher-priority categories
    // - other non-cash property: 50% of AGI
    // Cash: 60% minus total non-cash property under (G)
    const rawPublicAppreciatedPropertyDirect = input.donations
      .filter((don) => don.type !== "cash" && don.isLongTermCapitalGain && !don.isPrivateFoundation)
      .reduce((acc, don) => acc.plus(d(don.amount)), new Decimal(0));
    const rawPublicAppreciatedProperty = rawPublicAppreciatedPropertyDirect
      .plus(extra?.k1AppreciatedProperty30 ?? new Decimal(0));
    const rawPrivateFoundationAppreciatedPropertyDirect = input.donations
      .filter((don) => don.type !== "cash" && don.isLongTermCapitalGain && don.isPrivateFoundation)
      .reduce((acc, don) => acc.plus(d(don.amount)), new Decimal(0));
    const rawPrivateFoundationAppreciatedProperty = rawPrivateFoundationAppreciatedPropertyDirect
      .plus(extra?.k1AppreciatedProperty20 ?? new Decimal(0));
    const rawOtherNonCash = input.donations
      .filter((don) => don.type !== "cash" && !don.isLongTermCapitalGain)
      .reduce((acc, don) => acc.plus(d(don.amount)), new Decimal(0));
    const appreciatedLimit = roundDollar(contributionBase.times("0.3"));
    const privateFoundationAppreciatedLimit = roundDollar(contributionBase.times("0.2"));
    const overallNonCashLimit = roundDollar(contributionBase.times("0.5"));
    const deductiblePublicAppreciatedProperty = min(rawPublicAppreciatedProperty, appreciatedLimit);
    // Other non-cash gets remaining 50% capacity after LTCG
    const otherNonCashCapacity = zeroFloor(overallNonCashLimit.minus(deductiblePublicAppreciatedProperty));
    const deductibleOtherNonCash = min(rawOtherNonCash, otherNonCashCapacity);

    // Cash limited to 60% minus non-cash property already allowed (IRC §170(b)(1)(G))
    const rawCashCharitableDirect = input.donations
      .filter((don) => don.type === "cash")
      .reduce((acc, don) => acc.plus(d(don.amount)), new Decimal(0));
    const rawCashCharitable = rawCashCharitableDirect
      .plus(extra?.k1CashCharitable ?? new Decimal(0));
    const cashAGILimit = roundDollar(contributionBase.times("0.6"));
    const preliminaryNonCash = deductiblePublicAppreciatedProperty.plus(deductibleOtherNonCash);
    const cashCapacity = zeroFloor(cashAGILimit.minus(preliminaryNonCash));

    // Resolve and reconcile per-year carryforward entries with FIFO and 5-year expiration
    const currentTaxYear = input.taxpayer.taxYear;
    const carryforwardEntries = resolveCharitableCarryforwardEntries(input);
    const carryforwardCapacity = zeroFloor(cashCapacity.minus(rawCashCharitable));
    const carryforwardReconciliation = reconcileCharitableCarryforward(
      carryforwardEntries, currentTaxYear, carryforwardCapacity,
    );
    const carryforwardUsed = carryforwardReconciliation.totalUsed;

    const totalCashCharitable = rawCashCharitable.plus(carryforwardUsed);
    cashCharitable = min(totalCashCharitable, cashCapacity);
    const k1CashNote = (extra?.k1CashCharitable ?? new Decimal(0)).isZero()
      ? ""
      : ` + K-1 Box 13 Code A ${extra!.k1CashCharitable}`;
    const carryforwardAuditNote = carryforwardReconciliation.totalExpired.greaterThan(0)
      ? ` (carryforward used ${carryforwardUsed}, expired ${carryforwardReconciliation.totalExpired})`
      : ` + carryforward ${carryforwardUsed}`;
    audit.record("Sched A", "12", "Cash charitable", cashCharitable,
      `Sum cash donations ${rawCashCharitableDirect}${k1CashNote}${carryforwardAuditNote} (limited to 60% AGI = $${cashAGILimit})`);

    const remainingThirtyPercentHeadroom = zeroFloor(appreciatedLimit.minus(deductiblePublicAppreciatedProperty));
    const remainingFiftyPercentHeadroom = zeroFloor(
      overallNonCashLimit
        .minus(cashCharitable)
        .minus(deductiblePublicAppreciatedProperty)
        .minus(deductibleOtherNonCash)
    );
    const deductiblePrivateFoundationAppreciatedProperty = Decimal.min(
      rawPrivateFoundationAppreciatedProperty,
      privateFoundationAppreciatedLimit,
      remainingThirtyPercentHeadroom,
      remainingFiftyPercentHeadroom
    );
    nonCashCharitable = deductiblePublicAppreciatedProperty
      .plus(deductiblePrivateFoundationAppreciatedProperty)
      .plus(deductibleOtherNonCash);
    audit.record("Sched A", "13", "Non-cash charitable", nonCashCharitable,
      "Supported public-charity LTCG property (30% AGI limit) + supported private-foundation LTCG property (20% AGI branch with remaining 30% and 50% headroom limits) + other non-cash property (50% AGI limit)" +
      ((extra?.k1AppreciatedProperty30 ?? new Decimal(0)).isZero() && (extra?.k1AppreciatedProperty20 ?? new Decimal(0)).isZero()
        ? ""
        : " + K-1 Box 13 Code B/C pass-through"), {
        "Raw public-charity LTCG property (direct)": rawPublicAppreciatedPropertyDirect,
        "K-1 Box 13 Code B (30% limit)": extra?.k1AppreciatedProperty30 ?? new Decimal(0),
        "Raw public-charity LTCG property (total)": rawPublicAppreciatedProperty,
        "Raw private-foundation LTCG property (direct)": rawPrivateFoundationAppreciatedPropertyDirect,
        "K-1 Box 13 Code C (20% limit)": extra?.k1AppreciatedProperty20 ?? new Decimal(0),
        "Raw private-foundation LTCG property (total)": rawPrivateFoundationAppreciatedProperty,
        "Raw other non-cash property": rawOtherNonCash,
        "30% AGI limit": appreciatedLimit,
        "20% AGI limit": privateFoundationAppreciatedLimit,
        "50% AGI limit": overallNonCashLimit,
        "Deductible public-charity LTCG property": deductiblePublicAppreciatedProperty,
        "Remaining 30% headroom for private-foundation LTCG property": remainingThirtyPercentHeadroom,
        "Remaining 50% headroom for private-foundation LTCG property": remainingFiftyPercentHeadroom,
        "Deductible private-foundation LTCG property": deductiblePrivateFoundationAppreciatedProperty,
        "Deductible other non-cash property": deductibleOtherNonCash,
      });

    // ── Charitable carryforward (IRC §170(d)) ───────────
    // Track excess contributions that carry forward up to 5 years.
    // Cash excess: current-year cash offered minus deductible cash (excluding carryforward used)
    // Non-cash excess: total non-cash offered minus deductible non-cash
    // Unused prior-year carryforward vintages carry forward via reconciliation remaining
    const totalRawNonCash = rawPublicAppreciatedProperty.plus(rawOtherNonCash).plus(rawPrivateFoundationAppreciatedProperty);
    const currentYearExcessCash = zeroFloor(rawCashCharitable.minus(cashCapacity));
    const excessNonCash = zeroFloor(totalRawNonCash.minus(nonCashCharitable));
    const currentYearExcess = currentYearExcessCash.plus(excessNonCash);

    // Build per-year carryforward: remaining prior-year vintages + new current-year vintage
    const carryforwardByYear: CharitableCarryforwardEntry[] = [
      ...carryforwardReconciliation.remaining,
    ];
    if (currentYearExcess.greaterThan(0)) {
      carryforwardByYear.push({ taxYear: currentTaxYear, amount: currentYearExcess });
    }

    // Aggregate carryforward for backward compatibility
    charitableCarryforwards = carryforwardByYear;
    charitableCarryforwardExpired = carryforwardReconciliation.totalExpired;
    charitableCarryforwardDetail = carryforwardReconciliation.detail;
  }
  const newCharitableCarryforward = sum(...charitableCarryforwards.map(entry => entry.amount));

  // Line 28: Gambling losses (limited to gambling winnings per IRC §165(d))
  const gamblingWinnings = extra?.gamblingWinnings ?? new Decimal(0);
  const rawGamblingLosses = extra?.gamblingLosses ?? new Decimal(0);
  const gamblingExpenses = extra?.gamblingExpenses ?? ZERO;
  if ([gamblingWinnings, rawGamblingLosses, gamblingExpenses].some((value) => !value.isFinite() || value.lt(0))) throw new Error("Wagering facts must be finite and nonnegative");
  const deductibleWageringAmount = rawGamblingLosses.plus(gamblingExpenses).times(input.taxpayer.taxYear === 2026 ? "0.90" : "1");
  const gamblingLossDeduction = roundDollar(min(deductibleWageringAmount, gamblingWinnings));
  audit.record("Sched A", "28", "Gambling losses (limited to winnings)", gamblingLossDeduction,
    `min(${input.taxpayer.taxYear === 2026 ? "90%" : "100%"} × (losses ${rawGamblingLosses} + expenses ${gamblingExpenses}), winnings ${gamblingWinnings})`);

  // ── Total (Line 17) ───────────────────────────────────
  const totalItemized = sum(
    medicalDeduction,
    saltDeduction,
    mortgageInterest,
    pointsPaid,
    mortgageInsurancePremiums,
    investmentInterestDeduction,
    casualtyLossDeduction,
    cashCharitable,
    nonCashCharitable,
    gamblingLossDeduction
  );
  audit.record("Sched A", "17", "Total itemized deductions", totalItemized,
    "Medical + SALT + mortgage + investment interest + casualty losses + charitable + gambling losses");


  return {
    medicalDeduction,
    saltDeduction,
    salesTaxElected: hasSalesTaxElection,
    mortgageInterest,
    mortgageInsurancePremiums,
    investmentInterestDeduction,
    casualtyLossDeduction,
    cashCharitable,
    nonCashCharitable,
    gamblingLossDeduction,
    totalItemized,
    nonitemizerCharitableDeduction,
    charitableCarryforward: newCharitableCarryforward,
    charitableCarryforwardByYear: charitableCarryforwards,
    charitableCarryforwardExpired,
    charitableCarryforwardDetail,
    lines: audit.getLines(),
  };
}
