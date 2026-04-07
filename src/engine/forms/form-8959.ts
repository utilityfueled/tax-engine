/**
 * Form 8959 — Additional Medicare Tax
 * Spec: spec/federal/form-8959.yaml
 *
 * 0.9% additional tax on Medicare wages + SE earnings exceeding threshold.
 * Threshold: $200K single/HoH/QSS, $250K MFJ, $125K MFS.
 */

import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { d, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateForm4137 } from "./form-4137.js";
import { calculateForm8919 } from "./form-8919.js";

export interface Form8959Result {
  medicareWages: Decimal; // Line 1
  unreportedTips: Decimal; // Line 2
  form8919Wages: Decimal; // Line 3
  selfEmploymentEarnings: Decimal; // Line 5
  totalEarnings: Decimal;
  threshold: Decimal; // Line 7
  excessOverThreshold: Decimal;
  additionalMedicareTax: Decimal; // Line 18
  // Line 19: W-2 Medicare withholding in excess of regular 1.45%
  withholdingCredit: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm8959(
  input: TaxYearInput,
  selfEmploymentEarnings: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): Form8959Result {
  const audit = new AuditTrail();
  const rate = constants.additionalMedicareTax.rate;
  const threshold = constants.additionalMedicareTax.threshold[filingStatus];

  // Line 1: Medicare wages from W-2s
  const medicareWages = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.medicareWages)),
    new Decimal(0)
  );
  audit.record("Form 8959", "1", "Medicare wages from W-2s", medicareWages,
    "Sum W-2 Box 5");

  const form4137 = input.form4137
    ? calculateForm4137(input.form4137, constants, {
      socialSecurityWagesAndTipsAlreadyReported: input.w2s.reduce(
        (acc, w2) => acc.plus(d(w2.socialSecurityWages)),
        new Decimal(0)
      ),
    })
    : undefined;
  const unreportedTips = form4137?.line6 ?? new Decimal(0);
  audit.record("Form 8959", "2", "Unreported tips subject to Medicare tax", unreportedTips,
    "Supported Form 4137 Line 6");

  const form8919 = input.form8919
    ? calculateForm8919(input.form8919, constants, {
      socialSecurityWagesAndTipsAlreadyReported: input.w2s.reduce(
        (acc, w2) => acc.plus(d(w2.socialSecurityWages)),
        new Decimal(0)
      ),
      form4137SocialSecurityTipsAlreadyReported: form4137?.line10 ?? new Decimal(0),
    })
    : undefined;
  const form8919Wages = form8919?.line6 ?? new Decimal(0);
  audit.record("Form 8959", "3", "Form 8919 wages subject to Medicare tax", form8919Wages,
    "Supported Form 8919 Line 6");

  // Line 5: SE earnings (post-multiplier from Schedule SE Line 4a).
  // Per IRS Form 8959 Parts I/II, negative SE does not offset wage-based tax.
  const effectiveSE = zeroFloor(selfEmploymentEarnings);
  audit.record("Form 8959", "5", "SE earnings for Additional Medicare", effectiveSE,
    "From Schedule SE (post-multiplier, floored at 0)");

  // Line 7: Threshold
  audit.record("Form 8959", "7", "Threshold amount", threshold,
    `${filingStatus} threshold`);

  // Combined earnings
  const totalEarnings = medicareWages.plus(unreportedTips).plus(form8919Wages).plus(effectiveSE);

  // Excess over threshold
  const excessOverThreshold = zeroFloor(totalEarnings.minus(threshold));

  // Line 18: Additional Medicare Tax
  const additionalMedicareTax = roundDollar(excessOverThreshold.times(rate));
  audit.record("Form 8959", "18", "Additional Medicare Tax", additionalMedicareTax,
    `(${totalEarnings} - ${threshold}) × ${rate}`);

  // Line 19: Withholding credit — employers withhold Additional Medicare Tax
  // on wages over $200K regardless of filing status. Credit for excess withholding.
  const regularMedicareRate = new Decimal(0.0145);
  const totalMedicareWithheld = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.medicareWithheld)),
    new Decimal(0)
  );
  const expectedRegularMedicare = roundDollar(medicareWages.times(regularMedicareRate));
  const withholdingCredit = zeroFloor(totalMedicareWithheld.minus(expectedRegularMedicare));
  audit.record("Form 8959", "19", "Additional Medicare withholding credit", withholdingCredit,
    "W-2 Medicare withheld - (wages × 1.45%)");

  return {
    medicareWages,
    unreportedTips,
    form8919Wages,
    selfEmploymentEarnings: effectiveSE,
    totalEarnings,
    threshold,
    excessOverThreshold,
    additionalMedicareTax,
    withholdingCredit,
    lines: audit.getLines(),
  };
}
