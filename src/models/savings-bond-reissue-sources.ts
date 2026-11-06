/** Original ordinary bond reissue records. Saved drafts never acquire defaults. */
import { z } from "zod";

const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
const sourceText = z.string().optional();
const date = z.string().optional();
const owner = z.enum(["taxpayer", "spouse"]).optional();
const identity = z.object({
  firstName: sourceText, lastName: sourceText, ssnLast4: sourceText, dateOfBirth: date,
});

export const SavingsBondReissueSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: sourceText,
  sourceFactsConfirmed: z.boolean().optional(), primary: identity.optional(), spouse: identity.optional(),
  /** Original current statements and their transaction detail; never inferred from bond medium. */
  statements: z.array(z.object({
    sourceId: sourceText, sourceReference: sourceText, originalIndex: z.number().int().nonnegative().optional(),
    payer: sourceText, accountReference: sourceText, accountHolder: z.enum(["primary", "spouse"]).optional(),
    box3: amount, priorRecognizedInterestIncluded: amount, otherBox3Interest: amount,
    redemptionSourceIds: z.array(z.string()).optional(),
    currentTransfers: z.array(z.object({ groupSourceId: sourceText, owner: z.enum(["primary", "spouse"]).optional() })).optional(),
  })).optional(),
  groups: z.array(z.object({
    sourceId: sourceText, originalBondIdentifier: sourceText, sourceReference: sourceText,
    originalBondType: z.enum(["paper_ee", "electronic_ee", "series_i", "other"]).optional(),
    originalIssueDate: date, originalFaceValue: amount,
    originalRegisteredOwner: z.enum(["taxpayer", "spouse", "taxpayer_and_spouse", "other"]).optional(),
    taxpayerPurchaseFunds: amount, spousePurchaseFunds: amount, communityProperty: z.boolean().optional(),
    bothOriginalOwnersLivingConfirmed: z.boolean().optional(), allPriorReportingCompleteConfirmed: z.boolean().optional(),
    taxpayerPreviouslyReportedInterest: amount, spousePreviouslyReportedInterest: amount,
    reissueDate: date, valueAtReissue: amount, allSuccessorsCompleteConfirmed: z.boolean().optional(),
    successors: z.array(z.object({
      sourceId: sourceText, bondIdentifier: sourceText, sourceReference: sourceText, faceValue: amount, registeredOwner: owner,
      furtherOwnershipChanges: z.boolean().optional(), status: z.enum(["redeemed", "held"]).optional(),
      redemptionSourceId: sourceText, postReissuePriorInterestReported: amount,
    })).optional(),
  })).optional(),
});
export type SavingsBondReissueSources = z.infer<typeof SavingsBondReissueSourcesSchema>;
