// Spec: spec/federal/guided-schedule-ai-investment-household.yaml.
import {expect,it,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {updateSectionData}from '@/lib/guided-interview-flow';
import {createWorkspaceRecord}from '@/lib/workspace-storage';
import {sanitizeWorkspaceForHostedStorage}from '@/lib/hosted-privacy';
import {calculateVerifiedAiAudit,resolveServerAiTaxContext}from '@/lib/ai-tax-context';
afterEach(()=>vi.unstubAllGlobals());
import {guidedInvestmentHouseholdFixture} from '../fixtures/guided-schedule-ai-investment-household';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildEstimatedTaxFacts} from '@/lib/guided-estimated-tax-facts';
import {parseInput,calculateFederalTax} from '@/index';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual source required');return v;}
it('forwards actual joint household originals and exact canonical taxes without mutation',()=>{
 const x=guidedInvestmentHouseholdFixture(),before=JSON.stringify(x.state);
 expect(buildEstimatedTaxFacts(x.state.sectionData.payments,2025)?.investmentElectionSources?.household).toMatchObject({sourceTaxYear:2025,spouseInvestmentIncome:'0',dividendSources:[{sourceIndex:0,sourceTaxYear:2025}]});
 const result=calculateFederalTax(parseInput(required(buildTaxInputFromGuidedData(x.state))));
 expect(result.totalTaxBeforeCredits.toFixed()).toBe('22078');expect(result.form2210?.lines.filter(l=>l.form==='Form 2210 Schedule AI'&&/^14[a-d]$/.test(l.line)).map(l=>l.value.toFixed())).toEqual(['24888','34012','18636','22078']);expect(JSON.stringify(x.state)).toBe(before);
});
it('rejects unknown and contradictory household originals without inventing spouse facts',()=>{
 for(const change of [(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>{x.household.spouseInvestmentIncome='';},(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>{x.household.spouseInvestmentIncome='1';},(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>{x.household.sourceFactsConfirmed=false;},(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>{x.household.spouseDomicile.sourceReference='';}]){const x=guidedInvestmentHouseholdFixture();change(x);expect(()=>buildEstimatedTaxFacts(x.state.sectionData.payments,2025)).toThrow();}
});

it('binds actual source identities and retains both spouse and dividend conflicts',()=>{
 const changes:Array<(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>void>=[
 ...['sourceTaxYear','sourceReference','sourceFactsConfirmed','jointReturnConfirmed','marriedAtYearEndConfirmed','bothSpousesAliveAllYearConfirmed','bothSpousesUsResidentsAllYearConfirmed','marriageSourceReference','primary','spouse','primaryDomicile','spouseDomicile','spouseInvestmentIncome','spouseInvestmentInterestExpense','spousePriorDisallowedInterest','spouseOtherInvestmentExpenses','spouseInvestmentSourcesNoneConfirmed','spouseSourceReference','allInvestmentSourcesIncludedConfirmed','primarySoleInvestmentOwnershipConfirmed','propertyNeverCommunityOwnedConfirmed','ownershipSourceReference','dividendSources'].map(key=>(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>{Reflect.deleteProperty(x.household,key);}),
 x=>{x.household.spouse.ssn='234--56-7890';},x=>{x.household.primary.ssn=x.household.spouse.ssn;},x=>{x.household.spouseDomicile.state='TX';},x=>{x.household.primaryDomicile.startDate='2025-01-02';},x=>{required(x.household.dividendSources[0]).sourceIndex='00';},x=>{required(x.household.dividendSources[0]).sourceTaxYear='2024';},x=>{required(x.household.dividendSources[0]).qualifiedDividends='40000.01';},x=>{Reflect.set(x.household,'unknownOriginal',true);},
 ];for(const[caseIndex,change]of changes.entries()){const x=guidedInvestmentHouseholdFixture();change(x);expect(()=>buildEstimatedTaxFacts(x.state.sectionData.payments,2025),`original-${caseIndex}`).toThrow();}
 const mismatches:Array<(x:ReturnType<typeof guidedInvestmentHouseholdFixture>)=>void>=[x=>{required(required(x.state.sectionData['personal-info']).spouse).lastName='Changed';},x=>{required(required(x.state.sectionData['income-investments']).dividendEntries[0]).accountHolder='spouse';},x=>{required(required(x.state.sectionData['income-investments']).dividendEntries[0]).accountReference='Different';},x=>{required(required(x.state.sectionData['income-investments']).dividendEntries[0]).qualifiedDividends='39999';},x=>{required(x.household.dividendSources[0]).recipient.ssn=x.household.spouse.ssn;}];
 for(const change of mismatches){const x=guidedInvestmentHouseholdFixture();change(x);const built=buildTaxInputFromGuidedData(x.state);if(built!==null)expect(()=>calculateFederalTax(parseInput(built))).toThrow();}
 const future=guidedInvestmentHouseholdFixture();future.state.taxYear=2026;expect(buildTaxInputFromGuidedData(future.state)).toBeNull();
 const renamed=guidedInvestmentHouseholdFixture();required(required(renamed.state.sectionData['personal-info']).spouse).lastName='ActualRenamed';renamed.household.spouse.lastName='ActualRenamed';expect(calculateFederalTax(parseInput(required(buildTaxInputFromGuidedData(renamed.state)))).totalTaxBeforeCredits.toFixed()).toBe('22078');
});
it('revokes stale household confirmation and preserves private JSON replay',()=>{
 const x=guidedInvestmentHouseholdFixture(),replay=JSON.parse(JSON.stringify(x.state));
 const input=parseInput(required(buildTaxInputFromGuidedData(replay)));expect(calculateFederalTax(input).totalTaxBeforeCredits.toFixed()).toBe('22078');
 const personal=required(x.state.sectionData['personal-info']);const changed=updateSectionData(x.state,'personal-info',{...personal,spouse:{...required(personal.spouse),lastName:'ActualChanged'}});
 expect(changed.sectionData.payments?.estimatedTaxFacts?.investmentElectionSources?.household?.sourceFactsConfirmed).toBeNull();expect(changed.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();expect(x.household.spouse.lastName).toBe('Spouse');
 expect(buildTaxInputFromGuidedData(changed)).toBeNull();
 const investments=required(x.state.sectionData['income-investments']);const stale=updateSectionData(x.state,'income-investments',{...investments,dividendEntries:investments.dividendEntries.map(row=>({...row,accountReference:'ActualChangedAccount'}))});expect(stale.sectionData.payments?.estimatedTaxFacts?.investmentElectionSources?.household?.sourceFactsConfirmed).toBeNull();
 const scope={ownerScope:'hosted-owner:mfj-guide',workspaceId:'mfj-guide',workspaceRevision:'revision'};const audit=calculateVerifiedAiAudit(scope,input),context=JSON.stringify(resolveServerAiTaxContext({...scope,taxYear:2025,audit}));const workspace=createWorkspaceRecord('mfj-guide');Object.assign(workspace,{confirmedTaxInput:input,guidedState:x.state});
 for(const value of['123-45-6789','234-56-7890','PrivateMfjSpouseName','PRIVATE-JOINT-HOUSEHOLD','PRIVATE-SPOUSE-COMPLETE','PRIVATE-ACTUAL-MARRIAGE','PRIVATE-PRIMARY-ACCOUNT','household','dividendSources']){expect(JSON.stringify(sanitizeWorkspaceForHostedStorage(workspace))).not.toContain(value);expect(context).not.toContain(value);expect(JSON.stringify(calculateFederalTax(input).allLines)).not.toContain(value);}
});
it('accepts actual formatted money without turning missing originals into zero',()=>{
 const x=guidedInvestmentHouseholdFixture();const row=required(x.household.dividendSources[0]);row.ordinaryDividends='40,000';row.qualifiedDividends='40,000';const before=JSON.stringify(x.state);
 const built=required(buildTaxInputFromGuidedData(x.state));expect(built.form2210?.investmentElectionSources?.household?.dividendSources?.[0]?.ordinaryDividends).toBe('40000');expect(calculateFederalTax(parseInput(built)).totalTaxBeforeCredits.toFixed()).toBe('22078');expect(JSON.stringify(x.state)).toBe(before);
 for(const value of['',' ','40,00','40000.01','-1','NaN']){const y=guidedInvestmentHouseholdFixture();required(y.household.dividendSources[0]).ordinaryDividends=value;expect(()=>buildEstimatedTaxFacts(y.state.sectionData.payments,2025)).toThrow();}
 for(const value of['',' ','0.01','-0.01','0,00','NaN']){const y=guidedInvestmentHouseholdFixture();y.household.spouseInvestmentIncome=value;expect(()=>buildEstimatedTaxFacts(y.state.sectionData.payments,2025)).toThrow();}
});
