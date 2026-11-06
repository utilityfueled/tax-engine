/** Actual identity eligibility for Schedule 8812; spec/federal/form-8812.yaml. */
import type { TaxYearInput } from "@/models/inputs.js";

export function calculateChildCreditEligibility(input: TaxYearInput): {qualifyingChildren:number;otherDependents:number} {
  const {taxpayer} = input;
  const strict = taxpayer.taxYear === 2026;
  const joint = taxpayer.filingStatus === "married_filing_jointly";
  const ctcClaims = taxpayer.dependents.filter(dep => dep.qualifiesForCTC);
  const odcClaims = taxpayer.dependents.filter(dep => dep.qualifiesForODC);
  if (ctcClaims.length + odcClaims.length === 0) return {qualifyingChildren:0,otherDependents:0};
  if (strict && taxpayer.dependents.some(dep => dep.qualifiesForCTC && dep.qualifiesForODC)) throw new Error("A dependent cannot be claimed for both CTC and ODC");
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
