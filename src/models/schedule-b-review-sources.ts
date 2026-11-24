/** Spec: spec/federal/schedule-b-2026-template.yaml. Private return sources. */
import { z } from "zod";
import { d } from "@/utils/decimal.js";
import type { TaxYearInput } from "./inputs.js";

const sourceText = z.string().trim().min(1).max(200).refine(value => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value));
const payerTin = z.string().trim().regex(/^(?:\d{9}|\d{2}-\d{7})$/u)
  .transform(value => value.replace("-", "")).refine(value => value !== "000000000");
const accountReference = sourceText.refine(value => !/[*•]/u.test(value));
const cents = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const recipient = z.object({ firstName: sourceText, lastName: sourceText, ssnLast4: z.string().regex(/^\d{4}$/u) }).strict();
const originalStatement = {
  taxYear: z.literal(2026),
  accountHolder: z.literal("primary"),
  payer: sourceText,
  payerTin,
  accountReference,
  sourceReference: sourceText,
  recipient,
  actualOriginalConfirmed: z.literal(true),
  corrected: z.literal(false),
  completeAccountReferenceConfirmed: z.literal(true),
  ordinaryOnlyConfirmed: z.literal(true),
};

const reviewSources = z.object({
  taxYear: z.literal(2026),
  calendarYearReturnConfirmed: z.literal(true),
  completeIncomeInventoryConfirmed: z.literal(true),
  ordinaryDomesticSourcesConfirmed: z.literal(true),
  originals: z.array(z.discriminatedUnion("form", [
    z.object({ ...originalStatement, form: z.literal("1099-int"), box1: cents }).strict(),
    z.object({ ...originalStatement, form: z.literal("1099-div"), box1a: cents }).strict(),
  ])).min(1).max(29),
}).strict();

const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toUpperCase();
const statementKey = (form: string, tin: string, account: string) => `${form}:${tin}:${account.trim()}`;
const anyAmount = (values: (string | undefined)[]) => values.some(value => !d(value).isZero());

/** Verify every private original against the return and keep only values for review projection. */
export function readScheduleBReviewOriginals(input: TaxYearInput, rawSources: unknown) {
  const { taxpayer, form1099Int, form1099Div, standardDeductionFacts: period, scheduleBPartThree: foreign } = input;
  if (form1099Int.length > 14 || form1099Div.length > 15) throw new Error("Schedule B review original inventory exceeds native row capacity.");
  const parsed = reviewSources.safeParse(rawSources);
  if (!parsed.success) throw new Error("Schedule B review requires complete confirmed ordinary 2026 original source statements.");
  const { taxYear, originals } = parsed.data;
  const owner = taxpayer.primary;
  if (taxpayer.taxYear !== taxYear || taxpayer.filingStatus !== "single" || taxpayer.spouse
    || period?.primaryDeathDate !== null || period.spouseDeathDate != null || period.shortTaxYear === true
    || period.nonresidentAlien === true || period.dualStatusAlien === true || period.residentJointElection === true
    || !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u.test(owner.ssn)) {
    throw new Error("Schedule B review requires the matching current living single primary recipient and calendar year.");
  }
  const recipientIdSuffix = owner.ssn.replace(/-/gu, "").slice(-4);
  if (originals.some(({ recipient }) => normalized(recipient.firstName) !== normalized(owner.firstName)
    || normalized(recipient.lastName) !== normalized(owner.lastName) || recipient.ssnLast4 !== recipientIdSuffix)) {
    throw new Error("Schedule B review requires every original to match the current primary recipient.");
  }
  if (foreign?.hasForeignAccounts !== false || foreign.hasForeignTrust !== false
    || foreign.fbarRequired !== undefined || foreign.foreignAccountCountries?.length) {
    throw new Error("Schedule B review requires known negative foreign account and trust answers.");
  }
  if (input.form1099OID?.length || input.scheduleK1.length || input.scheduleK1Form1041.length
    || input.form8814.length || input.form1099DA.length || input.savingsBondRedemptions.length || input.form8815 !== undefined
    || form1099Int.some(form => form.foreignCountry?.trim() || form.privateActivityBondFacts !== undefined
      || anyAmount([form.earlyWithdrawalPenalty, form.usSavingsBondInterest, form.foreignTaxPaid,
        form.taxExemptInterest, form.privateActivityBondInterest, form.paDirectObligationInterest]))
    || form1099Div.some(form => form.foreignCountry?.trim() || form.privateActivityBondFacts !== undefined
      || anyAmount([form.qualifiedDividends, form.totalCapitalGainDistributions, form.section1250Gain,
        form.section1202Gain, form.collectiblesGain, form.nondividendDistributions, form.section199ADividends,
        form.foreignTaxPaid, form.exemptInterestDividends, form.specifiedPrivateActivityBondInterest, form.paExemptInterestDividendAllocation]))) {
    throw new Error("Schedule B review requires ordinary income without unsupported original amounts or methods.");
  }

  const originalsByAccount = new Map(originals.map(original => [statementKey(original.form, original.payerTin, original.accountReference), original]));
  const originalReferences = new Set(originals.map(original => normalized(original.sourceReference)));
  if (originals.length !== form1099Int.length + form1099Div.length
    || originalsByAccount.size !== originals.length || originalReferences.size !== originals.length) {
    throw new Error("Schedule B review requires the complete distinct original statement inventory.");
  }
  const match = (kind: "1099-int" | "1099-div", form: (typeof form1099Int)[number] | (typeof form1099Div)[number], income: string) => {
    const tin = payerTin.safeParse(form.payerTin);
    const account = accountReference.safeParse(form.accountReference);
    if (form.taxYear !== taxYear || form.accountHolder !== "primary" || !tin.success || !account.success) {
      throw new Error("Schedule B review requires the current owner, payer TIN and account identity of each original.");
    }
    const key = statementKey(kind, tin.data, account.data);
    const original = originalsByAccount.get(key);
    const actualAmount = d(original?.form === "1099-int" ? original.box1 : original?.box1a);
    if (!original || !actualAmount.gt(0) || !actualAmount.eq(d(income)) || normalized(original.payer) !== normalized(form.payer)) {
      throw new Error("Schedule B original payer and exact income must reconcile to each canonical statement.");
    }
    originalsByAccount.delete(key);
    return actualAmount;
  };
  return {
    interest: form1099Int.map(form => match("1099-int", form, form.interestIncome)),
    dividends: form1099Div.map(form => match("1099-div", form, form.ordinaryDividends)),
  };
}
