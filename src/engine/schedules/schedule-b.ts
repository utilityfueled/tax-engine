/**
 * Schedule B — Interest and Ordinary Dividends
 * Spec: spec/federal/schedule-b.yaml
 *
 * Supported attachment triggers include the $1,500 interest and dividend
 * thresholds, a claimed education savings-bond exclusion, and foreign
 * financial accounts or trusts.
 */

import Decimal from "decimal.js";
import { calculateForm1099OID } from "../forms/form-1099-oid.js";
import { assertStatementYear } from "../assert-statement-year.js";
import { calculateForm1099DASources } from '../forms/form-1099-da-sources.js';
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateSavingsBondStatementSources } from "../forms/savings-bond-statement-sources.js";
import { reportSavingsBondRatios, sumSavingsBondRatios } from "@/utils/savings-bond-ratios.js";

export interface InterestPayer {
  name: string;
  amount: Decimal;
}

export interface DividendPayer {
  name: string;
  amount: Decimal;
}

export interface ScheduleBResult {
  /** Part I */
  interestPayers: InterestPayer[];
  totalInterest: Decimal; // Line 2
  previouslyReportedSavingsBondInterest: Decimal; // Actual prior interest included in current Box 3
  savingsBondExclusion: Decimal; // Line 3
  taxableInterest: Decimal; // Line 4 → 1040 Line 2b

  /** Part II */
  dividendPayers: DividendPayer[];
  totalOrdinaryDividends: Decimal; // Line 6 → 1040 Line 3b

  /** Part III */
  hasForeignAccounts: boolean | null; // Line 7a, question 1
  fbarRequired: boolean | null; // Line 7a, question 2
  foreignAccountCountries: string[]; // Line 7b
  hasForeignTrust: boolean | null; // Line 8
  partThreeComplete: boolean;

  /** Whether the supplied facts establish that Schedule B is required. */
  isRequired: boolean;

  lines: CalculatedLine[];
}

export function calculateScheduleB(
  input: TaxYearInput,
  savingsBondExclusionOverride?: Decimal,
  form8814QualifiedDividends?: Decimal,
): ScheduleBResult {
  const returnYear = input.taxpayer.taxYear;
  assertStatementYear("Form 1099-INT", input.form1099Int, returnYear);
  assertStatementYear("Form 1099-DIV", input.form1099Div, returnYear);
  const audit = new AuditTrail();
  // Validates actual current transfer/redemption sources; income still enters
  // exclusively through the original statements below.
  const reissueSources = calculateSavingsBondStatementSources(input);
  const exactEducatorBondSources = input.adjustments?.educatorExpenseSources?.some(source => source.savingsBondReductionMethod === "return_sources") === true;

  // ── Part I: Interest ──────────────────────────────────

  const interestPayers: InterestPayer[] = [];

  // Spec: form-1099-da-market-discount.yaml. Keep original statements intact;
  // this is the same exact amount removed from Form8949 capital gain, once.
  if (input.form1099DA?.some(form => form.transactions.some(row => row.marketDiscountSource !== undefined
    || row.ordinaryIncome === true || (row.marketDiscount !== undefined && (!row.marketDiscount.trim() || !d(row.marketDiscount).isZero()))))) {
    for (const source of calculateForm1099DASources(input).marketDiscountSources) {
      if (source.interest.isZero()) continue;
      interestPayers.push({ name: 'Accrued Market Discount', amount: source.interest });
      audit.record('Sched B', '1', 'Accrued Market Discount', source.interest,
        'Source-qualified original Form1099DA disposition; Form8949 worksheet line5, once', { 'Statement index': String(source.statementIndex), 'Transaction index': String(source.transactionIndex) });
    }
  }

  // 1099-INT sources
  for (const form of input.form1099Int) {
    const box1Interest = d(form.interestIncome);
    const box3Interest = d(form.usSavingsBondInterest);
    const amount = reissueSources || exactEducatorBondSources ? sumSavingsBondRatios([box1Interest, box3Interest]
      .map(numerator => ({ numerator, denominator: new Decimal(1) }))).numerator : box1Interest.plus(box3Interest);
    interestPayers.push({
      name: form.payer,
      amount,
    });
    audit.record("Sched B", "1", `Interest payer - ${form.payer}`, amount,
      "1099-INT Box 1 + separately reported Box 3", {
        "1099-INT Box 1": box1Interest,
        "1099-INT Box 3": box3Interest,
      });
  }

  const previouslyReportedSavingsBondInterest = d(input.form8815?.priorYearInterestIncludedInCurrentStatements);
  const reportedTreasuryInterest = input.form1099Int.reduce((total, form) => total.plus(d(form.usSavingsBondInterest)), new Decimal(0));
  if (!previouslyReportedSavingsBondInterest.isFinite() || previouslyReportedSavingsBondInterest.isNegative()
    || previouslyReportedSavingsBondInterest.gt(reportedTreasuryInterest)) {
    throw new Error("Previously reported interest adjustment must be finite, nonnegative and no greater than current Box 3 interest");
  }
  if (previouslyReportedSavingsBondInterest.gt(0)) {
    if (input.form8815?.sourceFactsConfirmed !== true || input.form8815.currentStatementReconciliationConfirmed !== true
      || !input.savingsBondRedemptions?.length) {
      throw new Error("Previously reported interest requires actual reconciled bond and statement sources");
    }
    interestPayers.push({ name: "U.S. savings bond interest previously reported", amount: previouslyReportedSavingsBondInterest.negated() });
    audit.record("Sched B", "1-prior-interest", "Previously reported savings bond interest", previouslyReportedSavingsBondInterest.negated(),
      "Subtract only actual prior interest confirmed as included in current Treasury statements");
  }

  // K-1 interest income (Box 5 — partnerships/S-corps)
  for (const k1 of input.scheduleK1) {
    const k1Interest = d(k1.interestIncome);
    if (k1Interest.greaterThan(0)) {
      interestPayers.push({
        name: `${k1.partnershipName} (K-1)`,
        amount: k1Interest,
      });
      audit.record("Sched B", "1", `Interest payer - ${k1.partnershipName} (K-1)`, k1Interest, "Schedule K-1 Box 5");
    }
  }

  // K-1 Form 1041 interest income (Box 1 — estates/trusts)
  for (const k1 of (input.scheduleK1Form1041 ?? [])) {
    const k1Interest = d(k1.interestIncome);
    if (k1Interest.greaterThan(0)) {
      interestPayers.push({
        name: `${k1.estateTrustName} (K-1 1041)`,
        amount: k1Interest,
      });
      audit.record(
        "Sched B",
        "1",
        `Interest payer - ${k1.estateTrustName} (K-1 1041)`,
        k1Interest,
        "Schedule K-1 (Form 1041) Box 1"
      );
    }
  }

  // One recipient-classified amount per actual OID source. Box8 is separate
  // Treasury OID; tax-exempt Box11/coupons never become taxable by position.
  const oid = calculateForm1099OID(input.form1099OID ?? [], input.taxpayer.taxYear);
  for (const source of oid.sources) {
    if (source.taxableInterest.isZero()) continue;
    interestPayers.push({ name: `${source.payer} (OID)`, amount: source.taxableInterest });
    audit.record("Sched B", "1", `Interest payer - ${source.payer} (OID)`, source.taxableInterest,
      source.sourceFactsVerified ? "Actual recipient-classified OID and stated interest after elections and matching source adjustments" : "Unverified historical OID and interest aliases after legacy netting",
      { "Source ID": source.sourceId, "Treasury interest": source.treasuryInterest });
  }

  audit.record(
    "Sched B",
    "1-count",
    "Interest payers listed",
    new Decimal(interestPayers.length),
    "Count of payer-level Line 1 entries from 1099-INT, 1099-OID, K-1, and K-1 (Form 1041) interest sources"
  );

  // Line 2: Total interest
  const totalInterest = reissueSources || exactEducatorBondSources ? reportSavingsBondRatios(interestPayers.map(payer => ({ numerator: payer.amount, denominator: new Decimal(1) }))) : interestPayers.reduce(
    (acc, p) => acc.plus(p.amount),
    new Decimal(0)
  );
  audit.record("Sched B", "2", "Total interest", totalInterest, "Sum of all Line 1 amounts");

  // Line 3: Savings bond exclusion (Form 8815, computed externally)
  const savingsBondExclusion = savingsBondExclusionOverride ?? new Decimal(0);
  audit.record(
    "Sched B",
    "3",
    "Savings bond exclusion",
    savingsBondExclusion,
    savingsBondExclusion.isZero() ? "No savings bond exclusion" : "Form 8815"
  );

  // Line 4: Taxable interest
  const taxableInterest = zeroFloor(totalInterest.minus(savingsBondExclusion));
  audit.record("Sched B", "4", "Taxable interest", taxableInterest, "Line 2 - Line 3");

  // ── Part II: Ordinary Dividends ───────────────────────

  const dividendPayers: DividendPayer[] = [];

  // 1099-DIV sources
  for (const form of input.form1099Div) {
    const amount = d(form.ordinaryDividends);
    dividendPayers.push({
      name: form.payer,
      amount,
    });
    audit.record("Sched B", "5", `Dividend payer - ${form.payer}`, amount, "1099-DIV Box 1a");
  }

  // K-1 ordinary dividends (Box 6a — partnerships/S-corps)
  for (const k1 of input.scheduleK1) {
    const k1Div = d(k1.ordinaryDividends);
    if (k1Div.greaterThan(0)) {
      dividendPayers.push({
        name: `${k1.partnershipName} (K-1)`,
        amount: k1Div,
      });
      audit.record("Sched B", "5", `Dividend payer - ${k1.partnershipName} (K-1)`, k1Div, "Schedule K-1 Box 6a");
    }
  }

  // K-1 Form 1041 ordinary dividends (Box 2a — estates/trusts)
  for (const k1 of (input.scheduleK1Form1041 ?? [])) {
    const k1Div = d(k1.ordinaryDividends);
    if (k1Div.greaterThan(0)) {
      dividendPayers.push({
        name: `${k1.estateTrustName} (K-1 1041)`,
        amount: k1Div,
      });
      audit.record(
        "Sched B",
        "5",
        `Dividend payer - ${k1.estateTrustName} (K-1 1041)`,
        k1Div,
        "Schedule K-1 (Form 1041) Box 2a"
      );
    }
  }

  let dividendPayerCountReason = "Count of payer-level Line 5 entries from 1099-DIV, K-1, and K-1 (Form 1041) dividend sources";
  if (form8814QualifiedDividends?.greaterThan(0)) {
    dividendPayers.push({ name: "Form 8814", amount: form8814QualifiedDividends });
    audit.record("Sched B", "5", "Dividend payer - Form 8814", form8814QualifiedDividends,
      "Sum of Form 8814 Line 9 from validated child elections");
    dividendPayerCountReason = "Count of Line 5 entries from 1099-DIV, K-1, K-1 (Form 1041), and Form 8814";
  }

  audit.record(
    "Sched B",
    "5-count",
    "Dividend payers listed",
    new Decimal(dividendPayers.length),
    dividendPayerCountReason
  );

  // Line 6: Total ordinary dividends
  const totalOrdinaryDividends = dividendPayers.reduce(
    (acc, p) => acc.plus(p.amount),
    new Decimal(0)
  );
  audit.record(
    "Sched B",
    "6",
    "Total ordinary dividends",
    totalOrdinaryDividends,
    "Sum of all Line 5 amounts"
  );

  // ── Part III: Foreign Accounts and Trusts ─────────────

  const foreignAnswers = input.scheduleBPartThree;
  const hasForeignAccounts = foreignAnswers?.hasForeignAccounts ?? null;
  const fbarRequired = hasForeignAccounts === true ? foreignAnswers?.fbarRequired ?? null : null;
  const suppliedCountries = foreignAnswers?.foreignAccountCountries?.map((country) => country.trim()) ?? [];
  const foreignAccountCountries = fbarRequired === true && suppliedCountries.every(Boolean)
    ? [...new Set(suppliedCountries)]
    : [];
  const hasForeignTrust = foreignAnswers?.hasForeignTrust ?? null;
  const fbarAnswerApplicable = hasForeignAccounts === false
    ? foreignAnswers?.fbarRequired === undefined
    : fbarRequired !== null;
  const countryAnswersComplete = fbarRequired === true
    ? foreignAccountCountries.length > 0
    : suppliedCountries.length === 0;
  const partThreeComplete = hasForeignTrust !== null && fbarAnswerApplicable && countryAnswersComplete;

  if (hasForeignAccounts !== null) {
    audit.record("Sched B", "7a", "Foreign financial account", new Decimal(Number(hasForeignAccounts)), "Taxpayer's answer");
  }
  if (fbarRequired !== null) {
    audit.record("Sched B", "7a-FBAR", "FinCEN Form 114 required", new Decimal(Number(fbarRequired)), "Taxpayer's answer");
  }
  if (foreignAccountCountries.length) {
    audit.record("Sched B", "7b", "Foreign account countries", new Decimal(foreignAccountCountries.length), foreignAccountCountries.join(", "));
  }
  if (hasForeignTrust !== null) {
    audit.record("Sched B", "8", "Foreign trust", new Decimal(Number(hasForeignTrust)), "Taxpayer's answer");
  }

  // Determine if Schedule B is required
  const isRequired =
    totalInterest.greaterThan(1500) ||
    totalOrdinaryDividends.greaterThan(1500) ||
    savingsBondExclusion.gt(0) ||
    hasForeignAccounts === true ||
    hasForeignTrust === true;

  return {
    previouslyReportedSavingsBondInterest,
    interestPayers,
    totalInterest,
    savingsBondExclusion,
    taxableInterest,
    dividendPayers,
    totalOrdinaryDividends,
    hasForeignAccounts,
    fbarRequired,
    foreignAccountCountries,
    hasForeignTrust,
    partThreeComplete,
    isRequired,
    lines: audit.getLines(),
  };
}
