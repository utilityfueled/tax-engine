/** Spec: state/oh-reciprocal-wages-guided.yaml. Genuine existing APIs only, before products. */
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/index';
import {buildGuidedStateOriginals,buildGuidedOhioOverlay} from '@/lib/guided-state-engine-inputs';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {updateSectionData,validateSection,type StateReturnData} from '@/lib/guided-interview-flow';
import {guidedReciprocalWageFixture,reciprocalRequired as required,type EnteredReciprocalDraft} from '../../fixtures/guided-oh-reciprocal-wages-complete';
const rows=['second','first']as const;
function readDraft(data:StateReturnData):EnteredReciprocalDraft{const raw:unknown=Reflect.get(data,'ohioReciprocalWages');if(!raw||typeof raw!=='object')throw Error('Actual retained native reciprocal draft required');return raw as EnteredReciprocalDraft;}
function runCanonical(f:ReturnType<typeof guidedReciprocalWageFixture>){return calculateOhioResidentReturnFromFederal({taxInput:f.canonical,federalResult:calculateFederalTax(f.canonical)});}
it.each(rows)('pins unchanged strict core and public-safe oracles before native binding %s',position=>{
 const f=guidedReciprocalWageFixture('60000.25','2000.60',position==='first'),before=structuredClone(f),precision=Decimal.precision,result=runCanonical(f);
 expect(calculateFederalTax(f.canonical).agi.toString()).toBe('60000.25');expect(result.scheduleOfAdjustments.line14_reciprocityWages.toString()).toBe('60000');
 expect(result.it1040.line1_federalAgi.toString()).toBe('60000');expect(result.it1040.line3_ohioAgi.toString()).toBe('0');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');expect(result.it1040.line14_ohioWithholding.toString()).toBe('2001');expect(result.it1040.line26_refund.toString()).toBe('2001');
 expect(result.nonresidentCreditResult?.line1.toString()).toBe('0');expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');
 for(const secret of [f.original.taxpayer.primary.ssn,f.source.sourceReference,'PRIVATE-PAYROLL-','PRIVATE-FICTIONAL-OH-STATE-ROW'])expect(JSON.stringify(result)).not.toContain(secret);
 expect(f).toEqual(before);expect(Decimal.precision).toBe(precision);
});
it.each(rows)('answers existing native state API from current actual reciprocal originals %s',position=>{
 const f=guidedReciprocalWageFixture('60000.25','2000.60',position==='first'),before=structuredClone(f.state),bound=buildGuidedStateOriginals(f.original,f.state);
 expect(bound.ohioResidency?.reciprocalWageSources).toEqual(f.source);const federal=calculateFederalTax(bound),publicResult=calculateOhioResidentReturnFromFederal({taxInput:bound,federalResult:federal,overlay:buildGuidedOhioOverlay(bound,f.state,federal.taxExemptInterest)});
 expect(publicResult.it1040.line26_refund.toString()).toBe('2001');expect(publicResult.it1040.line3_ohioAgi.toString()).toBe('0');
 const preview=required(computeGuidedPreview(f.state)),state=required(preview.state);expect(preview.agi).toBe('60000.25');expect(state).toMatchObject({stateCode:'OH',stateTax:'0',stateRefund:'2001',stateAmountOwed:'0',stateWithholding:'2001'});expect(validateSection(f.state,'state-return').status).toBe('complete');expect(f.state).toEqual(before);
});
it.each([['60000.49','2000.49','60000','2000'],['60000.50','2000.50','60001','2001'],['60000.25','0','60000','0']]as const)('retains exact native raw wages %s and Ohio withholding %s',(wages,wh,reportedWages,reportedWH)=>{
 const f=guidedReciprocalWageFixture(wages,wh),unchanged=runCanonical(f);expect(unchanged.it1040.line1_federalAgi.toString()).toBe(reportedWages);expect(unchanged.it1040.line26_refund.toString()).toBe(reportedWH);
 const bound=buildGuidedStateOriginals(f.original,f.state),result=calculateOhioResidentReturnFromFederal({taxInput:bound,federalResult:calculateFederalTax(bound)});expect(required(bound.w2s[0]).wages).toBe(wages);expect(result.scheduleOfAdjustments.line14_reciprocityWages.toString()).toBe(reportedWages);expect(result.it1040.line3_ohioAgi.toString()).toBe('0');expect(result.it1040.line14_ohioWithholding.toString()).toBe(reportedWH);expect(result.it1040.line26_refund.toString()).toBe(reportedWH);
});
const edits=['owner','W2 employer','reciprocal reference','domicile reference','payment reference','actual as-of date']as const;
it.each(edits)('invalidates actual reciprocal confirmation without replacing originals after %s',kind=>{
 const f=guidedReciprocalWageFixture(),old=structuredClone(f.draft),before=structuredClone(f.state);let next;
 if(kind==='owner'){const personal=required(f.state.sectionData['personal-info']);next=updateSectionData(f.state,'personal-info',{...personal,lastName:'Actual changed source owner'});}
 else if(kind==='W2 employer'){const wages=required(f.state.sectionData['income-w2']);next=updateSectionData(f.state,'income-w2',{entries:wages.entries.map(row=>({...row,employerName:'Actual changed equal-money employer'}))});}
 else{const data=structuredClone(f.data);if(kind==='reciprocal reference')readDraft(data).sourceReference='Actual changed documentary source';if(kind==='domicile reference')required(data.ohioResidency).sourceReference='Actual changed domicile original';if(kind==='payment reference')required(data.ohioPayments).sourceReference='Actual changed complete account original';if(kind==='actual as-of date')required(data.ohioPayments).currentTiming.asOfDate='2026-04-02';next=updateSectionData(f.state,'state-return',data);}
 const retained=readDraft(required(next.sectionData['state-return']));expect(retained.sourceFactsConfirmed).not.toBe(true);expect(retained.originalW2).toEqual(old.originalW2);expect(retained.originalTaxpayer).toEqual(old.originalTaxpayer);expect(retained.originalFederalSources).toEqual(old.originalFederalSources);expect(retained.originalResidencySources).toEqual(old.originalResidencySources);expect(retained.originalPaymentSources).toEqual(old.originalPaymentSources);expect(f.state).toEqual(before);
});
it('requires explicit current reciprocal source review after a saved unknown answer',()=>{const f=guidedReciprocalWageFixture();f.draft.sourceFactsConfirmed=null;const before=structuredClone(f.state),validation=validateSection(f.state,'state-return');expect(validation.status).toBe('partial');expect(validation.allowSkip).toBe(false);expect(Object.keys(validation.fieldErrors??{}).join(' ')).toMatch(/reciprocal/i);expect(computeGuidedPreview(f.state)?.state).toBeNull();expect(f.state).toEqual(before);});
it('replays saved actual native sources without refreshing current originals',()=>{const f=guidedReciprocalWageFixture(),saved=JSON.parse(JSON.stringify(f.state)),before=structuredClone(saved),bound=buildGuidedStateOriginals(f.original,saved);expect(bound.ohioResidency?.reciprocalWageSources).toEqual(f.source);expect(saved).toEqual(before);});
it('keeps native no-op and confirmation-only flow changes current',()=>{const f=guidedReciprocalWageFixture(),next=updateSectionData(f.state,'state-return',structuredClone(f.data));expect(readDraft(required(next.sectionData['state-return'])).sourceFactsConfirmed).toBe(true);const unconfirmed=structuredClone(f.state);readDraft(required(unconfirmed.sectionData['state-return'])).sourceFactsConfirmed=null;const reviewed=updateSectionData(unconfirmed,'state-return',structuredClone(f.data));expect(readDraft(required(reviewed.sectionData['state-return'])).sourceFactsConfirmed).toBe(true);});
it('keeps native current2026 public denial and original source privacy',()=>{
 const f=guidedReciprocalWageFixture(),before=structuredClone(f.state),preview=required(computeGuidedPreview(f.state));for(const secret of [f.original.taxpayer.primary.ssn,f.source.sourceReference,'PRIVATE-PAYROLL-'])expect(JSON.stringify(preview)).not.toContain(secret);
 const current=structuredClone(f.original);current.taxpayer.taxYear=2026;const w=required(current.w2s[0]),source=required(w.stateLocalSources);w.taxYear=2026;source.sourceTaxYear=2026;const{stateLocalSources:_rows,...original}=w;source.originalW2=structuredClone(original);expect(()=>calculateFederalTax(current)).toThrow(/Tax year 2026 rule pack .* is incomplete; calculation is unavailable/);expect(f.state).toEqual(before);
});
