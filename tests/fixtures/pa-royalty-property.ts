import { royaltyPropertyFixture } from './royalty-property.js';
export function paRoyaltyPropertyFixture() {
  const raw=royaltyPropertyFixture(),property=raw.royaltyPropertySources.properties[0];
  return {...raw,taxpayer:{...raw.taxpayer,stateResidency:'full-year' as const,address:{...raw.taxpayer.address,state:'PA'}},royaltyPropertySources:{...raw.royaltyPropertySources,properties:[{...property,paTreatment:{
    sourceTaxYear:2025,sourceReference:'Actual PA royalty classification',sourceFactsConfirmed:true,
    accountHolder:property.accountHolder,propertyType:property.propertyType,ownerFullYearPAResident:true,
    paIncomeClass:'royalties-copyrights-patents' as const,forProfit:true,allExpenseClassificationsIncluded:true,
    expenses:property.expenses.map(receipt=>({sourceId:receipt.sourceId,paidDate:receipt.paidDate,amountPaid:receipt.amountPaid,category:receipt.category,
      relatesToRoyaltyRights:true,surfaceRights:false,netIncomeTax:false})),
  }}]}};
}
