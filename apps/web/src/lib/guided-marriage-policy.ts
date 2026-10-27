import { Form8962MarriageSourcesSchema } from '@/models/form-8962-marriage';
import type { TaxYearInput } from '@/models/inputs';
import { calculateForm8962MarriageSources, marriagePolicyGroupOwner } from '@/engine/forms/form-8962-marriage-sources';
import { normalizeMarketplacePolicy } from './guided-shared-policy';
import { parseGuidedCurrency } from './guided-currency';
import type { FilingStatus, PersonalInfoData } from './guided-interview-flow';
import type { MarketplacePolicyData, PremiumTaxCreditData } from './guided-premium-tax-credit-facts';
import type { HealthInsuranceData } from './guided-health-insurance-facts';
import { buildCoverageFamilyHealthSources } from './guided-coverage-family-health';

type Owner = 'primary' | 'spouse';
export interface MarriageDependentData {
  name: string; ssn: string; alternativeFamilyOwner: '' | Owner;
  qualifiesForPrimary: boolean | null; qualifiesForSpouse: boolean | null; sourceReference: string;
}
export interface MarriagePolicySourceData {
  sourceId: string; sourceReference: string; original: MarketplacePolicyData;
  fullMonthCoverageConfirmed: boolean | null; allCoveredIndividualsEligibleForPtcConfirmed: boolean | null;
}
export interface MarriageBenchmarkData {
  owner: Owner; month: string; slcsp: string; sourceReference: string;
  sourceFactsConfirmed: boolean | null; coveredIndividualSsns: string[];
}
export interface MarriagePolicyData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPoliciesIncluded: boolean | null;
  primaryName: string; primarySsn: string; spouseName: string; spouseSsn: string;
  marriageDate: string; primaryUnmarriedOnJanuary1: boolean | null; spouseUnmarriedOnJanuary1: boolean | null;
  marriedToEachOtherOnDecember31: boolean | null; allDependentAssignmentsIncluded: boolean | null;
  dependents: MarriageDependentData[]; policies: MarriagePolicySourceData[]; benchmarks: MarriageBenchmarkData[];
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}.`);
  return value.trim();
}
function whole(value: string | undefined, label: string): number {
  if (!value?.trim() || !/^\d{1,4}$/.test(value.trim())) throw new Error(`Enter the actual whole number for ${label}.`);
  return Number(value);
}
function id(value: string | undefined, label: string): string {
  const actual=text(value,label).replaceAll('-','');
  if (!/^\d{9}$/.test(actual)) throw new Error(`Enter the actual complete ${label}.`);
  return actual;
}
function person(value: {firstName?:string;lastName?:string;ssn?:string} | undefined, label:string) {
  const firstName=text(value?.firstName,`${label} first name`),lastName=text(value?.lastName,`${label} last name`);
  id(value?.ssn,`${label} SSN`);
  return {firstName,lastName,ssn:text(value?.ssn,`${label} SSN`)};
}
function household(data:PremiumTaxCreditData,personal:PersonalInfoData|undefined,status:FilingStatus|null|undefined) {
  if(status!=='mfj')throw new Error('The actual marriage method requires a married joint return.');
  const year=whole(data.sourceTaxYear,'marriage source year');
  if(![2025,2026].includes(year))throw new Error('Choose the actual supported marriage source year.');
  if(!personal || !Array.isArray(personal.dependents))throw new Error('Complete the actual claimed household before copying marriage sources.');
  return {year,primary:person(personal,'primary taxpayer'),spouse:person(personal.spouse,'joint spouse'),dependents:personal.dependents.map(row=>person(row,'claimed dependent'))};
}
function money(value:string|undefined,label:string):string {
  text(value,label);const amount=parseGuidedCurrency(value);
  if(amount.lt(0))throw new Error(`The actual ${label} cannot be negative.`);
  return amount.toFixed();
}
/** Copy only supplied originals. Qualification and amount answers stay unknown. */
export function captureMarriageSources(data:PremiumTaxCreditData,personal:PersonalInfoData|undefined,status:FilingStatus|null|undefined):MarriagePolicyData {
  const h=household(data,personal,status);
  if(!data.policies.length)throw new Error('Enter the actual original Marketplace policies before copying.');
  return {
    sourceTaxYear:data.sourceTaxYear,sourceReference:'',sourceFactsConfirmed:null,allPoliciesIncluded:null,
    primaryName:`${h.primary.firstName} ${h.primary.lastName}`,primarySsn:h.primary.ssn,spouseName:`${h.spouse.firstName} ${h.spouse.lastName}`,spouseSsn:h.spouse.ssn,
    marriageDate:'',primaryUnmarriedOnJanuary1:null,spouseUnmarriedOnJanuary1:null,marriedToEachOtherOnDecember31:null,allDependentAssignmentsIncluded:null,
    dependents:h.dependents.map(row=>({name:`${row.firstName} ${row.lastName}`,ssn:row.ssn,alternativeFamilyOwner:'',qualifiesForPrimary:null,qualifiesForSpouse:null,sourceReference:''})),
    policies:data.policies.map((original,index)=>{
      normalizeMarketplacePolicy(original,h.year,true);
      return {sourceId:`form1095A:${index}`,sourceReference:'',original:structuredClone(original),fullMonthCoverageConfirmed:null,allCoveredIndividualsEligibleForPtcConfirmed:null};
    }),benchmarks:[],
  };
}
/** Rows are copied from source coverage, never from a calculated credit or income. */
export function copyMarriageBenchmarkGroups(data:PremiumTaxCreditData,personal:PersonalInfoData|undefined,status:FilingStatus|null|undefined,healthInsurance?:HealthInsuranceData):MarriageBenchmarkData[] {
  const h=household(data,personal,status),packet=data.marriageSources;
  if(!packet)throw new Error('Copy actual marriage sources and assign dependents first.');
  const date=text(packet.marriageDate,'marriage date'),parsed=new Date(`${date}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||parsed.getUTCFullYear()!==h.year)throw new Error('Enter the actual marriage date in the return year.');
  const lastPreMarriageMonth=parsed.getUTCMonth()+1-(parsed.getUTCDate()===1?1:0);
  if(lastPreMarriageMonth===0)throw new Error('Marriage on January 1 is not eligible for the alternative marriage calculation.');
  const primaryId=id(h.primary.ssn,'primary SSN'),spouseId=id(h.spouse.ssn,'spouse SSN');
  const families={primary:new Set([primaryId]),spouse:new Set([spouseId])};
  if(packet.dependents.length!==h.dependents.length)throw new Error('Reconcile every actual dependent assignment before copying benchmark groups.');
  for(const person of h.dependents){
    const key=id(person.ssn,'dependent SSN'),matches=packet.dependents.filter(row=>id(row.ssn,'dependent assignment SSN')===key),row=matches[0];
    if(matches.length!==1||!row||!row.alternativeFamilyOwner||typeof row.qualifiesForPrimary!=='boolean'||typeof row.qualifiesForSpouse!=='boolean'
      ||(row.alternativeFamilyOwner==='primary'?!row.qualifiesForPrimary:!row.qualifiesForSpouse))throw new Error('Complete each actual dependent qualification and family assignment.');
    families[row.alternativeFamilyOwner].add(key);
  }
  const policies=data.policies.map(policy=>normalizeMarketplacePolicy(policy,h.year,true));
  const coverage=new Map<string,Set<number>>(),fullCoverage=new Map<string,Set<number>>(),originalIds=new Map<string,string>();
  const groups={primary:new Map<number,Set<string>>(),spouse:new Map<number,Set<string>>()};
  const householdIds = new Set([...families.primary,...families.spouse]);
  for(const [index,policy] of policies.entries()){
    const recipient=id(policy.recipientSsn,'original recipient SSN');
    const sharedRows=data.sharedPolicyAllocations?.policies.filter(row=>row.sourceId===`form1095A:${index}`),shared=sharedRows?.[0];
    if(data.allocationRequired && (sharedRows?.length!==1 || !shared?.original || JSON.stringify(normalizeMarketplacePolicy(shared.original,h.year,true))!==JSON.stringify(policy)))throw new Error('Reconcile each actual allocation original before copying marriage groups.');
    const ownPeople=(policy.coveredIndividuals??[]).filter(person=>{
      const key=id(person.ssn,'original covered-person SSN');
      if(data.allocationRequired && shared?.situation!=='not_shared'){
        const assignments=shared?.coveredFamilyAssignments.filter(row=>id(row.ssn,'shared person SSN')===key),assignment=assignments?.[0];
        if(assignments?.length!==1 || !assignment?.family || (assignment.family==='this_return')!==householdIds.has(key))throw new Error('Reconcile every original person to an actual tax family before copying marriage groups.');
        return assignment.family==='this_return';
      }
      if(!householdIds.has(key))throw new Error('An original outside person requires the actual shared-family source assignment.');
      return true;
    });
    if(!data.allocationRequired && recipient!==primaryId && recipient!==spouseId)throw new Error('Marriage benchmarks require an actual filer recipient or completed shared-family sources.');
    const familyPlans=healthInsurance?.plans.filter(plan=>plan.marketplacePolicySourceIds?.includes(`form1095A:${index}`)&&plan.coverageFamilySources)??[];
    if(familyPlans.length>1)throw new Error('Each original marriage policy needs one actual monthly coverage-family source.');
    const monthlyFamily=buildCoverageFamilyHealthSources(familyPlans[0]?.coverageFamilySources);
    const policyAnswers=packet.policies.find(row=>row.sourceId===`form1095A:${index}`);
    if(!monthlyFamily&&(policyAnswers?.fullMonthCoverageConfirmed===false||policyAnswers?.allCoveredIndividualsEligibleForPtcConfirmed===false))throw new Error('Enter actual monthly eligibility sources for the partial-coverage policy before copying marriage groups.');
    if(monthlyFamily){
      const originals=monthlyFamily.policies?.filter(row=>row.sourceId===`form1095A:${index}`);
      if(monthlyFamily.sourceTaxYear!==h.year||originals?.length!==1||JSON.stringify(originals[0].original)!==JSON.stringify(policy))throw new Error('Reconcile the actual monthly coverage-family original before copying marriage groups.');
      const people=monthlyFamily.persons??[];
      if(new Set(people.map(row=>text(row.personId,'coverage person ID'))).size!==people.length||new Set(people.map(row=>id(row.coveredIndividualSsn,'coverage person SSN'))).size!==people.length)throw new Error('Each actual monthly coverage person must be linked once.');
      const months=monthlyFamily.months??[];
      if(new Set(months.map(row=>row.month)).size!==months.length)throw new Error('Each actual monthly coverage source must occur once.');
    }
    const eligibility=(key:string,month:number)=>{
      if(!monthlyFamily)return {full:true,eligible:true};
      const links=monthlyFamily.persons?.filter(row=>id(row.coveredIndividualSsn,'coverage person SSN')===key),link=links?.[0];
      const rows=monthlyFamily.months?.filter(row=>row.month===month),row=rows?.[0];
      const facts=row?.personFacts?.filter(person=>person.personId===link?.personId),fact=facts?.[0];
      if(links?.length!==1||!link||rows?.length!==1||!row||facts?.length!==1||!fact||typeof fact.fullCoverageMonthConfirmed!=='boolean'||typeof fact.otherMecEligible!=='boolean')throw new Error('Complete each actual person and month full-coverage and other-MEC answer before copying marriage groups.');
      text(fact.sourceReference,'monthly person eligibility reference');
      return {full:fact.fullCoverageMonthConfirmed,eligible:fact.fullCoverageMonthConfirmed&&!fact.otherMecEligible};
    };
    for(const person of ownPeople){
      const key=id(person.ssn,'original covered-person SSN'),first=person.firstMonth,last=person.lastMonth;
      originalIds.set(key,text(person.ssn,'original covered-person SSN'));
      if(first===undefined||last===undefined)throw new Error('Enter actual original covered-person periods.');
      for(let month=first;month<=Math.min(last,lastPreMarriageMonth);month++){
        const covered=coverage.get(key)??new Set<number>();covered.add(month);coverage.set(key,covered);
        if(eligibility(key,month).full){const full=fullCoverage.get(key)??new Set<number>();full.add(month);fullCoverage.set(key,full);}
      }
    }
    for(let month=1;month<=lastPreMarriageMonth;month++){
      const people=ownPeople.filter(person=>person.firstMonth!<=month&&person.lastMonth!>=month).map(person=>id(person.ssn,'original covered-person SSN'));
      if(!people.length)continue;
      const owner=marriagePolicyGroupOwner(recipient,primaryId,spouseId,people,families),group=groups[owner].get(month)??new Set<string>();
      for(const key of people)if(eligibility(key,month).eligible)group.add(key);
      groups[owner].set(month,group);
    }
  }
  return (['primary','spouse'] as const).flatMap(owner=>{
    const covered=[...families[owner]].flatMap(key=>[...(coverage.get(key)??[])]);
    const full=[...families[owner]].flatMap(key=>[...(fullCoverage.get(key)??[])]);
    if(!full.length)return [];
    const rows:MarriageBenchmarkData[]=[];
    for(let month=Math.min(...full);month<=Math.max(...covered);month++)rows.push({owner,month:String(month),slcsp:'',sourceReference:'',sourceFactsConfirmed:null,coveredIndividualSsns:[...(groups[owner].get(month)??[])].sort().map(key=>text(originalIds.get(key),'original covered-person SSN'))});
    return rows;
  });
}
export function invalidateMarriageSources(data:MarriagePolicyData):MarriagePolicyData {
  return {...data,sourceFactsConfirmed:null,benchmarks:data.benchmarks.map(row=>({...row,sourceFactsConfirmed:null}))};
}
/** Normalize exact entered facts then invoke the same canonical source binder. */
export function bindGuidedMarriageSources(data:PremiumTaxCreditData,year:number,status:FilingStatus,personal:PersonalInfoData,
  policies:TaxYearInput['form1095A'],facts:NonNullable<TaxYearInput['form8962']>,form7206?:TaxYearInput['form7206']) {
  const h=household(data,personal,status),packet=data.marriageSources;
  if(!packet)throw new Error('Enter the actual marriage source worksheet for the selected election.');
  if(h.year!==year)throw new Error('The actual marriage source year must match the return.');
  const normalized=Form8962MarriageSourcesSchema.parse({...packet,sourceTaxYear:whole(packet.sourceTaxYear,'marriage worksheet year'),
    sourceFactsConfirmed:packet.sourceFactsConfirmed??undefined,allPoliciesIncluded:packet.allPoliciesIncluded??undefined,
    primaryUnmarriedOnJanuary1:packet.primaryUnmarriedOnJanuary1??undefined,spouseUnmarriedOnJanuary1:packet.spouseUnmarriedOnJanuary1??undefined,
    marriedToEachOtherOnDecember31:packet.marriedToEachOtherOnDecember31??undefined,allDependentAssignmentsIncluded:packet.allDependentAssignmentsIncluded??undefined,
    dependents:packet.dependents.map(row=>({...row,alternativeFamilyOwner:row.alternativeFamilyOwner||undefined,qualifiesForPrimary:row.qualifiesForPrimary??undefined,qualifiesForSpouse:row.qualifiesForSpouse??undefined})),
    policies:packet.policies.map(row=>({...row,original:normalizeMarketplacePolicy(row.original,year,true),fullMonthCoverageConfirmed:row.fullMonthCoverageConfirmed??undefined,allCoveredIndividualsEligibleForPtcConfirmed:row.allCoveredIndividualsEligibleForPtcConfirmed??undefined})),
    benchmarks:packet.benchmarks.map(row=>({...row,month:whole(row.month,'alternative benchmark month'),slcsp:money(row.slcsp,'corrected alternative benchmark'),sourceFactsConfirmed:row.sourceFactsConfirmed??undefined})),
  });
  calculateForm8962MarriageSources({taxpayer:{taxYear:year,filingStatus:'married_filing_jointly',primary:h.primary,spouse:h.spouse,dependents:h.dependents},
    standardDeductionFacts:{primaryCanBeClaimedAsDependent:personal.standardDeductionFacts?.primaryCanBeClaimedAsDependent??undefined,spouseCanBeClaimedAsDependent:personal.standardDeductionFacts?.spouseCanBeClaimedAsDependent??undefined},
    form1095A:policies,form7206,form8962:{...facts,marriageSources:normalized}});
  return normalized;
}
