// Spec: spec/federal/current-charitable-crypto-handoff.yaml.
import {expect,it} from 'vitest';
import {calculateCurrentCharitableCandidates} from '@/engine/forms/current-charitable-candidates.js';
import {currentCryptoFixture,currentCryptoContext} from '../../fixtures/current-charitable-crypto.js';
import {d} from '@/utils/decimal.js';
const carries=(rows:{category:string;medium?:string;amount:{toFixed():string}}[])=>rows.map(row=>[row.category,row.medium,row.amount.toFixed()]);
it('reconciles verified crypto and direct receipts once by original category',()=>{
 const input=currentCryptoFixture(),ctx=currentCryptoContext(),before=JSON.stringify(input);
 const r=calculateCurrentCharitableCandidates(input,ctx);
 expect(r.itemized.totalDeduction.toFixed()).toBe('54500');
 expect([r.itemized.exactCashDeduction,r.itemized.exactNonCashDeduction].map(x=>x.toFixed())).toEqual(['20000','34500']);
 expect(carries(r.itemized.carryforwards)).toEqual([['capital_gain_20','noncash','5500']]);
 expect(carries(r.nonitemizedCarryforwards)).toEqual([['capital_gain_20','noncash','5000']]);
 const reordered=structuredClone(input);reordered.cryptoIncome?.donations.reverse();reordered.donations.reverse();
 expect(calculateCurrentCharitableCandidates(reordered,ctx)).toEqual(r);
 const cents=currentCryptoFixture(),gift=cents.cryptoIncome?.donations[0];if(!gift)throw Error('Missing synthetic source');gift.costBasis='5000.01';const centsCtx=currentCryptoContext();centsCtx.current.noncashPublic=d('5000.01');
 expect(calculateCurrentCharitableCandidates(cents,centsCtx).itemized.allowedBeforeFloor.noncash_50.toFixed()).toBe('5000.01');
 expect(JSON.stringify(input)).toBe(before);
});
it('preserves unknown valuation and partial media guards at the handoff',()=>{
 for(const mutate of [
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].recipientCategory=undefined;},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].sourceFactsConfirmed=false;},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[1].qualifiedAppraisalObtained=undefined;},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].dateDonated='2025-06-01';},
  (x:ReturnType<typeof currentCryptoFixture>)=>{if(x.cryptoIncome)x.cryptoIncome.donations[0].costBasis='4999.99';},
 ]){const input=currentCryptoFixture();mutate(input);expect(()=>calculateCurrentCharitableCandidates(input,currentCryptoContext())).toThrow();}
 const wrong=currentCryptoContext();wrong.current.capitalGainPublic=d('19999.99');wrong.current.capitalGainPrivate=d('15000.01');expect(()=>calculateCurrentCharitableCandidates(currentCryptoFixture(),wrong)).toThrow(/reconcile/i);
 const ineligible=currentCryptoFixture();if(!ineligible.cryptoIncome)throw Error('Missing source');ineligible.cryptoIncome.donations[2].isQualifiedOrganization=false;const none=currentCryptoContext();none.current.capitalGainPrivate=d('0');expect(calculateCurrentCharitableCandidates(ineligible,none).itemized.totalDeduction.toFixed()).toBe('44500');
 const foundation=currentCryptoFixture();if(!foundation.cryptoIncome)throw Error('Missing source');foundation.cryptoIncome.donations[2].recipientCategory='private-nonoperating';const fctx=currentCryptoContext();fctx.current.capitalGainPrivate=d('1000');expect(calculateCurrentCharitableCandidates(foundation,fctx).currentReceiptAmounts.capitalGainPrivate.toFixed()).toBe('1000');
 const partial=currentCryptoFixture();partial.donations[0].amount='0';partial.donations[1].amount='100';if(!partial.cryptoIncome)throw Error('Missing source');partial.cryptoIncome.donations=[{...partial.cryptoIncome.donations[0],recipientCategory:'other-thirty-percent',fairMarketValueAtDonation:'200',costBasis:'200'}];
 const pctx=currentCryptoContext();pctx.contributionBase=d('10000');for(const key of Object.keys(pctx.current) as (keyof typeof pctx.current)[])pctx.current[key]=d('0');pctx.current.cashPrivate=d('100');pctx.current.noncashPrivate=d('200');expect(()=>calculateCurrentCharitableCandidates(partial,pctx)).toThrow(/partial.*cash\/noncash|allocation method/i);
});
