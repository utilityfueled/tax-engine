/** Spec: spec/federal/form-6781-2026-template.yaml. Internal source records only. */
import { z } from "zod";
import { d, sum } from "@/utils/decimal.js";
import type { TaxYearInput } from "./inputs.js";

const sourceText = z.string().trim().min(1).max(200).refine(value => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value));
const payerTin = z.string().trim().regex(/^(?:\d{9}|\d{2}-\d{7})$/u)
  .refine(value => value.replace("-", "") !== "000000000");
const brokerOriginalSchema = z.object({
  form: z.literal("1099-b"),
  taxYear: z.literal(2026),
  accountHolder: z.literal("primary"),
  corrected: z.literal(false),
  sourceId: sourceText,
  broker: sourceText,
  payerTin,
  accountReference: sourceText,
  box11: z.string().refine(amount => /^-?\d{1,14}(?:\.\d{1,2})?$/u.test(amount) && !d(amount).isZero()),
}).strict();

const reviewSourceSchema = z.object({
  taxYear: z.literal(2026),
  accountHolder: z.literal("primary"),
  originalReturnConfirmed: z.literal(true),
  calendarYearReturnConfirmed: z.literal(true),
  allOriginalsReviewedAndIncludedConfirmed: z.literal(true),
  ordinaryMarkToMarketConfirmed: z.literal(true),
  recipient: z.object({ firstName: sourceText, lastName: sourceText, ssnLast4: z.string().regex(/^\d{4}$/u) }).strict(),
  elections: z.object({ A: z.literal(false), B: z.literal(false), C: z.literal(false), D: z.literal(false) }).strict(),
  exclusions: z.object({
    straddles: z.literal(false), hedges: z.literal(false), section988Election: z.literal(false),
    adjustmentStatement: z.literal(false), unreportedContracts: z.literal(false), dealerActivity: z.literal(false),
    passThroughAmounts: z.literal(false), qofActivity: z.literal(false),
  }).strict(),
  partIII: z.object({ noReportablePositionsConfirmed: z.literal(true), sourceReference: sourceText }).strict(),
  originals: z.array(brokerOriginalSchema).min(1).max(3),
}).strict();

const comparisonText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toUpperCase();
const accountKey = (value: string) => {
  const account = comparisonText(value);
  return /^\d[\d -]*$/u.test(account) ? account.replace(/[ -]/gu, "") : account;
};

/** Match the private Box 11 capture to the current return and return only printable rows and sums. */
export function readForm6781ReviewOriginals(input: TaxYearInput, rawSources: unknown) {
  const parsed = reviewSourceSchema.safeParse(rawSources);
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.path[0] === "partIII")) {
      throw new Error("Form 6781 review requires documented confirmation of no reportable Part III positions.");
    }
    throw new Error("Form 6781 review requires complete confirmed 2026 ordinary broker originals and negative election and exclusion answers.");
  }
  const { taxYear, accountHolder, recipient, originals } = parsed.data;
  const { taxpayer, form6781 } = input;
  const owner = taxpayer.primary;
  if (taxpayer.taxYear !== taxYear || taxpayer.filingStatus !== "single" || taxpayer.spouse
    || form6781?.accountHolder !== accountHolder
    || comparisonText(recipient.firstName) !== comparisonText(owner.firstName)
    || comparisonText(recipient.lastName) !== comparisonText(owner.lastName)
    || !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u.test(owner.ssn)
    || recipient.ssnLast4 !== owner.ssn.replace(/-/gu, "").slice(-4)) {
    throw new Error("Form 6781 review requires the current 2026 single recipient and matching source owner.");
  }
  const period = input.standardDeductionFacts;
  if (period?.primaryDeathDate !== null || period.spouseDeathDate != null || period.shortTaxYear === true
    || period.dualStatusAlien === true || period.nonresidentAlien === true || period.residentJointElection === true) {
    throw new Error("Form 6781 review requires a living single taxpayer and the ordinary calendar-year return.");
  }
  if (form6781.carrybackElection || [form6781.adjustments, form6781.carrybackAmount, form6781.shortTermStraddleLosses,
    form6781.longTermStraddleLosses, form6781.shortTermStraddleGains, form6781.longTermStraddleGains].some(amount => !d(amount).isZero())
    || input.qofDispositionFacts !== undefined || input.form1099DA?.length || input.scheduleK1.length || input.scheduleK1Form1041?.length) {
    throw new Error("Form 6781 review requires ordinary Part I sources without adjustments, carryback, straddles, or separate reporting.");
  }

  const canonicalStatements = new Map(input.form1099B.map(statement => [comparisonText(statement.sourceId ?? ""), statement]));
  const originalIds = new Set(originals.map(statement => comparisonText(statement.sourceId)));
  const originalAccounts = new Set(originals.map(statement => `${statement.payerTin.replace("-", "")}:${accountKey(statement.accountReference)}`));
  if (originals.length !== input.form1099B.length || canonicalStatements.size !== originals.length
    || originalIds.size !== originals.length || originalAccounts.size !== originals.length) {
    throw new Error("Form 6781 review requires the complete distinct broker statement and account inventory.");
  }
  const rows = originals.map(original => {
    const statement = canonicalStatements.get(comparisonText(original.sourceId));
    const canonicalTin = payerTin.safeParse(statement?.payerTin);
    if (!statement || statement.taxYear !== taxYear || statement.accountHolder !== accountHolder
      || !canonicalTin.success || canonicalTin.data.replace("-", "") !== original.payerTin.replace("-", "")
      || comparisonText(statement.broker) !== comparisonText(original.broker)
      || accountKey(statement.accountReference ?? "") !== accountKey(original.accountReference)
      || statement.transactions.length || statement.withholdingOnlyOpenShortSale) {
      throw new Error("Form 6781 review requires each original to match an ordinary current broker statement without separate transaction detail.");
    }
    return { broker: original.broker, amount: d(original.box11) };
  });
  const gains = sum(...rows.filter(row => row.amount.gt(0)).map(row => row.amount));
  const losses = sum(...rows.filter(row => row.amount.lt(0)).map(row => row.amount.abs()));
  if (!gains.eq(d(form6781.section1256Gains)) || !losses.eq(d(form6781.section1256Losses))) {
    throw new Error("Form 6781 original broker gains and losses must each reconcile to the calculation input.");
  }
  return { rows, gains, losses, calculationInput: form6781 };
}
