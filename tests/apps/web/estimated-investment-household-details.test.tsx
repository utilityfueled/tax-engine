// @vitest-environment jsdom
// Spec: spec/federal/guided-schedule-ai-investment-household.yaml.
import {act,createElement,useState} from 'react';
import {expect,it,vi,afterEach} from 'vitest';
import {mountGuidedPanel} from './guided-panel-dom';
import {EstimatedInvestmentElectionDetails} from '@/components/guided-interview/estimated-investment-election-details';
import {HOUSEHOLD_TEXT,HOUSEHOLD_FLAGS,SPOUSE_AMOUNTS,DIVIDEND_TEXT,DIVIDEND_AMOUNTS} from '@/lib/guided-estimated-investment-household';
import type {EstimatedInvestmentElectionData}from '@/lib/guided-estimated-investment-election';
import {guidedInvestmentHouseholdFixture} from '../../fixtures/guided-schedule-ai-investment-household';
import {buildEstimatedTaxFacts} from '@/lib/guided-estimated-tax-facts';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual source required');return v;}
afterEach(()=>vi.unstubAllGlobals());
it('requires visible household originals and revokes confirmation after edits',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const x=guidedInvestmentHouseholdFixture(),target=x.household;
 let current:EstimatedInvestmentElectionData|undefined={...x.packet,household:undefined};
 function Harness(){const[draft,set]=useState(current);return createElement(EstimatedInvestmentElectionDetails,{data:draft,onChange:(next:EstimatedInvestmentElectionData|undefined)=>{current=next;set(next);}});}
 const panel=await mountGuidedPanel(createElement(Harness));
 try{
 await panel.click('Add actual joint household investment originals');expect(current?.household).toEqual({});
 expect((panel.control('Spouse actual investment income')as HTMLInputElement).value).toBe('');expect((panel.control('Joint household originals checked after the last edit')as HTMLSelectElement).value).toBe('');
 for(const[key,label]of HOUSEHOLD_TEXT)await panel.change(label,target[key]);
 for(const[key,label]of HOUSEHOLD_FLAGS)await panel.change(label,String(target[key]));
 for(const[key,label]of SPOUSE_AMOUNTS)await panel.change(label,target[key]);
 for(const owner of['primary','spouse']as const){for(const[key,label]of[['firstName','first name'],['lastName','last name'],['ssn','complete SSN']]as const)await panel.change(`Household ${owner}: original ${label}`,target[owner][key]);const d=owner==='primary'?target.primaryDomicile:target.spouseDomicile;for(const[key,label]of[['state','domicile state'],['startDate','domicile start date'],['endDate','domicile end date'],['sourceReference','domicile original reference']]as const)await panel.change(`Household ${owner}: ${label}`,d[key]);}
 await panel.click('Add actual household dividend original');const div=required(target.dividendSources[0]);
 for(const[key,label]of DIVIDEND_TEXT)await panel.change(`Household dividend 1: ${label}`,div[key]);
 for(const[key,label]of[['firstName','first name'],['lastName','last name'],['ssn','complete SSN']]as const)await panel.change(`Household dividend 1: recipient ${label}`,div.recipient[key]);
 await panel.change('Household dividend 1: Actual owner','primary');for(const[key,label]of DIVIDEND_AMOUNTS)await panel.change(`Household dividend 1: ${label}`,div[key]);await panel.change('Household dividend 1: All other reported boxes are actually zero','true');
 await act(async()=>{panel.control('Household dividend 1: Ordinary dividends').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});expect(current?.household?.dividendSources?.[0]?.ordinaryDividends).toBe('40,000');
 await panel.change('Joint household originals checked after the last edit','true');await panel.change('All investment-election originals checked after the last edit','true');
 const payment=structuredClone(required(x.state.sectionData.payments));required(payment.estimatedTaxFacts).investmentElectionSources=current;expect(buildEstimatedTaxFacts(payment,2025)?.investmentElectionSources?.household).toEqual(x.canonical.form2210.investmentElectionSources.household);
 await panel.change('Spouse actual investment income','1');expect(current?.household?.spouseInvestmentIncome).toBe('1');expect(current?.household?.sourceFactsConfirmed).toBeNull();expect(current?.sourceFactsConfirmed).toBeNull();
 }finally{await panel.dispose();}
});
