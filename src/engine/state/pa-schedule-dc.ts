/**
 * Pennsylvania Schedule DC — Child and Dependent Care Enhancement Tax Credit
 * Spec: spec/state/pa-schedule-dc.yaml
 *
 * Pennsylvania matches 100% of the allowed federal child and dependent care
 * credit. The state schedule instructs the taxpayer to enter the amount from
 * federal Form 2441 Line 9a and transfer it to PA-40 Line 23.
 */

import Decimal from "decimal.js";
import { min, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

interface PAScheduleDCConstants {
  threshold: Decimal;
  lowIncomeCaps: {
    oneDependent: Decimal;
    twoOrMoreDependents: Decimal;
  };
  highIncomeCaps: {
    oneDependent: Decimal;
    twoOrMoreDependents: Decimal;
  };
}

const PA_SCHEDULE_DC_CONSTANTS: Record<number, PAScheduleDCConstants> = {
  2024: {
    threshold: new Decimal(43000),
    lowIncomeCaps: {
      oneDependent: new Decimal(1050),
      twoOrMoreDependents: new Decimal(2100),
    },
    highIncomeCaps: {
      oneDependent: new Decimal(600),
      twoOrMoreDependents: new Decimal(1200),
    },
  },
  2025: {
    threshold: new Decimal(43000),
    lowIncomeCaps: {
      oneDependent: new Decimal(1050),
      twoOrMoreDependents: new Decimal(2100),
    },
    highIncomeCaps: {
      oneDependent: new Decimal(600),
      twoOrMoreDependents: new Decimal(1200),
    },
  },
  2026: {
    threshold: new Decimal(43000),
    lowIncomeCaps: {
      oneDependent: new Decimal(1050),
      twoOrMoreDependents: new Decimal(2100),
    },
    highIncomeCaps: {
      oneDependent: new Decimal(600),
      twoOrMoreDependents: new Decimal(1200),
    },
  },
};

export interface ScheduleDCInput {
  taxYear: number;
  /** Total qualifying persons from Schedule DC Section II / federal Form 2441 */
  qualifyingPersons: number;
  /** Pennsylvania taxable income used for the printed Schedule DC chart */
  paTaxableIncome: Decimal;
  /** Allowed federal child and dependent care credit from Form 2441 Line 9a */
  federalCredit: Decimal;
}

export interface ScheduleDCResult {
  qualifyingPersons: number;
  federalCredit: Decimal;
  /** PA Schedule DC credit amount, transferable to PA-40 Line 23 */
  credit: Decimal;
  lines: CalculatedLine[];
}

export function calculateScheduleDC(input: ScheduleDCInput): ScheduleDCResult {
  const constants = PA_SCHEDULE_DC_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA Schedule DC constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const qualifyingPersons = Math.max(0, Math.trunc(input.qualifyingPersons));

  audit.record(
    "PA-Schedule-DC",
    "1",
    "Qualifying persons",
    new Decimal(qualifyingPersons),
    "Total qualifying persons from Schedule DC Section II",
  );

  const chartCap =
    qualifyingPersons <= 0
      ? new Decimal(0)
      : qualifyingPersons === 1
        ? input.paTaxableIncome.lte(constants.threshold)
          ? constants.lowIncomeCaps.oneDependent
          : constants.highIncomeCaps.oneDependent
        : input.paTaxableIncome.lte(constants.threshold)
          ? constants.lowIncomeCaps.twoOrMoreDependents
          : constants.highIncomeCaps.twoOrMoreDependents;
  const credit = min(zeroFloor(input.federalCredit), chartCap);
  audit.record(
    "PA-Schedule-DC",
    "2",
    "Child and dependent care enhancement tax credit",
    credit,
    `Federal Form 2441 Line 9a credit floored at 0 and capped at $${chartCap.toString()} based on ${qualifyingPersons} qualifying person(s) and PA taxable income of $${input.paTaxableIncome.toString()}`,
  );

  return {
    qualifyingPersons,
    federalCredit: input.federalCredit,
    credit,
    lines: audit.getLines(),
  };
}
