import { z } from "zod";
import { d } from "@/utils/decimal.js";
import { isBeforeAge59AndHalfDate } from "@/utils/retirement-age.js";

const unsignedAmount = z.string().regex(/^\d+(\.\d+)?$/);
const payerTin = z.string().regex(/^\d{2}-?\d{7}$/);
const sourceReference = z.string().trim().min(1);

const contributor = z.strictObject({
  qualifyingStudentMonths: z.number().int().min(0).max(12),
  dependentDeductionAllowedToAnotherTaxpayer: z.boolean(),
  testingPeriodDistributionReduction: unsignedAmount,
});

const signedAmount = z.string().regex(/^-?\d+(\.\d+)?$/);

const priorYearOrdinaryIraDistribution = z.strictObject({
  original: z.strictObject({
    taxYear: z.literal(2025),
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
    receivedDate: z.iso.date().refine(date => date.startsWith("2025-")),
    amount: unsignedAmount,
  }),
  statementReportsThisSinglePaymentConfirmed: z.literal(true),
  noLine4ExclusionConfirmed: z.literal(true),
  /** Covers the full testing period before the actual applicable due date, including extensions. */
  onlyIncludiblePaymentForTestingPeriodConfirmed: z.literal(true),
});

/** Confirmed annual inputs, including the net AGI effects of disregarding §§931 and 933. */
const Form8880Sources2026Schema = z.strictObject({
  taxYear: z.literal(2026),
  testingPeriodComplete: z.literal(true),
  primary: contributor,
  spouse: contributor.optional(),
  priorYearOrdinaryIraDistribution: priorYearOrdinaryIraDistribution.optional(),
  americanSamoaAgiRestoration: signedAmount,
  puertoRicoAgiRestoration: signedAmount,
});

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
  const priorYear = sourceFacts2026.priorYearOrdinaryIraDistribution;
  if (!priorYear) return sourceFacts2026;
  if (!returnContext || returnContext.taxpayer.filingStatus !== "single" || hasSpouse
    || returnContext.hasCurrentRetirementStatements) {
    throw new Error("Form 8880 historical IRA proof requires a 2026 single return without current Form 1099-R originals");
  }
  const { original, issuerPayment } = priorYear;
  const { dateOfBirth, ssn } = returnContext.taxpayer.primary;
  const taxpayerId = ssn.replace(/-/g, "");
  if (!/^\d{9}$/.test(taxpayerId) || taxpayerId.slice(-4) !== original.recipientTaxIdLast4
    || !z.iso.date().safeParse(dateOfBirth).success
    || isBeforeAge59AndHalfDate(new Date(`${dateOfBirth}T00:00:00Z`), new Date(`${issuerPayment.receivedDate}T00:00:00Z`))) {
    throw new Error("Form 8880 historical IRA proof must match the primary owner and ordinary distribution age at receipt");
  }
  const gross = d(original.grossDistribution);
  if (original.payerTin.replace("-", "") !== issuerPayment.payerTin.replace("-", "")
    || original.accountReference.toLowerCase() !== issuerPayment.accountReference.toLowerCase()
    || original.sourceReference.toLowerCase() === issuerPayment.sourceReference.toLowerCase()
    || !gross.gt(0) || !gross.eq(original.taxableAmount) || !gross.eq(issuerPayment.amount)) {
    throw new Error("Form 8880 requires separately referenced historical records matching the issuer, account and fully taxable payment amount");
  }
  if (!gross.eq(primary.testingPeriodDistributionReduction)) {
    throw new Error("Form 8880 line 4 must match the original historical IRA payment amount");
  }
  return {
    ...sourceFacts2026,
    primary: { ...primary, testingPeriodDistributionReduction: gross.toFixed() },
  };
}
