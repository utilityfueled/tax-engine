/** Actual identity eligibility for Schedule 8812; spec/federal/form-8812.yaml. */
import { z } from "zod";
import type { TaxYearInput } from "@/models/inputs.js";

const birthDate = z.iso.date();

/** Compare supplied household identities without inventing one from arbitrary text. */
function knownHouseholdTin(value: string): string | undefined {
  return /^(?:[0-9]{9}|[0-9]{3}-[0-9]{2}-[0-9]{4})$/.test(value)
    ? value.replaceAll("-", "") : undefined;
}

export function calculateChildCreditEligibility(input: TaxYearInput): {qualifyingChildren:number;otherDependents:number} {
  const {taxpayer} = input;
  const strict = taxpayer.taxYear === 2026;
  const joint = taxpayer.filingStatus === "married_filing_jointly";
  const ctcClaims = taxpayer.dependents.filter(dep => dep.qualifiesForCTC);
  const odcClaims = taxpayer.dependents.filter(dep => dep.qualifiesForODC);
  if (ctcClaims.length + odcClaims.length === 0) return {qualifyingChildren:0,otherDependents:0};
  if (taxpayer.dependents.some(dep => dep.qualifiesForCTC && dep.qualifiesForODC)) throw new Error("A dependent cannot be claimed for both CTC and ODC");
  const suppliedTins = new Set<string>();
  for (const person of [taxpayer.primary, ...(taxpayer.spouse ? [taxpayer.spouse] : []), ...taxpayer.dependents]) {
    const tin = knownHouseholdTin(person.ssn);
    if (tin === undefined) continue;
    if (suppliedTins.has(tin)) throw new Error("Child-credit household members require distinct actual TINs");
    suppliedTins.add(tin);
  }
  const primarySsn = taxpayer.primary.employmentValidSsnIssuedByDueDate;
  const spouseSsn = taxpayer.spouse?.employmentValidSsnIssuedByDueDate;
  const primaryTin = taxpayer.primary.tinIssuedByDueDate ?? (primarySsn === true ? true : undefined);
  const spouseTin = taxpayer.spouse?.tinIssuedByDueDate ?? (spouseSsn === true ? true : undefined);
  if (strict && (primaryTin === undefined || (joint && spouseTin === undefined))) throw new Error("Taxpayer timely TIN eligibility is unknown for Schedule 8812");
  const parentsTinEligible = primaryTin !== false && (!joint || spouseTin !== false);
  const ssnKnownEligible = primarySsn === true || (joint && spouseSsn === true);
  const ssnKnownIneligible = primarySsn === false && (!joint || spouseSsn === false);
  if (strict && parentsTinEligible && ctcClaims.length > 0 && !ssnKnownEligible && !ssnKnownIneligible) throw new Error("Taxpayer employment-valid SSN eligibility is unknown for Schedule 8812");
  const parentsCtcEligible = parentsTinEligible && (strict ? ssnKnownEligible : !ssnKnownIneligible);
  let qualifyingChildren = 0;
  for (const child of ctcClaims) {
    const knownBirthDate = birthDate.safeParse(child.dateOfBirth).success;
    if (strict || (taxpayer.taxYear === 2025 && knownBirthDate)) {
      const year = taxpayer.taxYear;
      if (!birthDate.safeParse(child.dateOfBirth).success || child.dateOfBirth > `${year}-12-31`) {
        throw new Error("Schedule 8812 requires a valid birth date for a claimed qualifying child");
      }
      // Rev. Rul. 2003-72 uses the child's birthday for section 24.
      if (child.dateOfBirth <= `${year - 17}-12-31`) {
        throw new Error("Schedule 8812 CTC requires a child under age 17 at year end");
      }
    }
    if (!parentsCtcEligible) continue;
    if (strict && child.ctcSsnEligible === undefined) throw new Error("Qualifying child SSN eligibility is unknown for Schedule 8812");
    if (child.ctcSsnEligible !== false) qualifyingChildren++;
  }
  let otherDependents = 0;
  for (const dependent of odcClaims) {
    if (!parentsTinEligible) continue;
    if (strict && dependent.odcTinEligible === undefined) throw new Error("Other dependent TIN eligibility is unknown for Schedule 8812");
    if (dependent.odcTinEligible !== false) otherDependents++;
  }
  return {qualifyingChildren,otherDependents};
}
