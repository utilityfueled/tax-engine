/** Pennsylvania WPTC. Spec: state/pa-working-pennsylvanians-tax-credit.yaml. */
import Decimal from "decimal.js";
import { roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

const FEDERAL_MAXIMUM_BY_YEAR = new Map([[2025, new Decimal("8046")], [2026, new Decimal("8231")]]);
type Owner = "primary" | "spouse";
interface ActualOwner { firstName: string; lastName: string; ssn: string }
export interface PAWorkingCreditJointFederalSeparatePASources {
  sourceTaxYear: number;
  federalSourceReference: string;
  federalFactsConfirmed: boolean;
  federalReturnJoint: boolean;
  paReturnsSeparate: boolean;
  federalEarnedIncomeCredit: Decimal;
  primary: ActualOwner;
  spouse: ActualOwner;
  claimantAccountHolder: Owner;
  paSeparateReturns: Array<{
    accountHolder: Owner; sourceTaxYear: number; sourceReference: string; factsConfirmed: boolean;
    taxpayer: ActualOwner; taxAfterOtherCreditsBeforePayments: Decimal; otherCreditsFullyAppliedConfirmed: boolean;
    paEarnedIncome: Decimal; earnedIncomeSourceReference: string; eligibilityFactsConfirmed: boolean;
  }>;
}
export interface PAWorkingPennsylvaniansTaxCreditInput {
  taxYear: number;
  /** Actual PA earned-class income and allowed same-year federal-return EITC. */
  paEarnedIncome: Decimal;
  federalEarnedIncomeCredit: Decimal;
  /** Historical PA/SP source answer; it does not redetermine federal eligibility. */
  isClaimedAsDependentOnAnotherFederalReturn?: boolean;
  jointFederalSeparatePA?: PAWorkingCreditJointFederalSeparatePASources;
}
export interface PAWorkingPennsylvaniansTaxCreditResult {
  paEarnedIncome: Decimal; federalEarnedIncomeCredit: Decimal; isEligible: boolean; credit: Decimal; lines: CalculatedLine[];
}
function fail(detail: string): never { throw new Error(`PA WPTC actual source: ${detail}`); }
function amount(value: unknown, label: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0)) fail(`${label} must be an actual finite nonnegative amount`);
  return value;
}
function reference(value: unknown): boolean { return typeof value === "string" && value.trim().length > 0; }
function identity(owner: ActualOwner | undefined): string {
  if (!owner || !reference(owner.firstName) || !reference(owner.lastName) || typeof owner.ssn !== "string") fail("actual owner identity is incomplete");
  const ssn = owner.ssn.replace(/[-\s]/g, "");
  if (!/^\d{9}$/.test(ssn)) fail("actual owner SSN source is incomplete");
  return `${owner.firstName.trim().toLowerCase()}|${owner.lastName.trim().toLowerCase()}|${ssn}`;
}
function actualSeparateClaim(input: PAWorkingPennsylvaniansTaxCreditInput): boolean {
  const source = input.jointFederalSeparatePA;
  if (source === undefined) return true;
  if (!source || source.sourceTaxYear !== input.taxYear || source.federalFactsConfirmed !== true
    || source.federalReturnJoint !== true || source.paReturnsSeparate !== true || !reference(source.federalSourceReference)) fail("confirm actual same-year joint federal and separate PA originals");
  if (!amount(source.federalEarnedIncomeCredit, "joint federal EITC").eq(input.federalEarnedIncomeCredit)) fail("joint federal credit does not match its actual source");
  const owners = {primary: identity(source.primary), spouse: identity(source.spouse)};
  if (owners.primary === owners.spouse || source.primary.ssn.replace(/[-\s]/g, "") === source.spouse.ssn.replace(/[-\s]/g, "")) fail("actual owners must be distinct");
  if (source.claimantAccountHolder !== "primary" && source.claimantAccountHolder !== "spouse") fail("actual claimant owner is unknown");
  if (!Array.isArray(source.paSeparateReturns) || source.paSeparateReturns.length !== 2) fail("both actual separate PA return sources are required");
  const taxes = new Map<Owner, Decimal>();
  const refs = new Set<string>();
  for (const row of source.paSeparateReturns) {
    if (!row || (row.accountHolder !== "primary" && row.accountHolder !== "spouse") || taxes.has(row.accountHolder)) fail("each actual owner must have exactly one PA source");
    if (row.sourceTaxYear !== input.taxYear || row.factsConfirmed !== true || row.otherCreditsFullyAppliedConfirmed !== true
      || !reference(row.sourceReference) || refs.has(row.sourceReference.trim())) fail("actual PA source year, unique reference and confirmed other credits are required");
    if (identity(row.taxpayer) !== owners[row.accountHolder]) fail("actual PA and federal owner identities conflict");
    const earned = amount(row.paEarnedIncome, "owner PA earned income");
    if (!earned.gt(0) || !reference(row.earnedIncomeSourceReference) || row.eligibilityFactsConfirmed !== true) fail("both eligible spouses require actual positive PA earned-income sources; sole-eligible method unavailable");
    if (row.accountHolder === source.claimantAccountHolder && !earned.eq(input.paEarnedIncome)) fail("claimant PA earned-income source conflicts");
    const tax = amount(row.taxAfterOtherCreditsBeforePayments, "owner PA tax after other credits before payments");
    if (!tax.isInteger()) fail("actual reported owner PA tax must be whole dollars");
    taxes.set(row.accountHolder, tax); refs.add(row.sourceReference.trim());
  }
  const claimant = taxes.get(source.claimantAccountHolder)!;
  const other = taxes.get(source.claimantAccountHolder === "primary" ? "spouse" : "primary")!;
  if (claimant.eq(other)) fail("equal-tax tie has no established greater-tax claimant; method unavailable");
  return claimant.gt(other);
}
export function calculatePAWorkingPennsylvaniansTaxCredit(input: PAWorkingPennsylvaniansTaxCreditInput): PAWorkingPennsylvaniansTaxCreditResult {
  const maximum = FEDERAL_MAXIMUM_BY_YEAR.get(input.taxYear);
  if (!maximum) throw new Error(`PA Working Pennsylvanians Tax Credit constants not available for tax year ${input.taxYear}`);
  const paEarnedIncome = amount(input.paEarnedIncome, "PA earned income");
  const federalEarnedIncomeCredit = amount(input.federalEarnedIncomeCredit, "federal EITC");
  if (federalEarnedIncomeCredit.gt(maximum)) fail("federal EITC exceeds actual year federal maximum");
  const allowedClaimant = actualSeparateClaim(input);
  const isEligible = paEarnedIncome.gt(0) && federalEarnedIncomeCredit.gt(0) && allowedClaimant;
  const credit = isEligible ? roundDollar(federalEarnedIncomeCredit.times("0.10")) : new Decimal(0);
  const audit = new AuditTrail();
  audit.record("PA-WPTC", "pa-earned-income", "Actual Pennsylvania earned income", paEarnedIncome, "Actual PA Class 1 compensation plus positive PA Class 4 business income");
  audit.record("PA-WPTC", "eligibility", "Working Pennsylvanians Tax Credit eligibility", new Decimal(isEligible ? 1 : 0),
    !allowedClaimant ? "Only the other eligible spouse has greater pre-WPTC PA tax on the actual separate returns" : isEligible ? "Actual PA earned income and valid same-year federal EITC are positive; no independent PA/SP dependent bar" : "Actual PA earned income or federal EITC is zero",
    {paEarnedIncome, federalEarnedIncomeCredit});
  audit.record("PA-WPTC", "credit", "Working Pennsylvanians Tax Credit processing reference", credit,
    isEligible ? "roundDollar(actual same-year federal EITC x 10%); no fixed $805 cap" : "No credit for this claimant from the actual source facts");
  return {paEarnedIncome, federalEarnedIncomeCredit, isEligible, credit, lines:audit.getLines()};
}
