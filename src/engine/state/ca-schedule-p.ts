/**
 * California Schedule P (540) supported Part III credit ordering.
 * Spec: spec/state/ca-schedule-p.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";

export interface CASchedulePAdditionalCarryoverCreditInput {
  code: string;
  name: string;
  amount: Decimal | string | number;
  electedRefundableAmount?: Decimal | string | number;
}

export interface CASchedulePAdditionalCarryoverCreditResult {
  line: 17 | 18 | 19;
  code: string;
  name: string;
  amount: Decimal;
  electedRefundableAmount: Decimal;
  creditUsedThisYear: Decimal;
  remainingNetTax: Decimal;
  carryover: Decimal;
}

export interface CASchedulePSupportedCreditsInput {
  regularTaxBeforeCredits: Decimal | string | number;
  tentativeMinimumTax?: Decimal | string | number;
  line5ChildAndDependentCareCreditAmount?: Decimal | string | number;
  line12JointCustodyHeadOfHouseholdCreditAmount?: Decimal | string | number;
  line13DependentParentCreditAmount?: Decimal | string | number;
  line14SeniorHeadOfHouseholdCreditAmount?: Decimal | string | number;
  line15RentersCreditAmount?: Decimal | string | number;
  line16ChildAdoptionCostsCreditAmount?: Decimal | string | number;
  line16ChildAdoptionCostsWorksheetCarryover?: Decimal | string | number;
  line17Through19CarryoverCredits?: CASchedulePAdditionalCarryoverCreditInput[];
  line19RemainingNetTaxBeforeOtherStateTaxCredit?: Decimal | string | number;
  line20OtherStateTaxCreditAmount?: Decimal | string | number;
  line21PassThroughEntityElectiveTaxCreditAmount?: Decimal | string | number;
  taxYear: number;
}

export interface CASchedulePSupportedCreditsResult {
  regularTaxBeforeCredits: Decimal;
  tentativeMinimumTax: Decimal;
  line1RegularTaxBeforeCredits: Decimal;
  line2TentativeMinimumTax: Decimal;
  line3ExcessTax: Decimal;
  line5aChildAndDependentCareCreditAmount: Decimal;
  line5bChildAndDependentCareCreditUsed: Decimal;
  line5cRemainingExcessTax: Decimal;
  line11cSectionBStartingTaxBalance: Decimal;
  line12aJointCustodyHeadOfHouseholdCreditAmount: Decimal;
  line12bJointCustodyHeadOfHouseholdCreditUsed: Decimal;
  line12cRemainingNetTax: Decimal;
  line13aDependentParentCreditAmount: Decimal;
  line13bDependentParentCreditUsed: Decimal;
  line13cRemainingNetTax: Decimal;
  line14aSeniorHeadOfHouseholdCreditAmount: Decimal;
  line14bSeniorHeadOfHouseholdCreditUsed: Decimal;
  line14cRemainingNetTax: Decimal;
  line15aRentersCreditAmount: Decimal;
  line15bRentersCreditUsed: Decimal;
  line15cRemainingNetTax: Decimal;
  line16aChildAdoptionCostsCreditAmount: Decimal;
  line16bChildAdoptionCostsCreditUsed: Decimal;
  line16cRemainingNetTax: Decimal;
  line16dChildAdoptionCostsCarryover: Decimal;
  line17Through19CarryoverCredits: CASchedulePAdditionalCarryoverCreditResult[];
  line20bStartingNetTax: Decimal;
  line20aOtherStateTaxCreditAmount: Decimal;
  line20bOtherStateTaxCreditUsed: Decimal;
  line20cRemainingNetTax: Decimal;
  line21aPassThroughEntityElectiveTaxCreditAmount: Decimal;
  line21bPassThroughEntityElectiveTaxCreditUsed: Decimal;
  line21cRemainingNetTax: Decimal;
  line21dPassThroughEntityElectiveTaxCreditCarryover: Decimal;
  lines: CalculatedLine[];
}

function nonNegativeAmount(value: Decimal | string | number | undefined, description: string): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

export function calculateCASchedulePSupportedCredits(
  input: CASchedulePSupportedCreditsInput
): CASchedulePSupportedCreditsResult {
  if (input.taxYear !== 2025) {
    throw new Error(`CA Schedule P supported credit ordering not available for ${input.taxYear}`);
  }

  const line1RegularTaxBeforeCredits = nonNegativeAmount(
    input.regularTaxBeforeCredits,
    "CA Schedule P line 1 regular tax before credits"
  );
  const line2TentativeMinimumTax = nonNegativeAmount(
    input.tentativeMinimumTax,
    "CA Schedule P line 2 tentative minimum tax"
  );
  const line3ExcessTax = zeroFloor(line1RegularTaxBeforeCredits.minus(line2TentativeMinimumTax));

  const line5aChildAndDependentCareCreditAmount = nonNegativeAmount(
    input.line5ChildAndDependentCareCreditAmount,
    "CA Schedule P line 5 child and dependent care credit amount"
  );
  const line5bChildAndDependentCareCreditUsed = min(line5aChildAndDependentCareCreditAmount, line3ExcessTax);
  const line5cRemainingExcessTax = line3ExcessTax.minus(line5bChildAndDependentCareCreditUsed);

  const line11cSectionBStartingTaxBalance = line3ExcessTax.equals(0)
    ? line1RegularTaxBeforeCredits
    : line2TentativeMinimumTax.plus(line5cRemainingExcessTax);

  const line12aJointCustodyHeadOfHouseholdCreditAmount = nonNegativeAmount(
    input.line12JointCustodyHeadOfHouseholdCreditAmount,
    "CA Schedule P line 12 Joint Custody Head of Household credit amount"
  );
  const line12bJointCustodyHeadOfHouseholdCreditUsed = min(
    line12aJointCustodyHeadOfHouseholdCreditAmount,
    line11cSectionBStartingTaxBalance
  );
  const line12cRemainingNetTax = line11cSectionBStartingTaxBalance.minus(
    line12bJointCustodyHeadOfHouseholdCreditUsed
  );

  const line13aDependentParentCreditAmount = nonNegativeAmount(
    input.line13DependentParentCreditAmount,
    "CA Schedule P line 13 Dependent Parent credit amount"
  );
  const line13bDependentParentCreditUsed = min(line13aDependentParentCreditAmount, line12cRemainingNetTax);
  const line13cRemainingNetTax = line12cRemainingNetTax.minus(line13bDependentParentCreditUsed);

  const line14aSeniorHeadOfHouseholdCreditAmount = nonNegativeAmount(
    input.line14SeniorHeadOfHouseholdCreditAmount,
    "CA Schedule P line 14 Senior Head of Household credit amount"
  );
  const line14bSeniorHeadOfHouseholdCreditUsed = min(line14aSeniorHeadOfHouseholdCreditAmount, line13cRemainingNetTax);
  const line14cRemainingNetTax = line13cRemainingNetTax.minus(line14bSeniorHeadOfHouseholdCreditUsed);

  const line15aRentersCreditAmount = nonNegativeAmount(
    input.line15RentersCreditAmount,
    "CA Schedule P line 15 renter's credit amount"
  );
  const line15bRentersCreditUsed = min(line15aRentersCreditAmount, line14cRemainingNetTax);
  const line15cRemainingNetTax = line14cRemainingNetTax.minus(line15bRentersCreditUsed);

  const line16aChildAdoptionCostsCreditAmount = nonNegativeAmount(
    input.line16ChildAdoptionCostsCreditAmount,
    "CA Schedule P line 16 Child Adoption Costs credit amount"
  );
  const line16bChildAdoptionCostsCreditUsed = min(line16aChildAdoptionCostsCreditAmount, line15cRemainingNetTax);
  const line16cRemainingNetTax = line15cRemainingNetTax.minus(line16bChildAdoptionCostsCreditUsed);
  const line16WorksheetCarryover = nonNegativeAmount(
    input.line16ChildAdoptionCostsWorksheetCarryover,
    "CA Schedule P line 16 Child Adoption Costs worksheet carryover"
  );
  const line16dChildAdoptionCostsCarryover = line16WorksheetCarryover.plus(
    line16aChildAdoptionCostsCreditAmount.minus(line16bChildAdoptionCostsCreditUsed)
  );
  const additionalCarryoverCreditInputs = input.line17Through19CarryoverCredits ?? [];
  if (additionalCarryoverCreditInputs.length > 3) {
    throw new Error("CA Schedule P supports at most three additional Section B2 carryover credits on lines 17 through 19");
  }

  const line17Through19CarryoverCredits: CASchedulePAdditionalCarryoverCreditResult[] = [];
  let currentAdditionalCarryoverStartingNetTax = line16cRemainingNetTax;

  for (const [index, carryoverCreditInput] of additionalCarryoverCreditInputs.entries()) {
    const line = (17 + index) as CASchedulePAdditionalCarryoverCreditResult["line"];
    const code = carryoverCreditInput.code.trim();
    const name = carryoverCreditInput.name.trim();
    if (code.length === 0) {
      throw new Error(`CA Schedule P line ${line} additional carryover credit code is required`);
    }
    if (name.length === 0) {
      throw new Error(`CA Schedule P line ${line} additional carryover credit name is required`);
    }

    const amount = nonNegativeAmount(
      carryoverCreditInput.amount,
      `CA Schedule P line ${line} additional carryover credit amount`
    );
    const electedRefundableAmount = nonNegativeAmount(
      carryoverCreditInput.electedRefundableAmount,
      `CA Schedule P line ${line} elected refundable credit amount`
    );
    const creditUsedThisYear = min(amount, currentAdditionalCarryoverStartingNetTax);
    const unusedCredit = amount.minus(creditUsedThisYear);
    if (electedRefundableAmount.greaterThan(unusedCredit)) {
      throw new Error(
        `CA Schedule P line ${line} elected refundable amount cannot exceed the unused credit after current-year use`
      );
    }

    const remainingNetTax = currentAdditionalCarryoverStartingNetTax.minus(creditUsedThisYear);
    const carryover = zeroFloor(unusedCredit.minus(electedRefundableAmount));

    line17Through19CarryoverCredits.push({
      line,
      code,
      name,
      amount,
      electedRefundableAmount,
      creditUsedThisYear,
      remainingNetTax,
      carryover,
    });

    currentAdditionalCarryoverStartingNetTax = remainingNetTax;
  }

  const line20bStartingNetTax = line17Through19CarryoverCredits.length > 0
    ? line17Through19CarryoverCredits[line17Through19CarryoverCredits.length - 1].remainingNetTax
    : input.line19RemainingNetTaxBeforeOtherStateTaxCredit === undefined
      ? line16cRemainingNetTax
      : nonNegativeAmount(
          input.line19RemainingNetTaxBeforeOtherStateTaxCredit,
          "CA Schedule P line 19 remaining net tax before line 20"
        );
  const line20aOtherStateTaxCreditAmount = nonNegativeAmount(
    input.line20OtherStateTaxCreditAmount,
    "CA Schedule P line 20 Other state tax credit amount"
  );
  const line20bOtherStateTaxCreditUsed = min(line20aOtherStateTaxCreditAmount, line20bStartingNetTax);
  const line20cRemainingNetTax = line20bStartingNetTax.minus(line20bOtherStateTaxCreditUsed);
  const line21aPassThroughEntityElectiveTaxCreditAmount = nonNegativeAmount(
    input.line21PassThroughEntityElectiveTaxCreditAmount,
    "CA Schedule P line 21 pass-through entity elective tax credit amount"
  );
  const line21bPassThroughEntityElectiveTaxCreditUsed = min(
    line21aPassThroughEntityElectiveTaxCreditAmount,
    line20cRemainingNetTax
  );
  const line21cRemainingNetTax = line20cRemainingNetTax.minus(line21bPassThroughEntityElectiveTaxCreditUsed);
  const line21dPassThroughEntityElectiveTaxCreditCarryover =
    line21aPassThroughEntityElectiveTaxCreditAmount.minus(line21bPassThroughEntityElectiveTaxCreditUsed);

  const audit = new AuditTrail();
  audit.record(
    "CA-P",
    "1",
    "Regular tax before credits",
    line1RegularTaxBeforeCredits,
    "Supported input from Form 540 line 35 subtotal tax before credits"
  );
  audit.record(
    "CA-P",
    "2",
    "Tentative minimum tax",
    line2TentativeMinimumTax,
    "Supported input from Schedule P Part I line 24"
  );
  audit.record("CA-P", "3", "Excess tax", line3ExcessTax, "max(0, Line 1 - Line 2)", {
    "Line 1": line1RegularTaxBeforeCredits,
    "Line 2": line2TentativeMinimumTax,
  });
  audit.record(
    "CA-P",
    "5a",
    "Child and dependent care expenses credit amount",
    line5aChildAndDependentCareCreditAmount,
    "Supported input for Schedule P line 5 code 232 credit amount"
  );
  audit.record(
    "CA-P",
    "5b",
    "Child and dependent care expenses credit used this year",
    line5bChildAndDependentCareCreditUsed,
    "min(Line 5a, Line 3)",
    {
      "Line 5a": line5aChildAndDependentCareCreditAmount,
      "Line 3": line3ExcessTax,
    }
  );
  audit.record("CA-P", "5c", "Excess tax remaining after Schedule P line 5", line5cRemainingExcessTax, "Line 3 - Line 5b", {
    "Line 3": line3ExcessTax,
    "Line 5b": line5bChildAndDependentCareCreditUsed,
  });
  audit.record(
    "CA-P",
    "11c",
    "Section B starting tax balance that may be offset by credits",
    line11cSectionBStartingTaxBalance,
    line3ExcessTax.equals(0) ? "Line 1" : "Line 2 + Line 5c",
    {
      "Line 1": line1RegularTaxBeforeCredits,
      "Line 2": line2TentativeMinimumTax,
      "Line 3": line3ExcessTax,
      "Line 5c": line5cRemainingExcessTax,
    }
  );
  audit.record(
    "CA-P",
    "12a",
    "Joint Custody Head of Household credit amount",
    line12aJointCustodyHeadOfHouseholdCreditAmount,
    "Supported input for Schedule P line 12 code 170 credit amount"
  );
  audit.record(
    "CA-P",
    "12b",
    "Joint Custody Head of Household credit used this year",
    line12bJointCustodyHeadOfHouseholdCreditUsed,
    "min(Line 12a, Line 11c)",
    {
      "Line 12a": line12aJointCustodyHeadOfHouseholdCreditAmount,
      "Line 11c": line11cSectionBStartingTaxBalance,
    }
  );
  audit.record("CA-P", "12c", "Net tax remaining after Schedule P line 12", line12cRemainingNetTax, "Line 11c - Line 12b", {
    "Line 11c": line11cSectionBStartingTaxBalance,
    "Line 12b": line12bJointCustodyHeadOfHouseholdCreditUsed,
  });
  audit.record(
    "CA-P",
    "13a",
    "Dependent Parent credit amount",
    line13aDependentParentCreditAmount,
    "Supported input for Schedule P line 13 code 173 credit amount"
  );
  audit.record(
    "CA-P",
    "13b",
    "Dependent Parent credit used this year",
    line13bDependentParentCreditUsed,
    "min(Line 13a, Line 12c)",
    {
      "Line 13a": line13aDependentParentCreditAmount,
      "Line 12c": line12cRemainingNetTax,
    }
  );
  audit.record("CA-P", "13c", "Net tax remaining after Schedule P line 13", line13cRemainingNetTax, "Line 12c - Line 13b", {
    "Line 12c": line12cRemainingNetTax,
    "Line 13b": line13bDependentParentCreditUsed,
  });
  audit.record(
    "CA-P",
    "14a",
    "Senior Head of Household credit amount",
    line14aSeniorHeadOfHouseholdCreditAmount,
    "Supported input for Schedule P line 14 code 163 credit amount"
  );
  audit.record(
    "CA-P",
    "14b",
    "Senior Head of Household credit used this year",
    line14bSeniorHeadOfHouseholdCreditUsed,
    "min(Line 14a, Line 13c)",
    {
      "Line 14a": line14aSeniorHeadOfHouseholdCreditAmount,
      "Line 13c": line13cRemainingNetTax,
    }
  );
  audit.record("CA-P", "14c", "Net tax remaining after Schedule P line 14", line14cRemainingNetTax, "Line 13c - Line 14b", {
    "Line 13c": line13cRemainingNetTax,
    "Line 14b": line14bSeniorHeadOfHouseholdCreditUsed,
  });
  audit.record(
    "CA-P",
    "15a",
    "Nonrefundable renter's credit amount",
    line15aRentersCreditAmount,
    "Supported input for Schedule P line 15 renter's credit amount"
  );
  audit.record(
    "CA-P",
    "15b",
    "Nonrefundable renter's credit used this year",
    line15bRentersCreditUsed,
    "min(Line 15a, Line 14c)",
    {
      "Line 15a": line15aRentersCreditAmount,
      "Line 14c": line14cRemainingNetTax,
    }
  );
  audit.record("CA-P", "15c", "Net tax remaining after Schedule P line 15", line15cRemainingNetTax, "Line 14c - Line 15b", {
    "Line 14c": line14cRemainingNetTax,
    "Line 15b": line15bRentersCreditUsed,
  });
  audit.record(
    "CA-P",
    "16a",
    "Child Adoption Costs credit amount",
    line16aChildAdoptionCostsCreditAmount,
    "Supported input for Schedule P Section B2 line 16 code 197 current-year credit amount"
  );
  audit.record(
    "CA-P",
    "16b",
    "Child Adoption Costs credit used this year",
    line16bChildAdoptionCostsCreditUsed,
    "min(Line 16a, Line 15c)",
    {
      "Line 16a": line16aChildAdoptionCostsCreditAmount,
      "Line 15c": line15cRemainingNetTax,
    }
  );
  audit.record("CA-P", "16c", "Net tax remaining after Schedule P line 16", line16cRemainingNetTax, "Line 15c - Line 16b", {
    "Line 15c": line15cRemainingNetTax,
    "Line 16b": line16bChildAdoptionCostsCreditUsed,
  });
  audit.record(
    "CA-P",
    "16d",
    "Child Adoption Costs credit carryover",
    line16dChildAdoptionCostsCarryover,
    "Worksheet carryover + max(0, Line 16a - Line 16b)",
    {
      "Line 16a": line16aChildAdoptionCostsCreditAmount,
      "Line 16b": line16bChildAdoptionCostsCreditUsed,
      "Worksheet carryover": line16WorksheetCarryover,
    }
  );
  for (const carryoverCredit of line17Through19CarryoverCredits) {
    const previousLine = carryoverCredit.line === 17 ? "16c" : `${carryoverCredit.line - 1}c`;
    const previousBalance =
      carryoverCredit.line === 17
        ? line16cRemainingNetTax
        : line17Through19CarryoverCredits[carryoverCredit.line - 18].remainingNetTax;

    audit.record(
      "CA-P",
      `${carryoverCredit.line}a`,
      `${carryoverCredit.name} credit amount`,
      carryoverCredit.amount,
      `Supported input for Schedule P Section B2 line ${carryoverCredit.line} code ${carryoverCredit.code} credit amount`,
      {
        "Credit code": carryoverCredit.code,
        "Credit name": carryoverCredit.name,
      }
    );
    audit.record(
      "CA-P",
      `${carryoverCredit.line}b`,
      `${carryoverCredit.name} credit used this year`,
      carryoverCredit.creditUsedThisYear,
      `min(Line ${carryoverCredit.line}a, Line ${previousLine})`,
      {
        [`Line ${carryoverCredit.line}a`]: carryoverCredit.amount,
        [`Line ${previousLine}`]: previousBalance,
        "Credit code": carryoverCredit.code,
      }
    );
    audit.record(
      "CA-P",
      `${carryoverCredit.line}c`,
      `Net tax remaining after Schedule P line ${carryoverCredit.line}`,
      carryoverCredit.remainingNetTax,
      `Line ${previousLine} - Line ${carryoverCredit.line}b`,
      {
        [`Line ${previousLine}`]: previousBalance,
        [`Line ${carryoverCredit.line}b`]: carryoverCredit.creditUsedThisYear,
      }
    );
    audit.record(
      "CA-P",
      `${carryoverCredit.line}d`,
      `${carryoverCredit.name} credit carryover`,
      carryoverCredit.carryover,
      `max(0, Line ${carryoverCredit.line}a - Line ${carryoverCredit.line}b - elected refundable amount)`,
      {
        [`Line ${carryoverCredit.line}a`]: carryoverCredit.amount,
        [`Line ${carryoverCredit.line}b`]: carryoverCredit.creditUsedThisYear,
        "Elected refundable amount": carryoverCredit.electedRefundableAmount,
        "Credit code": carryoverCredit.code,
      }
    );
  }
  audit.record(
    "CA-P",
    "20a",
    "Other state tax credit amount",
    line20aOtherStateTaxCreditAmount,
    "Supported input from Schedule S (540) line 12"
  );
  audit.record(
    "CA-P",
    "20b",
    "Other state tax credit used this year",
    line20bOtherStateTaxCreditUsed,
    "min(Line 20a, last supported B2 line 17 through 19 column (c) balance when present; otherwise supported upstream line 19 column (c) balance when supplied; otherwise Line 16c)",
    {
      "Line 20a": line20aOtherStateTaxCreditAmount,
      "Starting balance": line20bStartingNetTax,
      "Starting balance source":
        line17Through19CarryoverCredits.length > 0
          ? `line${line17Through19CarryoverCredits[line17Through19CarryoverCredits.length - 1].line}c`
          : input.line19RemainingNetTaxBeforeOtherStateTaxCredit === undefined
            ? "line16c"
            : "upstream_line19c",
    }
  );
  audit.record(
    "CA-P",
    "20c",
    "Net tax remaining after Schedule P line 20",
    line20cRemainingNetTax,
    "Starting balance used for Line 20b - Line 20b",
    {
      "Starting balance": line20bStartingNetTax,
      "Line 20b": line20bOtherStateTaxCreditUsed,
    }
  );
  audit.record(
    "CA-P",
    "21a",
    "Pass-through entity elective tax credit amount",
    line21aPassThroughEntityElectiveTaxCreditAmount,
    "Supported input from FTB 3804-CR available credit amount"
  );
  audit.record(
    "CA-P",
    "21b",
    "Pass-through entity elective tax credit used this year",
    line21bPassThroughEntityElectiveTaxCreditUsed,
    "min(Line 21a, Line 20c)",
    {
      "Line 21a": line21aPassThroughEntityElectiveTaxCreditAmount,
      "Line 20c": line20cRemainingNetTax,
    }
  );
  audit.record(
    "CA-P",
    "21c",
    "Net tax remaining after Schedule P line 21",
    line21cRemainingNetTax,
    "Line 20c - Line 21b",
    {
      "Line 20c": line20cRemainingNetTax,
      "Line 21b": line21bPassThroughEntityElectiveTaxCreditUsed,
    }
  );
  audit.record(
    "CA-P",
    "21d",
    "Pass-through entity elective tax credit carryover",
    line21dPassThroughEntityElectiveTaxCreditCarryover,
    "max(0, Line 21a - Line 21b)",
    {
      "Line 21a": line21aPassThroughEntityElectiveTaxCreditAmount,
      "Line 21b": line21bPassThroughEntityElectiveTaxCreditUsed,
    }
  );

  return {
    regularTaxBeforeCredits: line1RegularTaxBeforeCredits,
    tentativeMinimumTax: line2TentativeMinimumTax,
    line1RegularTaxBeforeCredits,
    line2TentativeMinimumTax,
    line3ExcessTax,
    line5aChildAndDependentCareCreditAmount,
    line5bChildAndDependentCareCreditUsed,
    line5cRemainingExcessTax,
    line11cSectionBStartingTaxBalance,
    line12aJointCustodyHeadOfHouseholdCreditAmount,
    line12bJointCustodyHeadOfHouseholdCreditUsed,
    line12cRemainingNetTax,
    line13aDependentParentCreditAmount,
    line13bDependentParentCreditUsed,
    line13cRemainingNetTax,
    line14aSeniorHeadOfHouseholdCreditAmount,
    line14bSeniorHeadOfHouseholdCreditUsed,
    line14cRemainingNetTax,
    line15aRentersCreditAmount,
    line15bRentersCreditUsed,
    line15cRemainingNetTax,
    line16aChildAdoptionCostsCreditAmount,
    line16bChildAdoptionCostsCreditUsed,
    line16cRemainingNetTax,
    line16dChildAdoptionCostsCarryover,
    line17Through19CarryoverCredits,
    line20bStartingNetTax,
    line20aOtherStateTaxCreditAmount,
    line20bOtherStateTaxCreditUsed,
    line20cRemainingNetTax,
    line21aPassThroughEntityElectiveTaxCreditAmount,
    line21bPassThroughEntityElectiveTaxCreditUsed,
    line21cRemainingNetTax,
    line21dPassThroughEntityElectiveTaxCreditCarryover,
    lines: audit.getLines(),
  };
}
