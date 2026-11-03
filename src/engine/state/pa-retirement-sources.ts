/** Finite eligible employer plan sources; spec/state/pa-retirement-sources.yaml. */
import Decimal from 'decimal.js';
import {sha256}from '@noble/hashes/sha2.js';import {bytesToHex}from '@noble/hashes/utils.js';
import {Form1099RSchema,type TaxYearInput}from '@/models/inputs.js';
import {PARetirementSourcesSchema}from '@/models/pa-retirement-sources.js';
import type {PAResidencyStatus}from '@/models/pa-residency.js';import type {CalculatedLine}from '@/models/outputs.js';
import {AuditTrail}from '@/utils/audit.js';
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines}from './pa-ordinary-source-precision.js';
const fail=(message:string):never=>{throw Error('PA actual eligible retirement sources: '+message);};
const ref=(value:string)=>{if(!value.trim())fail('actual source reference is required');};
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
function day(value:string):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return fail('actual calendar date is required');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)return fail('impossible actual calendar date');return value;}
const normalized=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
export interface PARetirementSourcesResult{
 excludedEligibleRetirement:Decimal;paTaxableCompensation:Decimal;spEligibilityIncome:Decimal;paWithholding:Decimal;
 actualWithholdingSources:Array<{originalIndex:number;taxYear:number;payer:string;payerTin:string;accountReference:string;owner:'primary';state:string;amount:Decimal}>;
 sourceCommitment:string;lines:CalculatedLine[];
}
export function calculatePARetirementSources(input:TaxYearInput,raw:unknown,residency:{status:PAResidencyStatus}):PARetirementSourcesResult{
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input.form1099R,raw),rounding:Decimal.ROUND_HALF_UP});
 const amount=(value:unknown):Decimal=>{if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))return fail('actual nonnegative amount is required; unknown is not zero');const n=new Money(value);if(!n.isFinite())return fail('nonfinite actual source amount');return n;};
 const zero=()=>new Decimal(0),originals=input.form1099R??[];
 if(raw===undefined&&!originals.length)return {excludedEligibleRetirement:zero(),paTaxableCompensation:zero(),spEligibilityIncome:zero(),paWithholding:zero(),actualWithholdingSources:[],sourceCommitment:'',lines:[]};
 const source=PARetirementSourcesSchema.parse(raw),year=input.taxpayer.taxYear,person=input.taxpayer.primary;
 if(year!==2025||source.sourceTaxYear!==year||source.sourceFactsConfirmed!==true||source.allOriginalRetirementStatementsIncludedConfirmed!==true)return fail('complete actual2025 source confirmations required');ref(source.sourceReference);
 if(residency.status!=='resident'||input.taxpayer.spouse||['married_filing_jointly','married_filing_separately'].includes(input.taxpayer.filingStatus))return fail('actual primary full-year unmarried method required');
 const identity={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth};
 if(source.owner.accountHolder!=='primary'||!source.owner.originalTaxpayer||stable(source.owner.originalTaxpayer)!==stable(identity)||!/^\d{9}$/.test(person.ssn.replace(/\D/g,''))||!person.dateOfBirth)return fail('actual taxpayer identity and birth date differ');
 // March1 is certainly after65 for a leap-day birth; February28 stays outside this finite method.
 const birth=day(person.dateOfBirth),retirementAgeDate=day(String(Number(birth.slice(0,4))+65)+(birth.endsWith('-02-29')?'-03-01':birth.slice(4)));
 if(source.statements.length!==originals.length)return fail('every current actual original must be covered exactly once');
 let excluded=new Money(0),withheld=new Money(0);const used=new Set<number>(),accounts=new Set<string>(),actualWithholdingSources:PARetirementSourcesResult['actualWithholdingSources']=[];
 for(const row of source.statements){
  ref(row.sourceReference);const index=row.originalIndex;
  if(index===null||index<0||index>=originals.length||used.has(index)||row.sourceTaxYear!==year||row.sourceFactsConfirmed!==true||stable(row.owner)!==stable(identity))return fail('current unique source index/year/owner confirmation required');used.add(index);
  const original=originals[index],parsed=Form1099RSchema.safeParse(original);
  if(!parsed.success||stable(parsed.data)!==stable(original)||stable(row.original)!==stable(original)||original.taxYear!==year||original.accountHolder!=='primary'||!original.payer.trim()||!/^\d{9}$/.test(original.payerTin?.replace(/-/g,'')??'')||!original.accountReference?.trim())return fail('current complete original differs from retained source snapshot');
  const account=(original.payerTin??'').replace(/-/g,'')+'|'+normalized(original.accountReference);if(accounts.has(account))return fail('duplicate or corrected current retirement account must be reconciled');accounts.add(account);
  const q=row.qualification;
  for(const [key,value]of Object.entries(q))if((key.endsWith('Confirmed')&&value!==true))return fail('actual eligible retirement qualification incomplete: '+key);
  if(q.planType!=='employer_401a_defined_contribution'||q.normalRetirementAge!==65)return fail('other actual plan or age/service method required');
  ref(q.planSource.sourceReference);ref(q.administrator.sourceReference);ref(q.formerEmployer.sourceReference);
  if(!q.formerEmployer.name.trim()||!/^\d{9}$/.test(q.formerEmployer.ein.replace(/-/g,'')))return fail('actual sponsoring former employer required');
  if(input.w2s.some(w=>w.accountHolder!=='spouse'&&(normalized(w.employer.name)===normalized(q.formerEmployer.name)||w.employer.ein.replace(/-/g,'')===q.formerEmployer.ein.replace(/-/g,''))))return fail('current sponsoring-employer service requires its actual successor');
  const retired=day(q.actualRetirementDate),distributed=day(q.distributionDate);
  if(retired<retirementAgeDate||distributed<retired||!distributed.startsWith(year+'-')||(original.distributionDate!==undefined&&day(original.distributionDate)!==distributed))return fail('actual distribution and retirement chronology contradict eligible age/service');
  const ordinaryKeys=new Set(['taxYear','payer','payerTin','accountReference','accountHolder','grossDistribution','taxableAmount','federalWithheld','stateWithheld','stateTaxWithheld','state','stateDistribution','localTaxWithheld','locality','employeeContributions','distributionCode','distributionDate']);
  for(const [key,value]of Object.entries(original)){
   if(ordinaryKeys.has(key)||value===undefined||value===false)continue;
   if(value===true||typeof value!=='string'||!/^0+(\.0+)?$/.test(value))return fail('retained special original field needs its actual method: '+key);
  }
  if(original.distributionCode!=='7'||!amount(original.employeeContributions).isZero()||!amount(q.paEmployeeContributions).isZero()||!amount(q.priorRecoveredContributions).isZero()||!amount(original.localTaxWithheld).isZero()||original.locality?.trim())return fail('actual nonordinary/basis/local original requires its separate method');
  const gross=amount(original.grossDistribution);if(!amount(original.taxableAmount).eq(gross))return fail('actual federal pension taxability/basis needs its separate method');amount(original.federalWithheld);
  const first=amount(original.stateWithheld),alias=amount(original.stateTaxWithheld);if(first.gt(0)&&alias.gt(0)&&!first.eq(alias))return fail('actual withholding aliases conflict');const actual=first.gt(0)?first:alias,w=row.withholding;ref(w.sourceReference);
  if(!amount(w.amount).eq(actual)||w.state!==(original.state??''))return fail('actual original withholding amount or jurisdiction differs');
  if(original.state!==undefined&&original.state!=='PA')return fail('other state retirement withholding requires its source successor');
  if(original.state==='PA'){if(!amount(original.stateDistribution).eq(gross))return fail('actual state distribution requires its source successor');}
  else if(!actual.isZero()||!amount(original.stateDistribution).isZero())return fail('positive original state amount lacks actual jurisdiction');
  if(actual.gt(0)&&(w.actuallyWithheldConfirmed!==true||w.notRefundedTransferredOrCreditedElsewhereConfirmed!==true))return fail('actual positive PA remittance and no refund/offset proof required');
  excluded=excluded.plus(gross);withheld=withheld.plus(actual);actualWithholdingSources.push({originalIndex:index,taxYear:year,payer:original.payer,payerTin:original.payerTin??'',accountReference:original.accountReference,owner:'primary',state:original.state??'',amount:publicOrdinaryMoney(actual)});
 }
 const sourceCommitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-eligible-retirement-v1',year,identity,originals,raw})))),audit=new AuditTrail();
 audit.record('PA-Eligible-Retirement','excluded','Actual eligible retirement benefits',publicOrdinaryMoney(excluded),'Written eligible employer plan plus actual retirement after plan age/service; excluded PA compensation and SP eligibility');
 audit.record('PA-Eligible-Retirement','withholding','Actual PA original retirement withholding',publicOrdinaryMoney(withheld),'Exact current original Box14 counted once after remittance/no refund proof',{sourceCommitment});
 return {excludedEligibleRetirement:publicOrdinaryMoney(excluded),paTaxableCompensation:zero(),spEligibilityIncome:zero(),paWithholding:publicOrdinaryMoney(withheld),actualWithholdingSources,sourceCommitment,lines:publicOrdinaryLines(audit.getLines())};
}
