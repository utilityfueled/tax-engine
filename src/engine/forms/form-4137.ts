/**
 * Form 4137 — Social Security and Medicare Tax on Unreported Tip Income.
 * Spec: spec/federal/form-4137.yaml
 *
 * This supported slice accepts validated summary amounts instead of rebuilding
 * the full employer-by-employer worksheet.
 */

import Decimal from "decimal.js";
import type { Form4137Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { YearConstants } from "@/models/constants.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface Form4137Result {
  unreportedTipIncome: Decimal;
  line6: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm4137(
  input: Form4137Input,
  constants: YearConstants,
  defaults: {
    socialSecurityWagesAndTipsAlreadyReported?: Decimal;
    socialSecurityTipsAlreadyReported?: Decimal;
  } = {}
): Form4137Result {
  const audit = new AuditTrail();
  const unreportedTipIncome = Decimal.max(new Decimal(0), d(input.unreportedTipIncome));
  const line6 = unreportedTipIncome;
  const defaultSocialSecurityWagesAlreadyReported = d(defaults.socialSecurityWagesAndTipsAlreadyReported);
  const defaultSocialSecurityTipsAlreadyReported = d(defaults.socialSecurityTipsAlreadyReported);
  const line8 = Decimal.max(
    new Decimal(0),
    input.socialSecurityWagesAndTipsAlreadyReported !== undefined
      ? d(input.socialSecurityWagesAndTipsAlreadyReported)
      : defaultSocialSecurityWagesAlreadyReported.plus(defaultSocialSecurityTipsAlreadyReported)
  );
  const line9 = zeroFloor(constants.selfEmploymentTax.socialSecurityWageBase.minus(line8));
  const medicareOnlyGovernmentEmployeeTips = Decimal.max(
    new Decimal(0),
    d(input.medicareOnlyGovernmentEmployeeTips)
  );
  const socialSecurityComparableTips = zeroFloor(line6.minus(medicareOnlyGovernmentEmployeeTips));
  const line10 = min(socialSecurityComparableTips, line9);
  const line11 = roundDollar(line10.times(constants.selfEmploymentTax.socialSecurityRate.dividedBy(2)));
  const line12 = roundDollar(line6.times(constants.selfEmploymentTax.medicareRate.dividedBy(2)));
  const line13 = line11.plus(line12);

  audit.record(
    "Form 4137",
    "1040-1",
    "Unreported tip income added to Form 1040 line 1",
    unreportedTipIncome,
    "Validated supported Form 4137 unreported tip income amount"
  );
  audit.record(
    "Form 4137",
    "6",
    "Unreported tips subject to Medicare tax and Additional Medicare Tax",
    line6,
    "Validated supported unreported tip income amount"
  );
  audit.record(
    "Form 4137",
    "8",
    "Social Security wages and tips already subject to tax",
    line8,
    input.socialSecurityWagesAndTipsAlreadyReported !== undefined
      ? "Validated Form 4137 line 8 override"
      : "Defaulted from W-2 Box 3 Social Security wages plus W-2 Box 7 Social Security tips",
    {
      "Validated line 8 override": d(input.socialSecurityWagesAndTipsAlreadyReported),
      "Defaulted W-2 Box 3 Social Security wages": defaultSocialSecurityWagesAlreadyReported,
      "Defaulted W-2 Box 7 Social Security tips": defaultSocialSecurityTipsAlreadyReported,
    }
  );
  audit.record(
    "Form 4137",
    "9",
    "Remaining Social Security wage-base room",
    line9,
    "2025 Social Security wage base - Line 8, floored at $0",
    {
      "2025 Social Security wage base": constants.selfEmploymentTax.socialSecurityWageBase,
      "Line 8": line8,
    }
  );
  audit.record(
    "Form 4137",
    "10",
    "Tips subject to Social Security tax",
    line10,
    "Smaller of Line 9 or Line 6 after subtracting Medicare-only government-employee tips",
    {
      "Line 6": line6,
      "Line 9": line9,
      "Validated Medicare-only government-employee tips": medicareOnlyGovernmentEmployeeTips,
      "Social Security-comparable tips": socialSecurityComparableTips,
    }
  );
  audit.record(
    "Form 4137",
    "11",
    "Social Security tax on unreported tips",
    line11,
    `Line 10 × ${constants.selfEmploymentTax.socialSecurityRate.dividedBy(2)}`,
    {
      "Line 10": line10,
    }
  );
  audit.record(
    "Form 4137",
    "12",
    "Medicare tax on unreported tips",
    line12,
    `Line 6 × ${constants.selfEmploymentTax.medicareRate.dividedBy(2)}`,
    {
      "Line 6": line6,
    }
  );
  audit.record(
    "Form 4137",
    "13",
    "Additional Social Security and Medicare tax on unreported tips",
    line13,
    "Line 11 + Line 12",
    {
      "Line 11": line11,
      "Line 12": line12,
    }
  );

  return {
    unreportedTipIncome,
    line6,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    lines: audit.getLines(),
  };
}
