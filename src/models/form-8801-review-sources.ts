/** Spec: spec/federal/form-8801-2026-template.yaml. Private prior-return facts. */
import Decimal from "decimal.js";
import { z } from "zod";
import { d } from "@/utils/decimal.js";
import type { TaxYearInput } from "./inputs.js";

const sourceText = z.string().trim().min(1).max(200).refine(value => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value));
const wholeDollars = z.string().regex(/^-?\d{1,12}(?:\.0{1,2})?$/u);
const nonnegativeWholeDollars = z.string().regex(/^\d{1,12}(?:\.0{1,2})?$/u);
const original = {
  taxYear: z.literal(2025),
  operativeFiledOriginalConfirmed: z.literal(true),
  sourceReference: sourceText,
  owner: z.object({ firstName: sourceText, lastName: sourceText, ssnLast4: z.string().regex(/^\d{4}$/u) }).strict(),
};

const reviewSourcesSchema = z.object({
  calendarYearReturnConfirmed: z.literal(true),
  priorFilingStatus: z.literal("single"),
  priorOrdinaryStandardDeductionConfirmed: z.literal(true),
  onlyStandardDeductionExclusionConfirmed: z.literal(true),
  priorFiledForm2555: z.literal(false),
  priorFiledForm1040NR: z.literal(false),
  priorCapitalGainsWorksheetRequired: z.literal(false),
  priorNoNolConfirmed: z.literal(true),
  priorNoExclusionForeignTaxCreditConfirmed: z.literal(true),
  priorNoUnallowedQualifiedEvCreditConfirmed: z.literal(true),
  priorForm6251: z.object({
    ...original, form: z.literal("6251"),
    line1b: wholeDollars,
    line2a: nonnegativeWholeDollars,
    line2e: nonnegativeWholeDollars,
    line9: nonnegativeWholeDollars,
    line10: nonnegativeWholeDollars,
    line11: nonnegativeWholeDollars,
  }).strict(),
  priorForm8801: z.object({ ...original, form: z.literal("8801"), line26: nonnegativeWholeDollars }).strict(),
}).strict();

const comparisonText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toUpperCase();

/** Return the minimum confirmed source facts needed to reach the printed line 21 branch. */
export function readForm8801NoCreditReviewSources(input: TaxYearInput, rawSources: unknown) {
  const parsed = reviewSourcesSchema.safeParse(rawSources);
  if (!parsed.success) throw new Error("Form 8801 review requires complete ordinary whole-dollar 2025 originals and supported prior source facts.");
  const { priorForm6251, priorForm8801 } = parsed.data;
  const { taxpayer, form8801: canonical, standardDeductionFacts: period } = input;
  const { firstName, lastName, ssn } = taxpayer.primary;
  if (taxpayer.taxYear !== 2026 || taxpayer.filingStatus !== "single" || taxpayer.spouse
    || period?.primaryDeathDate !== null || period.spouseDeathDate != null || period.shortTaxYear === true
    || period.dualStatusAlien === true || period.nonresidentAlien === true || period.residentJointElection === true
    || !sourceText.safeParse(firstName).success || !sourceText.safeParse(lastName).success
    || !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u.test(ssn)) {
    throw new Error("Form 8801 review requires original evidence for the current living single calendar-year taxpayer.");
  }
  if ([priorForm6251.owner, priorForm8801.owner].some(owner => comparisonText(owner.firstName) !== comparisonText(firstName)
    || comparisonText(owner.lastName) !== comparisonText(lastName) || owner.ssnLast4 !== ssn.replace(/-/gu, "").slice(-4))
    || comparisonText(priorForm6251.sourceReference) === comparisonText(priorForm8801.sourceReference)) {
    throw new Error("Form 8801 review requires distinct same-owner Form 6251 and Form 8801 originals.");
  }
  const priorIncome = d(priorForm6251.line1b).plus(priorForm6251.line2e);
  const exclusions = d(priorForm6251.line2a);
  const priorRegularTax = d(priorForm6251.line10);
  const priorAmt = d(priorForm6251.line11);
  const carry = d(priorForm8801.line26);
  const canonicalMatches = [
    [canonical?.priorYearForm6251Line1And2e, priorIncome], [canonical?.priorYearExclusionItemAdjustments, exclusions],
    [canonical?.priorYearForm6251Line10, priorRegularTax], [canonical?.priorYearAMT, priorAmt],
    [canonical?.unusedMinimumTaxCreditCarryforward, carry], [canonical?.priorYearMinimumTaxCreditNOLDeduction, d(0)],
    [canonical?.priorYearMinimumTaxForeignTaxCredit, d(0)], [canonical?.priorYearUnallowedQualifiedElectricVehicleCredit, d(0)],
  ] as const;
  if (canonical?.priorYear !== 2025 || canonical.sourceFactsComplete !== true || canonical.sourceFactsConfirmed !== true
    || canonical.priorYearFilingStatus !== "single" || canonical.priorYearFiledForm2555 !== false
    || canonical.priorYearFiledForm1040NR !== false || canonical.priorYearCapitalGainsRequired !== false
    || canonical.priorYearCapitalGainsWorksheet !== undefined || canonical.priorYearForeignEarnedIncome !== undefined
    || [canonical.priorYearQualifiedDividends, canonical.priorYearNetLTCG, canonical.priorYearUnrecapturedSection1250Gain,
      canonical.priorYearCollectiblesGain, canonical.priorYearNetUSRealPropertyGain].some(value => !d(value).isZero())
    || !exclusions.gt(0) || !d(priorForm6251.line2e).isZero()
    || canonicalMatches.some(([value, expected]) => value === undefined || !d(value).eq(expected))
    || !priorAmt.eq(Decimal.max(0, d(priorForm6251.line9).minus(priorRegularTax)))) {
    throw new Error("Form 8801 review requires each original amount to reconcile to confirmed prior source facts.");
  }
  return { priorIncome, exclusions, priorRegularTax, priorAmt, carry };
}
