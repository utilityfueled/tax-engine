import {test,expect,vi}from 'vitest';
const hashObserver=vi.hoisted(()=>({enabled:false,count:0}));
vi.mock('@noble/hashes/sha2.js',async original=>{const actual=await original<typeof import('@noble/hashes/sha2.js')>();const sha256=Object.assign((...args:Parameters<typeof actual.sha256>)=>{if(hashObserver.enabled)hashObserver.count++;return actual.sha256(...args);},actual.sha256);return{...actual,sha256};});
import *as bridge from '@/lib/guided-interview-bridge';
import *as federal from '@/engine/federal';
import *as school from '@/engine/state/oh-sd-100-sources';
import *as flow from '@/lib/guided-interview-flow';
import *as stateOriginals from '@/lib/guided-state-engine-inputs';
import {computeGuidedPreviewEvaluation,computeGuidedPreviewOutcome}from '@/lib/guided-preview-compute';
import {TaxYearInputSchema}from '@/models/inputs';
import {nativeMIRoyaltyFixture}from '../fixtures/guided-pa-royalty-native';
import {schoolPyHeaderPacket}from '../fixtures/oh-school-district-part-year-official-review';
import {guidedSchoolDistrictFixture,enteredSchoolDraft}from '../fixtures/guided-oh-school-district-complete';
import {confirmGuidedW2StateLocalSources}from '@/lib/guided-w2-state-local-facts';
import {confirmGuidedOhioResidencyFacts}from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts}from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioSchoolDistrictFacts,emptyOhioSchoolDistrictDraft}from '@/lib/guided-ohio-school-district-facts';
import {confirmGuidedOhioReturnHeaderSources}from '@/lib/guided-ohio-return-header-sources';
import {confirmGuidedOhioResidentCreditSources,emptyOhioResidentCreditDraft}from '@/lib/guided-ohio-resident-credit-sources';
import {enterGuidedResidentCreditFederalOriginals,guidedResidentCreditFixture}from '../fixtures/guided-oh-resident-credit-complete';
import {julyNativeFixture,julyEnteredHeader} from '../fixtures/oh-business-part-year-header';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual diagnostic fixture missing');return v;}
import {evaluateGuidedRender}from '@/lib/guided-render-evaluation';
function ohio(){
 const packet=schoolPyHeaderPacket(),state=guidedSchoolDistrictFixture().state,w=required(packet.canonical.w2s[0]),person=packet.original.taxpayer.primary,address=packet.original.taxpayer.address;
 Object.assign(required(state.sectionData['personal-info']),{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth,stateResidency:'part-year',addressLine1:address.street,addressLine2:address.apt??'',city:address.city,state:address.state,zip:address.zip});
 const entry=required(required(state.sectionData['income-w2']).entries[0]);Object.assign(entry,{employerName:w.employer.name,employerEin:w.employer.ein,wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:w.socialSecurityWages,socialSecurityWithheld:w.socialSecurityWithheld,medicareWages:w.medicareWages,medicareWithheld:w.medicareWithheld,stateTaxReporting:'multiple',state:'OH',stateWages:'40000',stateWithheld:'2000',localWages:'40000',localTaxWithheld:'600',localityName:w.localityName,stateLocalSources:structuredClone(required(w.stateLocalSources))});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:''};entry.stateLocalSources=confirmGuidedW2StateLocalSources(required(bridge.buildGuidedW2SourceContext(state)),0,required(entry.stateLocalSources));
 const original=TaxYearInputSchema.parse(required(bridge.buildTaxInputFromGuidedData(state))),actual=packet.canonical;
 const residency=confirmGuidedOhioResidencyFacts(original,{...structuredClone(actual.ohioResidency),taxYear:'2025',sourceFactsConfirmed:null,owners:actual.ohioResidency.owners.map(o=>({...structuredClone(o),stateAdditions:[],stateDeductions:[]}))});
 const payments=confirmGuidedOhioPaymentFacts(original,{...structuredClone(actual.ohioPayments),taxYear:'2025',sourceFactsConfirmed:null,specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}});
 const school=confirmGuidedOhioSchoolDistrictFacts(original,{...enteredSchoolDraft(actual.ohioSchoolDistrict),partYearWageSources:{...structuredClone(required(actual.ohioSchoolDistrict.partYearWageSources)),payrollOriginals:required(actual.ohioSchoolDistrict.partYearWageSources).payrollOriginals.map(row=>({...structuredClone(row),taxYear:String(row.taxYear)}))}},residency,payments);
 const h=structuredClone(packet.header),header=confirmGuidedOhioReturnHeaderSources(original,{...h,taxYear:'2025',sourceFactsConfirmed:null,originalFederalSources:undefined,originalOhioResidencySources:undefined,originalOhioPaymentSources:undefined,confirmedHeaderSources:undefined,finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'51'}},residency,payments,school);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments,ohioSchoolDistrict:school,ohioReturnHeaderSources:header};return state;
}

function prepare(state:flow.GuidedFlowState){const route=flow.buildSectionRoute(state.segmentation),i=route.findIndex(s=>s.id==='state-return');expect(i).toBeGreaterThan(0);state.phase='interview';state.currentSectionIndex=i;state.completedSections=route.slice(0,i+1).map(s=>s.id);return state;}
function old(state:flow.GuidedFlowState){const preview=computeGuidedPreviewOutcome(state),analysis=flow.analyzeGuidedRender(state);let originalInput=null;try{const raw=bridge.buildTaxInputFromGuidedData(state),parsed=raw?TaxYearInputSchema.safeParse(raw):undefined;if(parsed?.success)originalInput=parsed.data;}catch{/* Preserve original incomplete-source boundary. */}return{preview,analysis,originalInput,ordinaryOriginalInput:flow.buildGuidedPAOrdinarySourceInput(state)};}
const cohorts=[['OH school PY',ohio],['PA royalty',()=>nativeMIRoyaltyFixture().state]]as const;

test('preserves original render results with an explicitly pending NEW212 header', () => {
  for (const variant of ['initial entry', 'changed saved header', 'malformed header', 'stale parent', 'route summary'] as const) {
    const fixture = julyNativeFixture();
    let state = prepare(fixture.state);
    const data = required(state.sectionData['state-return']);
    data.ohioReturnHeaderSources = julyEnteredHeader();
    if (variant === 'initial entry') {
      state.completedSections = state.completedSections.filter(section => section !== 'state-return');
    }
    if (variant === 'changed saved header') {
      const confirmed = confirmGuidedOhioReturnHeaderSources(fixture.input, data.ohioReturnHeaderSources, fixture.residency, fixture.payments);
      data.ohioReturnHeaderSources = confirmed;
      state = flow.updateSectionData(state, 'state-return', {
        ...data, ohioReturnHeaderSources: {
          ...confirmed, sourceFactsConfirmed: null, finderOriginal: { ...confirmed.finderOriginal, sourceReference: 'Fictional replacement Finder record' },
        },
      });
      expect(state.sectionData['state-return']?.ohioReturnHeaderSources?.confirmedHeaderSources).toEqual(confirmed.confirmedHeaderSources);
    }
    if (variant === 'malformed header') Reflect.set(data.ohioReturnHeaderSources, 'finderOriginal', null);
    if (variant === 'stale parent') required(data.ohioPayments).originalFederalSources = {};
    if (variant === 'route summary') state.phase = 'complete';

    const before = structuredClone(state), expected = old(state);
    const originalValidation = flow.validateSection(state, 'state-return');
    const replay = vi.spyOn(stateOriginals, 'buildGuidedStateOriginals');
    try {
      const actual = evaluateGuidedRender(state);
      expect(actual, variant).toEqual(expected);
      expect(actual.preview.metrics?.state ?? null, variant).toBeNull();
      expect(actual.preview.blockedBy, variant).toBeNull();
      expect(replay.mock.calls.length, variant).toBe(0);
      expect(actual.analysis?.sectionStatuses.get('state-return'), variant)
        .toBe(variant === 'initial entry' ? 'not-started' : 'needs-review');
      expect(state, variant).toEqual(before);
      expect(flow.validateSection(state, 'state-return'), variant).toEqual(originalValidation);
    } finally { replay.mockRestore(); }
  }
});

test('keeps confirmed or unknown NEW212 headers and retained school sources on the existing render replay', () => {
  const fixture = julyNativeFixture();
  const state = prepare(fixture.state), data = required(state.sectionData['state-return']);
  const entered = julyEnteredHeader();
  const confirmed = confirmGuidedOhioReturnHeaderSources(fixture.input, entered, fixture.residency, fixture.payments);
  for (const header of [
    confirmed,
    { ...entered, sourceFactsConfirmed: undefined },
    { ...entered, originalOhioSchoolDistrictSources: required(schoolPyHeaderPacket().canonical.ohioSchoolDistrict) },
  ]) {
    data.ohioReturnHeaderSources = header as typeof entered;
    const expected = old(state);
    const replay = vi.spyOn(stateOriginals, 'buildGuidedStateOriginals');
    try {
      expect(evaluateGuidedRender(state)).toEqual(expected);
      expect(replay).toHaveBeenCalledTimes(1);
    } finally { replay.mockRestore(); }
  }
});

test('retains the separate completed school replay and display when its header is pending', () => {
  const state = prepare(ohio()), data = required(state.sectionData['state-return']);
  required(data.ohioReturnHeaderSources).sourceFactsConfirmed = null;
  const expected = old(state);
  const evaluation = computeGuidedPreviewEvaluation(state);
  expect(evaluation.schoolReplaySucceeded).toBe(true);
  expect(evaluation.sourceReplaySucceeded).toBe(false);
  const render = evaluateGuidedRender(state);
  expect(render).toEqual(expected);
  expect(render.schoolDisplayObservation).toBeDefined();
});

test("reuses current Ohio school replay for the visited pending-header status", async () => {
  const confirmed = prepare(ohio());
  const data = required(confirmed.sectionData["state-return"]);
  const header = required(data.ohioReturnHeaderSources);
  const revised = flow.updateSectionData(confirmed, "state-return", {
    ...data,
    ohioReturnHeaderSources: {
      ...header,
      finderOriginal: { ...header.finderOriginal, sourceReference: "Fictional revised Finder original" },
    },
  });
  const revisedHeader = required(revised.sectionData["state-return"]?.ohioReturnHeaderSources);
  expect(revisedHeader.sourceFactsConfirmed).toBeNull();
  expect(revisedHeader.confirmedHeaderSources).toEqual(header.confirmedHeaderSources);

  const headerSources = await import("@/lib/guided-ohio-return-header-sources");
  const navigationReplay = vi.spyOn(headerSources, "buildGuidedOhioReturnHeaderSources");
  const previewReplay = vi.spyOn(headerSources, "buildGuidedOhioReturnHeaderOriginals");
  try {
    for (const variant of ["edit", "reopened", "summary", "unvisited", "stale parent", "invalid school", "legacy", "confirmed"] as const) {
      const state = variant === "reopened" ? JSON.parse(JSON.stringify(revised)) as flow.GuidedFlowState
        : structuredClone(variant === "confirmed" ? confirmed : revised);
      const current = required(state.sectionData["state-return"]);
      if (variant === "summary") state.phase = "complete";
      if (variant === "unvisited") state.completedSections = state.completedSections.filter(section => section !== "state-return");
      if (variant === "stale parent") required(current.ohioResidency).originalFederalSources = {};
      if (variant === "invalid school") required(current.ohioSchoolDistrict).sourceFactsConfirmed = null;
      if (variant === "legacy") Reflect.deleteProperty(required(current.ohioReturnHeaderSources), "sourceFactsConfirmed");

      const before = structuredClone(state);
      const expected = old(state);
      const validation = flow.validateSection(state, "state-return");
      const prompt = flow.shouldPromptBeforeAdvance(state);
      navigationReplay.mockClear();
      previewReplay.mockClear();

      const actual = evaluateGuidedRender(state);
      expect(actual, variant).toEqual(expected);
      expect(state, variant).toEqual(before);
      expect(previewReplay, variant).toHaveBeenCalledTimes(1);
      const sharedStatus = variant === "edit" || variant === "reopened" || variant === "summary";
      const needsIndependentReplay = variant === "stale parent" || variant === "invalid school" || variant === "legacy";
      expect(navigationReplay, variant).toHaveBeenCalledTimes(needsIndependentReplay ? 1 : 0);
      if (sharedStatus) {
        expect(actual.schoolDisplayObservation, variant).toBeDefined();
        expect(actual.analysis?.sectionStatuses.get("state-return"), variant).toBe("needs-review");
        expect(validation.fieldErrors, variant).toHaveProperty("ohioReturnHeader");
      }
      if (variant === "unvisited") expect(actual.analysis?.sectionStatuses.get("state-return")).toBe("not-started");

      navigationReplay.mockClear();
      expect(flow.validateSection(state, "state-return"), variant).toEqual(validation);
      expect(navigationReplay, variant).toHaveBeenCalledTimes(1);
      expect(flow.shouldPromptBeforeAdvance(state), variant).toEqual(prompt);
    }
  } finally {
    navigationReplay.mockRestore();
    previewReplay.mockRestore();
  }
});

test.each(['distinct', 'cents'] as const)('skips only the blocked render replay for pending Ohio resident credit %s', cohort => {
  const fixture = guidedResidentCreditFixture(cohort);
  let state = prepare(fixture.state);
  enterGuidedResidentCreditFederalOriginals(state, fixture.input);
  const input = TaxYearInputSchema.parse(required(bridge.buildTaxInputFromGuidedData(state)));
  const data = required(state.sectionData['state-return']);
  const residency = confirmGuidedOhioResidencyFacts(input, fixture.residency);
  data.ohioPayments = confirmGuidedOhioPaymentFacts(input, fixture.payments);
  const confirmed = confirmGuidedOhioResidentCreditSources(input, required(residency.residentCreditSources), residency, data.ohioPayments);
  data.ohioResidency = { ...residency, residentCreditSources: confirmed };
  const confirmedRender = evaluateGuidedRender(state);
  expect(confirmedRender).toEqual(old(state));
  expect(confirmedRender.preview.metrics?.state).toMatchObject({stateTax: fixture.expected.tax, stateRefund: fixture.expected.refund});

  const entry = {
    ...state,
    completedSections: state.completedSections.filter(section => section !== 'state-return'),
    sectionData: {
      ...state.sectionData,
      'state-return': { ...data, ohioResidency: {
        ...residency, sourceFactsConfirmed: null, originalFederalSources: undefined,
        residentCreditSources: emptyOhioResidentCreditDraft(),
      } },
    },
  };
  state = flow.updateSectionData(state, 'state-return', {
    ...data, ohioResidency: { ...residency, residentCreditSources: { ...confirmed, sourceReference: 'Fictional changed Virginia source' } },
  });
  const edited = required(state.sectionData['state-return']?.ohioResidency?.residentCreditSources);
  expect(edited.sourceFactsConfirmed).toBeNull();
  expect(edited.originalResidentCreditSourcePacket).toEqual(confirmed.originalResidentCreditSourcePacket);

  const reopened = JSON.parse(JSON.stringify(state)) as flow.GuidedFlowState;
  for (const pending of [entry, reopened]) {
    const before = structuredClone(pending), expected = old(pending);
    const validation = flow.validateSection(pending, 'state-return');
    const replay = vi.spyOn(stateOriginals, 'buildGuidedStateOriginals');
    try {
      const actual = evaluateGuidedRender(pending);
      expect(actual).toEqual(expected);
      expect(actual.preview.metrics).toEqual({ ...confirmedRender.preview.metrics, state: null });
      expect(actual.schoolDisplayObservation).toBeUndefined();
      expect(replay).not.toHaveBeenCalled();
      expect(pending).toEqual(before);
      expect(flow.validateSection(pending, 'state-return')).toEqual(validation);
      expect(computeGuidedPreviewOutcome(pending)).toEqual(expected.preview);
      expect(replay).toHaveBeenCalledTimes(1);
    } finally { replay.mockRestore(); }
  }

  for (const composition of ['unknown confirmation', 'added school draft', 'added header draft'] as const) {
    const composed = structuredClone(reopened), stateReturn = required(composed.sectionData['state-return']);
    if (composition === 'unknown confirmation') {
      Reflect.deleteProperty(required(stateReturn.ohioResidency?.residentCreditSources), 'sourceFactsConfirmed');
    } else if (composition === 'added school draft') {
      stateReturn.ohioSchoolDistrict = enteredSchoolDraft(schoolPyHeaderPacket().canonical.ohioSchoolDistrict);
    } else {
      stateReturn.ohioReturnHeaderSources = julyEnteredHeader();
    }
    const expected = old(composed);
    const replay = vi.spyOn(stateOriginals, 'buildGuidedStateOriginals');
    try {
      expect(evaluateGuidedRender(composed), composition).toEqual(expected);
      expect(replay, composition).toHaveBeenCalledTimes(1);
    } finally { replay.mockRestore(); }
  }
});

test('keeps Ohio parent validation and skips the unavailable state preview during school entry', () => {
  const state = prepare(ohio());
  const data = required(state.sectionData['state-return']);
  delete data.ohioReturnHeaderSources;
  const school = required(data.ohioSchoolDistrict);
  const confirmed = evaluateGuidedRender(state);
  expect(confirmed.preview.metrics?.state).toMatchObject({ stateCode: 'OH' });

  const entry = structuredClone(state);
  entry.completedSections = entry.completedSections.filter(section => section !== 'state-return');
  required(entry.sectionData['state-return']).ohioSchoolDistrict = emptyOhioSchoolDistrictDraft();
  const edited = flow.updateSectionData(state, 'state-return', {
    ...data, ohioSchoolDistrict: { ...school, sourceReference: 'Fictional amended district record' },
  });
  expect(edited.sectionData['state-return']?.ohioSchoolDistrict?.sourceFactsConfirmed).toBeNull();
  const stale = structuredClone(edited);
  required(stale.sectionData['state-return']?.ohioPayments).originalFederalSources = {};
  for (const pending of [entry, edited, stale]) {
    const before = structuredClone(pending);
    const expected = old(pending);
    const validation = flow.validateSection(pending, 'state-return');
    expect(validation.fieldErrors).toHaveProperty('ohioSchoolDistrict');
    if (pending === stale) expect(validation.fieldErrors).toHaveProperty('ohioPayments');

    const replay = vi.spyOn(stateOriginals, 'buildGuidedStateOriginals');
    try {
      const actual = evaluateGuidedRender(pending);
      expect(actual).toEqual(expected);
      expect(actual.preview.metrics).toEqual({ ...confirmed.preview.metrics, state: null });
      expect(replay.mock.calls).toHaveLength(0);
      expect(pending).toEqual(before);
      expect(flow.validateSection(pending, 'state-return')).toEqual(validation);
      expect(computeGuidedPreviewOutcome(pending)).toEqual(expected.preview);
      expect(replay).toHaveBeenCalledTimes(1);
    } finally {
      replay.mockRestore();
    }
  }

  Reflect.deleteProperty(school, 'sourceFactsConfirmed');
  const expected = old(state);
  const replay = vi.spyOn(stateOriginals, 'buildGuidedStateOriginals');
  try {
    expect(evaluateGuidedRender(state)).toEqual(expected);
    expect(replay).toHaveBeenCalledTimes(1);
  } finally {
    replay.mockRestore();
  }
});

test.each(['residency', 'payments', 'school', 'federal originals'] as const)(
  'preserves incomplete Ohio navigation with pending %s',
  pending => {
    const state = prepare(ohio());
    const data = required(state.sectionData['state-return']);
    if (pending === 'residency') required(data.ohioResidency).sourceFactsConfirmed = null;
    if (pending === 'payments') required(data.ohioPayments).sourceFactsConfirmed = null;
    if (pending === 'school') required(data.ohioSchoolDistrict).sourceFactsConfirmed = null;
    if (pending === 'federal originals') state.segmentation.filingStatus = null;

    const before = structuredClone(state);
    const expected = old(state);
    const bridgeCalls = vi.spyOn(bridge, 'buildTaxInputFromGuidedData');
    try {
      const actual = evaluateGuidedRender(state);
      expect(actual).toEqual(expected);
      expect(actual.preview.metrics?.state ?? null).toBeNull();
      expect(state).toEqual(before);
      if (pending === 'federal originals') {
        expect(actual.originalInput).toBeNull();
      } else {
        expect(actual.originalInput).not.toBeNull();
        expect(bridgeCalls).toHaveBeenCalledTimes(1);
      }
    } finally {
      bridgeCalls.mockRestore();
    }
  },
);

test.each(cohorts)('shares only one actual current source evaluation %s',(_name,factory)=>{const state=prepare(factory()),before=structuredClone(state),expected=old(state);const f=vi.spyOn(federal,'calculateFederalTax'),b=vi.spyOn(bridge,'buildTaxInputFromGuidedData'),sd=vi.spyOn(school,'buildOhioSchoolDistrictSource');f.mockClear();b.mockClear();sd.mockClear();hashObserver.count=0;hashObserver.enabled=true;const actual=evaluateGuidedRender(state);hashObserver.enabled=false;expect(hashObserver.count).toBeLessThan(_name.startsWith('OH')?151:44);expect(actual).toEqual(expected);expect(state).toEqual(before);expect(b).toHaveBeenCalledTimes(1);expect(f).toHaveBeenCalledTimes(_name.startsWith('OH')?7:4);expect(sd).toHaveBeenCalledTimes(_name.startsWith('OH')?2:0);if(_name.startsWith('OH')){expect(actual.preview.metrics?.state).toMatchObject({stateTax:'811',stateRefund:'1189',schoolDistrict:{tax:'500',refund:'100'}});}else expect(actual.preview.metrics).toMatchObject({agi:'211000.5',totalTax:'40125',state:{stateTax:'6478',stateAmountOwed:'6478'}});vi.restoreAllMocks();});
test.each(cohorts)('preserves original behavior after actual source edits %s',(_name,factory)=>{const state=prepare(factory());for(const change of['none','owner','year','future','wages','unknown','reference','retained']as const){const edited=structuredClone(state),data=required(edited.sectionData['state-return']);if(change==='owner')required(edited.sectionData['personal-info']).lastName+='Other';if(change==='year')edited.taxYear=2024;if(change==='future')edited.taxYear=2026;if(change==='wages')required(required(edited.sectionData['income-w2']).entries[0]).wages='60001';if(change==='unknown'){if(data.ohioReturnHeaderSources)data.ohioReturnHeaderSources.sourceFactsConfirmed=null;else required(data.paOrdinaryReturnCompletionSources).sourceFactsConfirmed=null;}if(change==='reference'){if(data.ohioPayments)data.ohioPayments.sourceReference+='Changed';else required(data.paOrdinaryReturnFacts).sourceReference+='Changed';}if(change==='retained'){if(data.ohioSchoolDistrict)data.ohioSchoolDistrict.sourceFactsConfirmed=null;else required(data.paResidencySources).sourceFactsConfirmed=null;}const before=structuredClone(edited);expect(evaluateGuidedRender(edited)).toEqual(old(edited));expect(edited).toEqual(before);}});
test.each(cohorts)('isolates returned source projections and subsequent evaluations %s',(_name,factory)=>{const state=prepare(factory()),before=structuredClone(state),expected=old(state),first=evaluateGuidedRender(state);required(first.originalInput).w2s.push(structuredClone(required(required(first.originalInput).w2s[0])));if(first.ordinaryOriginalInput){expect(first.ordinaryOriginalInput.w2s).toHaveLength(required(expected.originalInput).w2s.length);first.ordinaryOriginalInput.w2s.length=0;}required(required(first.analysis).progress.sections[0]).label='Changed returned label';if(required(first.analysis).progress.currentSection)required(required(first.analysis).progress.currentSection).label='Changed returned current label';required(first.analysis).progress.sections.length=0;required(first.analysis).completion.sections.length=0;expect(state).toEqual(before);expect(evaluateGuidedRender(state)).toEqual(expected);});

test.each(cohorts)('replays independent public validation and same-reference edits %s',(_name,factory)=>{const state=prepare(factory()),original=old(state);expect(evaluateGuidedRender(state)).toEqual(original);expect(flow.analyzeGuidedRender(state)).toEqual(original.analysis);expect(computeGuidedPreviewOutcome(state)).toEqual(original.preview);const data=required(state.sectionData['state-return']);if(data.ohioReturnHeaderSources)data.ohioReturnHeaderSources.sourceFactsConfirmed=null;else required(data.paOrdinaryReturnCompletionSources).sourceFactsConfirmed=null;const next=evaluateGuidedRender(state);expect(next).toEqual(old(state));expect(required(next.analysis).sectionStatuses.get('state-return')).toBe('needs-review');expect(flow.analyzeGuidedRender(state)).toEqual(next.analysis);expect(computeGuidedPreviewOutcome(state)).toEqual(next.preview);});

test.each(cohorts)('preserves actual reopened JSON source state %s',(_name,factory)=>{const state=prepare(factory()),reopened=JSON.parse(JSON.stringify(state))as flow.GuidedFlowState;expect(evaluateGuidedRender(reopened)).toEqual(old(reopened));expect(reopened).toEqual(state);});
