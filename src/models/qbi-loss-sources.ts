import { z } from 'zod';
const amount=z.string().regex(/^-?\d+(\.\d+)?$/).optional();
const evidence={sourceTaxYear:z.number().int().optional(),sourceReference:z.string().optional(),sourceFactsConfirmed:z.boolean().optional()};
/** Actual original records and opening histories; never a current loss/QBI override. */
export const QbiLossSourcesSchema=z.object({
  form461Classification:z.object({...evidence,method:z.enum(['ordinary_k1_only']).optional(),
    allNonEmployeeBusinessSourcesIncluded:z.boolean().optional(),capitalIncomeIsNonbusiness:z.boolean().optional(),
    otherBusinessIncome:amount,otherBusinessDeductions:amount}).optional(),
  ...evidence,allK1ActivitiesIncluded:z.boolean().optional(),
  allExcessBusinessLossHistoriesIncluded:z.boolean().optional(),
  excessBusinessLossHistories:z.array(z.object({
    ...evidence,nolSourceId:z.string().optional(),accountHolder:z.enum(['primary','spouse']).optional(),
    recipientName:z.string().optional(),recipientTaxpayerIdLast4:z.string().optional(),activityName:z.string().optional(),
    activityEIN:z.string().optional(),limitationSourceReference:z.string().optional(),
    originalNol:z.object({sourceId:z.string().optional(),lossTaxYear:z.number().int().optional(),sourceReference:z.string().optional(),
      originKind:z.enum(['individual_nol','excess_business_loss','estate_termination']).optional(),originalLoss:amount,openingCarryforward:amount,
      carrybackTreatment:z.enum(['not_required','waived','completed']).optional(),adjustedThroughTaxYear:z.number().int().optional(),
      historySourceReference:z.string().optional(),allHistoryIncluded:z.boolean().optional(),farmingLossIncluded:z.boolean().optional(),
      history:z.array(z.object({taxYear:z.number().int().optional(),nolUsed:amount,attributeReduction:amount,sourceReference:z.string().optional()})).optional(),
    }).optional(),
    originalQualifiedLoss:amount,qualifiedOpeningCarryforward:amount,allHistoryIncluded:z.boolean().optional(),
    materiallyParticipatedInCurrentYear:z.boolean().optional(),
    history:z.array(z.object({taxYear:z.number().int().optional(),qualifiedNolAbsorption:amount,
      qualifiedAttributeReduction:amount,sourceReference:z.string().optional()})).optional(),
  })).optional(),
  activities:z.array(z.object({
    k1SourceId:z.string().optional(),sourceTaxYear:z.number().int().optional(),sourceReference:z.string().optional(),
    accountHolder:z.enum(['primary','spouse']).optional(),entityType:z.enum(['partnership','s_corporation']).optional(),
    entityName:z.string().optional(),entityEIN:z.string().optional(),recipientName:z.string().optional(),recipientTaxpayerIdLast4:z.string().optional(),
    ordinaryBusinessOnlyConfirmed:z.boolean().optional(),continuingActivityConfirmed:z.boolean().optional(),
    selfEmploymentTreatment:z.object({...evidence,method:z.enum(['ordinary_current']).optional(),
      noOtherPartnerAdjustmentsConfirmed:z.boolean().optional(),
      priorLossHistory:z.object({...evidence,amount}).optional()}).optional(),
    statement:z.object({ordinaryIncome:amount,section199AQBI:amount,section199AW2Wages:amount,section199AUBIA:amount,
      selfEmploymentEarnings:amount,selfEmploymentNetEarningsAfterAdjustments:amount,selfEmploymentIncomeType:z.enum(['farm','nonfarm']).optional(),
      section199AIsSST:z.boolean().optional(),isPassiveActivity:z.boolean().optional(),qbiMateriallyParticipated:z.boolean().optional()}).optional(),
    basis:z.object({...evidence,beginningBasis:amount,noOtherBasisChangesConfirmed:z.boolean().optional(),priorSuspendedLoss:amount}).optional(),
    atRisk:z.object({...evidence,simplifiedMethodEligible:z.boolean().optional(),adjustedBasisAtEffectiveDate:amount,
      priorYearAmountAtRisk:amount,currentYearIncreases:amount,currentYearDecreases:amount,priorSuspendedLoss:amount,
      priorLossHistory:z.object({...evidence,vintages:z.array(z.object({taxYear:z.number().int(),originalLoss:amount,
        qualifiedOriginalLoss:amount,remainingLoss:amount,qualifiedRemainingLoss:amount})).optional()}).optional()}).optional(),
    priorPassiveLoss:amount,sameOwnerHistoryConfirmed:z.boolean().optional(),sameRegularAmtTreatmentConfirmed:z.boolean().optional(),
  })).optional(),
});
export type QbiLossSources=z.infer<typeof QbiLossSourcesSchema>;
