// Spec: state/pa-care-paper-identity.yaml. Existing APIs exercise genuine baseline failures.
import {expect,it} from 'vitest';
import {validatePACarePaperIdentitySources} from '@/engine/state/pa-care-paper-sources.js';
import {PAOrdinaryCareSourcesSchema} from '@/models/pa-care-sources.js';
import {buildGuidedPACareSources,captureGuidedPACareOriginals,captureGuidedPACarePaperIdentityOriginals,confirmGuidedPACarePaperIdentitySources} from '@/lib/guided-pa-care-sources';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {preparePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {paMarriedDependentCareFixture as fixture} from '../../fixtures/pa-married-dependent-care.js';
import {paCarePaperIdentityFixture} from '../../fixtures/pa-care-paper-identity.js';

function actual(year=2025){
  const f=fixture({year}),care=f.sources.care?.careSources;
  if(!care)throw Error('Actual fictional care sources required');
  const paperIdentitySources=paCarePaperIdentityFixture(f.input,{providers:['fein'],persons:['ssn']});
  return {...f,care:Object.assign(care,{paperIdentitySources})};
}

it('optional documentary identity survives existing source APIs without changing cash',()=>{
  const f=actual(),before=structuredClone(f);
  expect(PAOrdinaryCareSourcesSchema.safeParse(f.care).success).toBe(true);
  expect(buildGuidedPACareSources(f.input,f.care)).toEqual(f.care);
  const r=calculatePAMarriedOrdinaryReturn(f.input,f.sources).returns[0];
  expect(r.scheduleDC?.credit.toFixed()).toBe('600');
  expect(r.pa40.netOverpayment.toFixed()).toBe('600');
  expect(f).toEqual(before);
  const legacy=fixture();
  expect(legacy.sources.care?.careSources).not.toHaveProperty('paperIdentitySources');
  expect(calculatePAMarriedOrdinaryReturn(legacy.input,legacy.sources).returns[0].pa40.netOverpayment.toFixed()).toBe('600');
});

it('recapture clears documentary confirmation without silently replacing identity originals',()=>{
  const f=actual(),before=structuredClone(f.care.paperIdentitySources);
  const result=captureGuidedPACareOriginals(f.input,f.care,true);
  expect(result).toMatchObject({sourceFactsConfirmed:null,paperIdentitySources:{sourceFactsConfirmed:null}});
  expect({...Reflect.get(result,'paperIdentitySources'),sourceFactsConfirmed:true}).toEqual(before);
  expect(f.care.paperIdentitySources).toEqual(before);
});

it.each(['missingYear','unknownKind','missingOriginal','staleReference'] as const)('guided build rejects supplied incomplete documentary metadata %s',kind=>{
  const f=actual(),raw:unknown=structuredClone(f.care),data=raw as typeof f.care;
  if(kind==='missingYear')data.paperIdentitySources.sourceTaxYear=0;
  if(kind==='unknownKind')Reflect.set(data.paperIdentitySources.providers[0],'identifierKind','unknown');
  if(kind==='missingOriginal')data.paperIdentitySources.providers[0].originalProvider={...data.paperIdentitySources.providers[0].originalProvider,name:''};
  if(kind==='staleReference')data.paperIdentitySources.sourceReference='';
  expect(()=>buildGuidedPACareSources(f.input,data)).toThrow(/identity|documentary|source/i);
});

it('identity collection preserves current year and paper gates',()=>{
  const f=actual();
  // Stage2 separately qualifies the complete2025 parent context, not this identity validator.
  expect(validatePACarePaperIdentitySources(f.input,f.care).officialPaperQualified).toBe(false);
  expect(()=>preparePAMarriedReturnReview({...f.input,paMarriedOrdinarySources:f.sources})).not.toThrow();
  const incomplete=actual();incomplete.care.paperIdentitySources.providers[0].originalAvailableConfirmed=false;
  expect(()=>preparePAMarriedReturnReview({...incomplete.input,paMarriedOrdinarySources:incomplete.sources})).toThrow(/identity|documentary|source/i);
  const future=actual(2026);
  expect(buildGuidedPACareSources(future.input,future.care)).toEqual(future.care);
  expect(()=>calculatePAMarriedOrdinaryReturn(future.input,future.sources)).toThrow(/2026.*rule pack.*incomplete/i);
});

it.each(['ssn','fein','itin'] as const)('documentary identifier kinds remain explicit and never qualify paper %s',kind=>{
  const f=actual(),before=structuredClone(f.input);
  f.care.paperIdentitySources.providers[0].identifierKind=kind;
  const r=validatePACarePaperIdentitySources(f.input,f.care);
  expect(r.providers).toEqual([{providerIndex:0,identifierKind:kind}]);
  expect(r.providerKindsSupportedBy2025DC).toBe(kind!=='itin');
  expect(r.officialPaperQualified).toBe(false);
  expect(r.filingEligible).toBe(false);
  if(kind==='itin')expect(()=>preparePAMarriedReturnReview({...f.input,paMarriedOrdinarySources:f.sources})).toThrow(/provider ITIN|oval/i);
  else expect(()=>preparePAMarriedReturnReview({...f.input,paMarriedOrdinarySources:f.sources})).not.toThrow();
  expect(confirmGuidedPACarePaperIdentitySources(f.input,f.care).paperIdentitySources?.providers[0].identifierKind).toBe(kind);
  expect(f.input).toEqual(before);
});

it.each(['ssn','itin','atin'] as const)('retains the actual qualifying person documentary kind %s',kind=>{
  const f=actual();f.care.paperIdentitySources.qualifyingPersons[0].identifierKind=kind;
  const r=validatePACarePaperIdentitySources(f.input,f.care);
  expect(r.qualifyingPersons).toEqual([{qualifyingPersonIndex:0,originalDependentIndex:0,identifierKind:kind}]);
  expect(r.officialPaperQualified).toBe(false);
});

it.each(['year','unconfirmed','collectionRef','providerRef','personRef','providerUnavailable','personUnavailable','providerUnknown','personUnknown','providerMissing','personMissing','providerNull','personNull','dependentNull','providerRange','personRange','dependentRange','providerDuplicate','personDuplicate','dependentDuplicate','providerSnapshot','personSnapshot','dependentSnapshot','federalSnapshot','providerStatus','personStatus','personIdentity','personName','providerIdentifier','personIdentifier','unknownProperty'] as const)('identity projection rejects incomplete stale and contradictory originals %s',kind=>{
  const f=actual(),identity=f.care.paperIdentitySources,p=identity.providers[0],q=identity.qualifyingPersons[0],care=f.input.dependentCare;
  if(!care?.providers||!care.qualifyingPersons)throw Error('Actual care rows required');
  if(kind==='year')identity.sourceTaxYear=2024;
  if(kind==='unconfirmed')identity.sourceFactsConfirmed=false;
  if(kind==='collectionRef')identity.sourceReference='';
  if(kind==='providerRef')p.sourceReference='';
  if(kind==='personRef')q.sourceReference='';
  if(kind==='providerUnavailable')p.originalAvailableConfirmed=false;
  if(kind==='personUnavailable')q.originalAvailableConfirmed=false;
  if(kind==='providerUnknown')Reflect.set(p,'identifierKind','unknown');
  if(kind==='personUnknown')Reflect.set(q,'identifierKind','unknown');
  if(kind==='providerMissing')identity.providers=[];
  if(kind==='personMissing')identity.qualifyingPersons=[];
  if(kind==='providerNull')Reflect.set(p,'providerIndex',null);
  if(kind==='personNull')Reflect.set(q,'qualifyingPersonIndex',null);
  if(kind==='dependentNull')Reflect.set(q,'originalDependentIndex',null);
  if(kind==='providerRange')p.providerIndex=-1;
  if(kind==='personRange')q.qualifyingPersonIndex=99;
  if(kind==='dependentRange')q.originalDependentIndex=99;
  if(kind==='providerDuplicate'){
    care.providers.push({...structuredClone(care.providers[0]),name:'Second fictional documented provider',taxId:'97-7654321',amountPaid:'0'});
    identity.providers.push(structuredClone(p));f.care.originalDependentCare=structuredClone(care);
  }
  if(kind==='personDuplicate'||kind==='dependentDuplicate'){
    const two=fixture({twoChildren:true});
    if(!two.input.dependentCare)throw Error('Actual two-person originals required');
    f.input.taxpayer.dependents=two.input.taxpayer.dependents;
    f.input.dependentCare=two.input.dependentCare;
    f.care.originalDependentCare=structuredClone(two.input.dependentCare);
    identity.qualifyingPersons=paCarePaperIdentityFixture(f.input,{providers:['fein'],persons:['ssn','ssn']}).qualifyingPersons;
    if(kind==='personDuplicate')identity.qualifyingPersons[1].qualifyingPersonIndex=0;
    else identity.qualifyingPersons[1].originalDependentIndex=0;
  }
  if(kind==='providerSnapshot')p.originalProvider.name='Different equal-money provider original';
  if(kind==='personSnapshot')q.originalQualifyingPerson.firstName='Different equal-money person original';
  if(kind==='dependentSnapshot')q.originalFederalDependent.firstName='Different original dependent';
  if(kind==='federalSnapshot')f.care.originalDependentCare.expenses='3000.00';
  if(kind==='providerStatus'){care.providers[0].identifierType='tax_exempt';p.originalProvider=structuredClone(care.providers[0]);f.care.originalDependentCare=structuredClone(care);}
  if(kind==='personStatus'){care.qualifyingPersons[0].identifierType='died';q.originalQualifyingPerson=structuredClone(care.qualifyingPersons[0]);f.care.originalDependentCare=structuredClone(care);}
  if(kind==='personIdentity'){care.qualifyingPersons[0].taxId='900-70-0399';q.originalQualifyingPerson=structuredClone(care.qualifyingPersons[0]);f.care.originalDependentCare=structuredClone(care);}
  if(kind==='personName'){care.qualifyingPersons[0].firstName='Wrong original person';q.originalQualifyingPerson=structuredClone(care.qualifyingPersons[0]);f.care.originalDependentCare=structuredClone(care);}
  if(kind==='providerIdentifier'){care.providers[0].taxId='';p.originalProvider=structuredClone(care.providers[0]);f.care.originalDependentCare=structuredClone(care);}
  if(kind==='personIdentifier'){care.qualifyingPersons[0].taxId='';q.originalQualifyingPerson=structuredClone(care.qualifyingPersons[0]);f.care.originalDependentCare=structuredClone(care);}
  if(kind==='unknownProperty')Reflect.set(identity,'unreviewedScalarCredit','600');
  const before=structuredClone(f);
  expect(()=>validatePACarePaperIdentitySources(f.input,f.care)).toThrow(/documentary identity sources/);
  expect(f).toEqual(before);
});

it('explicit documentary capture never supplies unknown source facts and is atomic on invalid indices',()=>{
  const f=actual(),raw=structuredClone(f.care),identity=raw.paperIdentitySources;
  Reflect.set(identity,'sourceTaxYear',null);identity.sourceReference='';identity.sourceFactsConfirmed=false;
  Reflect.set(identity.providers[0],'identifierKind','unknown');identity.providers[0].originalAvailableConfirmed=false;
  identity.providers[0].originalProvider={...identity.providers[0].originalProvider,name:'Old retained provider'};
  const before=structuredClone(raw);
  expect(()=>captureGuidedPACarePaperIdentityOriginals(f.input,raw,null)).toThrow(/review/i);
  const captured=captureGuidedPACarePaperIdentityOriginals(f.input,raw,true);
  expect(captured.paperIdentitySources).toMatchObject({sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,providers:[{identifierKind:'unknown',originalAvailableConfirmed:false}]});
  expect(captured.paperIdentitySources?.providers[0].originalProvider).toEqual(f.input.dependentCare?.providers?.[0]);
  expect(raw).toEqual(before);
  identity.qualifyingPersons[0].originalDependentIndex=99;
  const invalid=structuredClone(raw);
  expect(()=>captureGuidedPACarePaperIdentityOriginals(f.input,raw,true)).toThrow(/original/i);
  expect(raw).toEqual(invalid);
});

it('documentary projection is detached and cannot replace parent care eligibility',()=>{
  const f=actual(),before=structuredClone(f.care),projection=validatePACarePaperIdentitySources(f.input,f.care);
  projection.providers[0].identifierKind='itin';
  expect(f.care).toEqual(before);
  if(!f.input.dependentCare)throw Error('Actual care original required');
  f.input.dependentCare.receivedBenefits=true;
  f.care.originalDependentCare=structuredClone(f.input.dependentCare);
  expect(validatePACarePaperIdentitySources(f.input,f.care).officialPaperQualified).toBe(false);
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/care|benefit|original|source/i);
});
