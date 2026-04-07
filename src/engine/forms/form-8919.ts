/**
 * Form 8919 — Uncollected Social Security and Medicare Tax on Wages.
 * Spec: spec/federal/form-8919.yaml
 *
 * This supported slice accepts validated summary amounts instead of rebuilding
 * the full employer and reason-code worksheet.
 */

import Decimal from "decimal.js";
import type { Form8919Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { YearConstants } from "@/models/constants.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface Form8919Result {
  line6: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm8919(
  input: Form8919Input,
  constants: YearConstants,
  defaults: {
    socialSecurityWagesAndTipsAlreadyReported?: Decimal;
    w2SocialSecurityTipsAlreadyReported?: Decimal;
    form4137SocialSecurityTipsAlreadyReported?: Decimal;
  } = {}
): Form8919Result {
  const audit = new AuditTrail();
  const line6 = Decimal.max(new Decimal(0), d(input.wagesNotReportedOnW2));
  const supportedRrtaCompensationIncludedOnLine8 = Decimal.min(
    constants.selfEmploymentTax.socialSecurityWageBase,
    Decimal.max(new Decimal(0), d(input.rrtaCompensationSubjectToSocialSecurityTax))
  );
  const defaultLine8 = d(defaults.socialSecurityWagesAndTipsAlreadyReported)
    .plus(d(defaults.w2SocialSecurityTipsAlreadyReported))
    .plus(d(defaults.form4137SocialSecurityTipsAlreadyReported))
    .plus(supportedRrtaCompensationIncludedOnLine8);
  const line8 = Decimal.max(
    new Decimal(0),
    input.socialSecurityWagesAndTipsAlreadyReported !== undefined
      ? d(input.socialSecurityWagesAndTipsAlreadyReported)
      : defaultLine8
  );
  const line9 = zeroFloor(constants.selfEmploymentTax.socialSecurityWageBase.minus(line8));
  const line10 = min(line6, line9);
  const line11 = roundDollar(line10.times(constants.selfEmploymentTax.socialSecurityRate.dividedBy(2)));
  const line12 = roundDollar(line6.times(constants.selfEmploymentTax.medicareRate.dividedBy(2)));
  const line13 = line11.plus(line12);

  audit.record(
    "Form 8919",
    "1040-1",
    "Form 8919 wages added to Form 1040 line 1",
    line6,
    "Validated supported Form 8919 wage amount"
  );
  audit.record(
    "Form 8919",
    "6",
    "Employee wages subject to Form 8919 tax",
    line6,
    "Validated supported wage amount not reported on Form W-2"
  );
  audit.record(
    "Form 8919",
    "8",
    "Social Security wages and tips already subject to tax",
    line8,
    input.socialSecurityWagesAndTipsAlreadyReported !== undefined
      ? "Validated Form 8919 line 8 override"
      : "Defaulted from W-2 Box 3 Social Security wages, W-2 Box 7 Social Security tips, any supported Form 4137 Line 10 tips, and any validated RRTA compensation subject to the 6.2% Social Security rate",
    {
      "Validated line 8 override": d(input.socialSecurityWagesAndTipsAlreadyReported),
      "Defaulted W-2 Box 3 Social Security wages": d(defaults.socialSecurityWagesAndTipsAlreadyReported),
      "Defaulted W-2 Box 7 Social Security tips": d(defaults.w2SocialSecurityTipsAlreadyReported),
      "Supported Form 4137 Line 10 tips": d(defaults.form4137SocialSecurityTipsAlreadyReported),
      "Validated RRTA compensation subject to the 6.2% Social Security rate":
        d(input.rrtaCompensationSubjectToSocialSecurityTax),
      "Supported RRTA compensation included on Line 8": supportedRrtaCompensationIncludedOnLine8,
    }
  );
  audit.record(
    "Form 8919",
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
    "Form 8919",
    "10",
    "Wages subject to Social Security tax",
    line10,
    "Smaller of Line 6 or Line 9",
    {
      "Line 6": line6,
      "Line 9": line9,
    }
  );
  audit.record(
    "Form 8919",
    "11",
    "Social Security tax on Form 8919 wages",
    line11,
    `Line 10 × ${constants.selfEmploymentTax.socialSecurityRate.dividedBy(2)}`,
    {
      "Line 10": line10,
    }
  );
  audit.record(
    "Form 8919",
    "12",
    "Medicare tax on Form 8919 wages",
    line12,
    `Line 6 × ${constants.selfEmploymentTax.medicareRate.dividedBy(2)}`,
    {
      "Line 6": line6,
    }
  );
  audit.record(
    "Form 8919",
    "13",
    "Total Social Security and Medicare tax on Form 8919 wages",
    line13,
    "Line 11 + Line 12",
    {
      "Line 11": line11,
      "Line 12": line12,
    }
  );

  return {
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
