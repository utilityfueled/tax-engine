import { z } from "zod";
import { d } from "@/utils/decimal.js";
import { isBeforeAge59AndHalfDate } from "@/utils/retirement-age.js";
import { sumSourceMoney } from "@/utils/sum-source-money.js";

const unsignedAmount = z.string().regex(/^\d+(\.\d+)?$/);
const payerTin = z.string().regex(/^\d{2}-?\d{7}$/);
const sourceReference = z.string().trim().min(1);

const contributor = z.strictObject({
  qualifyingStudentMonths: z.number().int().min(0).max(12),
  dependentDeductionAllowedToAnotherTaxpayer: z.boolean(),
  testingPeriodDistributionReduction: unsignedAmount,
});

const signedAmount = z.string().regex(/^-?\d+(\.\d+)?$/);

const historicalIraPaymentYears = [2024, 2025] as const;
const issuerPaymentDate = z.iso.date();

export function getForm8880HistoricalIraPaymentYear(receivedDate: string | undefined) {
  const date = issuerPaymentDate.safeParse(receivedDate);
  if (!date.success) return undefined;
  return historicalIraPaymentYears.find(year => date.data.startsWith(`${year}-`));
}

const historicalIraPayment = z.strictObject({
  original: z.strictObject({
    taxYear: z.literal(historicalIraPaymentYears),
    accountHolder: z.literal("primary"),
    recipientTaxIdLast4: z.string().regex(/^\d{4}$/),
    payerTin,
    accountReference: sourceReference,
    sourceReference,
    accountType: z.literal("traditional-ira"),
    iraSepSimple: z.literal(true),
    distributionCode: z.literal("7"),
    grossDistribution: unsignedAmount,
    taxableAmount: unsignedAmount,
    taxableAmountNotDetermined: z.literal(false),
  }),
  issuerPayment: z.strictObject({
    sourceReference,
    payerTin,
    accountReference: sourceReference,
    receivedDate: issuerPaymentDate,
    amount: unsignedAmount,
  }),
  statementReportsThisSinglePaymentConfirmed: z.literal(true),
  noLine4ExclusionConfirmed: z.literal(true),
}).refine(({ original, issuerPayment }) => issuerPayment.receivedDate.startsWith(`${original.taxYear}-`), {
  path: ["issuerPayment", "receivedDate"],
  message: "The issuer payment date must match the historical Form 1099-R year.",
});

const priorYearOrdinaryIraDistribution = historicalIraPayment.safeExtend({
  /** Covers the full testing period before the actual applicable due date, including extensions. */
  onlyIncludiblePaymentForTestingPeriodConfirmed: z.literal(true),
});

const priorYearOrdinaryIraDistributions = z.strictObject({
  payments: z.tuple([historicalIraPayment, historicalIraPayment]).refine(
    ([first, second]) => first.original.taxYear !== second.original.taxYear,
    "Historical IRA proof requires one payment from 2024 and one from 2025.",
  ),
  onlyIncludiblePaymentsForTestingPeriodConfirmed: z.literal(true),
});

/** Confirmed annual inputs, including the net AGI effects of disregarding §§931 and 933. */
const Form8880Sources2026Schema = z.strictObject({
  taxYear: z.literal(2026),
  testingPeriodComplete: z.literal(true),
  primary: contributor,
  spouse: contributor.optional(),
  priorYearOrdinaryIraDistribution: priorYearOrdinaryIraDistribution.optional(),
  priorYearOrdinaryIraDistributions: priorYearOrdinaryIraDistributions.optional(),
  americanSamoaAgiRestoration: signedAmount,
  puertoRicoAgiRestoration: signedAmount,
}).refine(({ priorYearOrdinaryIraDistribution, priorYearOrdinaryIraDistributions }) => (
  priorYearOrdinaryIraDistribution === undefined || priorYearOrdinaryIraDistributions === undefined
), "Form 8880 requires a single historical proof packet.");

const contribution = signedAmount.refine(value => d(value).gte(0), "Contribution must be nonnegative").optional();
export const Form8880AnnualSchema = z.strictObject({
  primaryElectiveDeferrals: contribution,
  primaryIraContributions: contribution,
  primaryAbleContributions: contribution,
  spouseElectiveDeferrals: contribution,
  spouseIraContributions: contribution,
  spouseAbleContributions: contribution,
  supportedW2PrimaryElectiveDeferrals: contribution,
  supportedW2SpouseElectiveDeferrals: contribution,
  sourceFacts2026: Form8880Sources2026Schema,
});

interface Form8880ReturnContext {
  taxpayer: { filingStatus: string; primary: { ssn: string; dateOfBirth: string } };
  hasCurrentRetirementStatements: boolean;
}

function reconcileHistoricalIraPayment(
  { original, issuerPayment }: z.infer<typeof historicalIraPayment>,
  { dateOfBirth, ssn }: Form8880ReturnContext["taxpayer"]["primary"],
) {
  const taxpayerId = ssn.replace(/-/g, "");
  if (!/^\d{9}$/.test(taxpayerId) || taxpayerId.slice(-4) !== original.recipientTaxIdLast4
    || !z.iso.date().safeParse(dateOfBirth).success
    || isBeforeAge59AndHalfDate(new Date(`${dateOfBirth}T00:00:00Z`), new Date(`${issuerPayment.receivedDate}T00:00:00Z`))) {
    throw new Error("Form 8880 historical IRA proof must match the primary owner and ordinary distribution age at receipt");
  }
  const gross = d(original.grossDistribution);
  if (original.payerTin.replace("-", "") !== issuerPayment.payerTin.replace("-", "")
    || original.accountReference.toLowerCase() !== issuerPayment.accountReference.toLowerCase()
    || !gross.gt(0) || !gross.eq(original.taxableAmount) || !gross.eq(issuerPayment.amount)) {
    throw new Error("Form 8880 requires separately referenced historical records matching the issuer, account and fully taxable payment amount");
  }
  return gross;
}

export function readForm8880AnnualSources(
  form: { sourceFacts2026?: unknown },
  year: number,
  isJointReturn: boolean,
  hasSpouse: boolean,
  standardDeductionFacts?: {
    primaryCanBeClaimedAsDependent?: boolean;
    spouseCanBeClaimedAsDependent?: boolean;
  },
  returnContext?: Form8880ReturnContext,
): z.infer<typeof Form8880Sources2026Schema> | undefined {
  if (year !== 2026) {
    if (form.sourceFacts2026 !== undefined) throw new Error("Form 8880 annual source year must match the return year");
    return undefined;
  }
  const declared = Form8880AnnualSchema.safeParse(form);
  if (!declared.success) throw new Error("Form 8880 for 2026 requires complete confirmed annual source facts");
  const { sourceFacts2026, spouseElectiveDeferrals, spouseIraContributions, spouseAbleContributions } = declared.data;
  const { primary, spouse } = sourceFacts2026;
  if ((isJointReturn && !hasSpouse) || (spouse !== undefined) !== isJointReturn
    || (!isJointReturn && [spouseElectiveDeferrals, spouseIraContributions, spouseAbleContributions]
      .some(amount => d(amount).gt(0)))) {
    throw new Error("Form 8880 spouse source facts must match an actual joint return");
  }
  const primaryDependency = standardDeductionFacts?.primaryCanBeClaimedAsDependent;
  const spouseDependency = standardDeductionFacts?.spouseCanBeClaimedAsDependent;
  if ((primaryDependency !== undefined && primaryDependency !== primary.dependentDeductionAllowedToAnotherTaxpayer)
    || (spouse && spouseDependency !== undefined && spouseDependency !== spouse.dependentDeductionAllowedToAnotherTaxpayer)) {
    throw new Error("Form 8880 and standard deduction dependency facts require reconciliation");
  }
  const single = sourceFacts2026.priorYearOrdinaryIraDistribution;
  const payments = sourceFacts2026.priorYearOrdinaryIraDistributions?.payments ?? (single ? [single] : []);
  if (payments.length === 0) return sourceFacts2026;
  if (!returnContext || returnContext.taxpayer.filingStatus !== "single" || hasSpouse
    || returnContext.hasCurrentRetirementStatements) {
    throw new Error("Form 8880 historical IRA proof requires a 2026 single return without current Form 1099-R originals");
  }
  const references = payments.flatMap(({ original, issuerPayment }) => [original.sourceReference.toLowerCase(), issuerPayment.sourceReference.toLowerCase()]);
  if (new Set(references).size !== references.length) {
    throw new Error("Form 8880 requires separately referenced historical records for each original and issuer payment");
  }
  const total = sumSourceMoney(...payments.map(payment => reconcileHistoricalIraPayment(payment, returnContext.taxpayer.primary)));
  if (!total.eq(primary.testingPeriodDistributionReduction)) {
    throw new Error("Form 8880 line 4 must match the total of the original historical IRA payments");
  }
  return {
    ...sourceFacts2026,
    primary: { ...primary, testingPeriodDistributionReduction: total.toFixed() },
  };
}
