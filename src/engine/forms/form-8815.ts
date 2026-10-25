/**
 * Form 8815 — education savings-bond interest exclusion.
 * Spec: spec/federal/form-8815.yaml. No side effects; amounts use Decimal.
 */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { SavingsBondRedemption, TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d, min, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8815RedemptionResult {
  sourceId?: string;
  eligible: boolean | undefined;
  reason: string;
  proceeds: Decimal;
  principal?: Decimal;
  currentYearInterest?: Decimal;
}
export interface Form8815Result {
  taxYear: number;
  sourceFactsVerified: boolean;
  grossQualifiedExpenses: Decimal; // Line 2, after coordination with other benefits
  nontaxableEducationalBenefits: Decimal; // Line 3
  qualifiedExpenses: Decimal; // Line 4
  totalProceeds: Decimal; // Line 5
  totalInterest: Decimal; // Line 6
  expenseRatio: Decimal; // Line 7
  excludableBeforePhaseOut: Decimal; // Line 8
  modifiedAGI: Decimal; // Line 9
  phaseOutThreshold: Decimal; // Line 10
  phaseOutRange: Decimal;
  excludableSavingsBondInterest: Decimal; // Line 14
  redemptionResults: Form8815RedemptionResult[];
  lines: CalculatedLine[];
}
interface Form8815Options {
  taxYear?: number;
  facts?: TaxYearInput["form8815"];
}

function amount(value: string | number | Decimal | undefined, name: string): Decimal {
  if (value === undefined) throw new Error(`Form 8815 requires actual ${name}.`);
  const result = d(value);
  if (!result.isFinite() || result.isNegative()) throw new Error(`Form 8815 ${name} must be finite and nonnegative.`);
  return result;
}
function date(value: string | undefined, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Form 8815 requires actual ${name}.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Form 8815 ${name} is not a valid date.`);
  return value;
}
function unique(value: string | undefined, seen: Set<string>, name: string): string {
  if (!value?.trim()) throw new Error(`Form 8815 requires actual ${name} source ID.`);
  if (seen.has(value)) throw new Error(`Form 8815 duplicate ${name} source ID.`);
  seen.add(value);
  return value;
}

export function calculateForm8815(
  redemptions: SavingsBondRedemption[],
  modifiedAGI: Decimal,
  filingStatus: FilingStatus,
  options: Form8815Options = {},
): Form8815Result {
  const taxYear = options.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error(`Form 8815 does not support tax year ${taxYear}.`);
  if (!modifiedAGI.isFinite()) throw new Error("Form 8815 modified AGI must be finite.");
  const audit = new AuditTrail();
  const sourceFactsVerified = taxYear === 2026 || options.facts !== undefined;
  if (filingStatus === "married_filing_separately") {
    audit.record("Form 8815", "14", "Excludable savings bond interest", d(0), "Married filing separately is ineligible");
    return {
      taxYear, sourceFactsVerified: false,
      grossQualifiedExpenses: d(0), nontaxableEducationalBenefits: d(0), qualifiedExpenses: d(0),
      totalProceeds: d(0), totalInterest: d(0), expenseRatio: d(0), excludableBeforePhaseOut: d(0),
      modifiedAGI, phaseOutThreshold: d(0), phaseOutRange: d(0), excludableSavingsBondInterest: d(0),
      redemptionResults: [], lines: audit.getLines(),
    };
  }

  let totalExpenses = d(0), beneficiaryBenefits = d(0), proceeds = d(0), interest = d(0);
  let paperFace = d(0), otherFace = d(0), priorInterest = d(0);
  const redemptionResults: Form8815RedemptionResult[] = [];
  if (sourceFactsVerified) {
    const facts = options.facts;
    if (facts?.sourceFactsConfirmed !== true || !facts.educationExpenses) throw new Error("Form 8815 requires confirmed actual bond and education source facts.");
    if (facts.currentStatementReconciliationConfirmed !== true) throw new Error("Form 8815 requires actual current statement interest reconciliation.");
    const statementAdjustment = amount(facts.priorYearInterestIncludedInCurrentStatements, "prior interest included in current statements");
    let allPriorInterest = d(0);
    const bondIds = new Set<string>();
    for (const bond of redemptions) {
      if (bond.sourceFactsComplete !== true) throw new Error("Form 8815 requires complete original bond source facts.");
      const sourceId = unique(bond.sourceId, bondIds, "bond");
      const issued = date(bond.issueDate, "bond issue date");
      if (!issued.endsWith("-01")) throw new Error("Form 8815 requires the assigned first-day-of-month bond issue date, not its purchase date.");
      const redeemed = date(bond.redemptionDate, "bond redemption date");
      const born = date(bond.ownerDateOfBirth, "registered owner birth date");
      if (Number(redeemed.slice(0, 4)) !== taxYear || issued > redeemed || born > issued) throw new Error("Form 8815 bond dates contradict the redemption year or owner history.");
      if (!bond.bondType || !bond.registeredOwner || bond.ownershipConfirmed === undefined) throw new Error("Form 8815 requires actual bond classification and ownership facts.");
      const gross = amount(bond.proceeds, "redemption proceeds");
      const face = amount(bond.faceValue, "face value");
      const reported = amount(bond.priorYearInterestReported, "previously reported interest");
      allPriorInterest = allPriorInterest.plus(reported);
      if (bond.qualifiedExpenses !== undefined && !amount(bond.qualifiedExpenses, "legacy expenses").isZero()) throw new Error("Form 8815 legacy per-bond expenses must be reconciled to return-level education sources.");
      if (bond.bondType === "other") {
        redemptionResults.push({ sourceId, eligible: false, reason: "The actual bond type is not series EE or I", proceeds: gross });
        continue;
      }
      const principal = bond.bondType === "paper_ee" ? face.times("0.5") : face;
      if (principal.gt(gross) || reported.gt(gross.minus(principal))) throw new Error("Form 8815 principal or prior reported interest exceeds actual redemption proceeds.");
      const currentYearInterest = gross.minus(principal).minus(reported);
      if (bond.interest !== undefined && !amount(bond.interest, "legacy interest").eq(currentYearInterest)) throw new Error("Form 8815 legacy interest does not reconcile to the actual source worksheet.");
      const ownerAge = Number(issued.slice(0, 4)) - Number(born.slice(0, 4)) - (issued.slice(5) < born.slice(5) ? 1 : 0);
      const ownershipEligible = bond.ownershipConfirmed && (bond.registeredOwner === "taxpayer" || (filingStatus === "married_filing_jointly" && (bond.registeredOwner === "spouse" || bond.registeredOwner === "taxpayer_and_spouse")));
      const eligible = issued >= "1990-01-01" && ownerAge >= 24 && ownershipEligible;
      const reason = eligible ? "Actual source facts satisfy the bond eligibility requirements" : "Actual source facts do not satisfy bond type, issue date, age or ownership requirements";
      redemptionResults.push({ sourceId, eligible, reason, proceeds: gross, principal, currentYearInterest });
      if (!eligible) continue;
      proceeds = proceeds.plus(gross);
      priorInterest = priorInterest.plus(reported);
      if (bond.bondType === "paper_ee") paperFace = paperFace.plus(face); else otherFace = otherFace.plus(face);
    }
    if (statementAdjustment.gt(allPriorInterest)) throw new Error("Form 8815 current statement adjustment exceeds actual previously reported interest.");
    audit.record("Form 8815", "statement-prior-interest-adjustment", "Previously reported interest included in current statements", statementAdjustment, "Actual reconciled adjustment applied once on Schedule B");
    const expenseIds = new Set<string>();
    for (const expense of facts.educationExpenses) {
      unique(expense.sourceId, expenseIds, "education expense");
      if (expense.paidTaxYear !== taxYear) throw new Error("Form 8815 education expenses must be paid in the redemption tax year.");
      if (!expense.beneficiaryName?.trim() || !expense.institutionName?.trim() || !expense.institutionAddress?.trim()) throw new Error("Form 8815 requires actual beneficiary and institution facts.");
      if (expense.coordinationConfirmed !== true) throw new Error("Form 8815 requires completed education expense coordination.");
      if (expense.qualificationConfirmed === undefined || (expense.relationship === "dependent" && expense.dependentClaimed === undefined)) throw new Error("Form 8815 requires known beneficiary and education eligibility.");
      const paid = amount(expense.amountPaid, "education amount paid");
      const direct = amount(expense.directInstitutionBenefits, "direct institution benefits");
      const credit = amount(expense.educationCreditExpenses, "education credit expenses");
      const distribution = amount(expense.taxFreeDistributionExpenses, "tax-free distribution expenses");
      const benefits = amount(expense.beneficiaryBenefits, "beneficiary educational benefits");
      const coordinated = paid.minus(direct).minus(credit).minus(distribution);
      if (coordinated.isNegative()) throw new Error("Form 8815 coordinated education expenses exceed actual cost.");
      const eligible = expense.qualificationConfirmed && (expense.relationship === "taxpayer" || (expense.relationship === "spouse" && filingStatus === "married_filing_jointly") || (expense.relationship === "dependent" && expense.dependentClaimed === true));
      if (!eligible) continue;
      totalExpenses = totalExpenses.plus(coordinated);
      // Line 3 includes benefits only to the extent they cover this source's line 2 expenses.
      beneficiaryBenefits = beneficiaryBenefits.plus(min(benefits, coordinated));
    }
    const w1 = roundDollar(proceeds), w2 = roundDollar(paperFace);
    const w3 = roundDollar(w2.times("0.5")), w4 = roundDollar(otherFace);
    const w5 = w3.plus(w4), w6 = zeroFloor(w1.minus(w5)), w7 = roundDollar(priorInterest);
    const w8 = zeroFloor(w6.minus(w7));
    const worksheet: Array<[string, string, Decimal, string]> = [
      ["1", "Eligible redemption proceeds", w1, "Form 8815 line 5"],
      ["2", "Paper series EE face value", w2, "Actual eligible paper EE face values"],
      ["3", "Paper series EE principal", w3, "Worksheet 2 x 50%"],
      ["4", "Electronic EE and series I face value", w4, "Actual eligible electronic EE/I face values"],
      ["5", "Total principal", w5, "Worksheet 3 + 4"],
      ["6", "Gross interest", w6, "Worksheet 1 - 5"],
      ["7", "Interest previously reported", w7, "Actual prior-year interest reporting"],
      ["8", "Current-year interest", w8, "Worksheet 6 - 7"],
    ];
    for (const [id, description, value, formula] of worksheet) audit.record("Form 8815", `6-worksheet-${id}`, description, value, formula);
    interest = w8;
  } else {
    // Historical 2025 calculations remain available but do not establish source qualification.
    for (const bond of redemptions) {
      const gross = amount(bond.proceeds, "legacy proceeds");
      const currentYearInterest = amount(bond.interest, "legacy interest");
      if (currentYearInterest.gt(gross)) throw new Error("Form 8815 interest exceeds proceeds.");
      totalExpenses = totalExpenses.plus(amount(bond.qualifiedExpenses, "legacy qualified expenses"));
      proceeds = proceeds.plus(gross);
      interest = interest.plus(currentYearInterest);
      redemptionResults.push({ sourceId: bond.sourceId, eligible: undefined, reason: "Historical aggregate input; bond qualification is unverified", proceeds: gross, principal: gross.minus(currentYearInterest), currentYearInterest });
    }
  }
  const grossQualifiedExpenses = roundDollar(totalExpenses);
  const nontaxableEducationalBenefits = roundDollar(beneficiaryBenefits);
  const qualifiedExpenses = zeroFloor(grossQualifiedExpenses.minus(nontaxableEducationalBenefits));
  const totalProceeds = roundDollar(proceeds), totalInterest = roundDollar(interest);
  const expenseRatio = totalProceeds.isZero() ? d(0) : min(qualifiedExpenses.div(totalProceeds), d(1)).toDecimalPlaces(12);
  const excludableBeforePhaseOut = roundDollar(totalInterest.times(expenseRatio));
  const joint = filingStatus === "married_filing_jointly";
  const phaseOutThreshold = d(taxYear === 2026 ? (joint ? "152650" : "101800") : (joint ? "149250" : "99500"));
  const phaseOutRange = d(joint ? "30000" : "15000");
  const magi = roundDollar(modifiedAGI);
  const excess = zeroFloor(magi.minus(phaseOutThreshold));
  const fraction = min(excess.div(phaseOutRange), d(1)).toDecimalPlaces(12);
  const reduction = roundDollar(excludableBeforePhaseOut.times(fraction));
  const excludableSavingsBondInterest = zeroFloor(excludableBeforePhaseOut.minus(reduction));
  const lines: Array<[string, string, Decimal, string]> = [
    ["2", "Qualified higher education expenses", grossQualifiedExpenses, sourceFactsVerified ? "Actual expenses less direct benefits, credit expenses and tax-free distribution expenses" : "Historical aggregate qualified expenses; qualification unverified"],
    ["3", "Nontaxable educational benefits", nontaxableEducationalBenefits, "Beneficiary benefits covering line 2 expenses"],
    ["4", "Net qualified expenses", qualifiedExpenses, "max(0, line 2 - line 3)"],
    ["5", "Qualified bond redemption proceeds", totalProceeds, "Eligible principal and interest"],
    ["6", "Current-year bond interest", totalInterest, sourceFactsVerified ? "Line 6 worksheet 8" : "Historical aggregate interest; qualification unverified"],
    ["7", "Expense fraction", expenseRatio, "min(1, line 4 / line 5); zero if no proceeds"],
    ["8", "Exclusion before phaseout", excludableBeforePhaseOut, "line 6 x line 7"],
    ["9", "Modified adjusted gross income", magi, "Completed official Line 9 Worksheet"],
    ["10", "Phaseout threshold", phaseOutThreshold, `${taxYear} ${filingStatus} threshold`],
    ["11", "Excess modified adjusted gross income", excess, "max(0, line 9 - line 10)"],
    ["12", "Phaseout fraction", fraction, `min(1, line 11 / ${phaseOutRange})`],
    ["13", "Phaseout reduction", reduction, "line 8 x line 12"],
    ["14", "Excludable savings bond interest", excludableSavingsBondInterest, "line 8 - line 13 -> Schedule B line 3"],
  ];
  for (const [id, description, value, formula] of lines) audit.record("Form 8815", id, description, value, formula);
  return { taxYear, sourceFactsVerified, grossQualifiedExpenses, nontaxableEducationalBenefits, qualifiedExpenses, totalProceeds, totalInterest, expenseRatio, excludableBeforePhaseOut, modifiedAGI: magi, phaseOutThreshold, phaseOutRange, excludableSavingsBondInterest, redemptionResults, lines: audit.getLines() };
}
