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
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { FilingStatus } from "@/models/constants.js";

export interface PassiveActivity {
  name: string;
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

export interface Form8582Result {
  passiveIncome: Decimal; // Line 1a
  passiveLoss: Decimal; // Line 1b
  netPassive: Decimal; // Line 1c

  rentalIncome: Decimal; // Line 3a
  rentalLoss: Decimal; // Line 3b
  netRental: Decimal; // Line 3c

  combinedLoss: Decimal; // Line 5
  rentalAllowance: Decimal; // Line 7
  allowedLoss: Decimal; // Line 9
  suspendedLoss: Decimal; // Line 10

  /** Per-activity allocation of allowed/suspended amounts */
  activityAllocations: Array<{
    name: string;
    totalLoss: Decimal;
    allowedLoss: Decimal;
    suspendedLoss: Decimal;
  }>;

  // ── PTP segregation (IRC §469(k)) ──────────────────────
  /** PTP net income included in the regular passive pool */
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

const RENTAL_ALLOWANCE_MAX = new Decimal(25000);
const RENTAL_PHASE_OUT_START = new Decimal(100000);
const RENTAL_PHASE_OUT_RATE = new Decimal(0.5); // $0.50 per $1 over $100K

// IRC §469(i)(4)(B): MFS lived-apart gets half the normal allowance and lower phase-out
const MFS_LIVED_APART_ALLOWANCE_MAX = new Decimal(12500);
const MFS_LIVED_APART_PHASE_OUT_START = new Decimal(50000);

export function calculateForm8582(input: Form8582Input): Form8582Result {
  const audit = new AuditTrail();

  // ═══════════════════════════════════════════════════════════
  // PTP segregation (IRC §469(k))
  // PTPs are handled separately: losses only offset same-PTP income.
  // PTP net income flows into the regular passive pool; PTP net losses
  // are fully suspended per-PTP.
  // ═══════════════════════════════════════════════════════════

  const ptpActivities = input.activities.filter((a) => a.isPubliclyTradedPartnership);
  const nonPTPActivities = input.activities.filter((a) => !a.isPubliclyTradedPartnership);

  // Build PTP prior-year carryforward map
  const priorPTPByName = new Map<string, Decimal>();
  for (const cf of input.priorYearPTPSuspendedLosses ?? []) {
    const amount = Decimal.max(new Decimal(0), cf.amount);
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
      // Any remaining net income goes to the passive pool (handled below if needed)
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

  // Synthetic passive activities to inject PTP net income into the regular pool
  const ptpIncomeActivities: Array<{
    name: string;
    income: Decimal;
    loss: Decimal;
    isRentalRealEstate: boolean;
    isActiveParticipant: boolean;
    currentYearLoss: Decimal;
    priorYearSuspendedLoss: Decimal;
  }> = [];

  for (const ptp of continuingPTPs) {
    const priorCarryforward = priorPTPByName.get(ptp.name) ?? new Decimal(0);
    priorPTPByName.delete(ptp.name);

    const currentIncome = ptp.income;
    const currentLoss = ptp.loss.abs(); // convert to positive for netting
    const netBeforeCarryforward = currentIncome.minus(currentLoss);
    const netAfterCarryforward = netBeforeCarryforward.minus(priorCarryforward);

    if (netAfterCarryforward.greaterThan(0)) {
      // PTP has net income after absorbing carryforwards → include in passive pool
      ptpNetIncomeTotal = ptpNetIncomeTotal.plus(netAfterCarryforward);
      ptpIncomeActivities.push({
        name: ptp.name,
        income: netAfterCarryforward,
        loss: new Decimal(0),
        isRentalRealEstate: ptp.isRentalRealEstate,
        isActiveParticipant: ptp.isActiveParticipant,
        currentYearLoss: new Decimal(0),
        priorYearSuspendedLoss: new Decimal(0),
      });
      audit.record("Form 8582", "ptp-income", `PTP net income: ${ptp.name}`, netAfterCarryforward,
        `Current income ${currentIncome} − current loss ${currentLoss} − prior carryforward ${priorCarryforward}`,
        {
          "Current-year PTP income": currentIncome,
          "Current-year PTP loss": currentLoss,
          "Prior-year PTP carryforward": priorCarryforward,
          "PTP net income (into passive pool)": netAfterCarryforward,
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

  const priorYearSuspendedLossesByName = new Map<string, Decimal>();
  for (const carryforward of input.priorYearSuspendedLosses ?? []) {
    const amount = Decimal.max(new Decimal(0), carryforward.amount);
    if (amount.isZero()) {
      continue;
    }
    priorYearSuspendedLossesByName.set(
      carryforward.name,
      (priorYearSuspendedLossesByName.get(carryforward.name) ?? new Decimal(0)).plus(amount)
    );
  }

  const activitiesWithCarryforwards = nonPTPActivities.map((activity) => {
    const matchedPriorYearSuspendedLoss = priorYearSuspendedLossesByName.get(activity.name) ?? new Decimal(0);
    priorYearSuspendedLossesByName.delete(activity.name);

    return {
      ...activity,
      currentYearLoss: activity.loss,
      priorYearSuspendedLoss: matchedPriorYearSuspendedLoss,
      loss: activity.loss.minus(matchedPriorYearSuspendedLoss),
    };
  });

  const unmatchedPriorYearCarryforwardActivities = Array.from(priorYearSuspendedLossesByName.entries()).map(
    ([name, amount]) => ({
      name,
      income: new Decimal(0),
      loss: amount.negated(),
      isRentalRealEstate: false,
      isActiveParticipant: false,
      currentYearLoss: new Decimal(0),
      priorYearSuspendedLoss: amount,
    })
  );

  const normalizedActivities = [
    ...activitiesWithCarryforwards,
    ...unmatchedPriorYearCarryforwardActivities,
    // PTP net income activities are included in the regular passive pool
    ...ptpIncomeActivities,
  ];

  // Separate rental (active participant) from other passive activities
  const nonRentalActivities = normalizedActivities.filter(
    (a) => !a.isRentalRealEstate || !a.isActiveParticipant
  );
  const rentalActivities = normalizedActivities.filter(
    (a) => a.isRentalRealEstate && a.isActiveParticipant
  );

  // ── Lines 1a-1c: Non-rental passive activities ────────

  const passiveIncome = nonRentalActivities.reduce(
    (acc, a) => acc.plus(a.income),
    new Decimal(0)
  );
  audit.record("Form 8582", "1a", "Passive activity income", passiveIncome, "Sum of non-rental passive income");

  const currentYearPassiveLoss = nonRentalActivities.reduce(
    (acc, a) => acc.plus(a.currentYearLoss),
    new Decimal(0)
  );
  const priorYearPassiveLoss = nonRentalActivities.reduce(
    (acc, a) => acc.plus(a.priorYearSuspendedLoss.negated()),
    new Decimal(0)
  );
  const unmatchedPriorYearPassiveLoss = unmatchedPriorYearCarryforwardActivities.reduce(
    (acc, a) => acc.plus(a.priorYearSuspendedLoss.negated()),
    new Decimal(0)
  );
  const passiveLoss = nonRentalActivities.reduce(
    (acc, a) => acc.plus(a.loss),
    new Decimal(0)
  );
  audit.record(
    "Form 8582",
    "1b",
    "Passive activity losses",
    passiveLoss,
    "Sum of current-year non-rental passive losses plus prior-year carryforwards in the non-rental bucket",
    {
      "Current-year non-rental passive losses": currentYearPassiveLoss,
      "Prior-year carried non-rental passive losses": priorYearPassiveLoss,
      "Unmatched prior-year carryforwards treated as non-rental passive": unmatchedPriorYearPassiveLoss,
    }
  );

  const netPassive = passiveIncome.plus(passiveLoss);
  audit.record("Form 8582", "1c", "Net passive", netPassive, "Line 1a + Line 1b");

  // ── Lines 3a-3c: Rental real estate (active participant) ──

  const rentalIncome = rentalActivities.reduce(
    (acc, a) => acc.plus(a.income),
    new Decimal(0)
  );
  audit.record("Form 8582", "3a", "Rental activity income", rentalIncome, "Sum of active-participant rental income");

  const currentYearRentalLoss = rentalActivities.reduce(
    (acc, a) => acc.plus(a.currentYearLoss),
    new Decimal(0)
  );
  const priorYearRentalLoss = rentalActivities.reduce(
    (acc, a) => acc.plus(a.priorYearSuspendedLoss.negated()),
    new Decimal(0)
  );
  const rentalLoss = rentalActivities.reduce(
    (acc, a) => acc.plus(a.loss),
    new Decimal(0)
  );
  audit.record(
    "Form 8582",
    "3b",
    "Rental activity losses",
    rentalLoss,
    "Sum of current-year active-participant rental losses plus matched prior-year rental carryforwards",
    {
      "Current-year active-participant rental losses": currentYearRentalLoss,
      "Prior-year carried active-participant rental losses": priorYearRentalLoss,
    }
  );

  const netRental = rentalIncome.plus(rentalLoss);
  audit.record("Form 8582", "3c", "Net rental", netRental, "Line 3a + Line 3b");

  // ── Line 5: Combined passive losses ───────────────────

  const combinedNet = netPassive.plus(netRental);
  const combinedLoss = combinedNet.isNegative() ? combinedNet : new Decimal(0);
  audit.record("Form 8582", "5", "Combined passive losses", combinedLoss, "Line 1c + Line 3c (if negative)");

  // If no net loss, no limitation needed
  if (!combinedNet.isNegative()) {
    audit.record("Form 8582", "7", "Rental allowance", new Decimal(0), "No net loss — no limitation needed");
    audit.record("Form 8582", "9", "Allowed loss", new Decimal(0), "No limitation");
    audit.record("Form 8582", "10", "Suspended loss", new Decimal(0), "No suspension");

    return {
      passiveIncome,
      passiveLoss,
      netPassive,
      rentalIncome,
      rentalLoss,
      netRental,
      combinedLoss: new Decimal(0),
      rentalAllowance: new Decimal(0),
      allowedLoss: new Decimal(0),
      suspendedLoss: new Decimal(0),
      activityAllocations: [],
      ptpNetIncome: ptpNetIncomeTotal,
      ptpSuspendedLosses,
      ptpDispositionReleasedLosses,
      lines: audit.getLines(),
    };
  }

  // ── Line 7: Special $25,000 rental allowance ──────────

  let rentalAllowance = new Decimal(0);
  let rentalAllowanceFormula = "No net rental loss — no rental allowance";
  if (netRental.isNegative()) {
    if (input.filingStatus === "married_filing_separately" && !input.mfsLivedApartFromSpouseAllYear) {
      // MFS who lived with spouse at any time: $0 allowance per IRC §469(i)(4)
      rentalAllowance = new Decimal(0);
      rentalAllowanceFormula = "$0 — MFS who lived with spouse at any time during the year (IRC §469(i)(4))";
    } else if (input.filingStatus === "married_filing_separately" && input.mfsLivedApartFromSpouseAllYear) {
      // MFS who lived apart all year: $12,500 max, phased out at $50K-$75K MAGI per IRC §469(i)(4)(B)
      const baseAllowance = min(MFS_LIVED_APART_ALLOWANCE_MAX, netRental.abs());
      const agiExcess = zeroFloor(input.agi.minus(MFS_LIVED_APART_PHASE_OUT_START));
      const phaseOutReduction = roundDollar(agiExcess.times(RENTAL_PHASE_OUT_RATE));
      rentalAllowance = zeroFloor(baseAllowance.minus(phaseOutReduction));
      rentalAllowanceFormula = "min($12,500, rental loss) - 50% × (MAGI - $50,000) — MFS lived apart all year (IRC §469(i)(4)(B))";
    } else {
      const baseAllowance = min(RENTAL_ALLOWANCE_MAX, netRental.abs());
      const agiExcess = zeroFloor(input.agi.minus(RENTAL_PHASE_OUT_START));
      const phaseOutReduction = roundDollar(agiExcess.times(RENTAL_PHASE_OUT_RATE));
      rentalAllowance = zeroFloor(baseAllowance.minus(phaseOutReduction));
      rentalAllowanceFormula = "min($25,000, rental loss) - 50% × (MAGI - $100,000)";
    }
  }
  audit.record(
    "Form 8582",
    "7",
    "Special rental allowance",
    rentalAllowance,
    rentalAllowanceFormula
  );

  // ── Line 9: Allowed passive activity loss ─────────────

  // Total gross losses across non-PTP activities only (PTPs are handled separately)
  const totalGrossLoss = nonPTPActivities.reduce(
    (acc, a) => acc.plus(a.loss.abs()),
    new Decimal(0)
  ).plus(
    normalizedActivities.reduce(
      (acc, a) => acc.plus(a.priorYearSuspendedLoss),
      new Decimal(0)
    )
  );

  // Allowed = passive income offsets + rental allowance, capped at total gross loss
  const totalPassiveIncomeOffset = passiveIncome.plus(rentalIncome);
  const allowedLoss = min(
    totalPassiveIncomeOffset.plus(rentalAllowance),
    totalGrossLoss
  );
  audit.record("Form 8582", "9", "Allowed passive loss", allowedLoss, "Passive income + rental allowance");

  // ── Line 10: Suspended loss ───────────────────────────

  const suspendedLoss = totalGrossLoss.minus(allowedLoss);
  audit.record("Form 8582", "10", "Suspended passive loss", suspendedLoss, "Total loss - allowed loss");

  // ── Per-activity allocation (IRS Parts VI/VII two-step method) ──

  const lossActivities = normalizedActivities.filter((a) => a.loss.isNegative());

  // Step 1: Allocate special allowance to rental loss activities only (Part VI)
  const rentalLossActs = lossActivities.filter(
    (a) => a.isRentalRealEstate && a.isActiveParticipant
  );
  const totalRentalAbsLoss = rentalLossActs.reduce(
    (acc, a) => acc.plus(a.loss.abs()),
    new Decimal(0)
  );

  // Step 2: For each loss activity, compute its SA portion and remaining loss
  const activityData = lossActivities.map((a) => {
    const isRentalActive = a.isRentalRealEstate && a.isActiveParticipant;
    const saShare =
      isRentalActive && !totalRentalAbsLoss.isZero()
        ? roundDollar(rentalAllowance.times(a.loss.abs().dividedBy(totalRentalAbsLoss)))
        : new Decimal(0);
    const remaining = zeroFloor(a.loss.abs().minus(saShare));
    return { activity: a, saShare, remaining };
  });

  const totalRemaining = activityData.reduce(
    (acc, item) => acc.plus(item.remaining),
    new Decimal(0)
  );

  // Step 3: Allocate unallowed losses proportionally by remaining loss (Part VII)
  const activityAllocations = activityData.map((data) => {
    const proportion = totalRemaining.isZero()
      ? new Decimal(0)
      : data.remaining.dividedBy(totalRemaining);
    const unallowed = roundDollar(suspendedLoss.times(proportion));
    const actAllowed = data.activity.loss.abs().minus(unallowed);
    return {
      name: data.activity.name,
      totalLoss: data.activity.loss,
      allowedLoss: actAllowed,
      suspendedLoss: unallowed,
    };
  });

  return {
    passiveIncome,
    passiveLoss,
    netPassive,
    rentalIncome,
    rentalLoss,
    netRental,
    combinedLoss,
    rentalAllowance,
    allowedLoss,
    suspendedLoss,
    activityAllocations,
    ptpNetIncome: ptpNetIncomeTotal,
    ptpSuspendedLosses,
    ptpDispositionReleasedLosses,
    lines: audit.getLines(),
  };
}
