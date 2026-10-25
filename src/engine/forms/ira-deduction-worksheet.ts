/** Pub590-A Worksheets1-2 and AppendixB2. Spec: ira-deduction-worksheet.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import { getConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface IraDeductionInput {
  filingStatus: FilingStatus;
  taxYear: number;
  /** Actual Worksheet1-1 line7 or AppendixB Worksheet1 line19. */
  magi: string | Decimal;
  contributions: string | Decimal;
  isActiveParticipant: boolean;
  isSpouseActiveParticipant: boolean;
  age50OrOlder: boolean;
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
  /** Actual Worksheet1-2 line5 after SE deductions and applicable spousal allocation. */
  compensation?: string | Decimal;
  /** Actual annual contributions to a section501(c)(18) plan, including known zero. */
  section501c18Contributions?: string | Decimal;
}

export interface IraDeductionResult {
  contributionLimit: Decimal;
  compensationLimit?: Decimal;
  contributions: Decimal;
  eligibleContributions: Decimal;
  deductibleAmount: Decimal;
  /** Valid nondeductible contribution; does not include excess contributions. */
  nondeductibleAmount: Decimal;
  excessContributions: Decimal;
  sourceFactsVerified: boolean;
  fullyPhasedOut: boolean;
  phaseOutApplied: boolean;
  lines: CalculatedLine[];
}

export function calculateIraDeduction(input: IraDeductionInput): IraDeductionResult {
  const audit = new AuditTrail();
  const ira = getConstants(input.taxYear).iraDeduction;
  const amount = (value: string | Decimal, name: string, signed = false): Decimal => {
    const result = d(value);
    if (!result.isFinite()) throw new Error(`IRA ${name} must be finite`);
    if (!signed && result.lt(0)) throw new Error(`IRA ${name} must be nonnegative`);
    return result;
  };
  const magi = amount(input.magi, "MAGI", true);
  const contributions = amount(input.contributions, "contributions");
  const isMfs = input.filingStatus === "married_filing_separately";
  const strict = input.taxYear >= 2026;
  if (strict && input.compensation === undefined) throw new Error("IRA actual compensation is required");
  if (strict && input.section501c18Contributions === undefined) throw new Error("IRA actual section501c18 contributions are required");
  if (strict && isMfs && input.livedWithSpouseAtAnyTimeDuringYear === undefined) {
    throw new Error("IRA actual MFS living arrangement is required");
  }
  for (const key of ["isActiveParticipant", "isSpouseActiveParticipant", "age50OrOlder"] as const) {
    if (typeof input[key] !== "boolean") throw new Error(`IRA actual ${key} is required`);
  }
  const compensationLimit = input.compensation === undefined ? undefined : amount(input.compensation, "compensation");
  const planContribution = input.section501c18Contributions === undefined
    ? new Decimal(0) : amount(input.section501c18Contributions, "section501c18 contributions");
  const annualLimit = ira.contributionLimit.plus(input.age50OrOlder ? ira.catchUpContribution : new Decimal(0));
  const contributionLimit = zeroFloor(annualLimit.minus(planContribution));
  const eligibleContributions = Decimal.min(contributions, contributionLimit, compensationLimit ?? contributionLimit);
  const excessContributions = contributions.minus(eligibleContributions);
  const sourceFactsVerified = compensationLimit !== undefined && input.section501c18Contributions !== undefined
    && (!isMfs || input.livedWithSpouseAtAnyTimeDuringYear !== undefined);
  audit.record("IRA Deduction Worksheet", "contributionLimit", "Annual IRA contribution limit after section501c18", contributionLimit,
    input.section501c18Contributions === undefined
      ? `${input.taxYear} indexed annual limit ${annualLimit}; legacy section501c18 source is unknown`
      : `${input.taxYear} indexed annual limit ${annualLimit} minus actual section501c18 contribution ${planContribution}`);
  if (compensationLimit !== undefined) {
    audit.record("IRA Deduction Worksheet", "5", "Actual eligible compensation", compensationLimit,
      "Actual compensation after SE-tax/retirement deductions and applicable joint lower-earner allocation");
  }
  audit.record("IRA Deduction Worksheet", "6", "Contributions within the annual limit", Decimal.min(contributions, contributionLimit),
    "min(actual contributions, annual limit after section501c18)");

  const mfsLivedApart = isMfs && input.livedWithSpouseAtAnyTimeDuringYear === false;
  const effectiveStatus: FilingStatus = mfsLivedApart ? "single" : input.filingStatus;
  // QSS uses the joint active-participant thresholds, but is not a joint
  // return with a current spouse for the nonparticipant-spouse rule.
  const effectivelyMarried = input.filingStatus === "married_filing_jointly" || (isMfs && !mfsLivedApart);
  const needsPhaseOut = input.isActiveParticipant || (effectivelyMarried && input.isSpouseActiveParticipant);
  let phaseOutApplied = false;
  let fullyPhasedOut = false;
  let deductionLimit = contributionLimit;
  if (needsPhaseOut) {
    const phaseOutStart = input.isActiveParticipant || isMfs
      ? ira.activeParticipantPhaseOutStart[effectiveStatus] : ira.spouseActiveParticipantPhaseOutStart;
    const phaseOutRange = input.isActiveParticipant || isMfs
      ? ira.activeParticipantPhaseOutRange[effectiveStatus] : ira.spouseActiveParticipantPhaseOutRange;
    const ceiling = phaseOutStart.plus(phaseOutRange);
    audit.record("IRA Deduction Worksheet", "1", "Applicable phaseout ceiling", ceiling, "Indexed source threshold plus phaseout range");
    audit.record("IRA Deduction Worksheet", "2", "Actual IRA modified AGI", magi, "Worksheet1-1 line7 or AppendixB Worksheet1 line19");
    const remaining = zeroFloor(ceiling.minus(magi));
    audit.record("IRA Deduction Worksheet", "3", "Remaining phaseout interval", remaining, "max(0,line1-line2)");
    if (magi.gte(ceiling)) {
      phaseOutApplied = true;
      fullyPhasedOut = true;
      deductionLimit = new Decimal(0);
    } else if (magi.gt(phaseOutStart)) {
      phaseOutApplied = true;
      // The IRS rounds the REMAINING limit up, not the reduction down/up.
      const rawLimit = remaining.times(annualLimit).div(phaseOutRange);
      deductionLimit = Decimal.max(new Decimal(200), rawLimit.div(10).ceil().times(10));
    }
    audit.record("IRA Deduction Worksheet", "4", "Deduction limit after phaseout", deductionLimit,
      fullyPhasedOut ? "MAGI reaches ceiling; no minimum deduction"
        : phaseOutApplied ? "max(200,ceil((ceiling-MAGI)*indexedAnnualLimit/range/10)*10)" : "Full deduction limit below phaseout");
  }
  const deductibleAmount = Decimal.min(eligibleContributions, deductionLimit);
  const nondeductibleAmount = eligibleContributions.minus(deductibleAmount);
  audit.record("IRA Deduction Worksheet", "7", "Deductible contribution", deductibleAmount,
    "min(phaseout limit, actual compensation, annual limit, actual contribution)");
  audit.record("IRA Deduction Worksheet", "8", "Valid nondeductible contribution", nondeductibleAmount,
    "Allowable contribution minus deduction; excess contributions excluded");
  audit.record("IRA Deduction Worksheet", "excessContributions", "Excess contributions requiring separate treatment", excessContributions,
    "Actual contribution minus allowable annual/compensation amount; not Form8606 basis");
  audit.record("IRA Deduction Worksheet", "deductibleAmount", "Deductible traditional IRA contribution", deductibleAmount,
    "Worksheet1-2 line7", { "MAGI": magi, "Contribution limit": contributionLimit,
      "Contributions": contributions, "Eligible contributions": eligibleContributions });
  return { contributionLimit, compensationLimit, contributions, eligibleContributions, deductibleAmount,
    nondeductibleAmount, excessContributions, sourceFactsVerified, fullyPhasedOut, phaseOutApplied, lines: audit.getLines() };
}
