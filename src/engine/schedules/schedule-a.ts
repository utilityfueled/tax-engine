/**
 * Schedule A — Itemized Deductions
 * Spec: spec/federal/schedule-a.yaml
 *
 * Computes itemized deductions: medical, SALT, mortgage interest,
 * and charitable contributions. Compared against standard deduction.
 */

import Decimal from "decimal.js";
import { calculateHomeMortgageInterest, type HomeMortgageInterestResult } from "../forms/home-mortgage-interest.js";
import { calculateEducatorExpensesDeduction } from "../forms/educator-expenses.js";
import { calculateForm1099OID } from "../forms/form-1099-oid.js";
import { calculateStateLocalIncomeTaxDeduction } from "../forms/state-local-income-tax-deduction.js";
import { resolveForeignTaxElection, type ForeignTaxElectionResult } from "../forms/foreign-tax-election.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { d, sum, zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateSALTLimit } from "@/utils/tax-math.js";
import { calculateCharitableContributionWorksheet, type CharitableCategory, type CharitableContributionWorksheetInput } from "@/engine/forms/charitable-contribution-worksheet.js";
import { charitableSourceDigest } from "@/utils/charitable-source-digest.js";
import { eligibleCurrentCharitableDonations } from "@/engine/forms/charitable-current-sources.js";
import { resolveCharitableRecipient } from "@/utils/charitable-recipient.js";
import { calculateCharitableCarryover } from "@/engine/forms/charitable-carryover.js";
import { calculateNonitemizedCharitableCarryover, type NonitemizedCharitableCarryoverResult } from "@/engine/forms/nonitemized-charitable-carryover.js";
import { calculateCurrentCharitableCandidates, type CurrentCharitableCandidates } from "@/engine/forms/current-charitable-candidates.js";
import { calculatePriorCashCurrentProperty, type PriorCashCurrentPropertyResult } from "@/engine/forms/prior-cash-current-property.js";
import type { SelectedCharitableCarryover } from "@/engine/forms/selected-charitable-carryover.js";
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
  /** Actual tentative crypto property values, before the common charitable limits. */
  cryptoCharitableAmounts?: CharitableContributionWorksheetInput["amounts"];
  /** Internal170(d)(1)(B) counterfactual source amount; never a taxpayer override. */
  nolPublicCashContributionLimit?: Decimal;
  /** Pre-computed sales tax deduction amount from the sales tax worksheet.
   *  When provided, Schedule A compares this to income taxes for Line 5a. */
  salesTaxDeduction?: Decimal;
  /** Whether the taxpayer elected the sales tax deduction (vs income tax).
   *  When autoCompare is true, the engine uses whichever is larger. */
  salesTaxElected?: boolean;
}

/** Per-year carryforward entry for charitable contribution vintage tracking (IRC §170(d)(1)) */
export interface CharitableCarryforwardEntry {
  sourceId?: string;
  taxYear: number;
  category?: CharitableCategory;
  medium?: "cash" | "noncash";
  amount: Decimal;
}

/** Reconciliation detail for a single carryforward vintage year */
export interface CharitableCarryforwardYearDetail {
  sourceId?: string;
  taxYear: number;
  category?: CharitableCategory;
  medium?: "cash" | "noncash";
  treatedAsPaid?: Decimal;
  amountAvailable: Decimal;
  amountUsed: Decimal;
  amountExpired: Decimal;
  amountRemaining: Decimal;
}

export interface ScheduleAResult {
  medicalDeduction: Decimal; // Line 4
  saltDeduction: Decimal; // Line 5e
  foreignIncomeTaxDeduction: Decimal; // Line 6: actual annual deduction election, outside SALT cap.
  foreignTaxElection: ForeignTaxElectionResult;
  /** Whether the general sales tax election was used for Line 5a (vs income taxes) */
  salesTaxElected: boolean;
  mortgageInterest: Decimal; // Interest only; reported and unreported
  mortgageWorksheet: HomeMortgageInterestResult;
  mortgageInsurancePremiums: Decimal; // Restored for 2026
  investmentInterestDeduction: Decimal; // Line 9
  casualtyLossDeduction: Decimal; // Line 15
  cashCharitable: Decimal; // Exact computational cash aggregate; includes legacy prior use.
  nonCashCharitable: Decimal; // Exact computational noncash amount.
  charitableCurrentCash: Decimal; // Reported line11 after source-group rounding.
  charitableCurrentNoncash: Decimal; // Reported line12.
  charitablePriorYearUsed: Decimal; // Reported line13; separate from current gifts.
  charitableTotal: Decimal; // Reported line14=sum11–13, transferred to17 and other deduction consumers.
  charitableSourceDigest: string; // Original charitable facts, excluding render-only identifiers.
  charitableTreatment?: SelectedCharitableCarryover; // Set only after canonical deduction selection.
  /** Derived only for the explicit2026 nonitemizer source method; no itemized charity candidate. */
  nonitemizedCharitableCarryover?: NonitemizedCharitableCarryoverResult;
  /** Derived current-only alternatives with an actual empty prior history. */
  currentCharitableCandidates?: CurrentCharitableCandidates;
  /** Actual prior G, with the entire floor attributed to current A only. */
  priorCashCurrentProperty?: PriorCashCurrentPropertyResult;
  gamblingLossDeduction: Decimal; // Component of line16
  bondPremiumDeduction: Decimal; // Actual allowable section171 excess
  oidOrdinaryLossDeduction: Decimal; // Actual allowable section1.1275-7(f)(1) ordinary loss
  estateTaxDeduction: Decimal; // Actual K1 Form1041 Box10 section691(c)
  educatorExpenseDeduction: Decimal; // 2026 section67 actual costs not deducted above the line
  otherItemizedDeductions: Decimal; // Line16
  totalItemized: Decimal; // Line 17
  nonitemizerCharitableDeduction: Decimal; // 2026 candidate; federal flow applies only under actual nonitemization
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

const ZERO = new Decimal(0);

export function calculateScheduleA(
  input: TaxYearInput,
  agi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants,
  extra?: ScheduleAInput
): ScheduleAResult {
  const eligibleDonations = eligibleCurrentCharitableDonations(input);
  const legacyCharity = [d(input.priorYear?.charitableCarryforward), ...(input.priorYear?.charitableCarryforwardByYear ?? []).map(row => d(row.amount))];
  if (legacyCharity.some(value => !value.isFinite() || value.lt(0))) throw new Error("Legacy charitable balances must be finite and nonnegative");
  if (!input.charitableCarryoverSources && legacyCharity.some(value => value.gt(0))) {
    throw new Error("Prior charitable carryover balances require an actual source history packet; their category and origin cannot be inferred");
  }
  const audit = new AuditTrail();

  // ── Medical (Lines 1-4) ────────────────────────────────
  const medicalExpenses = extra?.medicalExpenses ?? new Decimal(0);
  // Section213(a) allows actual expenses paid. A negative AGI cannot create
  // additional expenses; retain signed return AGI but floor this limitation.
  const medicalThreshold = roundDollar(zeroFloor(agi).times(new Decimal("0.075")));
  const medicalDeduction = zeroFloor(medicalExpenses.minus(medicalThreshold));
  audit.record("Sched A", "1", "Medical expenses", medicalExpenses, "Total unreimbursed");
  audit.record("Sched A", "4", "Medical deduction", medicalDeduction,
    `Line 1 - (7.5% × AGI = ${medicalThreshold})`);

  // ── SALT (Lines 5a-5d) ─────────────────────────────────
  // Line 5a: State/local income taxes OR general sales taxes (taxpayer elects)
  const salesTaxAmount = extra?.salesTaxDeduction ?? new Decimal(0);
  const hasSalesTaxElection = salesTaxAmount.greaterThan(0) && (extra?.salesTaxElected ?? false);
  const incomeTaxSources = hasSalesTaxElection ? undefined : calculateStateLocalIncomeTaxDeduction(input);
  if (incomeTaxSources) audit.merge(incomeTaxSources.lines);
  const additionalRealEstateTaxes = d(input.scheduleA?.realEstateTaxes);
  if (!additionalRealEstateTaxes.isFinite() || additionalRealEstateTaxes.lt(0)) throw new Error("Additional real estate tax payments must be finite and nonnegative");
  const stateLocalIncomeTaxes = incomeTaxSources?.total ?? new Decimal(0);

  let stateLocalTaxes: Decimal;
  let line5aDescription: string;

  if (hasSalesTaxElection) {
    // Sales tax elected — use sales tax amount
    stateLocalTaxes = salesTaxAmount;
    line5aDescription = `Elected general sales tax deduction $${salesTaxAmount}`;
  } else {
    // Default: income taxes
    stateLocalTaxes = stateLocalIncomeTaxes;
    line5aDescription = "SALT Income Tax WS total: actual W2/non-W2 withholding and in-year payments, excluding source withholding deducted elsewhere";
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
    additionalRealEstateTaxes
  );
  audit.record("Sched A", "5b", "Real estate taxes", propertyTaxes,
    "Sum Form 1098 property tax + other qualified real estate tax payments");

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

  const foreignTaxElection = resolveForeignTaxElection(input);
  audit.merge(foreignTaxElection.lines);
  const foreignIncomeTaxDeduction = roundDollar(foreignTaxElection.scheduleAForeignIncomeTaxes);
  audit.record("Sched A", "6", "Foreign income taxes", foreignIncomeTaxDeduction,
    "Actual annual deduction election: eligible paid source taxes, outside the state/local tax cap");
  audit.record("Sched A", "7", "Total deductible taxes", saltDeduction.plus(foreignIncomeTaxDeduction), "Line5e+line6");

  // Actual Pub936 sources supply interest and points without reusing Box2 as an average.
  const mortgageWorksheet = calculateHomeMortgageInterest({...input,taxpayer:{...input.taxpayer,filingStatus}});
  audit.merge(mortgageWorksheet.lines);
  const mortgageInterest = mortgageWorksheet.mortgageInterest;
  const pointsPaid = mortgageWorksheet.deductiblePoints;
  audit.record("Sched A", "8a", "Mortgage interest and points reported on Form1098", mortgageWorksheet.line8a, "Allowed current reported amounts from Pub936 source worksheet");
  audit.record("Sched A", "8b", "Mortgage interest not reported on Form1098", mortgageWorksheet.line8b, "Actual qualified unreported interest after Pub936 debt limit");
  audit.record("Sched A", "8c", "Points not reported on current Form1098", mortgageWorksheet.line8c, "Actual qualified unreported points and prior-year amortization after debt limit");

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

  const totalHomeInterest = sum(mortgageWorksheet.line8a,mortgageWorksheet.line8b,mortgageWorksheet.line8c,mortgageInsurancePremiums);
  audit.record("Sched A", "8e", "Total home mortgage interest and points", totalHomeInterest, "8a+8b+8c+8d");

  // Line 9: Investment interest expense (from Form 4952 or manual input)
  const investmentInterestDeduction = extra?.investmentInterestExpense ?? new Decimal(0);
  audit.record("Sched A", "9", "Investment interest expense", investmentInterestDeduction,
    investmentInterestDeduction.isZero()
      ? "No investment interest expense"
      : "Investment interest expense deduction (Form 4952 or validated manual input)");

  audit.record("Sched A", "10", "Total deductible interest", totalHomeInterest.plus(investmentInterestDeduction), "8e+9");

  // Line 15: Casualty and theft losses (from Form 4684)
  const casualtyLossDeduction = extra?.casualtyLossDeduction ?? new Decimal(0);
  audit.record("Sched A", "15", "Casualty and theft losses", casualtyLossDeduction,
    casualtyLossDeduction.isZero()
      ? "No casualty or theft losses"
      : "Form 4684 Section A deductible casualty loss (federally declared disaster only, post-TCJA)");

  let nonitemizerCharitableDeduction = ZERO;
  const contributionBase = zeroFloor(agi);
  const nolCashLimit = extra?.nolPublicCashContributionLimit;
  if (nolCashLimit !== undefined && (!Decimal.isDecimal(nolCashLimit) || !nolCashLimit.isFinite() || nolCashLimit.lt(0))) {
    throw new Error("Charitable NOL counterfactual requires a finite nonnegative source contribution limit");
  }
  if (input.taxpayer.taxYear === 2026) {
    let eligibleCash = ZERO;
    for (const donation of eligibleDonations) {
      const amount = d(donation.amount);
      if (!amount.isFinite() || amount.lt(0)) throw new Error("Charitable contribution must be finite and nonnegative");
      const date = new Date(`${donation.dateOfDonation}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== donation.dateOfDonation) throw new Error("Invalid donation date");
      if (!donation.dateOfDonation.startsWith(`${input.taxpayer.taxYear}-`)) throw new Error("Donation date must be in the return tax year");
      const recipient = resolveCharitableRecipient(donation);
      if (donation.type !== "cash" || amount.isZero()) continue;
      if (donation.qualifiedOrganization === undefined || donation.supportingOrganization === undefined || donation.donorAdvisedFund === undefined) throw new Error("Nonitemizer charitable recipient qualification is unknown");
      if (donation.qualifiedOrganization && !donation.supportingOrganization && !donation.donorAdvisedFund && recipient.percentageCategory === "fifty-percent") eligibleCash = eligibleCash.plus(amount);
    }
    if (nolCashLimit !== undefined) eligibleCash = min(eligibleCash, nolCashLimit);
    nonitemizerCharitableDeduction = roundDollar(Decimal.min(eligibleCash, contributionBase.times("0.60"), filingStatus === "married_filing_jointly" ? "2000" : "1000"));
    audit.record("Charitable WS", "nonitemizer", "Nonitemizer charitable deduction candidate", nonitemizerCharitableDeduction,
      "2026 current eligible cash only: min(cash, 60% AGI, 1000 [2000 MFJ]); no floor or carryover");
  }

  let cashCharitable: Decimal;
  let nonCashCharitable: Decimal;
  let charitableCarryforwards: CharitableCarryforwardEntry[];
  let charitableCarryforwardExpired = ZERO;
  let charitableCarryforwardDetail: CharitableCarryforwardYearDetail[] = [];
  let nonitemizedCharitableCarryover: NonitemizedCharitableCarryoverResult | undefined;
  let currentCharitableCandidates: CurrentCharitableCandidates | undefined;
  let priorCashCurrentProperty: PriorCashCurrentPropertyResult | undefined;
  const crypto = extra?.cryptoCharitableAmounts;
  const amounts = { cashPublic: (extra?.k1CashCharitable ?? ZERO).plus(crypto?.cashPublic ?? ZERO), noncashPublic: crypto?.noncashPublic ?? ZERO,
    capitalGainPublic: (extra?.k1AppreciatedProperty30 ?? ZERO).plus(crypto?.capitalGainPublic ?? ZERO), cashPrivate: crypto?.cashPrivate ?? ZERO,
    noncashPrivate: crypto?.noncashPrivate ?? ZERO, capitalGainPrivate: (extra?.k1AppreciatedProperty20 ?? ZERO).plus(crypto?.capitalGainPrivate ?? ZERO) };
  for (const donation of eligibleDonations) {
    if (d(donation.amount).isZero()) continue;
    if (donation.qualifiedOrganization === undefined) throw new Error("Charitable recipient qualification is unknown");
    if (donation.qualifiedOrganization === false) continue;
    const recipient = resolveCharitableRecipient(donation);
    const otherRecipient = recipient.percentageCategory === "other-thirty-percent";
    let contributionValue = d(donation.amount);
    if (donation.type !== "cash") {
      if (donation.isLongTermCapitalGain === undefined) throw new Error("Charitable property long-term holding status is unknown");
      if (!donation.isLongTermCapitalGain) {
        if (donation.costBasis === undefined) throw new Error("Charitable property cost basis is unknown or invalid");
        if (donation.costBasis !== undefined) {
          if (!d(donation.costBasis).isFinite() || d(donation.costBasis).lt(0)) throw new Error("Charitable property cost basis is unknown or invalid");
          contributionValue = min(contributionValue, d(donation.costBasis));
        }
      } else if (recipient.privateNonoperating && (donation.type !== "appreciated_stock" || donation.qualifiedAppreciatedStock !== true)) {
        if (donation.type === "appreciated_stock" && donation.qualifiedAppreciatedStock === undefined) {
          throw new Error("Private-foundation qualified appreciated stock status is unknown");
        }
        if (donation.costBasis === undefined || !d(donation.costBasis).isFinite() || d(donation.costBasis).lt(0)) throw new Error("Private-foundation capital gain gift requires qualified appreciated stock or actual basis-reduction qualification");
        contributionValue = min(contributionValue, d(donation.costBasis));
      }
    }
    const category = donation.type === "cash"
      ? otherRecipient ? "cashPrivate" : "cashPublic"
      : donation.isLongTermCapitalGain
        ? otherRecipient ? "capitalGainPrivate" : "capitalGainPublic"
        : otherRecipient ? "noncashPrivate" : "noncashPublic";
    amounts[category] = amounts[category].plus(contributionValue);
  }
  if (nolCashLimit !== undefined) amounts.cashPublic = min(amounts.cashPublic, nolCashLimit);
  if (input.charitableCarryoverSources) {
    if (input.taxpayer.taxYear === 2026 && ((input.deductionElection !== "standard" && input.deductionElection !== "nonitemized")
      || amounts.noncashPublic.gt(0) || eligibleDonations.some(source => source.type !== "cash"))
      && input.charitableCarryoverSources.vintages?.length === 0) {
      if (nolCashLimit !== undefined) throw new Error("Current charitable candidates require their separate NOL replay method");
      currentCharitableCandidates = calculateCurrentCharitableCandidates(input, { contributionBase, current: amounts });
    } else if (input.taxpayer.taxYear === 2026 && (input.charitableCarryoverSources.vintages?.length ?? 0) > 0
      && (amounts.noncashPublic.gt(0) || eligibleDonations.some(source => source.type !== "cash"))) {
      if (nolCashLimit !== undefined) throw new Error("Prior cash and current property require their separate NOL replay method");
      priorCashCurrentProperty = calculatePriorCashCurrentProperty(input, { contributionBase, current: amounts });
    } else if (input.taxpayer.taxYear === 2026 && (input.deductionElection === "standard" || input.deductionElection === "nonitemized")) {
      if (nolCashLimit !== undefined) throw new Error("Nonitemized charitable carry requires its separate NOL replay method");
      nonitemizedCharitableCarryover = calculateNonitemizedCharitableCarryover(input, { contributionBase, current: amounts });
    }
    if (currentCharitableCandidates) {
      audit.merge(currentCharitableCandidates.lines);
      cashCharitable = currentCharitableCandidates.itemized.exactCashDeduction;
      nonCashCharitable = currentCharitableCandidates.itemized.exactNonCashDeduction;
      charitableCarryforwards = currentCharitableCandidates.itemized.carryforwards;
    } else {
      const charitable = priorCashCurrentProperty ?? nonitemizedCharitableCarryover ?? calculateCharitableCarryover(input, { contributionBase, current: amounts, itemizes: true });
      audit.merge(charitable.lines);
      cashCharitable = charitable.currentCash.plus(charitable.priorCashDeduction);
      nonCashCharitable = charitable.currentNoncash.plus(charitable.priorNoncashDeduction);
      charitableCarryforwards = charitable.carryforwards;
      charitableCarryforwardDetail = charitable.detail;
      charitableCarryforwardExpired = charitable.expired;
    }
  } else {
    const charitable = calculateCharitableContributionWorksheet({ taxYear: input.taxpayer.taxYear, contributionBase, amounts });
    audit.merge(charitable.lines);
    cashCharitable = charitable.exactCashDeduction;
    nonCashCharitable = charitable.exactNonCashDeduction;
    charitableCarryforwards = charitable.carryforwards;
  }
  const limitDescription = nonitemizedCharitableCarryover ? "Actual explicit nonitemization: no ScheduleA charity deduction; section170(p) and percentage carry are separate"
    : input.taxpayer.taxYear === 2026 ? "2026 category worksheet, including 0.5% floor" : "Final2025 Pub526 Worksheet2 current-contribution category limits";
  audit.record("Charitable Computation", "cash", "Cash charitable after applicable limitations", cashCharitable, limitDescription);
  audit.record("Charitable Computation", "noncash", "Noncash charitable after applicable limitations", nonCashCharitable, limitDescription);

  const newCharitableCarryforward = sum(...charitableCarryforwards.map(entry => entry.amount));
  const exactPriorUsed = sum(...charitableCarryforwardDetail.map(entry => entry.amountUsed));
  const exactPriorCash = sum(...charitableCarryforwardDetail.filter(entry => entry.medium === "cash").map(entry => entry.amountUsed));
  const exactPriorNoncash = sum(...charitableCarryforwardDetail.filter(entry => entry.medium === "noncash").map(entry => entry.amountUsed));
  const exactCurrentCash = cashCharitable.minus(exactPriorCash);
  const exactCurrentNoncash = nonCashCharitable.minus(exactPriorNoncash);
  if (!exactPriorUsed.eq(exactPriorCash.plus(exactPriorNoncash)) || [exactCurrentCash, exactCurrentNoncash, exactPriorUsed].some(value => !value.isFinite() || value.lt(0))) {
    throw new Error("Charitable current and prior computational groups must reconcile");
  }
  const charitableCurrentCash = roundDollar(exactCurrentCash);
  const charitableCurrentNoncash = roundDollar(exactCurrentNoncash);
  const charitablePriorYearUsed = roundDollar(exactPriorUsed);
  const charitableTotal = sum(charitableCurrentCash, charitableCurrentNoncash, charitablePriorYearUsed);
  audit.record("Sched A", "11", "Current cash charitable contributions", charitableCurrentCash,
    "Round the completed current-cash group after category limits; preserve original cents", { "Exact current cash": exactCurrentCash });
  audit.record("Sched A", "12", "Current noncash charitable contributions", charitableCurrentNoncash,
    "Round the completed current-noncash group after category limits", { "Exact current noncash": exactCurrentNoncash });
  audit.record("Sched A", "13", "Prior-year charitable carryover used", charitablePriorYearUsed,
    "Round actual prior-year use separately from current gifts", { "Exact prior carry used": exactPriorUsed });
  audit.record("Sched A", "14", "Total charitable contributions", charitableTotal, "Add reported lines11,12,13");

  // Line 28: Gambling losses (limited to gambling winnings per IRC §165(d))
  const gamblingWinnings = extra?.gamblingWinnings ?? new Decimal(0);
  const rawGamblingLosses = extra?.gamblingLosses ?? new Decimal(0);
  const gamblingExpenses = extra?.gamblingExpenses ?? ZERO;
  if ([gamblingWinnings, rawGamblingLosses, gamblingExpenses].some((value) => !value.isFinite() || value.lt(0))) throw new Error("Wagering facts must be finite and nonnegative");
  const deductibleWageringAmount = rawGamblingLosses.plus(gamblingExpenses).times(input.taxpayer.taxYear === 2026 ? "0.90" : "1");
  const cappedWageringAmount = min(deductibleWageringAmount, gamblingWinnings);
  const gamblingLossDeduction = input.taxpayer.taxYear === 2026 ? roundDollar(cappedWageringAmount) : cappedWageringAmount;
  audit.record("Sched A", "28", "Gambling losses (limited to winnings)", gamblingLossDeduction,
    `min(${input.taxpayer.taxYear === 2026 ? "90%" : "100%"} × (losses ${rawGamblingLosses} + expenses ${gamblingExpenses}), winnings ${gamblingWinnings})`);

  const oidSource = calculateForm1099OID(input.form1099OID ?? [], input.taxpayer.taxYear);
  const bondPremiumDeduction = oidSource.bondPremiumDeduction;
  const oidOrdinaryLossDeduction = oidSource.deflationOrdinaryLoss;
  audit.record("OID Deduction Worksheet", "ordinary-loss", "Allowable TIPS ordinary loss", oidOrdinaryLossDeduction,
    "Actual source loss after same-instrument interest offset and prior-inclusion limit; carry excluded");
  if (input.taxpayer.taxYear >= 2026) audit.record("Sched A", "17g", "Ordinary loss on inflation-indexed debt", oidOrdinaryLossDeduction,
    "Draft2026 printed identity; final2025 line16 source rule, not a qualified final mapping");
  const estateTaxAmounts = (input.scheduleK1Form1041 ?? []).map(source => d(source.estateTaxDeduction));
  if (estateTaxAmounts.some(amount => !amount.isFinite() || amount.lt(0))) throw new Error("Estate-tax deductions must be finite and nonnegative");
  const estateTaxDeduction = sum(...estateTaxAmounts);
  const educatorWorksheet = calculateEducatorExpensesDeduction(input.adjustments, filingStatus, input.taxpayer.taxYear);
  if (!educatorWorksheet.itemizedCalculationComplete || educatorWorksheet.itemizedDeduction === undefined) {
    throw new Error("Educator itemized expenses require actual instructional and expense-funding source allocations");
  }
  const educatorExpenseDeduction = roundDollar(educatorWorksheet.itemizedDeduction);
  audit.record("Educator Expense Worksheet", "itemized", "Actual educator costs not deducted on Schedule1", educatorExpenseDeduction,
    "2026 section67 eligible unreimbursed expenses less actual above-line deduction; historical2025 zero", educatorWorksheet.inputs);
  if (input.taxpayer.taxYear >= 2026) audit.record("Sched A", "17k", "Deductible educator expenses not reported on Schedule1", educatorExpenseDeduction,
    "Draft2026 printed identity; actual section67 source worksheet, not a qualified final mapping");
  const otherItemizedDeductions = sum(gamblingLossDeduction, bondPremiumDeduction, oidOrdinaryLossDeduction, estateTaxDeduction, educatorExpenseDeduction);
  audit.record("Sched A", "16", "Other itemized deductions", otherItemizedDeductions,
    "Allowed wagering deduction + allowable excess bond premium + TIPS ordinary loss + K1 estate tax on IRD + actual educator excess; unused source carries excluded");

  // ── Total (Line 17) ───────────────────────────────────
  const totalItemized = sum(
    medicalDeduction,
    saltDeduction,
    foreignIncomeTaxDeduction,
    mortgageInterest,
    pointsPaid,
    mortgageInsurancePremiums,
    investmentInterestDeduction,
    casualtyLossDeduction,
    charitableTotal,
    otherItemizedDeductions
  );
  audit.record("Sched A", "17", "Total itemized deductions", totalItemized,
    "Medical + SALT + foreign income taxes + mortgage + investment interest + casualty losses + charitable + other itemized deductions");


  return {
    medicalDeduction,
    saltDeduction,
    foreignIncomeTaxDeduction,
    foreignTaxElection,
    salesTaxElected: hasSalesTaxElection,
    mortgageInterest,
    mortgageWorksheet,
    mortgageInsurancePremiums,
    investmentInterestDeduction,
    casualtyLossDeduction,
    cashCharitable,
    nonCashCharitable,
    charitableCurrentCash,
    charitableCurrentNoncash,
    charitablePriorYearUsed,
    charitableTotal,
    charitableSourceDigest: charitableSourceDigest(input),
    ...(nonitemizedCharitableCarryover ? { nonitemizedCharitableCarryover } : {}),
    ...(currentCharitableCandidates ? { currentCharitableCandidates } : {}),
    ...(priorCashCurrentProperty ? { priorCashCurrentProperty } : {}),
    gamblingLossDeduction,
    bondPremiumDeduction,
    oidOrdinaryLossDeduction,
    estateTaxDeduction,
    educatorExpenseDeduction,
    otherItemizedDeductions,
    totalItemized,
    nonitemizerCharitableDeduction,
    charitableCarryforward: newCharitableCarryforward,
    charitableCarryforwardByYear: charitableCarryforwards,
    charitableCarryforwardExpired,
    charitableCarryforwardDetail,
    lines: audit.getLines(),
  };
}
