import { z } from "zod";
import { d } from "@/utils/decimal.js";

const contributor = z.strictObject({
  qualifyingStudentMonths: z.number().int().min(0).max(12),
  dependentDeductionAllowedToAnotherTaxpayer: z.boolean(),
  testingPeriodDistributionReduction: z.string().regex(/^\d+(\.\d+)?$/),
});

const signedAmount = z.string().regex(/^-?\d+(\.\d+)?$/);

/** Confirmed annual inputs, including the net AGI effects of disregarding §§931 and 933. */
const Form8880Sources2026Schema = z.strictObject({
  taxYear: z.literal(2026),
  testingPeriodComplete: z.literal(true),
  primary: contributor,
  spouse: contributor.optional(),
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

export function readForm8880AnnualSources(
  form: { sourceFacts2026?: unknown },
  year: number,
  isJointReturn: boolean,
  hasSpouse: boolean,
  standardDeductionFacts?: {
    primaryCanBeClaimedAsDependent?: boolean;
    spouseCanBeClaimedAsDependent?: boolean;
  },
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
  return sourceFacts2026;
}
