/**
 * California Form 540 exemption credits.
 * Spec: spec/state/ca-form-540-exemption-credits.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

export interface CAForm540ExemptionCreditConstants {
  personalBlindSeniorCredit: Decimal;
  dependentCredit: Decimal;
  agiLimitThreshold: Record<FilingStatus, Decimal>;
  agiReductionDivisor: Record<FilingStatus, Decimal>;
  reductionAmountPerUnit: Decimal;
}

export const CA_FORM_540_EXEMPTION_CREDIT_CONSTANTS: Record<number, CAForm540ExemptionCreditConstants> = {
  2025: {
    personalBlindSeniorCredit: new Decimal(153),
    dependentCredit: new Decimal(475),
    agiLimitThreshold: {
      single: new Decimal(252203),
      married_filing_jointly: new Decimal(504411),
      married_filing_separately: new Decimal(252203),
      head_of_household: new Decimal(378310),
      qualifying_surviving_spouse: new Decimal(504411),
    },
    agiReductionDivisor: {
      single: new Decimal(2500),
      married_filing_jointly: new Decimal(2500),
      married_filing_separately: new Decimal(1250),
      head_of_household: new Decimal(2500),
      qualifying_surviving_spouse: new Decimal(2500),
    },
    reductionAmountPerUnit: new Decimal(6),
  },
};

export interface CAForm540ExemptionCreditsInput {
  filingStatus: FilingStatus;
  federalAgi: Decimal | string | number;
  personalExemptionCount: number;
  blindExemptionCount: number;
  seniorExemptionCount: number;
  dependentExemptionCount: number;
  taxYear: number;
}

export interface CAForm540ExemptionCreditsResult {
  filingStatus: FilingStatus;
  federalAgi: Decimal;
  personalExemptionCount: number;
  blindExemptionCount: number;
  seniorExemptionCount: number;
  dependentExemptionCount: number;
  personalExemptionAmount: Decimal;
  blindExemptionAmount: Decimal;
  seniorExemptionAmount: Decimal;
  dependentExemptionAmount: Decimal;
  exemptionAmount: Decimal;
  agiLimitThreshold: Decimal;
  agiReductionDivisor: Decimal;
  agiExcess: Decimal;
  agiReductionUnits: Decimal;
  perExemptionReduction: Decimal;
  personalBlindSeniorExemptionCount: Decimal;
  personalBlindSeniorReductionAmount: Decimal;
  personalBlindSeniorTotalAmount: Decimal;
  personalBlindSeniorAllowedAmount: Decimal;
  dependentReductionAmount: Decimal;
  dependentAllowedAmount: Decimal;
  line32ExemptionCredits: Decimal;
  lines: CalculatedLine[];
}

function validateCount(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CA Form 540 exemption counts must be non-negative whole numbers");
  }
}

function count(value: number): Decimal {
  validateCount(value);
  return new Decimal(value);
}

export function calculateCAForm540ExemptionCredits(
  input: CAForm540ExemptionCreditsInput
): CAForm540ExemptionCreditsResult {
  const constants = CA_FORM_540_EXEMPTION_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`CA Form 540 exemption credit constants not available for ${input.taxYear}`);
  }

  const personalExemptionCount = count(input.personalExemptionCount);
  const blindExemptionCount = count(input.blindExemptionCount);
  const seniorExemptionCount = count(input.seniorExemptionCount);
  const dependentExemptionCount = count(input.dependentExemptionCount);
  const federalAgi = d(input.federalAgi);
  const agiLimitThreshold = constants.agiLimitThreshold[input.filingStatus];
  const agiReductionDivisor = constants.agiReductionDivisor[input.filingStatus];

  const audit = new AuditTrail();

  const personalExemptionAmount = personalExemptionCount.times(constants.personalBlindSeniorCredit);
  audit.record(
    "CA-540-EX",
    "7",
    "Personal exemption credit amount",
    personalExemptionAmount,
    "Form 540 line 7 box count × $153",
    {
      "Personal exemption count": personalExemptionCount,
      "Credit amount": constants.personalBlindSeniorCredit,
    }
  );

  const blindExemptionAmount = blindExemptionCount.times(constants.personalBlindSeniorCredit);
  audit.record(
    "CA-540-EX",
    "8",
    "Blind exemption credit amount",
    blindExemptionAmount,
    "Form 540 line 8 box count × $153",
    {
      "Blind exemption count": blindExemptionCount,
      "Credit amount": constants.personalBlindSeniorCredit,
    }
  );

  const seniorExemptionAmount = seniorExemptionCount.times(constants.personalBlindSeniorCredit);
  audit.record(
    "CA-540-EX",
    "9",
    "Senior exemption credit amount",
    seniorExemptionAmount,
    "Form 540 line 9 box count × $153",
    {
      "Senior exemption count": seniorExemptionCount,
      "Credit amount": constants.personalBlindSeniorCredit,
    }
  );

  const dependentExemptionAmount = dependentExemptionCount.times(constants.dependentCredit);
  audit.record(
    "CA-540-EX",
    "10",
    "Dependent exemption credit amount",
    dependentExemptionAmount,
    "Form 540 line 10 box count × $475",
    {
      "Dependent exemption count": dependentExemptionCount,
      "Credit amount": constants.dependentCredit,
    }
  );

  const exemptionAmount = sum(
    personalExemptionAmount,
    blindExemptionAmount,
    seniorExemptionAmount,
    dependentExemptionAmount
  );
  audit.record(
    "CA-540-EX",
    "11",
    "Exemption amount",
    exemptionAmount,
    "Line 7 + Line 8 + Line 9 + Line 10",
    {
      "Line 7": personalExemptionAmount,
      "Line 8": blindExemptionAmount,
      "Line 9": seniorExemptionAmount,
      "Line 10": dependentExemptionAmount,
    }
  );

  audit.record("CA-540-EX", "32a", "Federal AGI for the AGI limitation worksheet", federalAgi, "Form 540 line 13 federal AGI");

  audit.record(
    "CA-540-EX",
    "32b",
    "AGI limitation threshold",
    agiLimitThreshold,
    "Use the published threshold for the filing status",
    {
      "Filing status": input.filingStatus,
      "Reduction divisor": agiReductionDivisor.toString(),
    }
  );

  const agiExcess = zeroFloor(federalAgi.minus(agiLimitThreshold));
  audit.record(
    "CA-540-EX",
    "32c",
    "AGI excess over the threshold",
    agiExcess,
    "max(0, Line 32a - Line 32b)",
    {
      "Line 32a": federalAgi,
      "Line 32b": agiLimitThreshold,
    }
  );

  const agiReductionUnits = agiExcess.isZero() ? new Decimal(0) : agiExcess.div(agiReductionDivisor).ceil();
  audit.record(
    "CA-540-EX",
    "32d",
    "AGI reduction units",
    agiReductionUnits,
    "If Line 32c is greater than 0, divide by the filing-status divisor and round up to the next whole number; otherwise 0",
    {
      "Line 32c": agiExcess,
      Divisor: agiReductionDivisor.toString(),
    }
  );

  const perExemptionReduction = agiReductionUnits.times(constants.reductionAmountPerUnit);
  audit.record(
    "CA-540-EX",
    "32e",
    "Per-exemption reduction amount",
    perExemptionReduction,
    "Line 32d × $6",
    {
      "Line 32d": agiReductionUnits,
      "Reduction amount per unit": constants.reductionAmountPerUnit,
    }
  );

  const personalBlindSeniorExemptionCount = sum(
    personalExemptionCount,
    blindExemptionCount,
    seniorExemptionCount
  );
  audit.record(
    "CA-540-EX",
    "32f",
    "Total personal, blind, and senior exemption count",
    personalBlindSeniorExemptionCount,
    "Line 7 count + Line 8 count + Line 9 count"
  );

  const personalBlindSeniorReductionAmount = perExemptionReduction.times(personalBlindSeniorExemptionCount);
  audit.record(
    "CA-540-EX",
    "32g",
    "Reduction against the personal, blind, and senior pool",
    personalBlindSeniorReductionAmount,
    "Line 32e × Line 32f",
    {
      "Line 32e": perExemptionReduction,
      "Line 32f": personalBlindSeniorExemptionCount,
    }
  );

  const personalBlindSeniorTotalAmount = sum(
    personalExemptionAmount,
    blindExemptionAmount,
    seniorExemptionAmount
  );
  audit.record(
    "CA-540-EX",
    "32h",
    "Personal, blind, and senior exemption pool before limitation",
    personalBlindSeniorTotalAmount,
    "Line 7 + Line 8 + Line 9",
    {
      "Line 7": personalExemptionAmount,
      "Line 8": blindExemptionAmount,
      "Line 9": seniorExemptionAmount,
    }
  );

  const personalBlindSeniorAllowedAmount = zeroFloor(
    personalBlindSeniorTotalAmount.minus(personalBlindSeniorReductionAmount)
  );
  audit.record(
    "CA-540-EX",
    "32i",
    "Allowed personal, blind, and senior exemption pool after AGI limitation",
    personalBlindSeniorAllowedAmount,
    "max(0, Line 32h - Line 32g)",
    {
      "Line 32h": personalBlindSeniorTotalAmount,
      "Line 32g": personalBlindSeniorReductionAmount,
    }
  );

  audit.record(
    "CA-540-EX",
    "32j",
    "Dependent exemption count",
    dependentExemptionCount,
    "Form 540 line 10 box count"
  );

  const dependentReductionAmount = perExemptionReduction.times(dependentExemptionCount);
  audit.record(
    "CA-540-EX",
    "32k",
    "Reduction against the dependent exemption pool",
    dependentReductionAmount,
    "Line 32e × Line 32j",
    {
      "Line 32e": perExemptionReduction,
      "Line 32j": dependentExemptionCount,
    }
  );

  audit.record(
    "CA-540-EX",
    "32l",
    "Dependent exemption pool before limitation",
    dependentExemptionAmount,
    "Line 10"
  );

  const dependentAllowedAmount = zeroFloor(dependentExemptionAmount.minus(dependentReductionAmount));
  audit.record(
    "CA-540-EX",
    "32m",
    "Allowed dependent exemption pool after AGI limitation",
    dependentAllowedAmount,
    "max(0, Line 32l - Line 32k)",
    {
      "Line 32l": dependentExemptionAmount,
      "Line 32k": dependentReductionAmount,
    }
  );

  const line32ExemptionCredits = sum(personalBlindSeniorAllowedAmount, dependentAllowedAmount);
  audit.record(
    "CA-540-EX",
    "32",
    "Form 540 line 32 exemption credits",
    line32ExemptionCredits,
    "If AGI does not exceed the filing-status threshold, Line 11; otherwise Line 32i + Line 32m",
    {
      "Line 11": exemptionAmount,
      "Line 32i": personalBlindSeniorAllowedAmount,
      "Line 32m": dependentAllowedAmount,
    }
  );

  return {
    filingStatus: input.filingStatus,
    federalAgi,
    personalExemptionCount: input.personalExemptionCount,
    blindExemptionCount: input.blindExemptionCount,
    seniorExemptionCount: input.seniorExemptionCount,
    dependentExemptionCount: input.dependentExemptionCount,
    personalExemptionAmount,
    blindExemptionAmount,
    seniorExemptionAmount,
    dependentExemptionAmount,
    exemptionAmount,
    agiLimitThreshold,
    agiReductionDivisor,
    agiExcess,
    agiReductionUnits,
    perExemptionReduction,
    personalBlindSeniorExemptionCount,
    personalBlindSeniorReductionAmount,
    personalBlindSeniorTotalAmount,
    personalBlindSeniorAllowedAmount,
    dependentReductionAmount,
    dependentAllowedAmount,
    line32ExemptionCredits,
    lines: audit.getLines(),
  };
}
