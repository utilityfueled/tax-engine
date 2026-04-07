/**
 * Pennsylvania Schedule T — Gambling and Lottery Winnings
 * Spec: spec/state/pa-schedule-t.yaml
 */

import Decimal from "decimal.js";
import { zeroFloor, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { PA_CONSTANTS } from "@/engine/state/pa-40.js";

export type PAScheduleTAccountHolder = "primary" | "spouse";
export type PAScheduleTPrizeType = "cash" | "noncash" | "mixed";
export type PAScheduleTEntrySource = "w2g" | "statement";

export interface PAScheduleTFormW2GEntry {
  payer: string;
  accountHolder?: PAScheduleTAccountHolder;
  reportableWinnings: Decimal;
  typeOfWager?: string;
  prizeType?: PAScheduleTPrizeType;
  stateWithheld?: Decimal;
  state?: string;
}

export interface PAScheduleTAdditionalEntry {
  description?: string;
  accountHolder?: PAScheduleTAccountHolder;
  winnings: Decimal;
  wageringCosts?: Decimal;
  isLottery?: boolean;
  lotteryState?: string;
  prizeType?: PAScheduleTPrizeType;
}

export interface PAScheduleTEntry extends PAScheduleTAdditionalEntry {
  source: PAScheduleTEntrySource;
}

export interface PAScheduleTInput {
  taxYear: number;
  entries?: PAScheduleTEntry[];
  w2gForms?: PAScheduleTFormW2GEntry[];
  additionalEntries?: PAScheduleTAdditionalEntry[];
}

export interface PAScheduleTHolderResult {
  formW2GWinnings: Decimal;
  supplementalWinnings: Decimal;
  totalWinnings: Decimal;
  wageringCosts: Decimal;
  wageringCostsUsed: Decimal;
  netTaxableWinnings: Decimal;
  allowableCosts: Decimal;
  taxableAfterCosts: Decimal;
}

export interface PAScheduleTResult {
  primary: PAScheduleTHolderResult;
  spouse: PAScheduleTHolderResult;
  exemptPALotteryNoncashWinnings: Decimal;
  totalWinnings: Decimal;
  totalWageringCostsUsed: Decimal;
  totalTaxableWinnings: Decimal;
  totalTaxableWinningsBeforeCosts: Decimal;
  totalAllowableCosts: Decimal;
  totalTaxableGamblingIncome: Decimal;
  paTaxWithheld: Decimal;
  lines: CalculatedLine[];
}

interface MutableHolderTotals {
  formW2GWinnings: Decimal;
  supplementalWinnings: Decimal;
  wageringCosts: Decimal;
}

const ZERO = new Decimal(0);

function getHolder(accountHolder?: PAScheduleTAccountHolder): PAScheduleTAccountHolder {
  return accountHolder ?? "primary";
}

function isPennsylvaniaLotteryPrize(options: {
  isLottery?: boolean;
  typeOfWager?: string;
  lotteryState?: string;
  state?: string;
}): boolean {
  const isLottery = options.isLottery ?? options.typeOfWager?.toLowerCase() === "lottery";
  const lotteryState = options.lotteryState?.toUpperCase() ?? options.state?.toUpperCase();
  return isLottery && (!lotteryState || lotteryState === "PA");
}

function isExemptPALotteryNoncashPrize(options: {
  prizeType?: PAScheduleTPrizeType;
  isLottery?: boolean;
  typeOfWager?: string;
  lotteryState?: string;
  state?: string;
}): boolean {
  return options.prizeType === "noncash" && isPennsylvaniaLotteryPrize(options);
}

function emptyHolder(): MutableHolderTotals {
  return {
    formW2GWinnings: ZERO,
    supplementalWinnings: ZERO,
    wageringCosts: ZERO,
  };
}

function finalizeHolder(holder: MutableHolderTotals): PAScheduleTHolderResult {
  const totalWinnings = sum(holder.formW2GWinnings, holder.supplementalWinnings);
  const wageringCostsUsed = Decimal.min(holder.wageringCosts, totalWinnings);
  return {
    formW2GWinnings: holder.formW2GWinnings,
    supplementalWinnings: holder.supplementalWinnings,
    totalWinnings,
    wageringCosts: holder.wageringCosts,
    wageringCostsUsed,
    netTaxableWinnings: zeroFloor(totalWinnings.minus(wageringCostsUsed)),
    allowableCosts: wageringCostsUsed,
    taxableAfterCosts: zeroFloor(totalWinnings.minus(wageringCostsUsed)),
  };
}

export function calculatePAScheduleT(input: PAScheduleTInput): PAScheduleTResult {
  if (!PA_CONSTANTS[input.taxYear]) {
    throw new Error(`PA Schedule T constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const primary = emptyHolder();
  const spouse = emptyHolder();
  let exemptPALotteryNoncashWinnings = ZERO;
  let paTaxWithheld = ZERO;

  const getMutableHolder = (accountHolder?: PAScheduleTAccountHolder) => (
    getHolder(accountHolder) === "spouse" ? spouse : primary
  );

  const entryBasedW2GForms = (input.entries ?? [])
    .filter((entry) => entry.source === "w2g")
    .map((entry) => ({
      payer: entry.description ?? "Form W-2G",
      accountHolder: entry.accountHolder,
      reportableWinnings: entry.winnings,
      typeOfWager: entry.isLottery ? "lottery" : undefined,
      prizeType: entry.prizeType,
      stateWithheld: ZERO,
      state: entry.lotteryState,
    }));
  const entryBasedAdditionalEntries = (input.entries ?? [])
    .filter((entry) => entry.source === "statement")
    .map(({ source: _source, ...entry }) => entry);

  const w2gForms = input.w2gForms ?? entryBasedW2GForms;
  const additionalEntries = input.additionalEntries ?? entryBasedAdditionalEntries;

  for (const form of w2gForms) {
    const amount = zeroFloor(form.reportableWinnings);
    const isExempt = isExemptPALotteryNoncashPrize(form);

    if (isExempt) {
      exemptPALotteryNoncashWinnings = exemptPALotteryNoncashWinnings.plus(amount);
      audit.record(
        "PA-Schedule-T",
        "1-exempt",
        `Excluded noncash PA Lottery prize from ${form.payer}`,
        amount,
        "Noncash Pennsylvania Lottery prizes remain exempt from PA income tax",
      );
    } else {
      const holder = getMutableHolder(form.accountHolder);
      holder.formW2GWinnings = holder.formW2GWinnings.plus(amount);
      audit.record(
        "PA-Schedule-T",
        "1-detail",
        `Taxable W-2G winnings from ${form.payer}`,
        amount,
        "Included on Schedule T Line 1",
      );
    }

    const state = form.state?.toUpperCase();
    if (!state || state === "PA") {
      paTaxWithheld = paTaxWithheld.plus(zeroFloor(form.stateWithheld ?? ZERO));
    }
  }

  for (const entry of additionalEntries) {
    const amount = zeroFloor(entry.winnings);
    const holder = getMutableHolder(entry.accountHolder);
    holder.wageringCosts = holder.wageringCosts.plus(zeroFloor(entry.wageringCosts ?? ZERO));

    if (isExemptPALotteryNoncashPrize(entry)) {
      exemptPALotteryNoncashWinnings = exemptPALotteryNoncashWinnings.plus(amount);
      audit.record(
        "PA-Schedule-T",
        "2-exempt",
        `Excluded noncash PA Lottery prize${entry.description ? `: ${entry.description}` : ""}`,
        amount,
        "Noncash Pennsylvania Lottery prizes remain exempt from PA income tax",
      );
      continue;
    }

    holder.supplementalWinnings = holder.supplementalWinnings.plus(amount);
    audit.record(
      "PA-Schedule-T",
      "2-detail",
      `Supplemental gambling winnings${entry.description ? `: ${entry.description}` : ""}`,
      amount,
      "Included on Schedule T Line 2",
    );
  }

  const primaryResult = finalizeHolder(primary);
  const spouseResult = finalizeHolder(spouse);
  const totalWinnings = sum(primaryResult.totalWinnings, spouseResult.totalWinnings);
  const totalWageringCostsUsed = sum(primaryResult.wageringCostsUsed, spouseResult.wageringCostsUsed);
  const totalTaxableWinnings = sum(primaryResult.netTaxableWinnings, spouseResult.netTaxableWinnings);

  audit.record("PA-Schedule-T", "1", "Forms W-2G winnings",
    sum(primaryResult.formW2GWinnings, spouseResult.formW2GWinnings),
    "Sum of PA-taxable Forms W-2G winnings");
  audit.record("PA-Schedule-T", "2", "Other gambling and lottery winnings",
    sum(primaryResult.supplementalWinnings, spouseResult.supplementalWinnings),
    "Sum of supplemental PA-taxable gambling and lottery winnings");
  audit.record("PA-Schedule-T", "3", "Total winnings", totalWinnings, "Line 1 + Line 2");
  audit.record("PA-Schedule-T", "4", "Wagering costs used",
    totalWageringCostsUsed,
    "Direct wagering costs limited to each spouse's own winnings");
  audit.record("PA-Schedule-T", "5", "Net gambling winnings by spouse",
    totalTaxableWinnings,
    "Sum of each spouse's max(Line 3 - Line 4, 0)");
  audit.record("PA-Schedule-T", "6", "Total gambling and lottery winnings",
    totalTaxableWinnings,
    "Carry to PA-40 Line 8");
  audit.record("PA-Schedule-T", "7", "Pennsylvania tax withheld from Forms W-2G",
    paTaxWithheld,
    "Sum of PA withholding reported on Forms W-2G");

  return {
    primary: primaryResult,
    spouse: spouseResult,
    exemptPALotteryNoncashWinnings,
    totalWinnings,
    totalWageringCostsUsed,
    totalTaxableWinnings,
    totalTaxableWinningsBeforeCosts: totalWinnings,
    totalAllowableCosts: totalWageringCostsUsed,
    totalTaxableGamblingIncome: totalTaxableWinnings,
    paTaxWithheld,
    lines: audit.getLines(),
  };
}
