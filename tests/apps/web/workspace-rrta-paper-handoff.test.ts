// Spec: spec/federal/guided-rrta-review-paper.yaml.
import {afterEach,expect,it,vi} from 'vitest';
import {POST} from '@/app/api/workspace/filled-return/route';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {nativeRRTA} from '../../guided-interview/guided-rrta-fixture';
import {captureGuidedRRTAPayrollSources,buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {captureGuidedRRTAPaper,emptyGuidedRRTAPaper} from '@/lib/guided-rrta-paper-sources';
import {TaxYearInputSchema} from '@/models/inputs';
import {rrtaPayrollReviewOriginalInput} from '@/pdf/rrta-payroll-review-context';
import * as renderer from '@/pdf/fill-return';
vi.mock('server-only',()=>({}));afterEach(()=>vi.restoreAllMocks());
function state(){const s=nativeRRTA(),d=captureGuidedRRTAPayrollSources(s);need(s.sectionData['additional-deductions']).rrtaPayrollSources={...d,sourceFactsConfirmed:true};return s;}
async function post(s:ReturnType<typeof state>,purpose='review'){const w=createWorkspaceRecord('synthetic-rrta-paper');w.returnSummary={...w.returnSummary,targetTaxYear:s.taxYear??null};return POST(new Request('http://localhost/api/workspace/filled-return',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:w,guidedFlowState:s,purpose})}));}
it('prepares an original-bound railroad context through the actual workspace POST before rendering',async()=>{
 const s=state(),d=captureGuidedRRTAPaper(s,{...emptyGuidedRRTAPaper(),sourceTaxYear:'2025',sourceReference:'PRIVATE paper original source',noOrdinaryUncollectedMedicareCodesBOrNConfirmed:true});need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).paperSources={...d,sourceFactsConfirmed:true};const before=structuredClone(s),expected=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s));let original:unknown;
 vi.spyOn(renderer,'fillReturn').mockImplementation(async(input,result,options)=>{original=rrtaPayrollReviewOriginalInput(input,result,options.rrtaPayrollReview);expect(input.taxpayer.primary.ssn).not.toBe(expected.taxpayer.primary.ssn);throw Error('Intentional no-I/O renderer stop after actual opaque-context validation');});
 const response=await post(s);expect(response.status).toBe(400);expect(original).toEqual(expected);expect(s).toEqual(before);
});
it('keeps missing paper evidence and unsupported years unavailable through the actual POST',async()=>{
 const s=state(),spy=vi.spyOn(renderer,'fillReturn');expect((await post(s)).status).toBe(400);expect(spy).not.toHaveBeenCalled();s.taxYear=2026;expect((await post(s)).status).toBe(400);expect(spy).not.toHaveBeenCalled();expect((await post(state(),'filing')).status).toBe(400);expect(spy).not.toHaveBeenCalled();
});

it('rejects client flags stale paper references and positive adjustments before rendering',async()=>{
 const spy=vi.spyOn(renderer,'fillReturn');
 for(const mode of ['uncaptured','unknown','positive','stale']as const){const s=state(),facts={...emptyGuidedRRTAPaper(),sourceTaxYear:'2025',sourceReference:'PRIVATE complete original B-N evidence',noOrdinaryUncollectedMedicareCodesBOrNConfirmed:true};let paper=mode==='uncaptured'?facts:captureGuidedRRTAPaper(s,facts);paper={...paper,sourceFactsConfirmed:true};if(mode==='unknown')paper.noOrdinaryUncollectedMedicareCodesBOrNConfirmed=null;if(mode==='positive')paper.noOrdinaryUncollectedMedicareCodesBOrNConfirmed=false;if(mode==='stale')paper.sourceReference+=' edited';need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).paperSources=paper;expect((await post(s)).status).toBe(400);expect(spy).not.toHaveBeenCalled();}
});

function need<T>(v:T|null|undefined):T{if(v==null)throw Error('Required fictional source');return v;}
