import { TaxYearInputSchema } from '@/models/inputs.js';
import { royaltyNiitFixture } from './niit-royalties.js';

export function royaltyPropertyFixture() {
  const original = { taxYear:2025, sourceId:'royalty-original-1', accountReference:'royalty-account-1',
    sourceFormRevision:'2025-04' as const, accountHolder:'primary' as const,
    payer:'Fictional Royalty Payer', royalties:'12000.25' };
  return { ...royaltyNiitFixture(), form1099Misc:[original], royaltyPropertySources:{
    sourceTaxYear:2025, sourceReference:'Private royalty property records', sourceFactsConfirmed:true,
    allDirectRoyaltySourcesIncluded:true,
    properties:[{ propertyId:'private-property-1', propertyReference:'Private copyright records', accountHolder:'primary' as const,
      propertyType:'copyright' as const, tradeOrBusiness:false, operatingInterest:false, capitalDisposition:false,
      foreignSource:false, communityPropertyAllocationRequired:false, cashMethod:true,
      sameRegularAmtTreatmentConfirmed:true, currentYearExpensesComplete:true,
      interestExpense:'0', depreciationExpense:'0', depletionExpense:'0', otherExpenses:'0', priorUnallowedExpenses:'0',
      incomeSources:[{sourceIndex:0, original:{...original}, allocatedGross:'12000.25'}],
      expenses:[{sourceId:'expense-1',sourceReference:'Private legal receipt',paidDate:'2025-02-15',category:'legal-professional' as const,amountPaid:'49.25',
        ordinaryNecessaryForProperty:true,relatesOnlyToCurrentYear:true,capitalOrImprovement:false,personalOrOwnLabor:false,reimbursed:false},
      {sourceId:'expense-2',sourceReference:'Private agent receipt',paidDate:'2025-12-31',category:'management-fees' as const,amountPaid:'950.50',
        ordinaryNecessaryForProperty:true,relatesOnlyToCurrentYear:true,capitalOrImprovement:false,personalOrOwnLabor:false,reimbursed:false}],
    }],
  } };
}
export function parsedRoyaltyPropertyFixture() { return TaxYearInputSchema.parse(royaltyPropertyFixture()); }
