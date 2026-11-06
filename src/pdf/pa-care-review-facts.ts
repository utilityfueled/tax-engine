/** Original-bound care paper facts; callers' scalars never qualify a PDF context. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import type {PAOrdinaryCareSources} from '@/models/pa-care-sources.js';
import type {ScheduleDCResult} from '@/engine/state/pa-schedule-dc.js';
import {validatePACarePaperIdentitySources} from '@/engine/state/pa-care-paper-sources.js';
const fail=(detail:string):never=>{throw Error('PA actual care paper: '+detail);};

function privateText(original:TaxYearInput):(value:string)=>string{
 const values=new Set<string>();
 const collect=(value:unknown):void=>{
  if(!value||typeof value!=='object')return;
  for(const[key,item]of Object.entries(value)){
   if(typeof item==='string'&&item.trim()&&/(?:ssn|tin|ein|taxid|identifyingnumber|accountReference|sourceReference|confirmationNumber|returnId|receiptNumber)$/i.test(key))values.add(item);
   else collect(item);
  }
 };
 collect(original);
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[...values].flatMap(value=>{
  const digits=value.replace(/\D/g,'');
  return /^[-.()\s\d]+$/.test(value)&&digits.length>=4?[escape(value),digits.split('').join('[-.()\\s]*')]:[escape(value)];
 }).sort((a,b)=>b.length-a.length);
 const expression=patterns.length?new RegExp(patterns.join('|'),'gi'):undefined;
 return value=>expression?value.replace(expression,'[REDACTED]'):value;
}

/** Federal companions still consume canonical display strings. Deny unsafe
 * originals before any IO, rather than rewriting source/token commitments. */
export function assertPACarePublicDisplayPrivacy(original:TaxYearInput):void{
 const text=privateText(original),t=original.taxpayer,c=original.dependentCare;
 const person=(row:typeof t.primary)=>[row.firstName,row.lastName,...(row.occupation!==undefined?[row.occupation]:[])];
 const display=[...person(t.primary),...(t.spouse?person(t.spouse):[]),...Object.values(t.address),...t.dependents.flatMap(row=>[row.firstName,row.lastName,row.relationship]),...(c?.providers??[]).flatMap(row=>[row.name,row.address,...(row.dueDiligenceStatement?[row.dueDiligenceStatement]:[])]),...(c?.qualifyingPersons??[]).flatMap(row=>[row.firstName,row.lastName])];
 if(display.some(value=>typeof value==='string'&&text(value)!==value))fail('private original identifier in public care display requires a separately qualified display projection');
}

export interface PACareOwnedPaper{
 claimantName:string;spouseName:string;
 providers:Array<{name:string;address:string;identifierKind:'ssn'|'fein';amountPaid:string}>;
 qualifyingPersons:Array<{firstName:string;lastName:string;dateOfBirth:string;relationship:string;identifierKind:'ssn'|'itin'|'atin';expenses:string}>;
 qualifyingPersonsCount:number;credit:string;
}

/** Parent contexts call this only after complete actual source tax calculation. */
export function projectPACareOwnedPaper(original:TaxYearInput,source:PAOrdinaryCareSources,dc:ScheduleDCResult,federal:TaxReturnResult):PACareOwnedPaper{
 if(original.taxpayer.taxYear!==2025||federal.taxYear!==2025||!dc.credit.gt(0))return fail('actual2025 source credit and reviewed paper method required');
 const identity=validatePACarePaperIdentitySources(original,source),care=original.dependentCare;
 if(!identity.providerKindsSupportedBy2025DC)return fail('provider ITIN has no qualified PA paper oval');
 if(!care?.providers?.length||!care.qualifyingPersons?.length||care.providers.length>5||care.qualifyingPersons.length>5||original.taxpayer.dependents.length>4)return fail('physical care row or federal dependent continuation requires its reviewed successor');
 const line9a=federal.form2441?.lines.find(row=>row.line==='9a')?.value;
 if(!line9a||!federal.form2441?.credit.gt(0)||!line9a.eq(dc.federalCredit)||!federal.form2441.credit.eq(line9a)||dc.qualifyingPersons!==care.qualifyingPersons.length)return fail('actual federal2441 and PA care result do not reconcile');
 const text=privateText(original),money=(value:string)=>new Decimal(value).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed(0);
 const relationships:Record<string,string>={natural_child:'CHILD',adopted_child:'ADOPTED CHILD',stepchild:'STEPCHILD',grandchild:'GRANDCHILD',foster_child:'FOSTER CHILD'};
 const children=original.paMarriedOrdinarySources?.dependentChildren??original.paOrdinaryReturnFacts?.filing.dependentChildren??[];
 const providers=care.providers.map((provider,index)=>{
  const proof=identity.providers.find(row=>row.providerIndex===index);
  if(!proof||proof.identifierKind==='itin')return fail('actual documentary provider kind is unsupported');
  return {name:text(provider.name),address:text(provider.address),identifierKind:proof.identifierKind,amountPaid:money(provider.amountPaid)};
 });
 const qualifyingPersons=care.qualifyingPersons.map((person,index)=>{
  const proof=identity.qualifyingPersons.find(row=>row.qualifyingPersonIndex===index),dependent=proof?original.taxpayer.dependents[proof.originalDependentIndex]:undefined;
  const child=proof?children.find(row=>row.originalIndex===proof.originalDependentIndex):undefined,relationship=child?relationships[child.relationship]:undefined;
  if(!proof||!dependent||!relationship)return fail('actual qualifying person relationship and original dependent required');
  const date=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dependent.dateOfBirth);
  if(!date)return fail('actual complete qualifying person date of birth required');
  return {firstName:text(person.firstName),lastName:text(person.lastName),dateOfBirth:date[2]+'/'+date[3]+'/'+date[1],relationship,identifierKind:proof.identifierKind,expenses:money(person.qualifiedExpenses)};
 });
 const t=original.taxpayer;
 return {claimantName:text(t.primary.firstName+' '+t.primary.lastName),spouseName:t.spouse?text(t.spouse.firstName+' '+t.spouse.lastName):'',providers,qualifyingPersons,qualifyingPersonsCount:dc.qualifyingPersons,credit:dc.credit.toFixed(0)};
}
