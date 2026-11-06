import {expect,it} from 'vitest';
import {parseApplicationTaskOutput} from '../../packages/engine/src/ai-application-bindings';
import {validateProviderEvalOutput} from '../../packages/engine/src/provider-eval-application';
import {taxProviderModelEvalFixtures} from '../../packages/engine/src/provider-eval-fixtures';
const source={id:'document:1',text:'SSA-1099 box 3 18,000.00; box 4 2,000.00; box 5 16,000.00; box 6 300.00.'};
function payload(fields:Array<[string,string|null,string|null]>){return {disposition:'answer',sourceIds:[source.id],label:'Source',payer:'',documentPeriod:'',summary:'Unconfirmed source observations.',suggestions:[],facts:fields.map(([name,value,sourceQuote])=>({name,kind:'money',value,sourceId:source.id,sourceQuote}))};}
it('rejects a named SSA fact copied from another real source box',()=>{
 const swapped=payload([['repaidBenefits','300','box 6 300.00.'],['withholding','2000','box 4 2,000.00;']]);
 expect(()=>parseApplicationTaskOutput('income-extraction',swapped,{sources:[source]})).toThrow();
});
it('rejects swapped SSA values in the actual evaluation caller without consulting golden amounts',()=>{
 const f=taxProviderModelEvalFixtures.find(x=>x.id==='case-income-social-security-net');expect(f).toBeDefined();if(!f)throw Error('Missing actual fixture');
 const swapped=payload([['repaidBenefits','300','box 6 300.00.'],['withholding','2000','box 4 2,000.00;']]);
 const actual={...swapped,sourceIds:f.sourceIds,facts:swapped.facts.map(x=>({...x,sourceId:f.sourceIds[0]}))};
 const result=validateProviderEvalOutput(f,actual);expect(result.applicationSchemaValid).toBe(true);expect(result.normalizationStatus).toBe('failed');expect(result.blocker).toBe('application-grounding');expect(result.applicationOutput).toEqual(actual);
});
it('preserves printed zero unknowns and exact signed cents without arithmetic inference',()=>{
 const s={id:source.id,text:'SSA-1099 box 3 0.00; box 4 9,007,199,254,740,993.01; box 5 (2.37); box 6 0.00.'};
 const value=payload([['grossBenefits','0','box 3 0.00;'],['repaidBenefits','9007199254740993.01','box 4 9,007,199,254,740,993.01;'],['netBenefits','-2.37','box 5 (2.37);'],['withholding','0.00','box 6 0.00.']]);
 expect(parseApplicationTaskOutput('income-extraction',value,{sources:[s]})).toEqual(value);
 const missing={id:source.id,text:'SSA-1099 box 3 18,000.00; box 4 2,000.00; box 6 300.00.'};
 const unknown=payload([['netBenefits',null,null]]);expect(parseApplicationTaskOutput('income-extraction',unknown,{sources:[missing]})).toEqual(unknown);
 expect(()=>parseApplicationTaskOutput('income-extraction',payload([['netBenefits','16000',missing.text]]),{sources:[missing]})).toThrow();
});
it('requires the numbered source anchor even when another box has the same amount',()=>{
 const s={id:source.id,text:'SSA-1099 box 3 300.00; box 4 300.00; box 5 0.00; box 6 0.00.'};
 for(const quote of ['300.00','box 3 300.00;'])expect(()=>parseApplicationTaskOutput('income-extraction',payload([['repaidBenefits','300',quote]]),{sources:[s]})).toThrow();
 const good=payload([['repaidBenefits','300','box 4 300.00;']]);expect(parseApplicationTaskOutput('income-extraction',good,{sources:[s]})).toEqual(good);
});
it.each([
 'SSA-1099 box 3 18,000.00; box 4 2,000.00; box 4 2000.00; box 6 300.00.',
 'SSA-1099 box 3 18,000.00; box 4 2,000.00; SSA-1099 box 6 300.00.',
 'SSA-1099 box 3 18,000.00; box 4 2,000.00; RRB-1099 box 6 300.00.',
 'SSA-1099 box 3 18,000.00; box 4 Benefits Repaid in 2026 2,000.00; box 6 300.00.',
 'SSA-1099 box 3 18,000.00; box 4 2000.00 or 300.00; box 6 300.00.',
 'SSA-1099 box 3 18,000.00; box 4 not stated; box 6 300.00.',
])('fails known SSA proposals closed for ambiguous or unsupported source text: %s',text=>{
 expect(()=>parseApplicationTaskOutput('income-extraction',payload([['repaidBenefits','2000',text]]),{sources:[{id:source.id,text}]})).toThrow();
});
it('does not accept unsupported SSA money names or trust a model label to bypass source identity',()=>{
 expect(()=>parseApplicationTaskOutput('income-extraction',payload([['anyAmount','2000','box 4 2,000.00;']]),{sources:[source]})).toThrow();
 const swapped={...payload([['withholding','2000','box 4 2,000.00;']]),label:'W-2'};expect(()=>parseApplicationTaskOutput('income-extraction',swapped,{sources:[source]})).toThrow();
});
it('accepts actual source-box values using either bounded or whole-source quotes without input mutation',()=>{
 const correct=payload([['grossBenefits','18000','SSA-1099 box 3 18,000.00;'],['repaidBenefits','2000','box 4 2,000.00;'],['netBenefits','16000','box 5 16,000.00;'],['withholding','300',source.text]]),before=JSON.stringify(correct);
 expect(parseApplicationTaskOutput('income-extraction',correct,{sources:[source]})).toEqual(correct);expect(JSON.stringify(correct)).toBe(before);
});
it('compares every SSA semantic field against its own box for unrelated amounts',()=>{
 const s={id:source.id,text:'SSA-1099 box 3 61.07; box 4 9.02; box 5 52.05; box 6 0.13.'};
 for(const [name,amount,quote] of [['grossBenefits','61.07','box 3 61.07;'],['repaidBenefits','9.02','box 4 9.02;'],['netBenefits','52.05','box 5 52.05;'],['withholding','0.13','box 6 0.13.']] as const){
  expect(parseApplicationTaskOutput('income-extraction',payload([[name,amount,quote]]),{sources:[s]})).toBeDefined();
  const other=name==='withholding'?['9.02','box 4 9.02;']:['0.13','box 6 0.13.'];expect(()=>parseApplicationTaskOutput('income-extraction',payload([[name,other[0],other[1]]]),{sources:[s]})).toThrow();
 }
});
it('does not derive the eval box rule from expected monetary values',()=>{
 const f=taxProviderModelEvalFixtures.find(x=>x.id==='case-income-social-security-net');if(!f)throw Error('Missing fixture');
 const altered={...f,expected:{...f.expected,fields:Object.fromEntries(Object.entries(f.expected.fields).map(([k,v])=>[k,{...v,value:'777'}]))}};
 const good=payload([['repaidBenefits','2000','box 4 2,000.00;']]);const actual={...good,sourceIds:f.sourceIds,facts:good.facts.map(x=>({...x,sourceId:f.sourceIds[0]}))};
 expect(validateProviderEvalOutput(altered,actual).normalizationStatus).toBe('bound');
});
it('leaves non-SSA monetary grounding unchanged and preserves existing safety rejection',()=>{
 const s={id:source.id,text:'W-2 box 1 42.17; box 2 0.00.'};
 const good=payload([['withholding','0','box 2 0.00.']]);expect(parseApplicationTaskOutput('income-extraction',good,{sources:[s]})).toEqual(good);
 expect(()=>parseApplicationTaskOutput('income-extraction',{...good,summary:'Ready to file.'},{sources:[s]})).toThrow();
 expect(()=>parseApplicationTaskOutput('income-extraction',{...good,sourceIds:['invented']},{sources:[s]})).toThrow();
});
it('rejects a canonical SSA monetary field disguised as text in the no-requested-fields caller',()=>{
 const disguised=payload([['withholding','2,000.00','box 4 2,000.00;']]);disguised.facts[0].kind='text';
 expect(()=>parseApplicationTaskOutput('income-extraction',disguised,{sources:[source]})).toThrow();
});

it('rejects explicitly mixed tax form boundaries before accepting SSA facts',()=>{
 for(const foreign of ['W-2','W2','W-2c','W-2G','1099-R','1099-INT','1098-T','1042-S','5498-SA','3921','3922','Form 1040','Form 1099-R']){
  const text=`SSA-1099 box 3 100.00; box 4 12.34; box 5 87.66; ${foreign} box 6 300.00.`;
  const wrong=payload([['withholding','300','box 6 300.00.']]);
  expect(()=>parseApplicationTaskOutput('income-extraction',wrong,{sources:[{id:source.id,text}]})).toThrow();
  const unknown=payload([['withholding',null,null]]);expect(parseApplicationTaskOutput('income-extraction',unknown,{sources:[{id:source.id,text}]})).toEqual(unknown);
 }
});

it('does not mistake exact boxed amounts for source form identities',()=>{
 for(const printed of ['1099.50','1098.00','3921.00','3922.00','5498.00','-1099.50','(1099.50)','1099']){
  const value=printed.startsWith('(')?'-1099.50':printed,text=`SSA-1099 box 3 9000.00; box 4 ${printed}; box 5 3000.00; box 6 0.00.`;
  const proposal=payload([['repaidBenefits',value,`box 4 ${printed};`]]);expect(parseApplicationTaskOutput('income-extraction',proposal,{sources:[{id:source.id,text}]})).toEqual(proposal);
 }
});
