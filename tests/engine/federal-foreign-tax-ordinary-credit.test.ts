// Spec: spec/federal/foreign-tax-ordinary-credit.yaml,canonical.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
 const original=await importOriginal<typeof import('@/models/constants.js')>();
 const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
 return{...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from '@/engine/federal.js';
import {foreignTaxOrdinaryCreditFixture} from '../fixtures/foreign-tax-ordinary-credit.js';
function fixture(year=2025){
 const input=foreignTaxOrdinaryCreditFixture(year),facts=input.foreignTaxElection?.creditWithForm1116;
 if(!facts||!input.foreignTaxElection)throw new Error('Missing explicit actual sources');
 facts.amtCarryback={taxYear:year-1,election:'form1116_credit',sourceFactsConfirmed:true,sourceReference:'Actual prior zero-capacity AMT source',allPriorUseIncludedConfirmed:true,limitation:'0',currentTaxes:'0',priorCarryoversUsed:'0'};
 input.foreignTaxElection.noUnusedCreditCarryoversConfirmed=false;
 facts.carryovers=[{originTaxYear:year-10,category:'passive',amount:'500',sourceReference:'Actual prior regular balance'}];
 return input;
}
function sources(input:ReturnType<typeof fixture>){
 const facts=input.foreignTaxElection?.creditWithForm1116;
 if(!facts||!facts.incomeSources?.[0])throw new Error('Missing actual synthetic foreign worksheet');
 return{facts,income:facts.incomeSources[0]};
}
it('routes actual ordinary regular and AMT credits with separate carry histories',()=>{
 const input=fixture(),before=JSON.stringify(input),result=calculateFederalTax(input),credit=result.foreignTaxOrdinaryCredit;
 expect(result.agi.toFixed()).toBe('100000');expect(result.taxableIncome.toFixed()).toBe('84250');expect(result.ordinaryTax.toFixed()).toBe('13455');
 expect(result.foreignTaxCredit.toFixed()).toBe('1346');expect(credit?.regular.priorUsed.toFixed()).toBe('446');expect(credit?.regular.expired.toFixed()).toBe('54');
 expect(credit?.amt.creditAllowed.toFixed()).toBe('309');expect(credit?.amt.currentCarryforward.toFixed()).toBe('591');
 expect(result.form6251?.lines.find(row=>row.line==='8')?.value.toFixed()).toBe('309');expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe('2785');
 expect(result.form6251?.lines.find(row=>row.line==='10')?.value.toFixed()).toBe('12109');
 expect(result.schedule3?.lines.find(row=>row.line==='1')?.value.toFixed()).toBe('1346');
 expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0].amount.toFixed()).toBe('591');
 expect(result.allLines.filter(row=>row.form==='Form 6251'&&row.line==='8')).toHaveLength(1);
 expect(result.allLines.some(row=>row.form==='Form 1116')).toBe(false);expect(JSON.stringify(input)).toBe(before);
 const next=calculateFederalTax(fixture(2026));
 // Statutory2026 preview: taxable83900; 12400*.10+38000*.12+33500*.22=13170.
 // Foreign net8390; ratio .1 =>1317. AMT(100000-90100)*.26=2574; .1=>257.
 expect(next.ordinaryTax.toFixed()).toBe('13170');expect(next.foreignTaxCredit.toFixed()).toBe('1317');
 expect(next.foreignTaxOrdinaryCredit?.amt.creditAllowed.toFixed()).toBe('257');expect(next.foreignTaxOrdinaryCredit?.amt.currentCarryforward.toFixed()).toBe('643');
});
it('rejects source context conflicts instead of using the historical estimate',()=>{
 const edits:Array<(i:ReturnType<typeof fixture>)=>void>=[
  i=>{i.form1099Div.push({payer:'Other',ordinaryDividends:'100',qualifiedDividends:'100'} as typeof i.form1099Div[number]);},
  i=>{i.adjustments={...i.adjustments,alimonyPaid:'1'};},
  i=>{sources(i).facts.amtCarryback=undefined;},
  i=>{sources(i).income.foreignIncome='20000.01';},
 ];
 for(const edit of edits){const input=fixture();edit(input);expect(()=>calculateFederalTax(input)).toThrow();}
});
