/** Publication590-A individual and joint compensation coordination. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { getConstants } from "@/models/constants.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { calculateIraDeduction } from "./ira-deduction-worksheet.js";

export function calculateIraReturnWorksheet(input: TaxYearInput, magi: Decimal, magiSourcesVerified = true): NonNullable<TaxReturnResult["iraDeductionWorksheet"]> {
  const ws = input.iraDeductionWorksheet;
  if (!ws) throw new Error("IRA worksheet source facts are required");
  const { taxYear, filingStatus } = input.taxpayer;
  const joint = filingStatus === "married_filing_jointly";
  const actualKeys = ["primaryCompensation", "spouseCompensation", "primaryRothContributions", "spouseRothContributions", "primarySection501c18Contributions", "spouseSection501c18Contributions"] as const;
  const verified = taxYear >= 2026 || ws.sourceFactsConfirmed !== undefined || actualKeys.some(key => ws[key] !== undefined);
  if (verified && ws.sourceFactsConfirmed !== true) throw new Error("IRA source facts require confirmation");
  if (verified && !magiSourcesVerified) throw new Error("IRA actual complete modified AGI context is required");
  const actual = (key: typeof actualKeys[number]): Decimal | undefined => {
    const value = ws[key];
    if (value === undefined) {
      if (verified) throw new Error(`IRA actual ${key} is required`);
      return undefined;
    }
    const amount = d(value);
    if (!amount.isFinite() || amount.lt(0)) throw new Error(`IRA ${key} must be finite and nonnegative`);
    return amount;
  };
  const primaryCompensation = actual("primaryCompensation");
  const primaryPlan = actual("primarySection501c18Contributions");
  const primaryRoth = actual("primaryRothContributions");
  const spouseCompensation = joint ? actual("spouseCompensation") : undefined;
  const spousePlan = joint ? actual("spouseSection501c18Contributions") : undefined;
  const spouseRoth = joint ? actual("spouseRothContributions") : undefined;
  if (verified && joint && (ws.spouseContributions === undefined || ws.spouseIsActiveParticipant === undefined || !input.taxpayer.spouse)) {
    throw new Error("IRA joint source facts require actual spouse contributions, participation and identity");
  }
  if (verified && filingStatus === "married_filing_separately" && input.taxpayer.livedWithSpouseAtAnyTimeDuringYear !== false && ws.spouseIsActiveParticipant === undefined) {
    throw new Error("IRA separate-return source facts require actual spouse participation");
  }
  if (!joint && d(ws.spouseContributions).gt(0)) throw new Error("IRA spouse contributions require a joint return");
  const age50 = (owner: "primary" | "spouse"): boolean => {
    const override = owner === "primary" ? ws.primaryAge50OrOlder : ws.spouseAge50OrOlder;
    const person = input.taxpayer[owner];
    if (override !== undefined) return override;
    if (!person || !/^\d{4}-\d{2}-\d{2}$/.test(person.dateOfBirth)) throw new Error("IRA actual date of birth is required");
    // Age attained on the day before the birthday; January1 reaches50 on Dec31.
    const birth = new Date(`${person.dateOfBirth}T00:00:00Z`);
    if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0,10) !== person.dateOfBirth) throw new Error("IRA actual date of birth is invalid");
    const birthday = new Date(birth); birthday.setUTCFullYear(birth.getUTCFullYear()+50);
    return birthday.getTime()-86400000 <= Date.UTC(taxYear,11,31);
  };
  const compensationFor = (own: Decimal | undefined, other: Decimal | undefined, otherTraditional: string | undefined, otherRoth: Decimal | undefined): Decimal | undefined => {
    if (own === undefined || other === undefined || !joint || !own.lt(other)) return own;
    return zeroFloor(sum(own,other).minus(d(otherTraditional)).minus(otherRoth ?? 0));
  };
  const calculate = (owner: "primary" | "spouse") => {
    const primary = owner === "primary";
    const roth = primary ? primaryRoth : spouseRoth;
    const contributions = primary ? ws.primaryContributions : ws.spouseContributions ?? "0";
    const plan = primary ? primaryPlan : spousePlan;
    const older = age50(owner);
    const annual = getConstants(taxYear).iraDeduction.contributionLimit.plus(older ? getConstants(taxYear).iraDeduction.catchUpContribution : 0).minus(plan ?? 0);
    if (verified && roth?.gt(0) && d(contributions).plus(roth).gt(annual)) throw new Error("IRA mixed traditional/Roth excess requires actual excess-contribution allocation");
    const result = calculateIraDeduction({ taxYear,filingStatus,magi,contributions,
      isActiveParticipant:primary ? ws.primaryIsActiveParticipant : ws.spouseIsActiveParticipant ?? false,
      isSpouseActiveParticipant:primary ? ws.spouseIsActiveParticipant ?? false : ws.primaryIsActiveParticipant,
      age50OrOlder:older,livedWithSpouseAtAnyTimeDuringYear:input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
      compensation:primary ? compensationFor(primaryCompensation,spouseCompensation,ws.spouseContributions,spouseRoth)
        : compensationFor(spouseCompensation,primaryCompensation,ws.primaryContributions,primaryRoth),
      section501c18Contributions:plan });
    return { ...result,sourceFactsVerified:verified && magiSourcesVerified && result.sourceFactsVerified };
  };
  const primary = calculate("primary");
  const spouse = joint && d(ws.spouseContributions).gt(0) ? calculate("spouse") : undefined;
  return { magi,primary,spouse,totalDeduction:primary.deductibleAmount.plus(spouse?.deductibleAmount ?? 0) };
}
