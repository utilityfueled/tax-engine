/**
 * California Form 540 tax table.
 * Spec: spec/state/ca-form-540-tax-table.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";
import {
  CA_FORM_540_TAX_RATE_SCHEDULES,
  type CAForm540ScheduleCode,
  type CAForm540TaxRateScheduleBracket,
} from "@/engine/state/ca-form-540-tax-rate-schedules.js";

export interface CAForm540TaxTableRange {
  lowerBound: Decimal;
  upperBound: Decimal;
}

export interface CAForm540TaxTableInput {
  taxableIncome: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;
}

export interface CAForm540TaxTableResult {
  taxableIncome: Decimal;
  selectedRange: CAForm540TaxTableRange;
  representativeIncome: Decimal;
  scheduleCode: CAForm540ScheduleCode;
  selectedBracket: CAForm540TaxRateScheduleBracket | null;
  taxBeforeRounding: Decimal;
  tax: Decimal;
  lines: CalculatedLine[];
}

const ZERO_RANGE: CAForm540TaxTableRange = {
  lowerBound: new Decimal(0),
  upperBound: new Decimal(0),
};

const FIRST_PRINTED_ROW: CAForm540TaxTableRange = {
  lowerBound: new Decimal(1),
  upperBound: new Decimal(50),
};

const cents = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

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

function selectTaxTableRange(taxableIncome: Decimal): CAForm540TaxTableRange {
  if (taxableIncome.isZero()) {
    return ZERO_RANGE;
  }

  if (taxableIncome.lessThanOrEqualTo(FIRST_PRINTED_ROW.upperBound)) {
    return FIRST_PRINTED_ROW;
  }

  const lowerBound = taxableIncome
    .minus(51)
    .div(100)
    .floor()
    .times(100)
    .plus(51);
  const upperBound = Decimal.min(lowerBound.plus(99), new Decimal(100000));

  return { lowerBound, upperBound };
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

export function calculateCAForm540TaxTable(
  input: CAForm540TaxTableInput
): CAForm540TaxTableResult {
  const constants = CA_FORM_540_TAX_RATE_SCHEDULES[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 tax table not available for ${input.taxYear}`);
  }

  const taxableIncome = zeroFloor(d(input.taxableIncome));
  if (taxableIncome.greaterThan(constants.taxTableMaximumIncome)) {
    throw new Error("CA Form 540 tax table applies only when taxable income is $100,000 or less");
  }

  const scheduleCode = getScheduleCode(input.filingStatus);
  const selectedRange = selectTaxTableRange(taxableIncome);
  const representativeIncome = taxableIncome.isZero()
    ? new Decimal(0)
    : selectedRange.lowerBound.plus(selectedRange.upperBound).div(2).floor();

  const audit = new AuditTrail();
  audit.record("CA-540-TT", "1", "Form 540 taxable income", taxableIncome, "Form 540 line 19 taxable income");

  audit.record(
    "CA-540-TT",
    "2",
    "Selected published tax-table row",
    selectedRange.lowerBound,
    "Choose the printed 2025 Tax Table row containing Line 1 and the column for filing status",
    {
      "Filing status": input.filingStatus,
      "Table row lower bound": selectedRange.lowerBound.toString(),
      "Table row upper bound": selectedRange.upperBound.toString(),
    }
  );

  audit.record(
    "CA-540-TT",
    "3",
    "Representative income for the selected row",
    representativeIncome,
    "floor((selected row lower bound + selected row upper bound) / 2), or 0 for the zero-income case",
    {
      "Selected row lower bound": selectedRange.lowerBound,
      "Selected row upper bound": selectedRange.upperBound,
    }
  );

  if (representativeIncome.isZero()) {
    const zeroTax = new Decimal(0);

    audit.record(
      "CA-540-TT",
      "4",
      "Selected California tax-rate schedule row for the representative income",
      zeroTax,
      "No schedule row is needed when the tax-table representative income is 0",
      {
        "Schedule code": scheduleCode,
      }
    );
    audit.record(
      "CA-540-TT",
      "5",
      "Tax before whole-dollar rounding",
      zeroTax,
      "Zero-income special case from the published tax table"
    );
    audit.record(
      "CA-540-TT",
      "6",
      "Form 540 line 31 tax from the tax table",
      zeroTax,
      "Line 5 rounded to the nearest whole dollar, or 0 for the zero-income case"
    );

    return {
      taxableIncome,
      selectedRange,
      representativeIncome,
      scheduleCode,
      selectedBracket: null,
      taxBeforeRounding: zeroTax,
      tax: zeroTax,
      lines: audit.getLines(),
    };
  }

  const selectedBracket = selectBracket(representativeIncome, constants.schedules[scheduleCode]);
  audit.record(
    "CA-540-TT",
    "4",
    "Selected California tax-rate schedule row for the representative income",
    selectedBracket.lowerBound,
    "Choose Schedule X, Y, or Z from filing status, then choose the row containing Line 3",
    {
      "Schedule code": scheduleCode,
      "Row lower bound": selectedBracket.lowerBound.toString(),
      "Row upper bound": selectedBracket.upperBound?.toString() ?? "AND OVER",
      "Base tax": selectedBracket.baseTax.toString(),
      "Marginal rate": selectedBracket.rate.toString(),
    }
  );

  const excessRepresentativeIncome = representativeIncome.minus(selectedBracket.lowerBound);
  const taxBeforeRounding = selectedBracket.baseTax.plus(cents(excessRepresentativeIncome.times(selectedBracket.rate)));
  audit.record(
    "CA-540-TT",
    "5",
    "Tax before whole-dollar rounding",
    taxBeforeRounding,
    "Selected schedule-row base tax + ((Line 3 - selected schedule-row lower threshold) × selected schedule-row rate), rounded to two decimals",
    {
      "Line 3": representativeIncome,
      "Selected schedule-row lower threshold": selectedBracket.lowerBound,
      "Selected schedule-row base tax": selectedBracket.baseTax,
      "Selected schedule-row rate": selectedBracket.rate.toString(),
    }
  );

  const tax = roundDollar(taxBeforeRounding);
  audit.record(
    "CA-540-TT",
    "6",
    "Form 540 line 31 tax from the tax table",
    tax,
    "Round Line 5 to the nearest whole dollar",
    {
      "Line 5": taxBeforeRounding,
    }
  );

  return {
    taxableIncome,
    selectedRange,
    representativeIncome,
    scheduleCode,
    selectedBracket,
    taxBeforeRounding,
    tax,
    lines: audit.getLines(),
  };
}
