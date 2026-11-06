import { TaxYearInputSchema, type CryptoDonation } from '@/models/inputs.js';
import { currentCategoryFixture, currentCategoryContext } from './current-charitable-categories.js';
export function currentCryptoFixture() {
 const input=currentCategoryFixture('10000','0','10000','0','0');
 input.donations=input.donations.filter(row=>row.type==='cash');
 input.w2s[0].wages='100000'; input.w2s[0].federalWithheld='20000';
 const base:CryptoDonation={asset:'BTC',quantity:'1',dateAcquired:'2024-01-01',dateDonated:'2026-06-01',fairMarketValueAtDonation:'20000',costBasis:'1000',charityName:'Actual synthetic public recipient',charityEIN:'12-3456789',isQualifiedOrganization:true,recipientCategory:'fifty-percent',capitalAsset:true,sourceFactsConfirmed:true,fullOwnershipInterestDonated:true,noGoodsOrServicesReceived:true,substantiationRequirementsMet:true,appraisalRequired:true,qualifiedAppraisalObtained:true};
 return TaxYearInputSchema.parse({...input,cryptoIncome:{donations:[
  {...base,asset:'ETH',dateAcquired:'2026-01-01',fairMarketValueAtDonation:'8000',costBasis:'5000'},
  base,
  {...base,charityName:'Actual synthetic other recipient',recipientCategory:'other-thirty-percent',fairMarketValueAtDonation:'15000'},
 ]}});
}
export function currentCryptoContext(){return currentCategoryContext('10000','5000','10000','20000','15000');}
