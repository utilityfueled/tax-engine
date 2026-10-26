/** Actual IRC32 claimant facts; spec/federal/eic-claimant-eligibility.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";

type Claimant = Pick<TaxYearInput["taxpayer"]["primary"], "dateOfBirth" | "employmentValidSsnIssuedByDueDate" | "tinIssuedByDueDate">;
export type EicClaimantInput = Pick<TaxYearInput, "standardDeductionFacts"> & {
  eic?: Pick<NonNullable<TaxYearInput["eic"]>, "claimantEligibility">;
  taxpayer: Pick<TaxYearInput["taxpayer"], "taxYear" | "filingStatus"> & { primary: Claimant; spouse?: Claimant };
};
export interface EicClaimantEligibilityResult {
  /** Covers only these claimant SSN, residency and relevant age source checks. */
  sourceFactsComplete: boolean;
  childlessAgeEligible: boolean | undefined;
  disqualificationReason?: string;
  lines: CalculatedLine[];
}

function date(value: string | undefined, label: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`EIC ${label} needs an actual calendar date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`EIC ${label} needs an actual calendar date`);
  return parsed;
}

function meetsAgeTest(birth: string, death: string | null | undefined, year: number, strict: boolean, who: string): boolean {
  const born = date(birth, `${who} birth date`);
  const yearEnd = date(`${year}-12-31`, "tax year end");
  if (born > yearEnd) throw new Error(`EIC ${who} birth date is after the return year`);
  if (strict && death === undefined) throw new Error(`EIC ${who} death status is unknown; confirm alive at year end or supply the actual death date`);
  const reference = death == null ? yearEnd : date(death, `${who} death date`);
  if (reference < born || reference.getUTCFullYear() !== year) throw new Error(`EIC ${who} death date must be within the return year and on or after birth`);
  const twentyFive = new Date(Date.UTC(born.getUTCFullYear() + 25, born.getUTCMonth(), born.getUTCDate()));
  twentyFive.setUTCDate(twentyFive.getUTCDate() - 1);
  const sixtyFive = new Date(Date.UTC(born.getUTCFullYear() + 65, born.getUTCMonth(), born.getUTCDate()));
  return reference >= twentyFive && reference < sixtyFive;
}

export function calculateEicClaimantEligibility(input: EicClaimantInput, childless: boolean): EicClaimantEligibilityResult {
  const { taxpayer, standardDeductionFacts: standard } = input;
  const facts = input.eic?.claimantEligibility;
  const joint = taxpayer.filingStatus === "married_filing_jointly";
  const strict = facts !== undefined || taxpayer.taxYear === 2026;
  if (joint && !taxpayer.spouse) throw new Error("EIC joint claimant requires the actual spouse");
  const filers = [taxpayer.primary, ...(joint && taxpayer.spouse ? [taxpayer.spouse] : [])];
  for (const filer of filers) {
    if (filer.employmentValidSsnIssuedByDueDate === true && filer.tinIssuedByDueDate === false) throw new Error("EIC timely work-authorized SSN conflicts with the actual untimely taxpayer ID answer");
  }
  const primaryKnownNonresident = standard?.nonresidentAlien === true || standard?.dualStatusAlien === true
    ? true : standard?.nonresidentAlien === false && standard.dualStatusAlien === false ? false : undefined;
  if (facts === undefined && taxpayer.taxYear === 2026) {
    // A known negative is sufficient for zero, but never supplies other unknown
    // affirmative eligibility facts. An explicitly supplied packet still takes
    // the full reconciliation path below, including for a zero credit.
    let reason: string | undefined;
    let age: boolean | undefined;
    if (filers.some(filer => filer.employmentValidSsnIssuedByDueDate === false)) {
      reason = "Each claimant, including both joint filers, must have a timely employment-valid SSN (Pub596 Rule2)";
    } else if (primaryKnownNonresident === true && (!joint || standard?.residentJointElection === false)) {
      reason = "A nonresident claimant requires a valid joint resident election (IRC32(c)(1)(D); Pub596 Rule4)";
    } else if (childless && standard?.primaryDeathDate !== undefined && (!joint || standard.spouseDeathDate !== undefined)) {
      const primary = meetsAgeTest(taxpayer.primary.dateOfBirth, standard.primaryDeathDate, taxpayer.taxYear, true, "primary");
      const spouse = joint && taxpayer.spouse ? meetsAgeTest(taxpayer.spouse.dateOfBirth, standard.spouseDeathDate, taxpayer.taxYear, true, "spouse") : false;
      age = primary || spouse;
      if (!age) reason = "Childless claimant age test is not met by either relevant filer (Pub596 Rule11)";
    }
    if (reason) {
      const audit = new AuditTrail();
      audit.record("EIC", "claimantSources", "Known claimant restriction; remaining sources unverified", new Decimal(0), reason);
      return { sourceFactsComplete: false, childlessAgeEligible: age, disqualificationReason: reason, lines: audit.getLines() };
    }
  }
  if (strict) {
    if (facts?.sourceTaxYear !== taxpayer.taxYear) throw new Error("EIC claimant source year must match the return year");
    if (!facts.sourceReference?.trim() || facts.sourceFactsConfirmed !== true) throw new Error("EIC claimant sources require an actual reference and confirmation");
    if (typeof facts.primaryNonresidentAlienDuringYear !== "boolean" || (joint && typeof facts.spouseNonresidentAlienDuringYear !== "boolean")) throw new Error("EIC nonresident history is unknown for a required claimant");
  }
  if (!joint && facts?.spouseNonresidentAlienDuringYear !== undefined) throw new Error("EIC spouse claimant sources require a joint return");
  if (facts?.primaryNonresidentAlienDuringYear !== undefined && primaryKnownNonresident !== undefined && facts.primaryNonresidentAlienDuringYear !== primaryKnownNonresident) throw new Error("EIC primary nonresident history conflicts with the actual household residency facts");
  if (facts?.residentJointElection !== undefined && standard?.residentJointElection !== undefined && facts.residentJointElection !== standard.residentJointElection) throw new Error("EIC resident joint election must reconcile with the actual household election");
  const election = facts?.residentJointElection ?? standard?.residentJointElection;
  if (election === true && !joint) throw new Error("EIC resident joint election requires a married joint return");

  for (const filer of filers) {
    if (strict && typeof filer.employmentValidSsnIssuedByDueDate !== "boolean") throw new Error("EIC required claimant SSN eligibility is unknown");
  }
  const nonresident = (facts?.primaryNonresidentAlienDuringYear ?? primaryKnownNonresident) === true || (joint && facts?.spouseNonresidentAlienDuringYear === true);
  if (nonresident && joint && election === undefined) throw new Error("EIC nonresident claimant requires a known actual joint resident election answer");
  const disqualificationReason = filers.some(filer => filer.employmentValidSsnIssuedByDueDate === false)
    ? "Each claimant, including both joint filers, must have a timely employment-valid SSN (Pub596 Rule2)"
    : nonresident && (!joint || election !== true)
      ? "A nonresident claimant requires a valid joint resident election (IRC32(c)(1)(D); Pub596 Rule4)" : undefined;

  let childlessAgeEligible = true;
  if (childless) {
    // Check both actual dates before OR; one spouse passing does not erase a contradictory source.
    const primary = meetsAgeTest(taxpayer.primary.dateOfBirth, standard?.primaryDeathDate, taxpayer.taxYear, strict, "primary");
    const spouse = joint && taxpayer.spouse ? meetsAgeTest(taxpayer.spouse.dateOfBirth, standard?.spouseDeathDate, taxpayer.taxYear, strict, "spouse") : false;
    childlessAgeEligible = primary || spouse;
  }
  const audit = new AuditTrail();
  audit.record("EIC", "claimantSources", "Claimant SSN, residency and age source checks", new Decimal(strict ? 1 : 0),
    strict ? "Actual claimant sources reconciled; other EIC eligibility rules remain separate" : "Historical claimant source completeness unverified; known source restrictions applied", {
      "Joint claimant SSNs required": joint ? "Yes" : "No",
      "Known claimant restriction": disqualificationReason ? "Yes" : "No",
      "Childless age test": childless ? childlessAgeEligible ? "Met by a claimant" : "Not met" : "Not applicable",
    });
  return { sourceFactsComplete: strict, childlessAgeEligible, disqualificationReason, lines: audit.getLines() };
}
