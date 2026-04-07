/**
 * Ohio Lump Sum Retirement Credit Worksheet.
 * Spec: spec/state/oh-lump-sum-retirement-credit.yaml
 */

import Decimal from "decimal.js";
import { OHIO_TAX_CONSTANTS, type RetirementIncomeCreditTier } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface OhioLumpSumRetirementCreditRecipientInput {
  age: number;
  retirementIncome: Decimal | string | number;
}

export interface OhioLumpSumRetirementCreditInput {
  taxYear: number;
  recipients: OhioLumpSumRetirementCreditRecipientInput[];
  /** Optional Ohio Schedule of Credits line 1 tax liability before credits. */
  scheduleOfCreditsLine1TaxLiability?: Decimal | string | number;
  /** Optional Ohio Schedule of Credits line 2 retirement income credit. */
  scheduleOfCreditsLine2RetirementIncomeCredit?: Decimal | string | number;
}

export interface OhioLumpSumRetirementCreditRecipientResult {
  age: number;
  retirementIncome: Decimal;
  multiple: Decimal;
  derivedRetirementIncome: Decimal;
  retirementIncomeCredit: Decimal;
  credit: Decimal;
}

export interface OhioLumpSumRetirementCreditResult {
  recipients: OhioLumpSumRetirementCreditRecipientResult[];
  line6_totalCredit: Decimal;
  line7_taxAvailableForCurrentYearCredit: Decimal;
  line8_excessCredit: Decimal;
  line9_futureYearDivisor: Decimal;
  line10_futureYearCredit: Decimal;
  lines: CalculatedLine[];
}

function validateRecipientCount(
  recipients: OhioLumpSumRetirementCreditRecipientInput[],
): void {
  if (recipients.length > 2) {
    throw new Error(
      "Ohio lump sum retirement credit supports at most two recipients because the worksheet only has Column A and Column B"
    );
  }
}

function getColumnLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function getAgeMultiple(age: number, ageMultiples: Record<number, Decimal>): Decimal {
  const multiple = ageMultiples[age];
  if (!multiple) {
    throw new Error(
      `Ohio lump sum retirement credit age ${age} is unsupported; supported ages are 46 through 105`
    );
  }

  return multiple;
}

function getRetirementIncomeCredit(
  derivedRetirementIncome: Decimal,
  tiers: RetirementIncomeCreditTier[],
): Decimal {
  for (const tier of tiers) {
    if (
      tier.maxIncome === null ||
      derivedRetirementIncome.lessThanOrEqualTo(tier.maxIncome)
    ) {
      return tier.credit;
    }
  }

  return new Decimal(0);
}

export function calculateOhioLumpSumRetirementCredit(
  input: OhioLumpSumRetirementCreditInput,
): OhioLumpSumRetirementCreditResult {
  const constants = OHIO_TAX_CONSTANTS[input.taxYear]?.scheduleCredits;
  if (!constants) {
    throw new Error(
      `Ohio lump sum retirement credit constants not available for tax year ${input.taxYear}`
    );
  }

  validateRecipientCount(input.recipients);

  const audit = new AuditTrail();
  const recipients = input.recipients.map((recipient, index) => {
    const column = getColumnLabel(index);
    const line1 = d(recipient.retirementIncome);
    const line2 = getAgeMultiple(recipient.age, constants.lumpSumAgeMultiples);
    const line3 = line1.div(line2);
    const line4 = getRetirementIncomeCredit(
      line3,
      constants.retirementIncomeCreditTiers,
    );
    const line5 = line2.times(line4);

    audit.record(
      "OH-LSRC",
      `1${column}`,
      `Retirement income included in Ohio AGI (${column})`,
      line1,
      "Input retirement income received on account of retirement and included in Ohio AGI",
      { Age: recipient.age.toString() },
    );
    audit.record(
      "OH-LSRC",
      `2${column}`,
      `Age multiple (${column})`,
      line2,
      "Table 1 age multiple lookup",
      { Age: recipient.age.toString() },
    );
    audit.record(
      "OH-LSRC",
      `3${column}`,
      `Derived retirement income amount (${column})`,
      line3,
      `Line 1${column} / Line 2${column}`,
      {
        [`Line 1${column}`]: line1,
        [`Line 2${column}`]: line2,
      },
    );
    audit.record(
      "OH-LSRC",
      `4${column}`,
      `Retirement income credit (${column})`,
      line4,
      "Table 2 retirement income credit lookup based on line 3",
      { [`Line 3${column}`]: line3 },
    );
    audit.record(
      "OH-LSRC",
      `5${column}`,
      `Lump sum retirement credit (${column})`,
      line5,
      `Line 2${column} × Line 4${column}`,
      {
        [`Line 2${column}`]: line2,
        [`Line 4${column}`]: line4,
      },
    );

    return {
      age: recipient.age,
      retirementIncome: line1,
      multiple: line2,
      derivedRetirementIncome: line3,
      retirementIncomeCredit: line4,
      credit: line5,
    };
  });

  const line6 = sum(...recipients.map((recipient) => recipient.credit));
  audit.record(
    "OH-LSRC",
    "6",
    "Total lump sum retirement credit",
    line6,
    "Sum of line 5 across all qualifying recipients",
  );

  const hasScheduleContext =
    input.scheduleOfCreditsLine1TaxLiability !== undefined ||
    input.scheduleOfCreditsLine2RetirementIncomeCredit !== undefined;
  const line7 = hasScheduleContext
    ? Decimal.max(
        d(input.scheduleOfCreditsLine1TaxLiability).minus(
          d(input.scheduleOfCreditsLine2RetirementIncomeCredit),
        ),
        new Decimal(0),
      )
    : new Decimal(0);
  audit.record(
    "OH-LSRC",
    "7",
    "Current-year tax available for the lump sum retirement credit",
    line7,
    hasScheduleContext
      ? "max(0, Schedule of Credits line 1 - Schedule of Credits line 2)"
      : "$0 because Schedule of Credits line 1/line 2 context was not provided",
    hasScheduleContext
      ? {
          "Schedule of Credits line 1": d(input.scheduleOfCreditsLine1TaxLiability),
          "Schedule of Credits line 2": d(input.scheduleOfCreditsLine2RetirementIncomeCredit),
        }
      : undefined,
  );

  const line8 = line6.greaterThan(line7) ? line6.minus(line7) : new Decimal(0);
  audit.record(
    "OH-LSRC",
    "8",
    "Excess current-year lump sum retirement credit",
    line8,
    line6.greaterThan(line7) ? "Line 6 - Line 7" : "$0 because line 6 does not exceed line 7",
    {
      "Line 6": line6,
      "Line 7": line7,
    },
  );

  const line9RecipientDivisors = recipients.map((recipient, index) => {
    const column = getColumnLabel(index);
    const divisor = recipient.multiple.minus(1);
    audit.record(
      "OH-LSRC",
      `9${column}`,
      `Future-year divisor (${column})`,
      divisor,
      `Line 2${column} - 1`,
      {
        [`Line 2${column}`]: recipient.multiple,
      },
    );
    return divisor;
  });
  const line9 = line8.greaterThan(0) ? sum(...line9RecipientDivisors) : new Decimal(0);
  audit.record(
    "OH-LSRC",
    "9",
    "Future-year divisor",
    line9,
    line8.greaterThan(0)
      ? "Sum of recipient divisors from line 2 minus 1"
      : "$0 because there is no excess credit on line 8",
  );

  const line10 =
    line8.greaterThan(0) && line9.greaterThan(0)
      ? line8.div(line9)
      : new Decimal(0);
  audit.record(
    "OH-LSRC",
    "10",
    "Future-year lump sum retirement credit",
    line10,
    line8.greaterThan(0) && line9.greaterThan(0)
      ? "Line 8 / Line 9"
      : "$0 because there is no future-year carryforward",
    {
      "Line 8": line8,
      "Line 9": line9,
    },
  );

  return {
    recipients,
    line6_totalCredit: line6,
    line7_taxAvailableForCurrentYearCredit: line7,
    line8_excessCredit: line8,
    line9_futureYearDivisor: line9,
    line10_futureYearCredit: line10,
    lines: audit.getLines(),
  };
}
