import {expect,it,vi} from 'vitest';
import {createDocumentAiExecutor} from '../../../apps/web/src/lib/document-ai-tasks';
vi.mock('server-only',()=>({}));
it('rejects swapped SSA boxes through the actual document adapter and records its failed usage once',async()=>{
 const source='SSA-1099 box 3 18,000.00; box 4 2,000.00; box 5 16,000.00; box 6 300.00.';
 const payload={disposition:'answer',sourceIds:['document:1'],label:'SSA-1099',payer:'',documentPeriod:'',summary:'Unconfirmed proposal.',suggestions:[],facts:[{name:'withholding',kind:'money',value:'2000',sourceId:'document:1',sourceQuote:'box 4 2,000.00;'}]};
 const fetchFn=vi.fn().mockResolvedValue(Response.json({status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:100,output_tokens:100}})),recordAttempt=vi.fn();
 const run=createDocumentAiExecutor({mode:'evaluation',syntheticFixtureId:'ssa-source-box-negative',apiKey:'synthetic',fetchFn,recordAttempt,now:()=> '2026-11-05'});
 expect(await run('income-extraction','Extract unconfirmed source facts.',source)).toBeNull();expect(fetchFn).toHaveBeenCalledTimes(1);expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(),expect.objectContaining({accepted:false,usage:expect.objectContaining({inputTokens:100,outputTokens:100})}));
});
it('accepts the correct explicit SSA box through the real adapter and keeps production disabled',async()=>{
 const source='SSA-1099 box 3 18,000.00; box 4 2,000.00; box 5 16,000.00; box 6 0.00.';
 const payload={disposition:'answer',sourceIds:['document:1'],label:'SSA-1099',payer:'',documentPeriod:'',summary:'Unconfirmed source proposal.',suggestions:[],facts:[{name:'withholding',kind:'money',value:'0',sourceId:'document:1',sourceQuote:'box 6 0.00.'}]};
 const fetchFn=vi.fn().mockResolvedValue(Response.json({status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:100,output_tokens:100}})),recordAttempt=vi.fn();
 const run=createDocumentAiExecutor({mode:'evaluation',syntheticFixtureId:'ssa-source-box-positive',apiKey:'synthetic',fetchFn,recordAttempt,now:()=> '2026-11-05'});
 expect(await run('income-extraction','Extract unconfirmed facts.',source)).toEqual(payload);expect(fetchFn).toHaveBeenCalledTimes(1);expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(),expect.objectContaining({accepted:true}));
 fetchFn.mockClear();const production=createDocumentAiExecutor({mode:'production',apiKey:'synthetic',fetchFn});expect(await production('income-extraction','Extract.',source)).toBeNull();expect(fetchFn).not.toHaveBeenCalled();
});

it('rejects a separate trailing W2 box through actual document grounding with usage retained',async()=>{
 const source='SSA-1099 box 3 100.00; box 4 12.34; box 5 87.66; W-2 box 6 300.00.';
 const payload={disposition:'answer',sourceIds:['document:1'],label:'Unconfirmed',payer:'',documentPeriod:'',summary:'Unconfirmed source proposal.',suggestions:[],facts:[{name:'withholding',kind:'money',value:'300',sourceId:'document:1',sourceQuote:'box 6 300.00.'}]};
 const fetchFn=vi.fn().mockResolvedValue(Response.json({status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:100,output_tokens:100}})),recordAttempt=vi.fn();
 const run=createDocumentAiExecutor({mode:'evaluation',syntheticFixtureId:'ssa-mixed-source-negative',apiKey:'synthetic',fetchFn,recordAttempt,now:()=> '2026-11-05'});
 expect(await run('income-extraction','Extract unconfirmed source facts.',source)).toBeNull();expect(fetchFn).toHaveBeenCalledTimes(1);expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(),expect.objectContaining({accepted:false,usage:expect.objectContaining({inputTokens:100,outputTokens:100})}));
});
