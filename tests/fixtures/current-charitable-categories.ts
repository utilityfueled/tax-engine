import { nonitemizerCarryFixture } from './nonitemizer-carry.js';
import { d } from '@/utils/decimal.js';
/** Actual synthetic original receipts, not a taxpayer allocation or computed carry. */
export function currentCategoryFixture(g='10000',a='5000',b='10000',c='20000',capitalOther='15000') {
 const input=nonitemizerCarryFixture(g);
 input.donations[0].recipientCategory='fifty-percent';
 input.donations.push(
  {organization:'Actual public ordinary recipient',type:'property',amount:a,costBasis:a,isLongTermCapitalGain:false,dateOfDonation:'2026-06-01',qualifiedOrganization:true,recipientCategory:'fifty-percent'},
  {organization:'Actual other cash recipient',type:'cash',amount:b,dateOfDonation:'2026-06-02',qualifiedOrganization:true,recipientCategory:'other-thirty-percent',supportingOrganization:false,donorAdvisedFund:false},
  {organization:'Actual public investment stock recipient',type:'appreciated_stock',amount:c,costBasis:'0',isLongTermCapitalGain:true,dateOfDonation:'2026-06-03',qualifiedOrganization:true,recipientCategory:'fifty-percent'},
  {organization:'Actual other investment stock recipient',type:'appreciated_stock',amount:capitalOther,costBasis:'0',isLongTermCapitalGain:true,dateOfDonation:'2026-06-04',qualifiedOrganization:true,recipientCategory:'other-thirty-percent'},
 );
 return input;
}
export function currentCategoryContext(g='10000',a='5000',b='10000',c='20000',capitalOther='15000',base='100000') {
 return {contributionBase:d(base),current:{cashPublic:d(g),noncashPublic:d(a),cashPrivate:d(b),noncashPrivate:d('0'),capitalGainPublic:d(c),capitalGainPrivate:d(capitalOther)}};
}
