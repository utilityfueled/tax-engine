/**
 * Schedule B — Interest and Ordinary Dividends
 * Spec: spec/federal/schedule-b.yaml
 *
 * Required when taxable interest or ordinary dividends exceed $1,500,
 * or when the taxpayer has foreign financial accounts/trusts.
 */

import Decimal from "decimal.js";
import { calculateForm1099OID } from "../forms/form-1099-oid.js";
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
  hasForeignAccounts: boolean; // Line 7a
  foreignAccountCountries: string[]; // Line 7b
  hasForeignTrust: boolean; // Line 8

  /** Whether Schedule B is required */
  isRequired: boolean;

  lines: CalculatedLine[];
}

export function calculateScheduleB(input: TaxYearInput, savingsBondExclusionOverride?: Decimal): ScheduleBResult {
  const audit = new AuditTrail();
  // Validates actual current transfer/redemption sources; income still enters
  // exclusively through the original statements below.
  const reissueSources = calculateSavingsBondStatementSources(input);

  // ── Part I: Interest ──────────────────────────────────

  const interestPayers: InterestPayer[] = [];

  // 1099-INT sources
  for (const form of input.form1099Int) {
    const box1Interest = d(form.interestIncome);
    const box3Interest = d(form.usSavingsBondInterest);
    const amount = reissueSources ? sumSavingsBondRatios([box1Interest, box3Interest]
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
  const totalInterest = reissueSources ? reportSavingsBondRatios(interestPayers.map(payer => ({ numerator: payer.amount, denominator: new Decimal(1) }))) : interestPayers.reduce(
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

  audit.record(
    "Sched B",
    "5-count",
    "Dividend payers listed",
    new Decimal(dividendPayers.length),
    "Count of payer-level Line 5 entries from 1099-DIV, K-1, and K-1 (Form 1041) dividend sources"
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

  // Detect foreign accounts from 1099-DIV foreign tax info
  const foreignCountries = new Set<string>();
  for (const form of input.form1099Div) {
    if (form.foreignCountry && d(form.foreignTaxPaid).greaterThan(0)) {
      foreignCountries.add(form.foreignCountry);
    }
  }

  const hasForeignAccounts = foreignCountries.size > 0;
  const foreignAccountCountries = [...foreignCountries];

  audit.record(
    "Sched B",
    "7a",
    "Foreign financial account",
    new Decimal(hasForeignAccounts ? 1 : 0),
    "Detected from 1099-DIV foreign tax paid"
  );

  audit.record(
    "Sched B",
    "7b",
    "Foreign account countries",
    new Decimal(foreignAccountCountries.length),
    foreignAccountCountries.join(", ") || "None"
  );

  // Detect foreign partnership/trust from K-1 data
  const hasForeignTrust = input.scheduleK1.some((k1) => k1.isForeignPartnership === true);
  audit.record(
    "Sched B",
    "8",
    "Foreign trust",
    new Decimal(hasForeignTrust ? 1 : 0),
    hasForeignTrust ? "K-1 foreign partnership detected" : "No foreign trust/partnership"
  );

  // Determine if Schedule B is required
  const isRequired =
    totalInterest.greaterThan(1500) ||
    totalOrdinaryDividends.greaterThan(1500) ||
    hasForeignAccounts ||
    hasForeignTrust;

  return {
    previouslyReportedSavingsBondInterest,
    interestPayers,
    totalInterest,
    savingsBondExclusion,
    taxableInterest,
    dividendPayers,
    totalOrdinaryDividends,
    hasForeignAccounts,
    foreignAccountCountries,
    hasForeignTrust,
    isRequired,
    lines: audit.getLines(),
  };
}
