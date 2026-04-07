/**
 * Ohio Lump Sum Distribution Credit Worksheet.
 * Spec: spec/state/oh-lump-sum-distribution-credit.yaml
 */

import Decimal from "decimal.js";
import { OHIO_TAX_CONSTANTS } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { sum } from "@/utils/decimal.js";

export interface OhioLumpSumDistributionCreditInput {
  taxYear: number;
  recipientAges: number[];
}

export interface OhioLumpSumDistributionCreditRecipientResult {
  age: number;
  multiple: Decimal;
  credit: Decimal;
}

export interface OhioLumpSumDistributionCreditResult {
  recipients: OhioLumpSumDistributionCreditRecipientResult[];
  line3_totalCredit: Decimal;
  lines: CalculatedLine[];
}

function validateRecipientCount(recipientAges: number[]): void {
  if (recipientAges.length > 2) {
    throw new Error(
      "Ohio lump sum distribution credit supports at most two recipients because the worksheet only has Column A and Column B"
    );
  }
}

function getColumnLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function getAgeMultiple(age: number, ageMultiples: Record<number, Decimal>): Decimal {
  if (age < 65) {
    return new Decimal(0);
  }

  const multiple = ageMultiples[age];
  if (!multiple) {
    throw new Error(
      `Ohio lump sum distribution credit age ${age} is unsupported; supported ages are 65 through 105`
    );
  }

  return multiple;
}

export function calculateOhioLumpSumDistributionCredit(
  input: OhioLumpSumDistributionCreditInput
): OhioLumpSumDistributionCreditResult {
  const constants = OHIO_TAX_CONSTANTS[input.taxYear]?.scheduleCredits;
  if (!constants) {
    throw new Error(
      `Ohio lump sum distribution credit constants not available for tax year ${input.taxYear}`
    );
  }

  validateRecipientCount(input.recipientAges);

  const audit = new AuditTrail();
  const recipients = input.recipientAges.map((age, index) => {
    const column = getColumnLabel(index);
    const multiple = getAgeMultiple(age, constants.lumpSumAgeMultiples);
    const credit = multiple.times(constants.lumpSumDistributionBaseAmount);

    audit.record(
      "OH-LSDC",
      `1${column}`,
      `Age multiple (${column})`,
      multiple,
      age < 65 ? "$0 because the recipient is younger than 65" : "Table 1 age multiple lookup",
      { Age: age.toString() }
    );
    audit.record(
      "OH-LSDC",
      `2${column}`,
      `Lump sum distribution credit (${column})`,
      credit,
      "Line 1 multiple × $50",
      {
        [`Line 1${column}`]: multiple,
        Multiplier: constants.lumpSumDistributionBaseAmount,
      }
    );

    return { age, multiple, credit };
  });

  const line3 = sum(...recipients.map((recipient) => recipient.credit));
  audit.record(
    "OH-LSDC",
    "3",
    "Total lump sum distribution credit",
    line3,
    "Sum of line 2 across all qualifying recipients"
  );

  return {
    recipients,
    line3_totalCredit: line3,
    lines: audit.getLines(),
  };
}
