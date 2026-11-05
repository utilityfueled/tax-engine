/** Fictional originals and literal independent paper oracles precede product changes. */
import {paMarriedDependentCareFixture,bindMarriedDependentCareFixture} from './pa-married-dependent-care';
import {W2StateLocalSourcesSchema} from '@/models/w2-state-local';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return';
const names=['Aspen','Birch','Cedar','Dahlia','Elm','Flora','Grove','Hazel','Iris','Juniper'];
const relations=[['natural_child','child','CHILD'],['adopted_child','adopted child','ADOPTED CHILD'],['stepchild','stepchild','STEPCHILD'],['grandchild','grandchild','GRANDCHILD'],['foster_child','foster child','FOSTER CHILD']]as const;
export const CHILD_PAPER_CASES=[
 {name:'one-joint',mode:'J',count:1,wages:['15000','7500'],withholding:['461','230'],refunds:['691'],percentage:'1.00',returns:[{owner:'joint',wages:'22500',tax:'691',credit:'691'}]},
 {name:'one-separate',mode:'M',count:1,wages:['15000','7500'],withholding:['461','230'],refunds:['461','230'],percentage:'1.00',returns:[{owner:'primary',wages:'15000',tax:'461',credit:'461'},{owner:'spouse',wages:'7500',tax:'230',credit:'230'}]},
 {name:'two-joint',mode:'J',count:2,wages:['20000','12000'],withholding:['614','368'],refunds:['982'],percentage:'1.00',returns:[{owner:'joint',wages:'32000',tax:'982',credit:'982'}]},
 {name:'two-separate',mode:'M',count:2,wages:['20000','12000'],withholding:['614','368'],refunds:['614','368'],percentage:'1.00',returns:[{owner:'primary',wages:'20000',tax:'614',credit:'614'},{owner:'spouse',wages:'12000',tax:'368',credit:'368'}]},
 {name:'nine-joint',mode:'J',count:9,wages:['15000','7500'],withholding:['461','230'],refunds:['691'],percentage:'1.00',returns:[{owner:'joint',wages:'22500',tax:'691',credit:'691'}]},
 {name:'nine-separate',mode:'M',count:9,wages:['15000','7500'],withholding:['461','230'],refunds:['461','230'],percentage:'1.00',returns:[{owner:'primary',wages:'15000',tax:'461',credit:'461'},{owner:'spouse',wages:'7500',tax:'230',credit:'230'}]},
 {name:'phaseout-joint',mode:'J',count:1,wages:['15000','7501'],withholding:['461','230'],refunds:['622'],percentage:'0.90',returns:[{owner:'joint',wages:'22501',tax:'691',credit:'622'}]},
 {name:'phaseout-separate',mode:'M',count:1,wages:['15000','7501'],withholding:['461','230'],refunds:['415','207'],percentage:'0.90',returns:[{owner:'primary',wages:'15000',tax:'461',credit:'415'},{owner:'spouse',wages:'7501',tax:'230',credit:'207'}]},
 {name:'zero-sp',mode:'J',count:9,wages:['100000','100000'],withholding:['3070','3070'],refunds:['0'],percentage:'0.00',returns:[{owner:'joint',wages:'200000',tax:'6140',credit:'0'}]},
]as const;
export function childLocalPaperFixture(oracle:typeof CHILD_PAPER_CASES[number]=CHILD_PAPER_CASES[0],local=false){
 const f=paMarriedDependentCareFixture({mode:oracle.mode,wages:[...oracle.wages],withholding:[...oracle.withholding],care:false,adult:true});
 f.input.taxpayer.dependents=Array.from({length:oracle.count},(_,index)=>({...structuredClone(f.input.taxpayer.dependents[0]),firstName:names[index]??'Extra',lastName:'Paper',ssn:`900-70-${String(601+index).padStart(4,'0')}`,relationship:relations[index%relations.length][1]}));
 f.sources.dependentChildren=f.input.taxpayer.dependents.map((child,originalIndex)=>({sourceReference:`PRIVATE-CHILD-ORIGINAL-${originalIndex+1}`,factsConfirmed:true,originalIndex,originalFederalDependent:structuredClone(child),relationship:relations[originalIndex%relations.length][0],federalReturnClaimConfirmed:true,noOtherClaimByAgreementOrDecreeConfirmed:true}));
 f.sources.dispositions.forEach((row,i)=>{row.refundRequested=oracle.refunds[i];});
 if(local)addChildPaperLocalRows(f);
 bindMarriedDependentCareFixture(f);f.input.paMarriedOrdinarySources=f.sources;return f;
}
export function addChildPaperLocalRows(f:ReturnType<typeof paMarriedDependentCareFixture>){
 f.sources.coverage.localJurisdictions=[{name:'PRIVATE-LOCAL-JURISDICTION',sourceReference:'PRIVATE-LOCAL-OBLIGATION',separateReturnRequired:true}];
 for(const [index,w]of f.input.w2s.entries()){
  const person=index===0?f.input.taxpayer.primary:f.input.taxpayer.spouse;if(!person)throw Error('Actual fixture spouse required');
  w.localWages=w.wages;w.localTaxWithheld=index===0?'150.25':'75.50';w.localityName='PRIVATE-LOCAL-JURISDICTION';
  w.stateLocalSources=W2StateLocalSourcesSchema.parse({sourceTaxYear:2025,sourceReference:`PRIVATE-LOCAL-W2-${index}`,sourceFactsConfirmed:true,owner:{accountHolder:w.accountHolder,originalTaxpayer:{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn}},originalW2:structuredClone(w),currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,stateReporting:'single',localReporting:'single',legacyScalarProjection:'first_entered_rows',stateRows:[{printedRow:1,sourceReference:'PRIVATE-PA-ROW',state:'PA',employerStateIDStatus:'reported',employerStateID:'PRIVATE-EMPLOYER-ACCOUNT',wages:w.stateWages,withheld:w.stateTaxWithheld}],localRows:[{printedRow:1,sourceReference:'PRIVATE-LOCAL-ROW',localityNameStatus:'reported',localityName:w.localityName,wages:w.localWages,withheld:w.localTaxWithheld}]});
 }
}
export function childPaperResult(f:ReturnType<typeof childLocalPaperFixture>){const federal=calculateFederalTax(f.input),married=calculatePAMarriedOrdinaryReturn(f.input,f.sources);return {...federal,stateReturns:{pennsylvania:married}};}
export const CHILD_PAPER_RELATIONSHIPS=relations.map(row=>row[2]);
