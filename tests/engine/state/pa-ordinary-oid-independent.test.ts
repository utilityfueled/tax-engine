// Spec: spec/state/pa-ordinary-oid-independent.yaml; author products frozen unchanged.
import {describe,it,expect} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import {calculatePAOrdinaryOIDSources} from '@/engine/state/pa-ordinary-oid-sources.js';
import {paOrdinaryOIDFixture,refreshPAOIDOriginals} from '../../fixtures/pa-ordinary-oid-sources.js';
const period=[{from:'2025-01-01',through:'2025-12-31'}];
const run=(f:ReturnType<typeof paOrdinaryOIDFixture>)=>calculatePAOrdinaryOIDSources(f.input,f.oidAndMiscSources,period);
const big='1'+'0'.repeat(100)+'.49';
function exactFixture(){
 const f=paOrdinaryOIDFixture('resident','taxable');
 f.input.form1099OID[0].originalIssueDiscount=big;
 f.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-12-31',oid:big,coupon:'0',sourceReference:'Fictional accepted exact original huge decimal'}];
 refreshPAOIDOriginals(f);return f;
}
describe('independent actual OID source controls',()=>{
 it('preserves accepted source digits beyond fixed100 precision',()=>{const f=exactFixture();expect(run(f).taxableInterest.toFixed()).toBe(big);});
 it('rejects an actual original discrepancy beyond fixed100 precision',()=>{const f=exactFixture();f.oidAndMiscSources.oid[0].accruals[0].oid='1'+'0'.repeat(100)+'.48';expect(()=>run(f)).toThrow(/reconcile/);});
 it('repeats the exact pure source replay',()=>{const f=paOrdinaryOIDFixture();const before=structuredClone(f);expect(isDeepStrictEqual(run(f),run(f))).toBe(true);expect(f).toEqual(before);});
 it('preserves other-state withholding independently from actual PA payment',()=>{const f=paOrdinaryOIDFixture();f.input.form1099OID[0].stateWithholding=[{state:'PA',statePayerId:'Fictional PA payer original',stateWithheld:'0.17'},{state:'NY',statePayerId:'Fictional NY payer original',stateWithheld:'2.13'}];refreshPAOIDOriginals(f);const r=run(f);expect(r.paWithholding.toFixed()).toBe('0.37');expect(r.stateWithholding.map(row=>({state:row.state,amount:row.amount.toFixed()}))).toEqual([{state:'PA',amount:'0.17'},{state:'NY',amount:'2.13'},{state:'PA',amount:'0.2'}]);});
 it('admits actual known no PA withholding without inventing a PA remittance',()=>{const f=paOrdinaryOIDFixture();f.input.form1099OID[0].stateWithholding=[];f.oidAndMiscSources.oid[0].withholdingConfirmation.actualPaymentToPAConfirmed=false;refreshPAOIDOriginals(f);const r=run(f);expect(r.paWithholding.toFixed()).toBe('0.2');expect(r.worldwideExemptInterest.toFixed()).toBe('1000');});
 it('requires actual remittance and not-refunded proof even for physical PA state boxes',()=>{for(const key of ['actualPaymentToPAConfirmed','notRefundedByPayerConfirmed'] as const){for(const value of [null,false]){const f=paOrdinaryOIDFixture();(f.oidAndMiscSources.oid[0].withholdingConfirmation as Record<string,unknown>)[key]=value;expect(()=>run(f)).toThrow(/remittance/);}}});
});
