/** Spec: state/oh-school-header-same-invocation.yaml. */
import {test,expect,vi}from 'vitest';
import Decimal from 'decimal.js';
import *as federal from '@/engine/federal';
import *as school from '@/engine/state/oh-sd-100-sources';
import * as reviewIdentifiers from '@/pdf/redact-review-identifiers';
import * as ohioAdapter from '@/engine/state/oh-input-adapter';
import {consumeOhioStandaloneSchoolPreviewAdapter,readOhioSchoolAdapterMethod,verifyOhioSchoolScheduleAPayments,withOhioSchoolAdapterInvocation,withOhioStandaloneSchoolPreviewAdapter,withPendingOhioSchoolAdapterInvocation,type OhioSourceAdapterInvocation} from '@/engine/state/oh-source-adapter-invocation';
import {evaluateGuidedRender}from '@/lib/guided-render-evaluation';
import {computeGuidedPreviewOutcome} from '@/lib/guided-preview-compute';
import { buildSectionRoute, validateSection } from '@/lib/guided-interview-flow';
import *as bridge from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema}from '@/models/inputs';
import {schoolPyHeaderPacket,schoolPyPaperCases}from '../fixtures/oh-school-district-part-year-official-review';
import {guidedSchoolDistrictFixture,enteredSchoolDraft}from '../fixtures/guided-oh-school-district-complete';
import {confirmGuidedW2StateLocalSources}from '@/lib/guided-w2-state-local-facts';
import {confirmGuidedOhioResidencyFacts}from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts}from '@/lib/guided-ohio-payment-facts';
import * as residencyFacts from '@/lib/guided-ohio-residency-facts';
import * as paymentFacts from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioSchoolDistrictFacts}from '@/lib/guided-ohio-school-district-facts';
import {buildGuidedOhioReturnHeaderOriginals,confirmGuidedOhioReturnHeaderSources,emptyOhioReturnHeaderDraft}from '@/lib/guided-ohio-return-header-sources';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual diagnostic fixture missing');return v;}

function ohio(which:0|1=0){
 const packet=schoolPyHeaderPacket(required(schoolPyPaperCases[which])),state=guidedSchoolDistrictFixture().state,w=required(packet.canonical.w2s[0]),person=packet.original.taxpayer.primary,address=packet.original.taxpayer.address;
 Object.assign(required(state.sectionData['personal-info']),{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth,stateResidency:'part-year',addressLine1:address.street,addressLine2:address.apt??'',city:address.city,state:address.state,zip:address.zip});
 const entry=required(required(state.sectionData['income-w2']).entries[0]);Object.assign(entry,{employerName:w.employer.name,employerEin:w.employer.ein,wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:w.socialSecurityWages,socialSecurityWithheld:w.socialSecurityWithheld,medicareWages:w.medicareWages,medicareWithheld:w.medicareWithheld,stateTaxReporting:'multiple',state:'OH',stateWages:'40000',stateWithheld:'2000',localWages:'40000',localTaxWithheld:w.localTaxWithheld,localityName:w.localityName,stateLocalSources:structuredClone(required(w.stateLocalSources))});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:''};entry.stateLocalSources=confirmGuidedW2StateLocalSources(required(bridge.buildGuidedW2SourceContext(state)),0,required(entry.stateLocalSources));
 const original=TaxYearInputSchema.parse(required(bridge.buildTaxInputFromGuidedData(state))),actual=packet.canonical;
 const residency=confirmGuidedOhioResidencyFacts(original,{...structuredClone(actual.ohioResidency),taxYear:'2025',sourceFactsConfirmed:null,owners:actual.ohioResidency.owners.map(o=>({...structuredClone(o),stateAdditions:[],stateDeductions:[]}))});
 const payments=confirmGuidedOhioPaymentFacts(original,{...structuredClone(actual.ohioPayments),taxYear:'2025',sourceFactsConfirmed:null,specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}});
 const school=confirmGuidedOhioSchoolDistrictFacts(original,{...enteredSchoolDraft(actual.ohioSchoolDistrict),partYearWageSources:{...structuredClone(required(actual.ohioSchoolDistrict.partYearWageSources)),payrollOriginals:required(actual.ohioSchoolDistrict.partYearWageSources).payrollOriginals.map(row=>({...structuredClone(row),taxYear:String(row.taxYear)}))}},residency,payments);
 const h=structuredClone(packet.header),header=confirmGuidedOhioReturnHeaderSources(original,{...h,taxYear:'2025',sourceFactsConfirmed:null,originalFederalSources:undefined,originalOhioResidencySources:undefined,originalOhioPaymentSources:undefined,confirmedHeaderSources:undefined,finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'51'}},residency,payments,school);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments,ohioSchoolDistrict:school,ohioReturnHeaderSources:header};return state;
}

// Spec: state/guided-ohio-source-navigation.yaml#accepted-header-school-replay
test('Ohio navigation reuses the accepted header school replay', () => {
 const state = ohio();
 const originals = structuredClone(state);
 const adapter = vi.spyOn(school, 'buildOhioSchoolDistrictSource');
 try {
  const validation = validateSection(state, 'state-return');
  expect(validation.status).toBe('complete');
  expect(validation.fieldErrors).toEqual({});
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(state).toEqual(originals);
 } finally {
  adapter.mockRestore();
 }

 const data = required(state.sectionData['state-return']);
 required(data.ohioReturnHeaderSources).sourceFactsConfirmed = false;
 const rejectedHeader = validateSection(state, 'state-return');
 expect(rejectedHeader.status).toBe('partial');
 expect(rejectedHeader.fieldErrors?.ohioReturnHeader).toEqual(expect.any(String));
 expect(rejectedHeader.fieldErrors?.ohioSchoolDistrict).toBeUndefined();

 required(data.ohioSchoolDistrict).sourceFactsConfirmed = false;
 const rejectedSchool = validateSection(state, 'state-return');
 expect(rejectedSchool.status).toBe('partial');
 expect(rejectedSchool.fieldErrors?.ohioSchoolDistrict).toEqual(expect.any(String));
});


test.each([0,1]as const)('complete current school header replay %s',(which)=>{
 const state=ohio(which),before=structuredClone(state),f=vi.spyOn(federal,'calculateFederalTax'),sd=vi.spyOn(school,'buildOhioSchoolDistrictSource');
 try{const result=evaluateGuidedRender(state);expect(result.preview.metrics?.state).toMatchObject({stateTax:'811',stateRefund:'1189',schoolDistrict:{tax:'500',refund:which===0?'100':'0'}});expect(state).toEqual(before);expect({federal:f.mock.calls.length,school:sd.mock.calls.length}).toEqual({federal:7,school:2});}finally{vi.restoreAllMocks();}
});

test.each([0, 1] as const)('replays each current parent once during incomplete entry and confirmation %s', (which) => {
 const state = ohio(which);
 const route = buildSectionRoute(state.segmentation);
 state.currentSectionIndex = route.findIndex(section => section.id === 'state-return');
 state.completedSections = route.slice(0, state.currentSectionIndex).map(section => section.id);
 const data = required(state.sectionData['state-return']);
 const confirmedHeader = required(data.ohioReturnHeaderSources);
 data.ohioReturnHeaderSources = { ...emptyOhioReturnHeaderDraft(), taxYear: '2025', sourceReference: 'FICTIONAL-HEADER-EDIT' };
 const before = structuredClone(state);
 const residency = vi.spyOn(residencyFacts, 'buildGuidedOhioResidencyFacts');
 const payments = vi.spyOn(paymentFacts, 'buildGuidedOhioPaymentFacts');
 try {
  const render = evaluateGuidedRender(state);
  expect(render.analysis?.progress.currentSection?.id).toBe('state-return');
  expect(render.preview.metrics).toMatchObject({ agi: '60000', state: null });
  expect(render.preview.blockedBy).toBeNull();
  expect(render.schoolDisplayObservation).toBeDefined();
  expect(state).toEqual(before);
  expect.soft(residency).toHaveBeenCalledTimes(1);
  expect.soft(payments).toHaveBeenCalledTimes(1);

  residency.mockClear();
  payments.mockClear();
  const draft = { ...confirmedHeader, sourceFactsConfirmed: null, confirmedHeaderSources: undefined };
  const reconfirmed = confirmGuidedOhioReturnHeaderSources(required(render.originalInput), draft,
   data.ohioResidency, data.ohioPayments, data.ohioSchoolDistrict);
  expect(reconfirmed).toEqual(confirmedHeader);
  expect(draft.sourceFactsConfirmed).toBeNull();
  expect.soft(residency).toHaveBeenCalledTimes(1);
  expect.soft(payments).toHaveBeenCalledTimes(1);
 } finally {
  residency.mockRestore();
  payments.mockRestore();
 }
});

test.each([0, 1] as const)('calculates federal tax once for the same pending school and residency input %s', (which) => {
 const state = ohio(which);
 const route = buildSectionRoute(state.segmentation);
 state.currentSectionIndex = route.findIndex(section => section.id === 'state-return');
 state.completedSections = route.slice(0, state.currentSectionIndex).map(section => section.id);
 const data = required(state.sectionData['state-return']);
 const header = { ...emptyOhioReturnHeaderDraft(), taxYear: '2025', sourceReference: 'FICTIONAL-HEADER-ENTRY' };
 data.ohioReturnHeaderSources = header;
 const before = structuredClone(state);
 const calculate = vi.spyOn(federal, 'calculateFederalTax');
 const schoolSource = vi.spyOn(school, 'buildOhioSchoolDistrictSource');
 const redact = vi.spyOn(reviewIdentifiers, 'redactReviewIdentifiers');
 try {
  const first = evaluateGuidedRender(state);
  expect(first.preview.metrics).toMatchObject({ agi: '60000', state: null });
  expect(first.preview.blockedBy).toBeNull();
  expect(first.schoolDisplayObservation).toBeDefined();
  expect(schoolSource).toHaveBeenCalledTimes(1);
  const schoolInput = required(schoolSource.mock.calls[0]?.[0]);
  const ownedFederalResult = required(schoolSource.mock.calls[0]?.[1]);
  expect(redact.mock.calls.filter(([value]) => value === ownedFederalResult)).toHaveLength(2);
  expect(schoolInput).toBe(calculate.mock.calls.find(([input]) => input.ohioSchoolDistrict)?.[0]);
  expect(calculate.mock.calls.filter(([input]) => input.ohioSchoolDistrict)).toHaveLength(1);
  expect(calculate.mock.calls.filter(([input]) => !input.ohioSchoolDistrict)).toHaveLength(1);
  expect(Object.isFrozen(schoolInput.taxpayer.primary)).toBe(true);
  expect(Object.isFrozen(schoolInput.ohioPayments?.paymentRows)).toBe(true);
  expect(state).toEqual(before);

  const changed = structuredClone(state);
  required(changed.sectionData['state-return']).ohioReturnHeaderSources = { ...header, sourceReference: 'FICTIONAL-HEADER-CHANGED' };
  const second = evaluateGuidedRender(changed);
  expect(second.preview).toEqual(first.preview);
  expect(second.schoolDisplayObservation).not.toBe(first.schoolDisplayObservation);
  expect(calculate.mock.calls.filter(([input]) => input.ohioSchoolDistrict)).toHaveLength(2);
 } finally {
  redact.mockRestore();
  schoolSource.mockRestore();
  calculate.mockRestore();
 }
});

test('keeps header proof binding and independent replay for unsupported canonical material', () => {
 const { canonical } = schoolPyHeaderPacket();
 const federalResult = federal.calculateFederalTax(canonical);
 const method = withOhioSchoolAdapterInvocation(canonical, federalResult, proof => readOhioSchoolAdapterMethod(canonical, federalResult, proof));
 expect(method).toBeDefined();
 const calculate = vi.spyOn(federal, 'calculateFederalTax');
 try {
  expect(withPendingOhioSchoolAdapterInvocation(canonical, proof => readOhioSchoolAdapterMethod(canonical, federalResult, proof))).toEqual(method);
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(canonical)).toBe(false);
  const unsupported = Object.defineProperty({ ...canonical }, 'extraMetadata', { value: 'synthetic', enumerable: false });
  calculate.mockClear();
  expect(withPendingOhioSchoolAdapterInvocation(unsupported, proof => readOhioSchoolAdapterMethod(unsupported, federalResult, proof))).toBeUndefined();
  expect(calculate).toHaveBeenCalledTimes(3);
  expect(calculate.mock.calls.every(([input]) => input === unsupported)).toBe(true);
 } finally { calculate.mockRestore(); }
});

test('rejects a changing Schedule A preliminary result even with the same object identity', () => {
 const { canonical } = schoolPyHeaderPacket();
 let reads = 0;
 expect(() => verifyOhioSchoolScheduleAPayments(canonical, current =>
  Object.defineProperty(federal.calculateFederalTax(current), 'syntheticResultRevision', {
   enumerable: true,
   get: () => ++reads,
  }),
 )).toThrow('saved federal result is stale');
 expect(reads).toBe(2);
});

test('keeps pending header rejection and the earlier invalid school guard in order', () => {
 const state = ohio();
 const original = required(evaluateGuidedRender(state).originalInput);
 const data = required(state.sectionData['state-return']);
 const header = emptyOhioReturnHeaderDraft();
 const schoolDraft = required(data.ohioSchoolDistrict);
 for (const sourceFactsConfirmed of [null, false]) {
  const pending = { ...header, sourceFactsConfirmed };
  const observed = vi.fn();
  expect(() => buildGuidedOhioReturnHeaderOriginals(original, pending, data.ohioResidency, data.ohioPayments, schoolDraft, observed))
   .toThrow('complete every actual header field and retain its explicit source confirmation');
  expect(observed).toHaveBeenCalledTimes(1);
  observed.mockClear();
  const invalid = { ...schoolDraft, sourceFactsConfirmed: null };
  expect(() => buildGuidedOhioReturnHeaderOriginals(original, pending, data.ohioResidency, data.ohioPayments, invalid, observed))
   .toThrow('complete and explicitly confirm the actual school district records after the last edit');
  expect(observed).not.toHaveBeenCalled();
 }
});

test.each([0, 1] as const)('reuses one current standalone adapter only during guided rendering %s', (which) => {
 const state = ohio(which);
 const route = buildSectionRoute(state.segmentation);
 state.currentSectionIndex = route.findIndex(section => section.id === 'state-return');
 state.completedSections = route.slice(0, state.currentSectionIndex).map(section => section.id);
 delete required(state.sectionData['state-return']).ohioReturnHeaderSources;
 const before = structuredClone(state);
 const adapter = vi.spyOn(ohioAdapter, 'buildOhioResidentReturnInput');
 try {
  const outcome = computeGuidedPreviewOutcome(state);
  expect(outcome.metrics?.state).toMatchObject({stateTax: '811', schoolDistrict: {tax: '500', refund: which === 0 ? '100' : '0'}});
  expect(adapter).toHaveBeenCalledTimes(2);

  const override = structuredClone(state);
  required(override.sectionData['state-return']).ohioInterestAllocation = {
   taxYear: '2025', sourceReference: 'FICTIONAL-ZERO-ALLOCATION', sourceFactsConfirmed: true,
   federalTaxExemptInterest: '0', nonOhioStateLocalInterest: '0', ohioStateLocalInterest: '0',
   otherInterestExemptFromOhio: '0', federalInterestTaxableByOhio: '0',
  };
  adapter.mockClear();
  expect(evaluateGuidedRender(override).preview.metrics?.state).toBeNull();
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(adapter.mock.calls[1]?.[2]).toEqual({nonOhioStateLocalInterest: '0', otherAdditions: '0'});
  expect(adapter.mock.results[1]?.type).toBe('throw');

  const changed = structuredClone(state);
  required(required(changed.sectionData['state-return']).ohioSchoolDistrict).originalFederalSources = {};
  adapter.mockClear();
  expect(evaluateGuidedRender(changed).preview.metrics?.state).toBeNull();
  expect(adapter).not.toHaveBeenCalled();

  adapter.mockClear();
  const current = evaluateGuidedRender(state);
  expect(current.preview).toEqual(outcome);
  expect(current.originalInput).toEqual(TaxYearInputSchema.parse(required(bridge.buildTaxInputFromGuidedData(state))));
  expect(current.schoolDisplayObservation).toBeUndefined();
  expect(state).toEqual(before);
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(required(adapter.mock.calls[0]?.[0]).taxpayer.primary)).toBe(true);
 } finally {
  adapter.mockRestore();
 }
});

test('consumes an exact standalone adapter result once and expires unused authority', () => {
 const {ohioReturnHeaderSources: _header, ...input} = structuredClone(schoolPyHeaderPacket().canonical);
 const currentFederal = federal.calculateFederalTax(input);
 const competingInput = structuredClone(input);
 required(competingInput.ohioSchoolDistrict).sourceReference += '-CHANGED';
 const competingFederal = {...currentFederal, agi: currentFederal.agi.plus(1)};
 expect(() => ohioAdapter.buildOhioResidentReturnInput(input, competingFederal)).toThrow(/saved federal result is stale/);

 let retained: OhioSourceAdapterInvocation | undefined;
 withOhioStandaloneSchoolPreviewAdapter(input, proof => {
  retained = proof;
  expect(consumeOhioStandaloneSchoolPreviewAdapter(competingInput, currentFederal, proof)).toBeUndefined();
  expect(consumeOhioStandaloneSchoolPreviewAdapter(input, competingFederal, proof)).toBeUndefined();
  let reads = 0;
  const unsupported = Object.defineProperty({...input}, 'syntheticMetadata', {enumerable: true, get() {reads++; return 'changed';}});
  expect(consumeOhioStandaloneSchoolPreviewAdapter(unsupported, currentFederal, proof)).toBeUndefined();
  expect(reads).toBe(0);
  const adapted = required(consumeOhioStandaloneSchoolPreviewAdapter(structuredClone(input), currentFederal, proof));
  expect(adapted).toEqual(ohioAdapter.buildOhioResidentReturnInput(input, currentFederal));
  adapted.exemptions = 999;
  expect(consumeOhioStandaloneSchoolPreviewAdapter(input, currentFederal, proof)).toBeUndefined();
 });
 expect(consumeOhioStandaloneSchoolPreviewAdapter(input, currentFederal, retained)).toBeUndefined();
 expect(consumeOhioStandaloneSchoolPreviewAdapter(input, currentFederal, {} as OhioSourceAdapterInvocation)).toBeUndefined();

 withOhioSchoolAdapterInvocation(input, currentFederal, proof => {
  expect(consumeOhioStandaloneSchoolPreviewAdapter(input, currentFederal, proof)).toBeUndefined();
 });
 withOhioStandaloneSchoolPreviewAdapter(input, proof => {retained = proof;});
 expect(consumeOhioStandaloneSchoolPreviewAdapter(input, currentFederal, retained)).toBeUndefined();
 expect(() => withOhioStandaloneSchoolPreviewAdapter(input, proof => {
  retained = proof;
  throw Error('fictional exceptional exit');
 })).toThrow('fictional exceptional exit');
 expect(consumeOhioStandaloneSchoolPreviewAdapter(input, currentFederal, retained)).toBeUndefined();
});

test('keeps distinct Decimal zero signs outside the same adapter proof', () => {
 const {ohioReturnHeaderSources: _header, ...input} = structuredClone(schoolPyHeaderPacket().canonical);
 const current = federal.calculateFederalTax(input);
 expect(current.taxExemptInterest.valueOf()).toBe('0');
 const changed = {...current, taxExemptInterest: new Decimal('-0')};
 expect(changed.taxExemptInterest.valueOf()).toBe('-0');
 withOhioStandaloneSchoolPreviewAdapter(input, proof => {
  expect(consumeOhioStandaloneSchoolPreviewAdapter(input, changed, proof)).toBeUndefined();
  expect(consumeOhioStandaloneSchoolPreviewAdapter(input, current, proof)).toBeDefined();
 });
});

test('allows one successful standalone adapter read across nested comparison', () => {
 const {ohioReturnHeaderSources: _header, ...input} = structuredClone(schoolPyHeaderPacket().canonical);
 const current = federal.calculateFederalTax(input);
 withOhioStandaloneSchoolPreviewAdapter(input, proof => {
  const originalValue = Decimal.prototype.valueOf;
  let nested: ReturnType<typeof consumeOhioStandaloneSchoolPreviewAdapter>;
  let started = false;
  const comparison = vi.spyOn(Decimal.prototype, 'valueOf').mockImplementation(function(this: Decimal) {
   if (!started) {
    started = true;
    nested = consumeOhioStandaloneSchoolPreviewAdapter(input, current, proof);
   }
   return originalValue.call(this);
  });
  try {
   const outer = consumeOhioStandaloneSchoolPreviewAdapter(input, current, proof);
   expect(nested !== undefined).toBe(true);
   expect(outer === undefined).toBe(true);
   expect(consumeOhioStandaloneSchoolPreviewAdapter(input, current, proof)).toBeUndefined();
  } finally {
   comparison.mockRestore();
  }
 });
});
