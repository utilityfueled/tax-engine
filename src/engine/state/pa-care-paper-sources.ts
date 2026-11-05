/** Pure documentary source binding. Spec: state/pa-care-paper-identity.yaml.
 * This validates identity provenance, never care eligibility or paper admission. */
import type {TaxYearInput} from '@/models/inputs.js';
import {PAOrdinaryCareSourcesSchema} from '@/models/pa-care-sources.js';

function fail():never{throw Error('PA care documentary identity sources: complete current reviewed original identities are required');}
function stable(value:unknown):string{
  if(value===null)return 'null';
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+stable(item)).join(',')+'}';
  return typeof value+':'+(JSON.stringify(value)??'undefined');
}
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
const name=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
const tin=(value:string)=>value.replace(/\D/g,'');

export interface PACarePaperIdentityFacts{
  sourceTaxYear:number;
  providers:Array<{providerIndex:number;identifierKind:'ssn'|'fein'|'itin'}>;
  qualifyingPersons:Array<{qualifyingPersonIndex:number;originalDependentIndex:number;identifierKind:'ssn'|'itin'|'atin'}>;
  providerKindsSupportedBy2025DC:boolean;
  officialPaperQualified:false;
  filingEligible:false;
}

export function validatePACarePaperIdentitySources(input:TaxYearInput,raw:unknown):PACarePaperIdentityFacts{
  const parsed=PAOrdinaryCareSourcesSchema.safeParse(raw);
  if(!parsed.success)return fail();
  const source=parsed.data,identity=source.paperIdentitySources,care=input.dependentCare,year=input.taxpayer.taxYear;
  if(!identity||source.sourceTaxYear!==year||!source.sourceReference.trim()||!care||!same(source.originalDependentCare,care))return fail();
  if(identity.sourceTaxYear!==year||identity.sourceFactsConfirmed!==true||!identity.sourceReference.trim())return fail();
  if(!care.providers?.length||!care.qualifyingPersons?.length||identity.providers.length!==care.providers.length||identity.qualifyingPersons.length!==care.qualifyingPersons.length)return fail();
  const providerIndices=new Set<number>(),personIndices=new Set<number>(),dependentIndices=new Set<number>();
  const providers=identity.providers.map(row=>{
    const index=row.providerIndex;
    if(index===null||index<0||providerIndices.has(index)||!row.sourceReference.trim()||row.originalAvailableConfirmed!==true||row.identifierKind==='unknown')return fail();
    const original=care.providers?.[index];
    if(!original||original.identifierType!=='tin'||!original.taxId||!/^\d{9}$/.test(tin(original.taxId))||!same(row.originalProvider,original))return fail();
    providerIndices.add(index);
    return {providerIndex:index,identifierKind:row.identifierKind};
  });
  const qualifyingPersons=identity.qualifyingPersons.map(row=>{
    const index=row.qualifyingPersonIndex,dependentIndex=row.originalDependentIndex;
    if(index===null||index<0||dependentIndex===null||dependentIndex<0||personIndices.has(index)||dependentIndices.has(dependentIndex)||!row.sourceReference.trim()||row.originalAvailableConfirmed!==true||row.identifierKind==='unknown')return fail();
    const original=care.qualifyingPersons?.[index],dependent=input.taxpayer.dependents[dependentIndex];
    if(!original||!dependent||original.identifierType!=='tax_id'||!original.taxId||!/^\d{9}$/.test(tin(original.taxId))||tin(original.taxId)!==tin(dependent.ssn)||name(original.firstName)!==name(dependent.firstName)||name(original.lastName)!==name(dependent.lastName)||!same(row.originalQualifyingPerson,original)||!same(row.originalFederalDependent,dependent))return fail();
    personIndices.add(index);dependentIndices.add(dependentIndex);
    return {qualifyingPersonIndex:index,originalDependentIndex:dependentIndex,identifierKind:row.identifierKind};
  });
  return {sourceTaxYear:year,providers,qualifyingPersons,providerKindsSupportedBy2025DC:providers.every(row=>row.identifierKind!=='itin'),officialPaperQualified:false,filingEligible:false};
}
