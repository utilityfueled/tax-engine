import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualNolInput } from './net-operating-loss.js';
export function actualEblNolInput() {
  const input=actualNolInput('100000',{priorYear:{}}),original=input.netOperatingLoss!.vintages![0];
  original.originKind='excess_business_loss';original.openingCarryforward='75000';
  original.history=[{taxYear:2023,nolUsed:'20000',attributeReduction:'5000',sourceReference:'Filed2023 use and reduction'}];
  return TaxYearInputSchema.parse({...input,qbiLossSources:{sourceTaxYear:2025,sourceReference:'Actual QBI loss packet',sourceFactsConfirmed:true,allK1ActivitiesIncluded:true,activities:[],allExcessBusinessLossHistoriesIncluded:true,
    excessBusinessLossHistories:[{nolSourceId:'loss2021',sourceTaxYear:2024,sourceReference:'Filed qualified EBL history',sourceFactsConfirmed:true,
      accountHolder:'primary',recipientName:'Jane Doe',recipientTaxpayerIdLast4:'6789',activityName:'Original qualified business',activityEIN:'12-3456789',limitationSourceReference:'Filed Form461 and QBI character',
      originalNol:structuredClone(original),originalQualifiedLoss:'80000',qualifiedOpeningCarryforward:'60000',allHistoryIncluded:true,
      history:[{taxYear:2023,qualifiedNolAbsorption:'16000',qualifiedAttributeReduction:'4000',sourceReference:'Filed qualified2023 carry'}]}]}});
}
