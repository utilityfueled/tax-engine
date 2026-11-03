// Spec: spec/state/pa-ordinary-royalty-sources.yaml.
import {expect,it} from 'vitest';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {paOrdinaryRoyaltyFixture} from '../../fixtures/pa-ordinary-royalty-sources';
import {paOrdinaryOIDFixture} from '../../fixtures/pa-ordinary-oid-sources';
const run=(f:ReturnType<typeof paOrdinaryRoyaltyFixture>)=>calculatePAResidencySources(f.input,f.residency);
it('retains actual guided royalty boxes and derives canonical PA class income',()=>{
 const f=paOrdinaryRoyaltyFixture(),before=JSON.stringify(f),r=run(f);
 expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe('211000');expect(r.taxBeforeCredits.toFixed()).toBe('6478');
 expect(f.input.form1099Misc[0]).toMatchObject({royalties:'12000.25',federalWithheld:'100.10',state:'MI',stateIncome:'12000.25',stateWithheld:'80.20'});
 expect(JSON.stringify(f)).toBe(before);
});
it('replays independently copied corrected legal receipt without changing MISC originals',()=>{
 const original=paOrdinaryRoyaltyFixture(),f=paOrdinaryRoyaltyFixture(true),r=run(f);
 expect(f.input.form1099Misc).toEqual(original.input.form1099Misc);expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe('210900');expect(r.taxBeforeCredits.toFixed()).toBe('6475');
});
it('does not interpret the raw missing canonical royalty packet as zero',()=>{
 const f=paOrdinaryRoyaltyFixture();Reflect.deleteProperty(f.residency,'royaltySources');expect(()=>run(f)).toThrow(/MISC|royalt|source/i);
});
it.each(['owner','year','original','property','unknown','receipt','income','duplicate','unsupported'] as const)('rejects incomplete or stale canonical royalty evidence: %s',kind=>{
 const f=paOrdinaryRoyaltyFixture();
 if(kind==='owner')f.royaltySources.owner.originalTaxpayer.firstName='Wrong';
 if(kind==='year')f.royaltySources.sourceTaxYear=2024;
 if(kind==='original')f.input.form1099Misc[0].stateWithheld='80.21';
 if(kind==='property'&&f.input.royaltyPropertySources)f.input.royaltyPropertySources.sourceReference='Changed';
 if(kind==='unknown')Object.assign(f.royaltySources,{sourceFactsConfirmed:null});
 if(kind==='receipt'&&f.input.royaltyPropertySources?.properties?.[0]?.paTreatment?.expenses)f.input.royaltyPropertySources.properties[0].paTreatment.expenses[0].amountPaid='49.26';
 if(kind==='income')f.input.form1099Misc[0].otherIncome='1';
 if(kind==='duplicate')f.royaltySources.originals.push(structuredClone(f.royaltySources.originals[0]));
 if(kind==='unsupported')f.residency.residency.status='part_year';
 expect(()=>run(f)).toThrow(/source|original|royalt|MISC|residen|complete|scope/i);
});
it('partitions a separate zero-income MISC without weakening its existing remittance guard',()=>{
 const f=paOrdinaryRoyaltyFixture(),zero=paOrdinaryOIDFixture();
 f.input.form1099Misc.push(structuredClone(zero.input.form1099Misc[0]));
 const zeroProof={...structuredClone(zero.oidAndMiscSources),owner:structuredClone(f.royaltySources.owner),oid:[],miscWithholding:[{...structuredClone(zero.oidAndMiscSources.miscWithholding[0]),originalIndex:1}]};
 Object.assign(f.residency,{oidAndMiscSources:zeroProof});
 const r=run(f);expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe('211000');expect(r.oidSources?.paWithholding.toFixed()).toBe('0.2');
 zeroProof.miscWithholding[0].withholdingConfirmation.notRefundedByPayerConfirmed=false;expect(()=>run(f)).toThrow(/withholding|refund|remittance/i);
});
it('conserves actual source cents before printed expense category rounding',()=>{
 const f=paOrdinaryRoyaltyFixture();const p=f.input.royaltyPropertySources?.properties?.[0];if(!p?.expenses||!p.paTreatment?.expenses)throw new Error('Fictional original expense source missing');
 p.expenses.forEach(row=>{row.category='legal-professional';row.amountPaid='0.25';});p.paTreatment.expenses.forEach(row=>{row.category='legal-professional';row.amountPaid='0.25';});
 f.royaltySources.originalPropertySources=structuredClone(f.input.royaltyPropertySources);
 expect(run(f).totalOrdinaryPATaxableIncome.toFixed()).toBe('211999');
});

it('preserves ordinary source residuals beyond fixed Decimal precision without an arbitrary digit limit',()=>{
 const f=paOrdinaryRoyaltyFixture(),gross='1'+'0'.repeat(100)+'.25',p=f.input.royaltyPropertySources?.properties?.[0];
 if(!p?.incomeSources?.[0])throw new Error('Fictional actual royalty original link missing');
 f.input.form1099Misc[0].royalties=gross;f.input.form1099Misc[0].stateIncome=gross;
 p.incomeSources[0].original={...p.incomeSources[0].original,royalties:gross};p.incomeSources[0].allocatedGross=gross;
 f.royaltySources.originals[0].original=structuredClone(f.input.form1099Misc[0]);f.royaltySources.originalPropertySources=structuredClone(f.input.royaltyPropertySources);
 expect(run(f).totalOrdinaryPATaxableIncome.toFixed()).toBe('1'+'0'.repeat(94)+'199000');
});
