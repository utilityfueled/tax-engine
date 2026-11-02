// Spec: spec/federal/form-1099-da-state-rows.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculatePANonresidentReturn } from '@/engine/state/pa-nonresident-orchestrator.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { calculateDigitalAssetStateSources } from '@/engine/state/digital-asset-sources.js';
import { actualDigitalAssetSource } from '../../fixtures/digital-asset-sources.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
function original() { return { ...structuredClone(actualDigitalAssetSource), stateTaxReporting: 'multiple', stateWithheld: undefined,
 stateWithholding: [{ state: 'PA', stateIdentificationNumber: 'PA-actual', stateWithheld: '0.10' }, { state: 'OH', stateIdentificationNumber: '', stateWithheld: '0.20' }],
 transactions: actualDigitalAssetSource.transactions.map(row=>({...row,paCostBasis:'80.24',paBasisSourceReference:'Actual PA ledger',paBasisFactsConfirmed:true,paTransactionForProfitConfirmed:true})) }; }
function parsed(form: ReturnType<typeof original>) { return TaxYearInputSchema.parse({...simpleW2Fixture,form1099DA:[form]}); }
it('preserves separate state originals and one federal disposition',()=>{
 const input=parsed(original()),before=JSON.stringify(input),result=calculateForm1099DASources(input);
 expect(result.capitalForms).toHaveLength(1); expect(result.capitalForms[0].transactions).toHaveLength(1);
 expect(result.federalWithheld.toFixed()).toBe('0.1'); expect(result.capitalForms[0].stateWithheld).toBe('0.3');
 expect(result.stateWithholding[0]).toMatchObject({state:'PA',stateWithheld:'0.10',stateIdentificationNumber:'PA-actual'});
 expect(JSON.stringify(input)).toBe(before);
});
it('selects only matching original withholding in each state view',()=>{
 const input=parsed(original());
 expect(calculateDigitalAssetStateSources(input,'PA').form1099B[0]).toMatchObject({state:'PA',stateWithheld:'0.10',transactions:[{costBasis:'80.24'}]});
 expect(calculateDigitalAssetStateSources(input,'OH').form1099B[0]).toMatchObject({state:'OH',stateWithheld:'0.20',transactions:[{costBasis:'90.24'}]});
});
it('rejects incomplete or contradictory original state rows',()=>{
 const row=original().stateWithholding[0];
 for(const patch of [{stateWithholding:undefined},{stateWithholding:[row]},{stateWithholding:[row,row]},{stateWithholding:[row,row,row]},{stateWithholding:[row,{...row,state:'NY'}]},
 {stateWithholding:[row,{...row,state:'OH',stateWithheld:undefined}]},{stateWithholding:[row,{...row,state:'OH',stateIdentificationNumber:undefined}]},
 {stateWithholding:[row,{...row,state:'OH',stateWithheld:'-1'}]},{state:'PA'},{stateWithheld:'0.31'},{stateTaxReporting:'none'}, {sourceFactsConfirmed:false}]) {
 expect(()=>calculateForm1099DASources(TaxYearInputSchema.parse({...simpleW2Fixture,form1099DA:[{...original(),...patch}]}))).toThrow();
 }
 const zero=original();zero.stateWithholding[1].stateWithheld='0';expect(calculateForm1099DASources(parsed(zero)).stateWithholding[1].stateWithheld).toBe('0');
});

it('preserves exact large cents and applies the same source contract in2026',()=>{
 const source=original();source.stateWithholding[0].stateWithheld='9007199254740993.10';
 expect(calculateForm1099DASources(parsed(source)).capitalForms[0].stateWithheld).toBe('9007199254740993.3');
 source.taxYear=2026;source.transactions[0].dateAcquired='2026-01-15';source.transactions[0].dateSold='2026-06-01';
 const input=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},form1099DA:[source]});
 expect(calculateForm1099DASources(input).federalWithheld.toFixed()).toBe('0.1');
});

it('rejects legacy row bypass and conflicting scalar state IDs',()=>{
 const legacy={brokerName:'Legacy broker',transactions:[{digitalAssetName:'Bitcoin',quantity:'1',dateAcquired:'2024-01-01',dateSold:'2025-06-01',proceeds:'100',costBasis:'90',holdingPeriod:'long',transactionType:'sale'}]};
 for(const fields of [{stateWithholding:[]},{stateWithholding:original().stateWithholding},{stateIdentificationNumber:'Unexpected scalar ID'}]) {
  const input=TaxYearInputSchema.parse({...simpleW2Fixture,form1099DA:[{...legacy,...fields}]});
  expect(()=>calculateForm1099DASources(input)).toThrow(/complete original|actual/i);
 }
 const scalar=original();
 expect(()=>calculateForm1099DASources(TaxYearInputSchema.parse({...simpleW2Fixture,form1099DA:[{...scalar,stateIdentificationNumber:'scalar conflicts'}]}))).toThrow(/scalar|conflict/i);
});

it('rejects unsupported Pennsylvania residency before calculation',()=>{
 expect(()=>calculatePANonresidentReturn(parsed(original()),{residencyStatus:'nonresident'})).toThrow(/two-state.*residency|two-state.*nonresident/i);
 expect(()=>calculatePANonresidentReturn(parsed(original()),{residencyStatus:'part_year'})).toThrow(/two-state.*residency|two-state.*nonresident/i);
});

it('rejects no-state reporting with a retained nonblank original ID',()=>{
 const none=structuredClone(actualDigitalAssetSource);
 const withId=(stateIdentificationNumber:string|undefined)=>TaxYearInputSchema.parse({...simpleW2Fixture,form1099DA:[{...none,stateIdentificationNumber}]});
 expect(()=>calculateForm1099DASources(withId('ORIGINAL-STATE-ID'))).toThrow(/no-state.*identif|no-state.*conflict/i);
 for(const blank of [undefined,'','   ']) {const r=calculateForm1099DASources(withId(blank));expect(r.stateWithholding).toEqual([]);expect(r.federalWithheld.toFixed()).toBe('0.1');expect(r.capitalForms).toHaveLength(1);}
});
