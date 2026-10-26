/**
 * Schedule E — Supplemental Income and Loss
 * Spec: spec/federal/schedule-e.yaml
 *
 * Part I: Rental real estate and royalties (Lines 1-26)
 * Part II: Income/loss from partnerships and S corporations (K-1s).
 * Passive activity losses are tracked for Form 8582 limitation.
 */

import Decimal from "decimal.js";
import type { TaxYearInput, ScheduleK1 } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateForm4562 } from "@/engine/forms/form-4562.js";
import { calculateForm6198, type Form6198Result } from "@/engine/forms/form-6198.js";
import { calculatePartnerBasisSchedule, type PartnerBasisScheduleResult } from "@/engine/forms/partner-basis-schedule.js";
import { calculateK1CharitableReturnSources, type K1CharitableReturnResult, type K1CharitableReturnInput } from "@/engine/forms/k1-charitable-return-sources.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

// ── Part I: Rental Property Entry ────────────────────────

export interface RentalPropertyEntry {
  description: string;
  propertyType: string;
  rents: Decimal;
  totalExpenses: Decimal;
  netRentalIncome: Decimal; // Line 21 per property
  isPassive: true; // Rental is always passive unless real estate professional
  isActiveParticipant: boolean;
}

// ── Part II: Partnership Entry ───────────────────────────

export interface PartnershipEntry {
  name: string;
  ein: string;
  isPassive: boolean;
  isRentalRealEstate: boolean;
  /** IRC §469(k): PTP losses can only offset income from the same PTP */
  isPubliclyTradedPartnership: boolean;
  /** IRC §469(g)(1): PTP was fully disposed of in a taxable transaction */
  ptpFullyDisposedInTaxableTransaction: boolean;
  /** Gain/loss on disposition of the PTP interest */
  ptpDispositionGainOrLoss: Decimal;
  nonpassiveIncome: Decimal;
  nonpassiveLoss: Decimal;
  passiveIncome: Decimal;
  passiveLoss: Decimal;
  rawNetAmount: Decimal;
  /** Net amount after basis limitation (if applied), before at-risk */
  basisAdjustedNetAmount: Decimal;
  netAmount: Decimal;
  atRiskAmount?: Decimal;
  suspendedAtRiskLoss: Decimal;
  /** Result from the basis schedule when beginningBasis was provided */
  basisResult?: PartnerBasisScheduleResult;
}

export interface ScheduleEResult {
  // Part I: Rental
  rentalProperties: RentalPropertyEntry[];
  totalRentalIncome: Decimal; // Line 26
  /** Portfolio royalties reported in Part I, excluded from the passive activity pool. */
  totalRoyaltyIncome: Decimal;

  // Part II: Partnerships
  partnerships: PartnershipEntry[];
  totalNonpassiveIncome: Decimal;
  totalNonpassiveLoss: Decimal;
  totalPassiveIncome: Decimal;
  totalPassiveLoss: Decimal; // Before Form 8582 limitation

  /** Line 32: total partnership income/loss (passive losses NOT yet limited) */
  totalPartnershipIncome: Decimal;

  /** Line 41: total supplemental income */
  totalSupplementalIncome: Decimal;

  /** Passive losses that need Form 8582 limitation */
  suspendedPassiveLosses: Array<{ partnershipName: string; amount: Decimal }>;

  /** K-1 losses suspended because the validated at-risk amount is smaller than the current-year loss */
  suspendedAtRiskLosses: Array<{ partnershipName: string; amount: Decimal }>;

  /** K-1 losses suspended because partner/shareholder basis is insufficient (IRC §704(d)/§1366(d)) */
  suspendedBasisLosses: Array<{ partnershipName: string; amount: Decimal }>;

  /** Capital gains from distributions exceeding basis (IRC §731/§1368) */
  excessDistributionGains: Array<{ partnershipName: string; amount: Decimal }>;

  /** IRC §280F(b)(2) recapture income from rental property Form 4562 listed assets */
  section280FRecaptureIncome: Decimal;

  lines: CalculatedLine[];
}

/**
 * Apply basis limitation (tier 1) to K-1 amounts.
 * Returns basis-adjusted Schedule E amounts and the full basis result.
 */
function applyBasisLimitation(
  k1: ScheduleK1,
  rawTotalK1Income: Decimal,
  audit: AuditTrail,
  completedBasis?: PartnerBasisScheduleResult,
): {
  basisAdjustedTotal: Decimal;
  basisResult: PartnerBasisScheduleResult;
} {
  const basisResult = completedBasis ?? calculatePartnerBasisSchedule(k1);
  audit.merge(basisResult.lines);

  // If there are no losses to limit, the basis-adjusted total is the same as raw.
  if (basisResult.totalLosses.isZero()) {
    return { basisAdjustedTotal: rawTotalK1Income, basisResult };
  }

  // Rebuild the Schedule E total using basis-allowed amounts for loss categories.
  // Income amounts are unaffected by basis limitation.
  // Loss categories: we use the allowed amount instead of the full loss.
  const findAllowed = (key: string): Decimal =>
    basisResult.lossCategories.find(c => c.key === key)?.allowed ?? new Decimal(0);

  // Ordinary: if K-1 Box 1 is a loss, substitute with basis-allowed ordinary
  const rawOrdinary = d(k1.ordinaryIncome);
  const basisOrdinary = completedBasis ? Decimal.max(0, rawOrdinary).minus(findAllowed("ordinary")) : rawOrdinary.isNegative()
    ? findAllowed("ordinary").negated() // Convert allowed (positive) back to negative loss
    : rawOrdinary;

  // Rental: if K-1 Box 2 is a loss, substitute
  const rawRental = d(k1.netRentalIncome);
  const basisRental = completedBasis ? Decimal.max(0, rawRental).minus(findAllowed("rental")) : rawRental.isNegative()
    ? findAllowed("rental").negated()
    : rawRental;

  // Other rental: if K-1 Box 3 is a loss, substitute
  const rawOtherRental = d(k1.otherNetRentalIncome);
  const basisOtherRental = completedBasis ? Decimal.max(0, rawOtherRental).minus(findAllowed("otherRental")) : rawOtherRental.isNegative()
    ? findAllowed("otherRental").negated()
    : rawOtherRental;

  // Other income: if K-1 Box 11 is a loss, substitute
  const rawOther = d(k1.otherIncome);
  const basisOther = completedBasis ? Decimal.max(0, rawOther).minus(findAllowed("otherLoss")) : rawOther.isNegative()
    ? findAllowed("otherLoss").negated()
    : rawOther;

  // §179 deduction: always reduces basis; use allowed amount
  const rawSection179 = d(k1.section179Deduction);
  const basisSection179 = rawSection179.isZero()
    ? rawSection179
    : findAllowed("section179");

  // Other deductions: use allowed amount
  const rawOtherDeductions = d(k1.otherDeductions);
  const basisOtherDeductions = rawOtherDeductions.isZero()
    ? rawOtherDeductions
    : findAllowed("otherDeductions");

  // Guaranteed payments remain in Part II; portfolio royalties are reported in Part I.
  const guaranteedPayments = d(k1.guaranteedPayments);

  const basisAdjustedTotal = sum(
    basisOrdinary,
    guaranteedPayments,
    basisRental,
    basisOtherRental,
    basisOther,
    basisSection179.negated(),
    basisOtherDeductions.negated(),
  );

  audit.record(
    "Sched E",
    "28-basis",
    `Basis limitation applied: ${k1.partnershipName}`,
    basisAdjustedTotal,
    `Raw K-1 total ${rawTotalK1Income} adjusted to ${basisAdjustedTotal} after IRC §${k1.entityType === "s_corporation" ? "1366(d)" : "704(d)"} basis limitation`,
    {
      "Raw K-1 total": rawTotalK1Income,
      "Basis-adjusted total": basisAdjustedTotal,
      "Beginning basis": basisResult.beginningBasis,
      "Ending basis": basisResult.endingBasis,
      "Total losses": basisResult.totalLosses,
      "Allowed losses": basisResult.totalAllowedLosses,
      "Suspended losses": basisResult.totalSuspendedLosses,
      "Excess distribution gain": basisResult.excessDistributionGain,
    }
  );

  return { basisAdjustedTotal, basisResult };
}

function applyAtRiskLimitation(
  k1: ScheduleK1,
  rawNetAmount: Decimal,
  audit: AuditTrail,
): {
  netAmount: Decimal;
  atRiskAmount?: Decimal;
  suspendedAtRiskLoss: Decimal;
  form6198Result?: Form6198Result;
} {
  // When Form 6198 input is provided, compute the at-risk amount from it
  // instead of using the manual atRiskAmount field
  if (k1.form6198) {
    const form6198Result = calculateForm6198(k1.form6198);
    const computedAtRisk = form6198Result.amountAtRisk;

    // Portfolio character under section469 does not determine section465
    // activity membership. For an actual current ordinary-loss/royalty source,
    // preserve the separately reported income offset described in i6198 line5.
    if (rawNetAmount.isNegative() && d(k1.royalties).gt(0)) {
      const source = k1.form6198;
      const requiredAmounts = [source.ordinaryIncome, source.gainLossFromDispositions,
        source.otherIncomeGains, source.otherDeductionsLosses, source.adjustedBasisAtEffectiveDate,
        source.currentYearIncreases, source.currentYearDecreases, source.priorYearAmountAtRisk];
      if (!source.activityName.trim() || requiredAmounts.some(value => value === undefined)) {
        throw new Error('K-1 royalty loss requires all actual Form6198 activity and amount sources, including explicit zeros');
      }
      const otherCategories = [k1.netRentalIncome, k1.otherNetRentalIncome, k1.guaranteedPayments,
        k1.otherIncome, k1.section179Deduction, k1.otherDeductions, k1.netShortTermCapitalGain,
        k1.netLongTermCapitalGain, k1.section1231Gain, k1.charitableCash, k1.charitableCapitalGain30,
        k1.charitableCapitalGain20, k1.investmentInterestExpense, k1.excessBusinessInterest,
        ...Object.values(k1.priorSuspendedLosses ?? {})];
      if (d(k1.ordinaryIncome).gte(0) || otherCategories.some(value => !d(value).isZero())
        || !form6198Result.line1.eq(rawNetAmount) || !form6198Result.line2.isZero()
        || !form6198Result.line4.isZero()
        || (!form6198Result.line3.isZero() && !form6198Result.line3.eq(d(k1.royalties)))) {
        throw new Error('K-1 royalty Form6198 sources must reconcile basis-allowed ordinary loss and actual royalty membership; other categories require their separate method');
      }
      if (computedAtRisk.isNegative()) throw new Error('K-1 royalty Form6198 recapture requires its separate source method');
      const deductibleLoss = Decimal.min(rawNetAmount.abs(), form6198Result.line3.plus(computedAtRisk));
      const netAmount = deductibleLoss.negated();
      const suspendedAtRiskLoss = rawNetAmount.plus(deductibleLoss);
      audit.merge(form6198Result.lines);
      audit.record('Sched E', '28-at-risk-royalty', 'Ordinary loss after actual royalty activity income and at-risk capacity', netAmount,
        'Allow the actual same-activity income offset before limiting the remaining ordinary loss; preserve portfolio reporting character', {
          'Basis-allowed ordinary loss': rawNetAmount,
          'Actual same-activity royalty income': form6198Result.line3,
          'Actual available at-risk amount': computedAtRisk,
          'Suspended at-risk loss': suspendedAtRiskLoss,
        });
      return { netAmount, atRiskAmount: computedAtRisk, suspendedAtRiskLoss, form6198Result };
    }

    if (!rawNetAmount.isNegative()) {
      return {
        netAmount: rawNetAmount,
        atRiskAmount: Decimal.max(new Decimal(0), computedAtRisk),
        suspendedAtRiskLoss: new Decimal(0),
        form6198Result,
      };
    }

    const availableAtRisk = Decimal.max(new Decimal(0), computedAtRisk);
    const deductibleLoss = Decimal.min(rawNetAmount.abs(), availableAtRisk);
    const suspendedAtRiskLoss = rawNetAmount.abs().minus(deductibleLoss);

    return {
      netAmount: deductibleLoss.negated(),
      atRiskAmount: availableAtRisk,
      suspendedAtRiskLoss: suspendedAtRiskLoss.isZero() ? new Decimal(0) : suspendedAtRiskLoss.negated(),
      form6198Result,
    };
  }

  // Fallback to manual atRiskAmount
  if (!rawNetAmount.isNegative() || k1.atRiskAmount === undefined) {
    return {
      netAmount: rawNetAmount,
      atRiskAmount: k1.atRiskAmount === undefined ? undefined : Decimal.max(new Decimal(0), d(k1.atRiskAmount)),
      suspendedAtRiskLoss: new Decimal(0),
    };
  }

  const atRiskAmount = Decimal.max(new Decimal(0), d(k1.atRiskAmount));
  const deductibleLoss = Decimal.min(rawNetAmount.abs(), atRiskAmount);
  const suspendedAtRiskLoss = rawNetAmount.abs().minus(deductibleLoss);

  return {
    netAmount: deductibleLoss.negated(),
    atRiskAmount,
    suspendedAtRiskLoss: suspendedAtRiskLoss.isZero() ? new Decimal(0) : suspendedAtRiskLoss.negated(),
  };
}

export function calculateScheduleE(input: Pick<TaxYearInput, 'scheduleK1' | 'rentalProperties' | 'form1099Misc'> & Partial<Pick<TaxYearInput, 'k1CharitableSources' | 'qbiLossSources'>> & { taxpayer?: K1CharitableReturnInput['taxpayer'] }, completedCharitable?: K1CharitableReturnResult): ScheduleEResult {
  if (input.k1CharitableSources && !input.taxpayer) throw new Error('K1 charitable ScheduleE requires the actual taxpayer context');
  const charitable = input.k1CharitableSources ? completedCharitable ?? calculateK1CharitableReturnSources({ ...input, taxpayer: input.taxpayer! }) : undefined;
  const audit = new AuditTrail();

  // ═══════════════════════════════════════════════════════════
  // Part I: Rental Real Estate and Royalties (Lines 1-26)
  // ═══════════════════════════════════════════════════════════

  const rentalProperties: RentalPropertyEntry[] = [];
  const rentals = input.rentalProperties ?? [];
  let rentalSection280FRecapture = new Decimal(0);

  for (const prop of rentals) {
    // Apply ownership percentage (default 100%)
    const ownershipPct = prop.ownershipPercentage
      ? d(prop.ownershipPercentage).dividedBy(100)
      : new Decimal(1);
    const rents = d(prop.rents).times(ownershipPct);
    const form4562 = prop.form4562 ? calculateForm4562(prop.form4562) : undefined;
    const supportedForm4562Depreciation = form4562
      ? sum(
        form4562.line14,
        form4562.line15,
        form4562.line16,
        form4562.line17,
        form4562.line19,
        form4562.line20,
        form4562.line21,
      )
      : undefined;
    const depreciation = (supportedForm4562Depreciation ?? d(prop.depreciation)).times(ownershipPct);
    const supportedForm4562Amortization = form4562?.line44 ?? new Decimal(0);
    const otherExpenses = d(prop.otherExpenses).plus(supportedForm4562Amortization).times(ownershipPct);
    if (form4562) {
      audit.merge(form4562.lines);
      rentalSection280FRecapture = rentalSection280FRecapture.plus(form4562.section280FRecaptureIncome);
    }

    // Sum all expense categories
    const grossExpenses = sum(
      d(prop.advertising),
      d(prop.autoTravel),
      d(prop.cleaning),
      d(prop.commissions),
      d(prop.insurance),
      d(prop.legalProfessional),
      d(prop.managementFees),
      d(prop.mortgageInterest),
      d(prop.otherInterest),
      d(prop.repairs),
      d(prop.supplies),
      d(prop.taxes),
      d(prop.utilities),
    ).times(ownershipPct).plus(otherExpenses).plus(depreciation);

    // IRC §280A: Vacation home / mixed-use property rules
    // If personal use > 14 days AND > 10% of rental days → mixed-use property
    // Expenses are allocated by rental days / total days
    const personalDays = prop.personalUseDays ?? 0;
    const rentalDays = prop.rentalDays ?? 365;
    const totalDays = personalDays + rentalDays;
    const isMixedUse = personalDays > 14 && personalDays > rentalDays * 0.1;

    let totalExpenses: Decimal;
    if (isMixedUse && totalDays > 0) {
      const rentalRatio = new Decimal(rentalDays).dividedBy(totalDays);
      totalExpenses = grossExpenses.times(rentalRatio).toDecimalPlaces(0, Decimal.ROUND_DOWN);
      audit.record("Sched E", "280A", `Mixed-use allocation: ${prop.description}`,
        totalExpenses,
        `${rentalDays}/${totalDays} days = ${rentalRatio.toFixed(4)} of $${grossExpenses}`);
    } else {
      totalExpenses = grossExpenses;
    }

    const netRentalIncome = rents.minus(totalExpenses);

    rentalProperties.push({
      description: prop.description,
      propertyType: prop.propertyType,
      rents,
      totalExpenses,
      netRentalIncome,
      isPassive: true,
      isActiveParticipant: prop.isActiveParticipant ?? true,
    });

    audit.record(
      "Sched E",
      "3",
      `Rental income: ${prop.description}`,
      rents,
      ownershipPct.equals(1) ? "Gross rents received" : `Gross rents × ${ownershipPct.times(100)}% ownership`
    );

    audit.record(
      "Sched E",
      "18",
      `Depreciation: ${prop.description}`,
      depreciation,
      form4562
        ? "Form 4562 depreciation subtotal from Lines 14, 15, 16, 17, 19, 20, and 21, excluding Line 12 section 179"
        : "Validated manual rental depreciation amount",
      form4562
        ? {
          "Form 4562 Line 12": form4562.line12,
          "Form 4562 Line 14": form4562.line14,
          "Form 4562 Line 15": form4562.line15,
          "Form 4562 Line 16": form4562.line16,
          "Form 4562 Line 17": form4562.line17,
          "Form 4562 Line 19": form4562.line19,
          "Form 4562 Line 20": form4562.line20,
          "Form 4562 Line 21": form4562.line21,
        }
        : { "Validated manual rental depreciation amount": d(prop.depreciation) }
    );

    audit.record(
      "Sched E",
      "19",
      `Other expenses: ${prop.description}`,
      otherExpenses,
      form4562
        ? "Validated manual rental other expenses plus Form 4562 Line 44 amortization"
        : "Validated manual rental other expenses amount",
      form4562
        ? {
          "Validated manual rental other expenses": d(prop.otherExpenses),
          "Form 4562 Line 44": form4562.line44,
        }
        : { "Validated manual rental other expenses": d(prop.otherExpenses) }
    );

    audit.record(
      "Sched E",
      "20",
      `Total expenses: ${prop.description}`,
      totalExpenses,
      "Sum of all rental expenses, including Line 18 depreciation and Line 19 other expenses",
      {
        "Line 18": depreciation,
        "Line 19": otherExpenses,
      }
    );

    audit.record(
      "Sched E",
      "21",
      `Net rental income: ${prop.description}`,
      netRentalIncome,
      `${rents} rents - ${totalExpenses} expenses`
    );
  }

  // ── Portfolio royalties: Schedule E Part I, Line 4 ─────
  // Partner K-1 box7 and shareholder K-1 box6 are portfolio income;
  // they must not supply passive income that releases ordinary activity losses.
  const miscRoyalties = sum(...input.form1099Misc.map(form => d(form.royalties)));
  const k1Royalties = sum(...input.scheduleK1.map(k1 => d(k1.royalties)));
  const totalRoyaltyIncome = miscRoyalties.plus(k1Royalties);
  if (!totalRoyaltyIncome.isZero()) {
    audit.record("Sched E", "4", "Portfolio royalty income", totalRoyaltyIncome,
      "Form1099-MISC box2 plus Form1065 K-1 box7 / Form1120S K-1 box6", {
        "Form1099-MISC royalties": miscRoyalties, "K-1 portfolio royalties": k1Royalties,
      });
  }

  // Line 26: Total rental and royalty income
  const totalRentalIncome = rentalProperties.reduce(
    (acc, p) => acc.plus(p.netRentalIncome),
    new Decimal(0)
  ).plus(totalRoyaltyIncome);
  audit.record("Sched E", "26", "Total rental real estate and royalty income or loss",
    totalRentalIncome, "Sum of all properties Line 21 + royalty income");

  // ═══════════════════════════════════════════════════════════
  // Part II: Partnerships and S Corporations (Lines 27-32)
  // ═══════════════════════════════════════════════════════════

  const partnerships: PartnershipEntry[] = [];

  for (const [k1Index, k1] of input.scheduleK1.entries()) {
    const ordinaryIncome = d(k1.ordinaryIncome);
    const guaranteedPayments = d(k1.guaranteedPayments);
    const netRentalIncome = d(k1.netRentalIncome);
    const otherNetRentalIncome = d(k1.otherNetRentalIncome);
    const otherIncome = d(k1.otherIncome);
    const section179Deduction = d(k1.section179Deduction);
    const otherDeductions = d(k1.otherDeductions);

    // Total K-1 income includes ordinary, guaranteed payments, rental,
    // other income, minus §179 and other deductions. Portfolio royalties
    // remain in Part I, while still increasing basis in the basis worksheet.
    // Capital gains, interest/dividends, and section 1231 amounts are handled
    // by other supported slices.
    const rawTotalK1Income = sum(
      ordinaryIncome,
      guaranteedPayments,
      netRentalIncome,
      otherNetRentalIncome,
      otherIncome,
      section179Deduction.negated(),
      otherDeductions.negated()
    );
    const isRentalRealEstate = !netRentalIncome.isZero() || !otherNetRentalIncome.isZero();

    // ── Tier 1: Basis limitation (IRC §704(d) / §1366(d)) ──
    // When beginningBasis is provided, losses are limited to available partner basis
    // before the at-risk and passive tests.
    let basisAdjustedAmount = rawTotalK1Income;
    let basisResult: PartnerBasisScheduleResult | undefined;
    if (k1.beginningBasis !== undefined) {
      const basisOutput = applyBasisLimitation(k1, rawTotalK1Income, audit, charitable?.statements.find(row => row.k1Index === k1Index)?.basis);
      basisAdjustedAmount = basisOutput.basisAdjustedTotal;
      basisResult = basisOutput.basisResult;
    }

    // ── Tier 2: At-risk limitation (IRC §465) ──
    const {
      netAmount: totalK1Income,
      atRiskAmount,
      suspendedAtRiskLoss,
    } = applyAtRiskLimitation(k1, basisAdjustedAmount, audit);

    let nonpassiveIncome = new Decimal(0);
    let nonpassiveLoss = new Decimal(0);
    let passiveIncome = new Decimal(0);
    let passiveLoss = new Decimal(0);

    if (k1.isPassiveActivity) {
      // Per IRS K-1 Box 4 instructions and Form 8582 instructions:
      // "Guaranteed payments are always nonpassive income to the payee."
      // They must be reported in Column G (nonpassive) even when the
      // underlying activity is passive.
      if (guaranteedPayments.greaterThan(0)) {
        nonpassiveIncome = guaranteedPayments;
      }
      const passiveK1 = totalK1Income.minus(guaranteedPayments);
      if (passiveK1.greaterThanOrEqualTo(0)) {
        passiveIncome = passiveK1;
      } else {
        passiveLoss = passiveK1; // negative
      }
    } else {
      if (totalK1Income.greaterThanOrEqualTo(0)) {
        nonpassiveIncome = totalK1Income;
      } else {
        nonpassiveLoss = totalK1Income; // negative
      }
    }

    const netAmount = nonpassiveIncome.plus(nonpassiveLoss).plus(passiveIncome).plus(passiveLoss);

    partnerships.push({
      name: k1.partnershipName,
      ein: k1.partnershipEIN,
      isPassive: k1.isPassiveActivity,
      isRentalRealEstate,
      isPubliclyTradedPartnership: k1.isPubliclyTradedPartnership,
      ptpFullyDisposedInTaxableTransaction: k1.ptpFullyDisposedInTaxableTransaction,
      ptpDispositionGainOrLoss: d(k1.ptpDispositionGainOrLoss),
      nonpassiveIncome,
      nonpassiveLoss,
      passiveIncome,
      passiveLoss,
      rawNetAmount: rawTotalK1Income,
      basisAdjustedNetAmount: basisAdjustedAmount,
      netAmount,
      atRiskAmount,
      suspendedAtRiskLoss,
      basisResult,
    });
  }

  // Record each partnership
  for (const p of partnerships) {
    audit.record(
      "Sched E",
      "28",
      `Partnership: ${p.name}`,
      p.netAmount,
      `EIN: ${p.ein}, Passive: ${p.isPassive}`,
      {
        rawNetAmount: p.rawNetAmount,
        basisAdjustedNetAmount: p.basisAdjustedNetAmount,
        nonpassiveIncome: p.nonpassiveIncome,
        nonpassiveLoss: p.nonpassiveLoss,
        passiveIncome: p.passiveIncome,
        passiveLoss: p.passiveLoss,
        atRiskAmount: p.atRiskAmount ?? "not_provided",
        suspendedAtRiskLoss: p.suspendedAtRiskLoss,
        basisLimited: p.basisResult !== undefined ? "yes" : "no",
        endingBasis: p.basisResult?.endingBasis ?? "not_computed",
      }
    );

    if (p.suspendedAtRiskLoss.isNegative()) {
      audit.record(
        "Sched E",
        "28-at-risk",
        `Suspended at-risk loss: ${p.name}`,
        p.suspendedAtRiskLoss,
        "Current-year K-1 loss in excess of the validated at-risk amount is suspended until additional at-risk basis is available",
        {
          "Raw K-1 net loss": p.rawNetAmount,
          "Validated at-risk amount": p.atRiskAmount ?? "not_provided",
          "Allowed current-year Schedule E loss": p.netAmount,
        }
      );
    }
  }

  const totalNonpassiveIncome = partnerships.reduce(
    (acc, p) => acc.plus(p.nonpassiveIncome),
    new Decimal(0)
  );
  const totalNonpassiveLoss = partnerships.reduce(
    (acc, p) => acc.plus(p.nonpassiveLoss),
    new Decimal(0)
  );
  const totalPassiveIncome = partnerships.reduce(
    (acc, p) => acc.plus(p.passiveIncome),
    new Decimal(0)
  );
  const totalPassiveLoss = partnerships.reduce(
    (acc, p) => acc.plus(p.passiveLoss),
    new Decimal(0)
  );

  audit.record("Sched E", "28-col-G", "Total nonpassive income", totalNonpassiveIncome, "Sum column G");
  audit.record("Sched E", "28-col-H", "Total nonpassive loss", totalNonpassiveLoss, "Sum column H");
  audit.record("Sched E", "28-col-I", "Total passive income", totalPassiveIncome, "Sum column I");
  audit.record("Sched E", "28-col-J", "Total passive loss", totalPassiveLoss, "Sum column J");

  // Simple passive loss limitation: passive losses can only offset passive income
  // Full Form 8582 is separate; here we just identify what's suspended
  const netPassive = totalPassiveIncome.plus(totalPassiveLoss);

  const suspendedPassiveLosses: Array<{ partnershipName: string; amount: Decimal }> = [];
  if (netPassive.isNegative()) {
    // Distribute suspended loss proportionally
    const totalAbsPassiveLoss = partnerships
      .filter((p) => p.passiveLoss.isNegative())
      .reduce((acc, p) => acc.plus(p.passiveLoss.abs()), new Decimal(0));

    if (totalAbsPassiveLoss.greaterThan(0)) {
      const suspendedTotal = netPassive.abs();
      for (const p of partnerships) {
        if (p.passiveLoss.isNegative()) {
          const proportion = p.passiveLoss.abs().dividedBy(totalAbsPassiveLoss);
          const suspended = suspendedTotal.times(proportion);
          if (suspended.greaterThan(0)) {
            suspendedPassiveLosses.push({
              partnershipName: p.name,
              amount: suspended.negated(),
            });
          }
        }
      }
    }
  }

  const suspendedAtRiskLosses = partnerships
    .filter((p) => p.suspendedAtRiskLoss.isNegative())
    .map((p) => ({
      partnershipName: p.name,
      amount: p.suspendedAtRiskLoss,
    }));

  const suspendedBasisLosses = partnerships
    .filter((p) => p.basisResult && p.basisResult.totalSuspendedLosses.greaterThan(0))
    .map((p) => ({
      partnershipName: p.name,
      amount: p.basisResult!.totalSuspendedLosses.negated(),
    }));

  const excessDistributionGains = partnerships
    .filter((p) => p.basisResult && p.basisResult.excessDistributionGain.greaterThan(0))
    .map((p) => ({
      partnershipName: p.name,
      amount: p.basisResult!.excessDistributionGain,
    }));

  // Line 32: Total partnership income
  // Nonpassive income/loss flows fully; passive limited by Form 8582
  const totalPartnershipIncome = totalNonpassiveIncome
    .plus(totalNonpassiveLoss)
    .plus(totalPassiveIncome)
    .plus(netPassive.isNegative() ? totalPassiveLoss.minus(netPassive) : totalPassiveLoss);

  audit.record(
    "Sched E",
    "32",
    "Total partnership income or loss",
    totalPartnershipIncome,
    "Nonpassive + allowed passive"
  );

  // Line 41: Total supplemental income = Part I (rental) + Part II (partnership)
  const totalSupplementalIncome = totalRentalIncome.plus(totalPartnershipIncome);
  audit.record(
    "Sched E",
    "41",
    "Total supplemental income or loss",
    totalSupplementalIncome,
    "Part I rental + Part II partnership"
  );

  return {
    rentalProperties,
    totalRentalIncome,
    totalRoyaltyIncome,
    partnerships,
    totalNonpassiveIncome,
    totalNonpassiveLoss,
    totalPassiveIncome,
    totalPassiveLoss,
    totalPartnershipIncome,
    totalSupplementalIncome,
    suspendedPassiveLosses,
    suspendedAtRiskLosses,
    suspendedBasisLosses,
    excessDistributionGains,
    section280FRecaptureIncome: rentalSection280FRecapture,
    lines: audit.getLines(),
  };
}
