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
import { d, zeroFloor, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateUnreportedTipPayroll } from "./unreported-tip-payroll.js";
import { calculateForm8919 } from "./form-8919.js";

export interface Form8959Result {
  medicareWages: Decimal; // Line 1
  unreportedTips: Decimal; // Line 2
  form8919Wages: Decimal; // Line 3
  selfEmploymentEarnings: Decimal; // Line 8
  totalEarnings: Decimal;
  threshold: Decimal; // Lines 5 and 9
  excessOverThreshold: Decimal;
  additionalMedicareTax: Decimal; // Line 18
  // Line 24: Additional Medicare withholding credited to Form 1040 line 25c
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
  const medicareWages = roundDollar(input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.medicareWages)),
    new Decimal(0)
  ));
  audit.record("Form 8959", "1", "Medicare wages from W-2s", medicareWages,
    "Sum W-2 Box 5");

  const tipPayroll = calculateUnreportedTipPayroll(input, constants);
  const unreportedTips = tipPayroll.medicareTips;
  audit.record("Form 8959", "2", "Unreported tips subject to Medicare tax", unreportedTips,
    "Sum actual owner Form4137 line6 amounts");
  const owner = input.form8919?.accountHolder;
  const ownerW2s = owner === undefined ? input.w2s : input.w2s.filter(w2 =>
    (w2.accountHolder ?? (filingStatus !== "married_filing_jointly" ? "primary" : undefined)) === owner);
  const form8919 = input.form8919 ? calculateForm8919(input.form8919, constants, {
    socialSecurityWagesAndTipsAlreadyReported: sum(...ownerW2s.map(w2 => d(w2.socialSecurityWages))),
    w2SocialSecurityTipsAlreadyReported: sum(...ownerW2s.map(w2 => d(w2.socialSecurityTips))),
    form4137SocialSecurityTipsAlreadyReported: sum(...tipPayroll.forms.filter(form => owner === undefined || form.accountHolder === undefined || form.accountHolder === owner).map(form => form.line10)),
  }) : undefined;
  const form8919Wages = form8919?.line6 ?? new Decimal(0);
  audit.record("Form 8959", "3", "Form 8919 wages subject to Medicare tax", form8919Wages,
    "Supported Form 8919 Line 6");

  // Parts I and II have independent tax lines and dollar rounding.
  const effectiveSE = roundDollar(zeroFloor(selfEmploymentEarnings));
  const wageBase = medicareWages.plus(roundDollar(unreportedTips)).plus(roundDollar(form8919Wages));
  const wageExcess = zeroFloor(wageBase.minus(threshold));
  const wageTax = roundDollar(wageExcess.times(rate));
  const remainingSEThreshold = zeroFloor(threshold.minus(wageBase));
  const seExcess = zeroFloor(effectiveSE.minus(remainingSEThreshold));
  const seTax = roundDollar(seExcess.times(rate));
  for (const [line, description, value, formula] of [
    ["4", "Medicare wages and tips", wageBase, "Lines 1 + 2 + 3"],
    ["5", "Wage threshold", threshold, `${filingStatus} threshold`],
    ["6", "Wages over threshold", wageExcess, "max(0, line 4 - line 5)"],
    ["7", "Additional Medicare Tax on wages", wageTax, "round(line 6 × 0.009)"],
    ["8", "Self-employment earnings", effectiveSE, "Nonnegative Schedule SE line 6"],
    ["9", "Self-employment threshold", threshold, `${filingStatus} threshold`],
    ["10", "Wages reducing SE threshold", wageBase, "Line 4"],
    ["11", "Remaining SE threshold", remainingSEThreshold, "max(0, line 9 - line 10)"],
    ["12", "SE earnings over threshold", seExcess, "max(0, line 8 - line 11)"],
    ["13", "Additional Medicare Tax on self-employment", seTax, "round(line 12 × 0.009)"],
  ] as const) audit.record("Form 8959", line, description, value, formula);
  const totalEarnings = wageBase.plus(effectiveSE);
  const excessOverThreshold = wageExcess.plus(seExcess);
  const additionalMedicareTax = wageTax.plus(seTax);
  audit.record("Form 8959", "18", "Additional Medicare Tax", additionalMedicareTax,
    "Lines 7 + 13 (each separately rounded at 0.009); no RRTA compensation supplied");

  // Part V: Employers withhold Additional Medicare Tax
  // on wages over $200K regardless of filing status. Credit for excess withholding.
  const regularMedicareRate = new Decimal("0.0145");
  const totalMedicareWithheld = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.medicareWithheld)),
    new Decimal(0)
  );
  const roundedMedicareWithheld = roundDollar(totalMedicareWithheld);
  const roundedMedicareWages = roundDollar(medicareWages);
  const expectedRegularMedicare = roundDollar(roundedMedicareWages.times(regularMedicareRate));
  const withholdingCredit = zeroFloor(roundedMedicareWithheld.minus(expectedRegularMedicare));
  audit.record("Form 8959", "19", "Medicare withholding", roundedMedicareWithheld, "Rounded sum W-2 box 6");
  audit.record("Form 8959", "20", "Medicare wages for withholding reconciliation", roundedMedicareWages, "Rounded sum W-2 box 5");
  audit.record("Form 8959", "21", "Regular Medicare withholding", expectedRegularMedicare, "Line 20 × 1.45%, rounded dollars");
  audit.record("Form 8959", "22", "Additional Medicare withholding on wages", withholdingCredit, "max(0, line 19 - line 21)");
  audit.record("Form 8959", "24", "Additional Medicare withholding credit", withholdingCredit, "Supported non-RRTA line 22 → Form 1040 line 25c");

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
