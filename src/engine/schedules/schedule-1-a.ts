/** Schedule 1-A — Additional Deductions. Spec: spec/federal/schedule-1-a.yaml */
import Decimal from "decimal.js";
import { calculateVehicleRefinancing } from "@/engine/forms/vehicle-refinancing.js";
import { Schedule1ASchema, type Schedule1AInput, type Taxpayer } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, sum, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Schedule1AParams {
  taxpayer: Taxpayer;
  agi: Decimal;
  foreignExcludedIncome: Decimal;
  facts: Schedule1AInput;
  /** Set only after the canonical return resolver validates actual source links. */
  canonicalSourcesVerified?: boolean;
  standardDeductionFacts?: { primaryDeathDate?: string | null; spouseDeathDate?: string | null };
}
export interface Schedule1AResult {
  magi: Decimal;
  tipsDeduction: Decimal;
  overtimeDeduction: Decimal;
  vehicleInterestDeduction: Decimal;
  seniorDeduction: Decimal;
  totalDeduction: Decimal;
  lines: CalculatedLine[];
}

export function calculateSchedule1A(input: Schedule1AParams): Schedule1AResult {
  const { taxpayer } = input;
  if (![2025, 2026].includes(taxpayer.taxYear)) throw new Error("Unsupported Schedule 1-A tax year");
  if (!input.agi.isFinite() || !input.foreignExcludedIncome.isFinite() || input.foreignExcludedIncome.lt(0)) throw new Error("Invalid Schedule 1-A MAGI inputs");
  const facts = Schedule1ASchema.parse(input.facts);
  const actualSources = facts.sourceTaxYear !== undefined || facts.sourceReference !== undefined || facts.sourceFactsConfirmed !== undefined || facts.allSourcesIncluded !== undefined
    || facts.employeeTips.some(entry => entry.w2SourceIds !== undefined || entry.form4137EmployerSourceId !== undefined || entry.reportingMethod !== undefined || entry.reportingSourceReference !== undefined)
    || facts.businessTips.some(entry => entry.businessSourceId !== undefined || entry.reportedTipSources !== undefined)
    || facts.overtime.some(entry => entry.compensationSourceId !== undefined || entry.reportingSourceReference !== undefined);
  if (actualSources) {
    if (facts.sourceTaxYear !== taxpayer.taxYear || !facts.sourceReference || facts.sourceFactsConfirmed !== true || facts.allSourcesIncluded !== true) throw new Error("Confirm the complete actual Schedule1-A sources for the return year.");
    if ((facts.employeeTips.length || facts.businessTips.length || facts.overtime.length) && input.canonicalSourcesVerified !== true) throw new Error("Actual Schedule1-A compensation sources require canonical source verification before calculating.");
  }
  const audit = new AuditTrail();
  const magi = sum(input.agi, input.foreignExcludedIncome, d(facts.excludedPuertoRicoIncome), d(facts.form4563Exclusion));
  audit.record("Schedule 1-A", "3", "Modified adjusted gross income", magi, "AGI + excluded Puerto Rico income + Form 2555 lines 45/50 + Form 4563 line 15");
  const marriedSeparate = taxpayer.filingStatus === "married_filing_separately";
  const joint = taxpayer.filingStatus === "married_filing_jointly";
  const ssnEligible = (owner: "primary" | "spouse"): boolean => {
    if (owner === "primary") return facts.primarySsnEligible;
    if (!taxpayer.spouse) throw new Error("Schedule 1-A spouse facts require a spouse");
    if (!joint) throw new Error("Schedule 1-A spouse deduction requires a joint return");
    if (facts.spouseSsnEligible === undefined) throw new Error("Schedule 1-A spouse SSN eligibility is unknown");
    return facts.spouseSsnEligible;
  };
  // Validate owner facts even if the filing-status limitation later produces zero.
  for (const entry of [...facts.employeeTips, ...facts.businessTips, ...facts.overtime]) ssnEligible(entry.owner);
  for (const owner of facts.seniorOwners) ssnEligible(owner);
  const tipEligible = (entry: Schedule1AInput["employeeTips"][number] | Schedule1AInput["businessTips"][number]) =>
    ssnEligible(entry.owner) && entry.eligibleOccupation && entry.voluntaryCashTips && entry.lawfulActivity && entry.meetsSstbRuleOrTransition;
  const employeeTips = sum(...facts.employeeTips.map((entry) => tipEligible(entry)
    ? Decimal.max(d(entry.qualifiedW2Tips), d(entry.qualifiedForm4137Tips)) : d("0")));
  const businessTips = sum(...facts.businessTips.map((entry) => {
    if (!tipEligible(entry)) return d("0");
    if (entry.netProfit === undefined || entry.otherAllocableDeductions === undefined) throw new Error("Schedule1-A requires the actual canonical business profit and allocable deductions.");
    return min(d(entry.qualifiedReportedTips), zeroFloor(d(entry.netProfit).minus(entry.otherAllocableDeductions)));
  }));
  const wageDeductionReduction = zeroFloor(magi.minus(joint ? "300000" : "150000")).div("1000").floor().times("100");
  const tipsDeduction = marriedSeparate ? d("0") : roundDollar(zeroFloor(min(employeeTips.plus(businessTips), d("25000")).minus(wageDeductionReduction)));
  audit.record("Schedule 1-A", "13", "Qualified tips deduction", tipsDeduction, "max(0, min(eligible reported tips, 25000) - 100 × floor(MAGI excess / 1000)); MFS excluded");
  const eligibleOvertime = sum(...facts.overtime.map((entry) => ssnEligible(entry.owner) && entry.requiredByFlsa ? d(entry.qualifiedPremium) : d("0")));
  const overtimeDeduction = marriedSeparate ? d("0") : roundDollar(zeroFloor(min(eligibleOvertime, d(joint ? "25000" : "12500")).minus(wageDeductionReduction)));
  audit.record("Schedule 1-A", "21", "Qualified overtime compensation deduction", overtimeDeduction, "max(0, min(FLSA premium, 12500 [25000 MFJ]) - 100 × floor(MAGI excess / 1000)); MFS excluded");
  const vehicleInterest = sum(...facts.vehicleLoans.map((loan, loanIndex) => {
    if (actualSources || loan.owner !== undefined || loan.sourceTaxYear !== undefined || loan.borrowerQualificationConfirmed !== undefined) {
      if (!loan.owner || loan.sourceTaxYear !== taxpayer.taxYear || !loan.lenderName || !loan.loanAccountReference || !loan.sourceReference || loan.borrowerQualificationConfirmed === undefined) throw new Error("Schedule1-A requires actual vehicle borrower and loan source facts for this year.");
      if (loan.owner === "spouse" && (!joint || !taxpayer.spouse)) throw new Error("Schedule1-A spouse vehicle borrower requires the actual joint household.");
      if (!loan.borrowerQualificationConfirmed) return d("0");
    }
    const refinancing = loan.refinanced ? calculateVehicleRefinancing(loan, taxpayer.taxYear, String(loanIndex + 1)) : undefined;
    if (!loan.refinanced && loan.refinancingSources !== undefined) throw new Error("Vehicle refinancing sources conflict with a non-refinanced loan");
    if (refinancing) audit.merge(refinancing.lines);
    const yearEnd = `${taxpayer.taxYear}-12-31`;
    if (loan.acquiredDate > yearEnd || loan.loanOriginationDate > yearEnd) throw new Error("Vehicle purchase/loan date is after the tax year");
    if (loan.acquiredDate < "2025-01-01" || loan.loanOriginationDate < "2025-01-01" || (!loan.refinanced && !loan.firstLien) || !loan.originalUse || !loan.finalAssemblyUnitedStates || !loan.personalUse || loan.grossVehicleWeightRating >= 14000 || (!loan.refinanced && loan.relatedParty) || loan.lease || loan.fleet || loan.salvageOrScrap) return d("0");
    return refinancing?.eligibleInterest ?? d(loan.interestPaid).minus(loan.businessInterestDeducted).minus(loan.nonqualifyingInterest);
  }));
  const vehicleReduction = zeroFloor(magi.minus(joint ? "200000" : "100000")).div("1000").ceil().times("200");
  const vehicleInterestDeduction = roundDollar(zeroFloor(min(vehicleInterest, d("10000")).minus(vehicleReduction)));
  audit.record("Schedule 1-A", "30", "Qualified vehicle loan interest deduction", vehicleInterestDeduction, "max(0, min(eligible interest, 10000) - 200 × ceil(MAGI excess / 1000))");
  const seniorPerPerson = roundDollar(zeroFloor(d("6000").minus(zeroFloor(magi.minus(joint ? "150000" : "75000")).times("0.06"))));
  const seniorAgeEligible = (owner: "primary" | "spouse") => {
    const person = owner === "primary" ? taxpayer.primary : taxpayer.spouse!;
    const parsed = new Date(`${person.dateOfBirth}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== person.dateOfBirth || person.dateOfBirth > `${taxpayer.taxYear}-12-31`) throw new Error("Invalid senior birth date");
    const deathDate = owner === "primary" ? input.standardDeductionFacts?.primaryDeathDate : input.standardDeductionFacts?.spouseDeathDate;
    if (deathDate === undefined && (taxpayer.taxYear === 2026 || facts.sourceFactsConfirmed === true)) throw new Error("Schedule 1-A senior death status is unknown; provide the actual date or confirmed alive status.");
    if (deathDate !== undefined && deathDate !== null) {
      const death = new Date(`${deathDate}T00:00:00Z`);
      if (!Number.isFinite(death.getTime()) || death.toISOString().slice(0, 10) !== deathDate || deathDate.slice(0, 4) !== String(taxpayer.taxYear) || deathDate < person.dateOfBirth) throw new Error("Schedule 1-A senior death date must be an actual date in the return year, on or after birth.");
    }
    const end = deathDate ?? `${taxpayer.taxYear}-12-31`;
    const birthdayYear = parsed.getUTCFullYear() + 65;
    // An actual leap-day death boundary needs its separate age-attainment rule.
    // Away from February28/Mar1, either boundary gives the same known answer.
    if (person.dateOfBirth.slice(5) === "02-29") {
      if (end < `${birthdayYear}-02-28`) return false;
      if (end >= `${birthdayYear}-03-01`) return true;
      throw new Error("Schedule 1-A senior leap-day death boundary requires its actual age-attainment determination.");
    }
    // Construct the birthday, then subtract one calendar day for attained age.
    const birthday = new Date(`${birthdayYear}-${person.dateOfBirth.slice(5)}T00:00:00Z`);
    birthday.setUTCDate(birthday.getUTCDate() - 1);
    return end >= birthday.toISOString().slice(0, 10);
  };
  // Validate actual dates even when filing status or SSN later disallows the claim.
  const ageEligible = new Map(facts.seniorOwners.map(owner => [owner, seniorAgeEligible(owner)]));
  const seniorDeduction = marriedSeparate ? d("0") : roundDollar(sum(...facts.seniorOwners.map((owner) => {
    return ssnEligible(owner) && ageEligible.get(owner) ? seniorPerPerson : d("0");
  })));
  audit.record("Schedule 1-A", "37", "Enhanced deduction for seniors", seniorDeduction, "Each eligible person: max(0, 6000 - 6% × MAGI excess); MFS excluded");
  const totalDeduction = sum(tipsDeduction, overtimeDeduction, vehicleInterestDeduction, seniorDeduction);
  audit.record("Schedule 1-A", "38", "Total additional deductions", totalDeduction, "Lines 13 + 21 + 30 + 37");
  return { magi, tipsDeduction, overtimeDeduction, vehicleInterestDeduction, seniorDeduction, totalDeduction, lines: audit.getLines() };
}
