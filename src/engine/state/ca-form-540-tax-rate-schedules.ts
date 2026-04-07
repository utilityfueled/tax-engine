/**
 * California Form 540 tax-rate schedules.
 * Spec: spec/state/ca-form-540-tax-rate-schedules.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

export type CAForm540ScheduleCode = "X" | "Y" | "Z";

export interface CAForm540TaxRateScheduleBracket {
  lowerBound: Decimal;
  upperBound: Decimal | null;
  baseTax: Decimal;
  rate: Decimal;
}

export interface CAForm540TaxRateSchedulesYear {
  taxTableMaximumIncome: Decimal;
  schedules: Record<CAForm540ScheduleCode, CAForm540TaxRateScheduleBracket[]>;
}

export interface CAForm540TaxRateSchedulesInput {
  taxableIncome: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;
}

export interface CAForm540TaxRateSchedulesResult {
  taxableIncome: Decimal;
  scheduleCode: CAForm540ScheduleCode;
  selectedBracket: CAForm540TaxRateScheduleBracket;
  excessTaxableIncome: Decimal;
  marginalTax: Decimal;
  taxBeforeRounding: Decimal;
  tax: Decimal;
  lines: CalculatedLine[];
}

const cents = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const bracket = (
  lowerBound: number,
  upperBound: number | null,
  baseTax: string,
  rate: string
): CAForm540TaxRateScheduleBracket => ({
  lowerBound: new Decimal(lowerBound),
  upperBound: upperBound === null ? null : new Decimal(upperBound),
  baseTax: new Decimal(baseTax),
  rate: new Decimal(rate),
});

export const CA_FORM_540_TAX_RATE_SCHEDULES: Record<number, CAForm540TaxRateSchedulesYear> = {
  2025: {
    taxTableMaximumIncome: new Decimal(100000),
    schedules: {
      X: [
        bracket(0, 11079, "0.00", "0.01"),
        bracket(11079, 26264, "110.79", "0.02"),
        bracket(26264, 41452, "414.49", "0.04"),
        bracket(41452, 57542, "1022.01", "0.06"),
        bracket(57542, 72724, "1987.41", "0.08"),
        bracket(72724, 371479, "3201.97", "0.093"),
        bracket(371479, 445771, "30986.19", "0.103"),
        bracket(445771, 742953, "38638.27", "0.113"),
        bracket(742953, null, "72219.84", "0.123"),
      ],
      Y: [
        bracket(0, 22158, "0.00", "0.01"),
        bracket(22158, 52528, "221.58", "0.02"),
        bracket(52528, 82904, "828.98", "0.04"),
        bracket(82904, 115084, "2044.02", "0.06"),
        bracket(115084, 145448, "3974.82", "0.08"),
        bracket(145448, 742958, "6403.94", "0.093"),
        bracket(742958, 891542, "61972.37", "0.103"),
        bracket(891542, 1485906, "77276.52", "0.113"),
        bracket(1485906, null, "144439.65", "0.123"),
      ],
      Z: [
        bracket(0, 22173, "0.00", "0.01"),
        bracket(22173, 52530, "221.73", "0.02"),
        bracket(52530, 67716, "828.87", "0.04"),
        bracket(67716, 83805, "1436.31", "0.06"),
        bracket(83805, 98990, "2401.65", "0.08"),
        bracket(98990, 505208, "3616.45", "0.093"),
        bracket(505208, 606251, "41394.72", "0.103"),
        bracket(606251, 1010417, "51802.15", "0.113"),
        bracket(1010417, null, "97472.91", "0.123"),
      ],
    },
  },
};

function getScheduleCode(filingStatus: FilingStatus): CAForm540ScheduleCode {
  switch (filingStatus) {
    case "single":
    case "married_filing_separately":
      return "X";
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      return "Y";
    case "head_of_household":
      return "Z";
  }
}

function selectBracket(
  taxableIncome: Decimal,
  brackets: CAForm540TaxRateScheduleBracket[]
): CAForm540TaxRateScheduleBracket {
  const selected = brackets.find((row) => {
    const aboveLowerBound = taxableIncome.greaterThan(row.lowerBound);
    const withinUpperBound = row.upperBound === null || taxableIncome.lessThanOrEqualTo(row.upperBound);
    return aboveLowerBound && withinUpperBound;
  });

  if (!selected) {
    throw new Error(`No California Form 540 tax rate schedule row matched taxable income ${taxableIncome.toString()}`);
  }

  return selected;
}

export function calculateCAForm540TaxRateSchedules(
  input: CAForm540TaxRateSchedulesInput
): CAForm540TaxRateSchedulesResult {
  const constants = CA_FORM_540_TAX_RATE_SCHEDULES[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 tax rate schedules not available for ${input.taxYear}`);
  }

  const taxableIncome = d(input.taxableIncome);
  if (taxableIncome.lessThanOrEqualTo(constants.taxTableMaximumIncome)) {
    throw new Error("CA Form 540 tax rate schedules apply only when taxable income exceeds $100,000");
  }

  const scheduleCode = getScheduleCode(input.filingStatus);
  const selectedBracket = selectBracket(taxableIncome, constants.schedules[scheduleCode]);

  const audit = new AuditTrail();
  audit.record("CA-540-TRS", "1", "Form 540 taxable income", taxableIncome, "Form 540 line 19 taxable income");

  audit.record(
    "CA-540-TRS",
    "2",
    "Selected California tax-rate schedule row",
    selectedBracket.lowerBound,
    "Choose the published Schedule X, Y, or Z row containing Line 1 taxable income",
    {
      "Filing status": input.filingStatus,
      "Schedule code": scheduleCode,
      "Row lower bound": selectedBracket.lowerBound.toString(),
      "Row upper bound": selectedBracket.upperBound?.toString() ?? "AND OVER",
      "Base tax": selectedBracket.baseTax.toString(),
      "Marginal rate": selectedBracket.rate.toString(),
    }
  );

  const excessTaxableIncome = taxableIncome.minus(selectedBracket.lowerBound);
  audit.record(
    "CA-540-TRS",
    "3",
    "Excess taxable income within the selected row",
    excessTaxableIncome,
    "Line 1 - selected row lower threshold",
    {
      "Line 1": taxableIncome,
      "Selected row lower threshold": selectedBracket.lowerBound,
    }
  );

  const marginalTax = cents(excessTaxableIncome.times(selectedBracket.rate));
  audit.record(
    "CA-540-TRS",
    "4",
    "Marginal tax on excess taxable income",
    marginalTax,
    "Line 3 × selected row marginal rate, rounded to two decimals",
    {
      "Line 3": excessTaxableIncome,
      "Marginal rate": selectedBracket.rate.toString(),
    }
  );

  const taxBeforeRounding = selectedBracket.baseTax.plus(marginalTax);
  audit.record(
    "CA-540-TRS",
    "5",
    "Tax before whole-dollar rounding",
    taxBeforeRounding,
    "Selected row base tax + Line 4",
    {
      "Selected row base tax": selectedBracket.baseTax,
      "Line 4": marginalTax,
    }
  );

  const tax = roundDollar(taxBeforeRounding);
  audit.record(
    "CA-540-TRS",
    "6",
    "Form 540 line 31 tax",
    tax,
    "Round Line 5 to the nearest whole dollar",
    {
      "Line 5": taxBeforeRounding,
    }
  );

  return {
    taxableIncome,
    scheduleCode,
    selectedBracket,
    excessTaxableIncome,
    marginalTax,
    taxBeforeRounding,
    tax,
    lines: audit.getLines(),
  };
}
