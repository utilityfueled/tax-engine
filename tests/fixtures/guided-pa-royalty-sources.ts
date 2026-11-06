import {actualGuidedRoyaltySources} from './guided-royalty-sources';
/** Explicit synthetic state records, never application defaults. */
export function actualGuidedPARoyaltySources(){
 const raw=actualGuidedRoyaltySources();
 return {...raw,properties:raw.properties.map(property=>({...property,paTreatment:{
  sourceTaxYear:'2025',sourceReference:'Fictional PA property classification record',sourceFactsConfirmed:true,
  accountHolder:property.accountHolder,propertyType:property.propertyType,ownerFullYearPAResident:true,
  paIncomeClass:'royalties-copyrights-patents',forProfit:true,allExpenseClassificationsIncluded:true,
  expenses:property.expenses.map(receipt=>({sourceId:receipt.sourceId,paidDate:receipt.paidDate,amountPaid:receipt.amountPaid,category:receipt.category,
   relatesToRoyaltyRights:true,surfaceRights:false,netIncomeTax:false})),
 }}))};
}
