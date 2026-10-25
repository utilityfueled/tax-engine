/**
 * Form 8582 — Passive Activity Loss Limitations
 * Spec: spec/federal/form-8582.yaml
 *
 * Limits passive losses to passive income, with a special $25,000
 * allowance for active-participant rental real estate (phased out
 * at $100K-$150K AGI).
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { FilingStatus } from "@/models/constants.js";

export interface PassiveActivity {
  name: string;
  /** Actual form/line used for this activity; omitted when that source is unknown. */
  reportingFormAndLine?: string;
  income: Decimal; // positive
  loss: Decimal; // negative
  isRentalRealEstate: boolean;
  isActiveParticipant: boolean;
  /** IRC §469(k): When true, losses can only offset income from the same PTP */
  isPubliclyTradedPartnership?: boolean;
  /** IRC §469(g)(1): When true, the entire PTP interest was disposed of in a
   *  fully taxable transaction this year. All accumulated suspended PTP losses
   *  become deductible as nonpassive losses. */
  ptpFullyDisposedInTaxableTransaction?: boolean;
  /** Gain or loss on disposition of the PTP interest. Treated as passive activity
   *  income/loss from the PTP for netting against suspended losses. Positive = gain. */
  ptpDispositionGainOrLoss?: Decimal;
}

export interface Form8582Input {
  activities: PassiveActivity[];
  agi: Decimal;
  filingStatus: FilingStatus;
  /**
   * True when the MFS filer lived apart from their spouse for the entire tax year.
   * IRC §469(i)(4)(B): MFS lived-apart gets $12,500 max allowance with $50K-$75K phase-out.
   * MFS who lived together at any time get $0 allowance per IRC §469(i)(4).
   * Ignored for non-MFS filing statuses.
   */
  mfsLivedApartFromSpouseAllYear?: boolean;
  priorYearSuspendedLosses?: Array<{ name: string; amount: Decimal }>;
  /** Prior-year suspended PTP losses — keyed by PTP name.
   *  These are separate from regular suspended losses per IRC §469(k)(2). */
  priorYearPTPSuspendedLosses?: Array<{ name: string; amount: Decimal }>;
}

export interface Form8582ActivityRow {
  sourceIndex?: number;
  name: string;
  reportingFormAndLine?: string;
  isActiveRental: boolean;
  sourceCurrentIncome: Decimal;
  sourceCurrentLoss: Decimal;
  sourcePriorYearSuspendedLoss: Decimal;
  currentIncome: Decimal;
  currentLoss: Decimal;
  priorYearSuspendedLoss: Decimal;
  overallNet: Decimal;
}

export interface Form8582Result {
  /** Actual input to the modified-AGI worksheet, retained even when Part II is skipped. */
  modifiedAgi: Decimal;
  passiveIncome: Decimal; // Line 2a
  passiveLoss: Decimal; // Lines 2b + 2c, negative
  netPassive: Decimal; // Line 2d
  rentalIncome: Decimal; // Line 1a
  rentalLoss: Decimal; // Lines 1b + 1c, negative
  netRental: Decimal; // Line 1d
  combinedLoss: Decimal; // Negative part of line 3
  rentalAllowance: Decimal; // Line 9
  allowedLoss: Decimal; // Line 11, or all losses allowed by line 3
  suspendedLoss: Decimal; // Part VII column c total
  requiresForm8582: boolean;
  activityRows: Form8582ActivityRow[];
  /** Stable original input index binds an allocation even when other rows have no loss. */
  activityAllocations: Array<{
    sourceIndex?: number;
    name: string;
    reportingFormAndLine?: string;
    isActiveRental: boolean;
    totalLoss: Decimal;
    overallLoss: Decimal;
    specialAllowanceRatio: Decimal;
    specialAllowance: Decimal;
    remainingLoss: Decimal;
    unallowedRatio: Decimal;
    allowedLoss: Decimal;
    suspendedLoss: Decimal;
  }>;

  // ── PTP segregation (IRC §469(k)) ──────────────────────
  /** PTP net income is nonpassive and excluded from the regular Form8582 pool. */
  ptpNetIncome: Decimal;
  /** Per-PTP suspended losses (only offset by same-PTP income) */
  ptpSuspendedLosses: Array<{
    name: string;
    currentYearLoss: Decimal;
    priorYearCarryforward: Decimal;
    currentYearIncome: Decimal;
    netSuspended: Decimal;
  }>;

  // ── PTP disposition (IRC §469(g)(1)) ──────────────────
  /** PTP losses released as nonpassive due to full disposition */
  ptpDispositionReleasedLosses: Array<{
    name: string;
    currentYearLoss: Decimal;
    priorYearSuspendedLoss: Decimal;
    dispositionGain: Decimal;
    totalReleased: Decimal;
  }>;

  lines: CalculatedLine[];
}

/** Dollar rounding only: conserve the printed total using largest remainders.
 * The IRS prescribes the proportional formula and matching totals, not this tie rule.
 */
function allocateDollars(total: Decimal, weights: Decimal[]): Decimal[] {
  const denominator = weights.reduce((sum, weight) => sum.plus(weight), new Decimal(0));
  if (denominator.isZero() || total.isZero()) return weights.map(() => new Decimal(0));
  const exact = weights.map(weight => total.times(weight).div(denominator));
  const amounts = exact.map(value => value.floor());
  let remaining = total.minus(amounts.reduce((sum, value) => sum.plus(value), new Decimal(0)));
  const order = exact.map((value, index) => ({ index, fraction: value.minus(amounts[index]) }))
    .sort((a, b) => b.fraction.comparedTo(a.fraction) || a.index - b.index);
  for (const { index } of order) {
    if (remaining.isZero()) break;
    amounts[index] = amounts[index].plus(1);
    remaining = remaining.minus(1);
  }
  if (!remaining.isZero()) throw new Error("Form8582 dollar allocation failed to reconcile its printed total.");
  return amounts;
}

export function calculateForm8582(input: Form8582Input): Form8582Result {
  const audit = new AuditTrail();

  // ═══════════════════════════════════════════════════════════
  // PTP segregation (IRC §469(k))
  // PTPs are handled separately: losses only offset same-PTP income.
  // PTP net gains are nonpassive; neither income nor losses enter this form.
  // ═══════════════════════════════════════════════════════════

  if (!input.agi.isFinite()) throw new Error("Form8582 requires finite actual modified AGI.");
  const sourceActivities = input.activities.map((activity, sourceIndex) => {
    if (typeof activity.name !== "string" || !activity.name.trim() || !activity.income.isFinite() || activity.income.lt(0)
      || !activity.loss.isFinite() || activity.loss.gt(0)) throw new Error("Form8582 requires actual finite signed activity amounts and names.");
    return { ...activity, sourceIndex };
  });
  const ptpActivities = sourceActivities.filter(a => a.isPubliclyTradedPartnership);
  const nonPTPActivities = sourceActivities.filter(a => !a.isPubliclyTradedPartnership);
  if (new Set(ptpActivities.map(activity => activity.name)).size !== ptpActivities.length) {
    throw new Error("Form8582 requires an unambiguous consolidated current PTP identity.");
  }

  // Build PTP prior-year carryforward map
  const priorPTPByName = new Map<string, Decimal>();
  for (const cf of input.priorYearPTPSuspendedLosses ?? []) {
    if (!cf.name.trim() || !cf.amount.isFinite() || cf.amount.lt(0)) throw new Error("Form8582 requires actual finite nonnegative prior PTP loss sources.");
    const amount = cf.amount;
    if (!amount.isZero()) {
      priorPTPByName.set(cf.name, (priorPTPByName.get(cf.name) ?? new Decimal(0)).plus(amount));
    }
  }

  // Separate disposed PTPs from continuing PTPs
  const disposedPTPs = ptpActivities.filter((a) => a.ptpFullyDisposedInTaxableTransaction);
  const continuingPTPs = ptpActivities.filter((a) => !a.ptpFullyDisposedInTaxableTransaction);

  // ── PTP dispositions (IRC §469(g)(1)) ─────────────────
  // When a PTP interest is fully disposed of in a taxable transaction,
  // ALL accumulated suspended losses become nonpassive (deductible).
  const ptpDispositionReleasedLosses: Form8582Result["ptpDispositionReleasedLosses"] = [];

  for (const ptp of disposedPTPs) {
    const priorCarryforward = priorPTPByName.get(ptp.name) ?? new Decimal(0);
    priorPTPByName.delete(ptp.name);

    const currentIncome = ptp.income;
    const currentLoss = ptp.loss.abs();
    const dispositionGain = ptp.ptpDispositionGainOrLoss ?? new Decimal(0);
    // Net = current income + disposition gain - current loss - prior carryforward
    const totalInflows = currentIncome.plus(Decimal.max(new Decimal(0), dispositionGain));
    const totalOutflows = currentLoss.plus(priorCarryforward).plus(
      dispositionGain.isNegative() ? dispositionGain.abs() : new Decimal(0)
    );
    const net = totalInflows.minus(totalOutflows);

    if (net.isNegative()) {
      // Net loss released as nonpassive per IRC §469(g)(1)
      const totalReleased = net.abs();
      ptpDispositionReleasedLosses.push({
        name: ptp.name,
        currentYearLoss: currentLoss,
        priorYearSuspendedLoss: priorCarryforward,
        dispositionGain,
        totalReleased,
      });
      audit.record("Form 8582", "ptp-disposition", `PTP disposition released loss: ${ptp.name}`, totalReleased.negated(),
        `Fully disposed PTP — current income ${currentIncome} + disposition gain ${dispositionGain} − current loss ${currentLoss} − prior carryforward ${priorCarryforward} = net loss ${totalReleased} released as nonpassive per IRC §469(g)(1)`,
        {
          "Current-year PTP income": currentIncome,
          "Current-year PTP loss": currentLoss,
          "Disposition gain/loss": dispositionGain,
          "Prior-year PTP carryforward": priorCarryforward,
          "Total released as nonpassive": totalReleased,
        }
      );
    } else {
      // Disposition gain fully absorbed suspended losses — no loss to release
      // Remaining gain is nonpassive and never enters the regular passive pool.
      audit.record("Form 8582", "ptp-disposition", `PTP disposition — no loss to release: ${ptp.name}`, new Decimal(0),
        `Fully disposed PTP — disposition gain/income absorbed all suspended losses. Net income ${net} not released (no suspended loss remains).`,
        {
          "Current-year PTP income": currentIncome,
          "Current-year PTP loss": currentLoss,
          "Disposition gain/loss": dispositionGain,
          "Prior-year PTP carryforward": priorCarryforward,
          "Net income (no release)": net,
        }
      );
    }
    // Disposed PTPs do NOT appear in ptpSuspendedLosses or the passive pool
  }

  // ── Continuing PTP processing ─────────────────────────
  // Process each continuing (non-disposed) PTP independently
  let ptpNetIncomeTotal = new Decimal(0);
  const ptpSuspendedLosses: Form8582Result["ptpSuspendedLosses"] = [];

  for (const ptp of continuingPTPs) {
    const priorCarryforward = priorPTPByName.get(ptp.name) ?? new Decimal(0);
    priorPTPByName.delete(ptp.name);

    const currentIncome = ptp.income;
    const currentLoss = ptp.loss.abs(); // convert to positive for netting
    const netBeforeCarryforward = currentIncome.minus(currentLoss);
    const netAfterCarryforward = netBeforeCarryforward.minus(priorCarryforward);

    if (netAfterCarryforward.greaterThan(0)) {
      // PTP net gain after its own carryforwards is nonpassive.
      ptpNetIncomeTotal = ptpNetIncomeTotal.plus(netAfterCarryforward);
      audit.record("Form 8582", "ptp-income", `PTP net income: ${ptp.name}`, netAfterCarryforward,
        `Current income ${currentIncome} − current loss ${currentLoss} − prior carryforward ${priorCarryforward}`,
        {
          "Current-year PTP income": currentIncome,
          "Current-year PTP loss": currentLoss,
          "Prior-year PTP carryforward": priorCarryforward,
          "PTP nonpassive net income": netAfterCarryforward,
        }
      );
    } else if (netAfterCarryforward.isNegative()) {
      // PTP has net loss → fully suspended per IRC §469(k)
      const netSuspended = netAfterCarryforward.abs();
      ptpSuspendedLosses.push({
        name: ptp.name,
        currentYearLoss: currentLoss,
        priorYearCarryforward: priorCarryforward,
        currentYearIncome: currentIncome,
        netSuspended,
      });
      audit.record("Form 8582", "ptp-suspended", `PTP suspended loss: ${ptp.name}`, netSuspended.negated(),
        `Current income ${currentIncome} − current loss ${currentLoss} − prior carryforward ${priorCarryforward} = net loss ${netSuspended} (fully suspended per IRC §469(k))`,
        {
          "Current-year PTP income": currentIncome,
          "Current-year PTP loss": currentLoss,
          "Prior-year PTP carryforward": priorCarryforward,
          "Net suspended PTP loss": netSuspended,
        }
      );
    }
    // else: exactly zero — carryforward fully absorbed, no income into pool, no suspended loss
  }

  // Handle unmatched prior-year PTP carryforwards (PTP not present this year)
  for (const [name, amount] of priorPTPByName.entries()) {
    ptpSuspendedLosses.push({
      name,
      currentYearLoss: new Decimal(0),
      priorYearCarryforward: amount,
      currentYearIncome: new Decimal(0),
      netSuspended: amount,
    });
    audit.record("Form 8582", "ptp-suspended", `PTP suspended loss (carryforward only): ${name}`, amount.negated(),
      `No current-year PTP activity — prior carryforward ${amount} remains fully suspended`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Regular (non-PTP) passive activity limitation
  // ═══════════════════════════════════════════════════════════

  const priorByName = new Map<string, Decimal>();
  for (const carryforward of input.priorYearSuspendedLosses ?? []) {
    if (!carryforward.amount.isFinite() || carryforward.amount.lt(0)) throw new Error("Form8582 requires a nonnegative actual prior unallowed loss.");
    if (!carryforward.amount.isZero()) priorByName.set(carryforward.name, (priorByName.get(carryforward.name) ?? new Decimal(0)).plus(carryforward.amount));
  }
  for (const name of priorByName.keys()) {
    if (nonPTPActivities.filter(activity => activity.name === name).length > 1) throw new Error("Form8582 prior loss requires an unambiguous actual activity identity.");
  }
  const mfsIneligible = input.filingStatus === "married_filing_separately" && !input.mfsLivedApartFromSpouseAllYear;
  const activityRows: Form8582ActivityRow[] = nonPTPActivities.map(activity => {
    const prior = priorByName.get(activity.name) ?? new Decimal(0);
    priorByName.delete(activity.name);
    const currentIncome = roundDollar(activity.income);
    const currentLoss = roundDollar(activity.loss);
    const priorYearSuspendedLoss = roundDollar(prior);
    return { sourceIndex: activity.sourceIndex, name: activity.name, reportingFormAndLine: activity.reportingFormAndLine,
      isActiveRental: activity.isRentalRealEstate && activity.isActiveParticipant && !mfsIneligible,
      sourceCurrentIncome: activity.income, sourceCurrentLoss: activity.loss, sourcePriorYearSuspendedLoss: prior,
      currentIncome, currentLoss, priorYearSuspendedLoss, overallNet: currentIncome.plus(currentLoss).minus(priorYearSuspendedLoss) };
  });
  for (const [name, prior] of priorByName) {
    // Historical compatibility: no source classification or report location is invented.
    const amount = roundDollar(prior);
    activityRows.push({ name, isActiveRental: false, sourceCurrentIncome: new Decimal(0), sourceCurrentLoss: new Decimal(0),
      sourcePriorYearSuspendedLoss: prior, currentIncome: new Decimal(0), currentLoss: new Decimal(0), priorYearSuspendedLoss: amount, overallNet: amount.negated() });
  }
  const sumRows = (rows: Form8582ActivityRow[], read: (row: Form8582ActivityRow) => Decimal) => rows.reduce((sum, row) => sum.plus(read(row)), new Decimal(0));
  const rentalRows = activityRows.filter(row => row.isActiveRental);
  const otherRows = activityRows.filter(row => !row.isActiveRental);
  const rentalIncome = sumRows(rentalRows, row => row.currentIncome);
  const rentalCurrentLoss = sumRows(rentalRows, row => row.currentLoss);
  const rentalPriorLoss = sumRows(rentalRows, row => row.priorYearSuspendedLoss).negated();
  const rentalLoss = rentalCurrentLoss.plus(rentalPriorLoss);
  const netRental = rentalIncome.plus(rentalLoss);
  const passiveIncome = sumRows(otherRows, row => row.currentIncome);
  const passiveCurrentLoss = sumRows(otherRows, row => row.currentLoss);
  const passivePriorLoss = sumRows(otherRows, row => row.priorYearSuspendedLoss).negated();
  const passiveLoss = passiveCurrentLoss.plus(passivePriorLoss);
  const netPassive = passiveIncome.plus(passiveLoss);
  const combinedNet = netRental.plus(netPassive);
  const combinedLoss = Decimal.min(0, combinedNet);
  const summaries: Array<[string, string, Decimal, string]> = [
    ["1a", "Active rental current income", rentalIncome, "Part IV column (a) total"],
    ["1b", "Active rental current losses", rentalCurrentLoss, "Part IV column (b) total"],
    ["1c", "Active rental prior unallowed losses", rentalPriorLoss, "Part IV column (c) total"],
    ["1d", "Net active rental income or loss", netRental, "1a + 1b + 1c"],
    ["2a", "Other passive current income", passiveIncome, "Part V column (a) total; excludes PTP income"],
    ["2b", "Other passive current losses", passiveCurrentLoss, "Part V column (b) total"],
    ["2c", "Other passive prior unallowed losses", passivePriorLoss, "Part V column (c) total"],
    ["2d", "Net other passive income or loss", netPassive, "2a + 2b + 2c"],
    ["3", "Combined passive net income or loss", combinedNet, "1d + 2d; no prior CRD represented"],
  ];
  for (const [id, description, amount, formula] of summaries) audit.record("Form 8582", id, description, amount, formula);

  let rentalAllowance = new Decimal(0);
  if (combinedNet.lt(0) && netRental.lt(0) && !mfsIneligible) {
    const line4 = Decimal.min(netRental.abs(), combinedNet.abs());
    const line5 = new Decimal(input.filingStatus === "married_filing_separately" ? 75000 : 150000);
    const line6 = roundDollar(zeroFloor(input.agi));
    audit.record("Form 8582", "4", "Loss eligible for special allowance", line4, "Smaller of negative 1d and 3, as positive amounts");
    audit.record("Form 8582", "5", "Modified AGI phaseout ceiling", line5, "150000; 75000 for MFS living apart all year");
    audit.record("Form 8582", "6", "Actual modified adjusted gross income", line6, "Actual Form8582 modified AGI, not less than zero");
    if (line6.lt(line5)) {
      const line7 = line5.minus(line6);
      const line8 = roundDollar(Decimal.min(input.filingStatus === "married_filing_separately" ? 12500 : 25000, line7.times("0.5")));
      audit.record("Form 8582", "7", "Remaining income capacity", line7, "5 - 6");
      audit.record("Form 8582", "8", "Special allowance capacity", line8, "50% of line7 limited to 25000 or MFS 12500");
      rentalAllowance = Decimal.min(line4, line8);
    }
    audit.record("Form 8582", "9", "Special rental allowance", rentalAllowance, "Smaller of 4 and 8; zero when 6 is at least 5");
  }
  const grossLoss = rentalLoss.plus(passiveLoss).abs();
  const incomeOffset = rentalIncome.plus(passiveIncome);
  const allowedLoss = combinedNet.lt(0) ? incomeOffset.plus(rentalAllowance) : grossLoss;
  const suspendedLoss = grossLoss.minus(allowedLoss);
  if (combinedNet.lt(0)) {
    audit.record("Form 8582", "10", "Current passive income offset", incomeOffset, "1a + 2a");
    audit.record("Form 8582", "11", "Total allowed passive losses", allowedLoss, "9 + 10; skipped Part II contributes zero");
  }
  audit.record("Form 8582", "suspended", "Unallowed loss carryforward", suspendedLoss, "Total current and prior losses minus allowed losses");

  const lossRows = activityRows.filter(row => row.currentLoss.minus(row.priorYearSuspendedLoss).lt(0));
  const rentalWeights = lossRows.map(row => row.isActiveRental ? zeroFloor(row.overallNet.negated()) : new Decimal(0));
  const rentalDenominator = rentalWeights.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const specialAllowances = allocateDollars(rentalAllowance, rentalWeights);
  const remainingLosses = lossRows.map((row, index) => zeroFloor(row.overallNet.negated()).minus(specialAllowances[index]));
  const remainingTotal = remainingLosses.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const unallowed = allocateDollars(suspendedLoss, remainingLosses);
  const activityAllocations = lossRows.map((row, index) => {
    const totalLoss = row.currentLoss.minus(row.priorYearSuspendedLoss);
    return { sourceIndex: row.sourceIndex, name: row.name, reportingFormAndLine: row.reportingFormAndLine, isActiveRental: row.isActiveRental,
      totalLoss, overallLoss: zeroFloor(row.overallNet.negated()),
      specialAllowanceRatio: rentalDenominator.isZero() ? new Decimal(0) : rentalWeights[index].div(rentalDenominator),
      specialAllowance: specialAllowances[index], remainingLoss: remainingLosses[index],
      unallowedRatio: remainingTotal.isZero() ? new Decimal(0) : remainingLosses[index].div(remainingTotal),
      allowedLoss: totalLoss.abs().minus(unallowed[index]), suspendedLoss: unallowed[index] };
  });
  return { modifiedAgi: input.agi, passiveIncome, passiveLoss, netPassive, rentalIncome, rentalLoss, netRental, combinedLoss, rentalAllowance,
    allowedLoss, suspendedLoss, requiresForm8582: grossLoss.gt(0), activityRows, activityAllocations,
    ptpNetIncome: ptpNetIncomeTotal, ptpSuspendedLosses, ptpDispositionReleasedLosses, lines: audit.getLines() };
}
