import type {Form1099R,TaxYearInput} from '@/models/inputs';
import type {TaxReturnResult} from '@/models/outputs';
import type {Form8606Result} from '@/engine/forms/form-8606';
import {calculateHomeMortgageInterest} from '@/engine/forms/home-mortgage-interest';
import {getForm1099RTaxabilitySource,isIraForm1099RDistribution} from '@/engine/forms/form-1099-r';
import {d,roundDollar,sum} from '@/utils/decimal';

// 2025 Instructions for Forms1099-R and5498, Table1, pages18–20.
// Source-code combinations only: not a duplicate tax-method or amount resolver.
const box7Companions2025:Readonly<Record<string,string>>={
  '1':'8BDKLMP', '2':'8BDKLMP', '3':'D', '4':'8ABDGHKLMPY', '5':'', '6':'W',
  '7':'ABDKLMY', '8':'124BJK', '9':'', A:'47', B:'12478GLMPU', C:'D',
  D:'12347C', E:'', F:'', G:'4BK', H:'4', J:'8PS', K:'12478GY',
  L:'1247B', M:'1247B', N:'', P:'124BJ', Q:'', R:'', S:'J', T:'',
  U:'B', W:'6', Y:'47K',
};
/** Table1 syntax only; all existing account, source and tax-method guards still apply. */
export function hasValid2025RetirementDistributionCodes(value:string|undefined):boolean {
  const code=value?.toUpperCase().replace(/\s+/gu,'') ?? '';
  if(code.length<1 || code.length>2 || ![...code].every(part=>Object.hasOwn(box7Companions2025,part)))return false;
  // Table1's explicit QCD footnote requires Y first and either4,7 orK after it.
  if(code.includes('Y'))return /^Y[47K]$/u.test(code);
  return code.length===1 || (code[0]!==code[1]
    && box7Companions2025[code[0]].includes(code[1])
    && box7Companions2025[code[1]].includes(code[0]));
}

function record(value:unknown):Record<string,unknown>|undefined {
  return value!==null && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
function originalBasisComplete(value:unknown):boolean {
  const original=record(value);
  return !!original && ['priorYearBasis','yearEndValue','nondeductibleContributions','contributionsMadeNextYear']
    .every(key=>typeof original[key]==='string' && String(original[key]).trim()!=='');
}
function coveredGross(form:Form8606Result,kind:'traditional'|'roth') {
  return kind==='traditional' ? sum(form.line7,form.line7Exclusions)
    : sum(form.line19,form.line19Exclusions);
}
function applicableIraWorksheet(input:TaxYearInput,result:TaxReturnResult,source:Form1099R,raw:unknown):boolean {
  const joint=input.taxpayer.filingStatus==='married_filing_jointly' && input.taxpayer.spouse!==undefined;
  const owner=source.accountHolder ?? (joint ? undefined : 'primary');
  if(!owner || (owner==='spouse'&&!joint))return false;
  const rawInput=record(raw);
  let worksheet:Form8606Result|undefined;
  let manual:TaxYearInput['form8606'];
  if(input.iraBasisSources!==undefined){
    worksheet=result.form8606ByOwner?.[owner];
  }else if(input.form8606ByOwner!==undefined){
    const original=record(rawInput?.form8606ByOwner)?.[owner];
    if(!originalBasisComplete(original))return false;
    worksheet=result.form8606ByOwner?.[owner];
    manual=input.form8606ByOwner[owner];
  }else if(input.form8606!==undefined){
    if(!originalBasisComplete(rawInput?.form8606))return false;
    // A single manual worksheet cannot silently certify multiple joint IRA owners.
    const owners=new Set((input.form1099R??[]).filter(isIraForm1099RDistribution)
      .filter(form=>getForm1099RTaxabilitySource(form).currentYear)
      .map(form=>form.accountHolder ?? (joint ? undefined : 'primary')));
    if(owners.size!==1 || !owners.has(owner))return false;
    worksheet=result.form8606;
    manual=input.form8606;
  }
  if(!worksheet)return false;
  const kind=getForm1099RTaxabilitySource(source).iraKind;
  if(kind===undefined)return false;
  const ownerForms=(input.form1099R??[]).filter(form=>isIraForm1099RDistribution(form)
    && getForm1099RTaxabilitySource(form).currentYear
    && (form.accountHolder ?? (joint ? undefined : 'primary'))===owner);
  const conversions=sum(...ownerForms.map(form=>getForm1099RTaxabilitySource(form).iraConversionAmount));
  if(!worksheet.line16.eq(roundDollar(conversions)))return false;
  if(manual){
    const traditional=sum(...ownerForms.filter(form=>getForm1099RTaxabilitySource(form).iraKind==='traditional').map(form=>d(form.grossDistribution))).minus(conversions);
    const roth=sum(...ownerForms.filter(form=>getForm1099RTaxabilitySource(form).iraKind==='roth').map(form=>d(form.grossDistribution)));
    // Omitted current-distribution fields retain the engine's actual-source defaults;
    // explicitly supplied worksheet amounts must match those actual originals.
    if((manual.traditionalDistributions!==undefined && !d(manual.traditionalDistributions).eq(traditional))
      || (manual.rothConversions!==undefined && !d(manual.rothConversions).eq(conversions))
      || (manual.rothDistributions!==undefined && !d(manual.rothDistributions).eq(roth)))return false;
  }
  const unresolvedGross=sum(...(input.form1099R??[])
    .filter(form=>isIraForm1099RDistribution(form)
      && (form.accountHolder ?? (joint ? undefined : 'primary'))===owner
      && getForm1099RTaxabilitySource(form).source==='historical-preview'
      && getForm1099RTaxabilitySource(form).iraKind===kind)
    .map(form=>kind==='traditional' ? d(form.grossDistribution).minus(getForm1099RTaxabilitySource(form).iraConversionAmount) : d(form.grossDistribution)));
  return coveredGross(worksheet,kind).gte(roundDollar(unresolvedGross));
}

/** Verifies software source admission, never real-world truth or filing readiness. */
export function assertVerifiedAiSourceAdmission(input:TaxYearInput,result:TaxReturnResult,originalInput:unknown):void {
  // These are actual calendar-year originals, not prior-year carry or worksheet histories.
  const directOriginals=[...input.w2s,...input.form1099Int,...input.form1099Div,...(input.form1099R??[]),...input.form1099Misc,...input.form1099Nec,...input.form1099OID,...input.form1099K,...input.form1098E,...input.form1095A,...input.formW2G];
  if(directOriginals.some(form=>form.taxYear!==undefined && form.taxYear!==input.taxpayer.taxYear)
    || (input.formSSA1099??[]).some(form=>form.sourceTaxYear!==undefined && form.sourceTaxYear!==input.taxpayer.taxYear)){
    throw new Error('A confirmed explanation requires matching-year direct income originals.');
  }
  if(result.deductionUsed==='itemized'){
    const mortgage=calculateHomeMortgageInterest(input);
    if(!mortgage.sourceFactsVerified && sum(mortgage.line8a,mortgage.line8b,mortgage.line8c).gt(0)){
      throw new Error('A confirmed explanation requires actual sources for the selected mortgage deduction.');
    }
  }
  for(const form of input.form1099R??[]){
    if(d(form.grossDistribution).lte(0))continue;
    const provenance=getForm1099RTaxabilitySource(form);
    if(!provenance.recognizedDistributionCode || (input.taxpayer.taxYear===2025
      && !hasValid2025RetirementDistributionCodes(form.distributionCode)))throw new Error('A confirmed explanation requires an actual retirement distribution code and resolved taxability.');
    if(isIraForm1099RDistribution(form) && provenance.currentYear){
      const joint=input.taxpayer.filingStatus==='married_filing_jointly' && input.taxpayer.spouse!==undefined;
      const owner=form.accountHolder ?? (joint ? undefined : 'primary');
      const manualApplies=input.form8606!==undefined || (input.form8606ByOwner!==undefined
        && (owner===undefined || input.form8606ByOwner[owner]!==undefined));
      if(manualApplies && !applicableIraWorksheet(input,result,form,originalInput)){
        throw new Error('A confirmed explanation requires an applicable source-reconciled IRA worksheet.');
      }
    }
    if(provenance.source!=='historical-preview')continue;
    if(isIraForm1099RDistribution(form)
      && ((form.iraBasisConfirmedZero===true && d(form.employeeContributions).isZero())
        || applicableIraWorksheet(input,result,form,originalInput)))continue;
    throw new Error('A confirmed explanation requires source-resolved retirement taxability.');
  }
}
