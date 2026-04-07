/**
 * New Jersey NJ-1040 personal exemptions computation.
 * Spec: spec/state/nj-1040-exemptions.yaml
 *
 * Computes total personal exemptions (Lines 30-37) that reduce NJ gross income
 * to arrive at NJ taxable income. NJ has no standard deduction — exemptions
 * serve a similar role.
 */

import Decimal from "decimal.js";
import { getNJResidentConstants, type FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface NJ1040ExemptionsInput {
  filingStatus: FilingStatus;
  taxYear: number;
  /** Is the taxpayer age 65 or older by Dec 31? */
  taxpayerAge65OrOlder?: boolean;
  /** Is the spouse age 65 or older by Dec 31? (only applies to MFJ) */
  spouseAge65OrOlder?: boolean;
  /** Is the taxpayer blind or disabled? */
  taxpayerBlindOrDisabled?: boolean;
  /** Is the spouse blind or disabled? (only applies to MFJ) */
  spouseBlindOrDisabled?: boolean;
  /** Is the taxpayer an honorably discharged veteran? */
  isVeteran?: boolean;
  /** Is the spouse/CU partner an honorably discharged veteran? (joint return only) */
  spouseIsVeteran?: boolean;
  /** Number of qualifying dependents */
  dependentCount?: number;
  /** Number of dependents who are full-time college students under age 22 */
  collegeDependentCount?: number;
}

export interface NJ1040ExemptionsResult {
  selfExemption: Decimal;
  spouseExemption: Decimal;
  age65Exemption: Decimal;
  blindDisabledExemption: Decimal;
  veteranExemption: Decimal;
  dependentExemption: Decimal;
  collegeDependentExemption: Decimal;
  totalExemptions: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040Exemptions(
  input: NJ1040ExemptionsInput
): NJ1040ExemptionsResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 exemption amounts");

  const audit = new AuditTrail();
  const isMFJ = input.filingStatus === "married_filing_jointly";
  const exemptionAmounts = getNJResidentConstants(input.taxYear).exemptionAmounts;

  // Line 30: Self exemption — always $1,000
  const selfExemption = exemptionAmounts.self;
  audit.record(
    "NJ-1040",
    "30",
    "Regular exemption — self",
    selfExemption,
    "$1,000 for all filers"
  );

  // Line 31: Spouse exemption — $1,000 if MFJ only
  const spouseExemption = isMFJ ? exemptionAmounts.spouse : d(0);
  audit.record(
    "NJ-1040",
    "31",
    "Regular exemption — spouse/CU partner",
    spouseExemption,
    "$1,000 if married filing jointly; $0 otherwise",
    { "Filing status": input.filingStatus }
  );

  // Line 32: Age 65+ exemption
  let age65Count = 0;
  if (input.taxpayerAge65OrOlder) age65Count++;
  if (isMFJ && input.spouseAge65OrOlder) age65Count++;
  const age65Exemption = exemptionAmounts.age65OrOlder.times(age65Count);
  audit.record(
    "NJ-1040",
    "32",
    "Age 65 or older exemption",
    age65Exemption,
    "$1,000 for each qualifying taxpayer/spouse who is 65+",
    { "Qualifying count": age65Count.toString() }
  );

  // Line 33: Blind or disabled exemption
  let blindCount = 0;
  if (input.taxpayerBlindOrDisabled) blindCount++;
  if (isMFJ && input.spouseBlindOrDisabled) blindCount++;
  const blindDisabledExemption = exemptionAmounts.blindOrDisabled.times(blindCount);
  audit.record(
    "NJ-1040",
    "33",
    "Blind or disabled exemption",
    blindDisabledExemption,
    "$1,000 for each qualifying taxpayer/spouse who is blind or disabled",
    { "Qualifying count": blindCount.toString() }
  );

  // Line 34: Veteran exemption
  let veteranCount = 0;
  if (input.isVeteran) veteranCount++;
  if (isMFJ && input.spouseIsVeteran) veteranCount++;
  const veteranExemption = exemptionAmounts.veteran.times(veteranCount);
  audit.record(
    "NJ-1040",
    "34",
    "Veteran exemption",
    veteranExemption,
    "$6,000 for each qualifying veteran on the return",
    { "Qualifying veteran count": veteranCount.toString() }
  );

  // Line 35: Qualifying dependents
  const depCount = input.dependentCount ?? 0;
  const dependentExemption = exemptionAmounts.dependent.times(depCount);
  audit.record(
    "NJ-1040",
    "35",
    "Qualifying dependents exemption",
    dependentExemption,
    "Number of qualifying dependents × $1,500",
    { "Dependent count": depCount.toString() }
  );

  // Line 36: College-attending dependents additional exemption
  const collegeCount = input.collegeDependentCount ?? 0;
  const collegeDependentExemption = exemptionAmounts.collegeDependent.times(
    collegeCount
  );
  audit.record(
    "NJ-1040",
    "36",
    "College-attending dependents additional exemption",
    collegeDependentExemption,
    "Number of dependents who are full-time students under age 22 × $1,000",
    { "College dependent count": collegeCount.toString() }
  );

  // Line 37: Total personal exemptions
  const totalExemptions = sum(
    selfExemption,
    spouseExemption,
    age65Exemption,
    blindDisabledExemption,
    veteranExemption,
    dependentExemption,
    collegeDependentExemption
  );
  audit.record(
    "NJ-1040",
    "37",
    "Total personal exemptions",
    totalExemptions,
    "Sum of Lines 30 through 36",
    {
      "Line 30": selfExemption,
      "Line 31": spouseExemption,
      "Line 32": age65Exemption,
      "Line 33": blindDisabledExemption,
      "Line 34": veteranExemption,
      "Line 35": dependentExemption,
      "Line 36": collegeDependentExemption,
    }
  );

  return {
    selfExemption,
    spouseExemption,
    age65Exemption,
    blindDisabledExemption,
    veteranExemption,
    dependentExemption,
    collegeDependentExemption,
    totalExemptions,
    lines: audit.getLines(),
  };
}
