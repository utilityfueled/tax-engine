import {charitableCarryoverFixture} from './charitable-carryover.js';
/** Actual synthetic current public stock and a complete prior other-cash source. */
export function priorOtherCapacityFixture(currentCapital='40000',currentOther='0') {
 const input=charitableCarryoverFixture();
 if(!input.charitableCarryoverSources?.vintages?.[0])throw Error('Missing synthetic history');
 const prior=input.charitableCarryoverSources.vintages[0];
 Object.assign(prior,{sourceId:'actual-prior-other-cash',category:'other_30',medium:'cash',originalExcess:'30000',openingCarryforward:'30000'});
 input.w2s[0].wages='100000';input.w2s[0].federalWithheld='20000';input.deductionElection='itemized';
 input.donations=[{organization:'Synthetic public stock recipient',type:'appreciated_stock',amount:currentCapital,
  costBasis:'1000',isLongTermCapitalGain:true,dateOfDonation:'2025-06-01',qualifiedOrganization:true,recipientCategory:'fifty-percent'},
  {organization:'Synthetic other cash recipient',type:'cash',amount:currentOther,dateOfDonation:'2025-06-02',
   qualifiedOrganization:true,recipientCategory:'other-thirty-percent'}];
 return input;
}
