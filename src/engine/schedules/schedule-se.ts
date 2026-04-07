/**
 * Schedule SE — Self-Employment Tax
 * Spec: spec/federal/schedule-se.yaml
 *
 * Calculates SE tax (Social Security + Medicare) on self-employment earnings.
 * Deductible half flows to Schedule 1 Line 15.
 * Total SE tax flows to Schedule 2 Line 6.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { YearConstants } from "@/models/constants.js";
import { calculateForm4137 } from "@/engine/forms/form-4137.js";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { calculateScheduleC } from "./schedule-c.js";
import { calculateScheduleF } from "./schedule-f.js";
import { d, zeroFloor, min, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface ScheduleSEResult {
  netFarmProfit: Decimal; // Line 4a
  netNonfarmProfit: Decimal; // Line 4b
  netSEEarnings: Decimal; // Line 6
  taxableEarnings: Decimal; // Line 7 (× 0.9235)
  socialSecurityPortion: Decimal; // Line 10
  medicarePortion: Decimal; // Line 11
  totalSETax: Decimal; // Line 12
  deductibleHalf: Decimal; // Line 13
  lines: CalculatedLine[];
}

export function calculateScheduleSE(
  input: TaxYearInput,
  constants: YearConstants,
  scheduleCNetProfitOverride?: Decimal,
  scheduleFNetProfitOverride?: Decimal
): ScheduleSEResult {
  const audit = new AuditTrail();
  const se = constants.selfEmploymentTax;
  const computedScheduleFNetProfit = calculateScheduleF(input.scheduleF).netFarmProfit;
  const netFarmProfit = scheduleFNetProfitOverride ?? computedScheduleFNetProfit;
  const scheduleCNetProfit =
    scheduleCNetProfitOverride ?? calculateScheduleC(input, input.scheduleC).netProfit;

  audit.record(
    "Sched SE",
    "4a",
    "Net farm profit or loss",
    netFarmProfit,
    scheduleFNetProfitOverride !== undefined
      ? "Schedule F Line 34 override"
      : netFarmProfit.isZero()
        ? "No Schedule F farm income"
        : "Schedule F Line 34"
  );

  // Line 4b: Net nonfarm profit (Schedule C Line 31 + K-1 SE earnings + guaranteed payments)
  // Per IRS Schedule SE Instructions, Line 4b: "Net profit or (loss) from Schedule C, line 31"
  // Must use Schedule C net profit (after expenses), NOT gross 1099-NEC amounts.
  const k1SEEarnings = input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.selfEmploymentEarnings)),
    new Decimal(0)
  );
  const k1GuaranteedPayments = input.scheduleK1.reduce(
    (acc, k) => acc.plus(d(k.guaranteedPayments)),
    new Decimal(0)
  );
  const netNonfarmProfit = sum(scheduleCNetProfit, k1SEEarnings, k1GuaranteedPayments);
  audit.record("Sched SE", "4b", "Net nonfarm profit", netNonfarmProfit,
    "Sched C + K-1 Box 14 + K-1 Box 4", {
      "Schedule C Line 31 net profit": scheduleCNetProfit,
      "K-1 self-employment earnings": k1SEEarnings,
      "K-1 guaranteed payments": k1GuaranteedPayments,
    });

  // Line 6: Net SE earnings (farm income from Schedule F + nonfarm)
  const netSEEarnings = netFarmProfit.plus(netNonfarmProfit);
  audit.record("Sched SE", "6", "Net SE earnings", netSEEarnings,
    "Line 4a + 4b", {
      "Line 4a": netFarmProfit,
      "Line 4b": netNonfarmProfit,
    });

  // W-2 social security wages (reduces remaining SS room)
  const w2SSWages = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.socialSecurityWages)),
    new Decimal(0)
  );
  const form4137SocialSecurityTips = input.form4137
    ? calculateForm4137(input.form4137, constants, {
      socialSecurityWagesAndTipsAlreadyReported: w2SSWages,
    }).line10
    : new Decimal(0);
  const form8919SocialSecurityWages = input.form8919
    ? calculateForm8919(input.form8919, constants, {
      socialSecurityWagesAndTipsAlreadyReported: w2SSWages,
      form4137SocialSecurityTipsAlreadyReported: form4137SocialSecurityTips,
    }).line10
    : new Decimal(0);

  // Short-circuit for non-positive SE earnings (no need to multiply)
  if (netSEEarnings.lte(new Decimal(0))) {
    audit.record("Sched SE", "7", "SE tax earnings multiplier", new Decimal(0), "Non-positive SE earnings");
    audit.record("Sched SE", "10", "SS portion", new Decimal(0), "Non-positive SE earnings");
    audit.record("Sched SE", "11", "Medicare portion", new Decimal(0), "Non-positive SE earnings");
    audit.record("Sched SE", "12", "Total SE tax", new Decimal(0), "Non-positive SE earnings");
    audit.record("Sched SE", "13", "Deductible half", new Decimal(0), "Non-positive SE earnings");
    return {
      netFarmProfit,
      netNonfarmProfit,
      netSEEarnings,
      taxableEarnings: new Decimal(0),
      socialSecurityPortion: new Decimal(0),
      medicarePortion: new Decimal(0),
      totalSETax: new Decimal(0),
      deductibleHalf: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  // Line 7: SE earnings × 0.9235
  const taxableEarnings = roundDollar(netSEEarnings.times(se.earningsMultiplier));
  audit.record("Sched SE", "7", "SE tax earnings multiplier", taxableEarnings,
    `Line 6 × ${se.earningsMultiplier}`, {
      "Line 6": netSEEarnings,
      Multiplier: se.earningsMultiplier,
    });

  // IRC §1402(b)(2): SE tax only applies when net SE earnings (post-multiplier) ≥ $400.
  // Short Schedule SE Line 3: "If less than $400, you don't owe self-employment tax."
  // Pre-multiplier amounts $400–$432 produce post-multiplier amounts below $400.
  const SE_MINIMUM_THRESHOLD = new Decimal(400);
  if (taxableEarnings.lt(SE_MINIMUM_THRESHOLD)) {
    audit.record("Sched SE", "10", "SS portion", new Decimal(0), "Post-multiplier SE < $400, no SE tax due", {
      "Line 7 taxable earnings": taxableEarnings,
      "W-2 SS wages": w2SSWages,
      "Supported Form 4137 Line 10 tips": form4137SocialSecurityTips,
      "Supported Form 8919 Line 10 wages": form8919SocialSecurityWages,
    });
    audit.record("Sched SE", "11", "Medicare portion", new Decimal(0), "Post-multiplier SE < $400, no SE tax due");
    audit.record("Sched SE", "12", "Total SE tax", new Decimal(0), "Post-multiplier SE < $400, no SE tax due");
    audit.record("Sched SE", "13", "Deductible half", new Decimal(0), "Post-multiplier SE < $400, no SE tax due");
    return {
      netFarmProfit,
      netNonfarmProfit,
      netSEEarnings,
      taxableEarnings,
      socialSecurityPortion: new Decimal(0),
      medicarePortion: new Decimal(0),
      totalSETax: new Decimal(0),
      deductibleHalf: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  // Line 10: Social Security portion (capped at wage base - W-2 SS wages)
  const ssRemaining = zeroFloor(
    se.socialSecurityWageBase
      .minus(w2SSWages)
      .minus(form4137SocialSecurityTips)
      .minus(form8919SocialSecurityWages)
  );
  const ssTaxable = min(taxableEarnings, ssRemaining);
  const socialSecurityPortion = roundDollar(ssTaxable.times(se.socialSecurityRate));
  audit.record("Sched SE", "10", "SS portion", socialSecurityPortion,
    `min(${taxableEarnings}, ${ssRemaining}) × ${se.socialSecurityRate}`, {
      "Line 7 taxable earnings": taxableEarnings,
      "W-2 SS wages": w2SSWages,
      "Supported Form 4137 Line 10 tips": form4137SocialSecurityTips,
      "Supported Form 8919 Line 10 wages": form8919SocialSecurityWages,
      "Remaining SS wage base room": ssRemaining,
      "SS-taxable earnings after cap": ssTaxable,
    });

  // Line 11: Medicare portion (no cap)
  const medicarePortion = roundDollar(taxableEarnings.times(se.medicareRate));
  audit.record("Sched SE", "11", "Medicare portion", medicarePortion,
    `${taxableEarnings} × ${se.medicareRate}`, {
      "Line 7 taxable earnings": taxableEarnings,
    });

  // Line 12: Total SE tax
  const totalSETax = socialSecurityPortion.plus(medicarePortion);
  audit.record("Sched SE", "12", "Total SE tax", totalSETax, "Line 10 + 11", {
    "Line 10": socialSecurityPortion,
    "Line 11": medicarePortion,
  });

  // Line 13: Deductible half
  const deductibleHalf = roundDollar(totalSETax.times(se.deductiblePortion));
  audit.record("Sched SE", "13", "Deductible half", deductibleHalf,
    `Line 12 × ${se.deductiblePortion}`, {
      "Line 12": totalSETax,
    });

  return {
    netFarmProfit,
    netNonfarmProfit,
    netSEEarnings,
    taxableEarnings,
    socialSecurityPortion,
    medicarePortion,
    totalSETax,
    deductibleHalf,
    lines: audit.getLines(),
  };
}
