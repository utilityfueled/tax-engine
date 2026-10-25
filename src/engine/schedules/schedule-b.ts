/**
 * Schedule B — Interest and Ordinary Dividends
 * Spec: spec/federal/schedule-b.yaml
 *
 * Required when taxable interest or ordinary dividends exceed $1,500,
 * or when the taxpayer has foreign financial accounts/trusts.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

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

  // ── Part I: Interest ──────────────────────────────────

  const interestPayers: InterestPayer[] = [];

  // 1099-INT sources
  for (const form of input.form1099Int) {
    const box1Interest = d(form.interestIncome);
    const box3Interest = d(form.usSavingsBondInterest);
    const amount = box1Interest.plus(box3Interest);
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

  // 1099-OID sources: net OID (Box 1 − acquisition premium) + other periodic interest (Box 2 − bond premium)
  for (const form of (input.form1099OID ?? [])) {
    const grossOID = d(form.originalIssueDiscount);
    const acqPremium = Decimal.min(d(form.acquisitionPremium), grossOID);
    const netOID = grossOID.minus(acqPremium);
    if (netOID.greaterThan(0)) {
      interestPayers.push({
        name: `${form.payer} (OID)`,
        amount: netOID,
      });
      audit.record(
        "Sched B",
        "1",
        `Interest payer - ${form.payer} (OID)`,
        netOID,
        "Form 1099-OID Box 1 - min(Box 1, Box 6 acquisition premium)"
      );
    }
    // Box 2: Other periodic interest, reduced by bond premium (Box 11) under §171
    const otherInterest = d(form.otherPeriodicInterest);
    const premium = Decimal.min(d(form.bondPremium), otherInterest);
    const netOtherInterest = otherInterest.minus(premium);
    if (netOtherInterest.greaterThan(0)) {
      interestPayers.push({
        name: `${form.payer} (interest)`,
        amount: netOtherInterest,
      });
      audit.record(
        "Sched B",
        "1",
        `Interest payer - ${form.payer} (interest)`,
        netOtherInterest,
        "Form 1099-OID Box 2 - min(Box 2, Box 11 bond premium)"
      );
    }
  }

  audit.record(
    "Sched B",
    "1-count",
    "Interest payers listed",
    new Decimal(interestPayers.length),
    "Count of payer-level Line 1 entries from 1099-INT, 1099-OID, K-1, and K-1 (Form 1041) interest sources"
  );

  // Line 2: Total interest
  const totalInterest = interestPayers.reduce(
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
