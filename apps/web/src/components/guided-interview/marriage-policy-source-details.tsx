"use client";

import { useState } from 'react';
import type { FilingStatus, PersonalInfoData } from '@/lib/guided-interview-flow';
import type { PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';
import { captureMarriageSources, copyMarriageBenchmarkGroups, type MarriagePolicyData } from '@/lib/guided-marriage-policy';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function MarriagePolicySourceDetails({data,personal,filingStatus,onChange}:{
  data:PremiumTaxCreditData;personal?:PersonalInfoData;filingStatus?:FilingStatus|null;onChange:(patch:Partial<PremiumTaxCreditData>)=>void;
}) {
  const [error,setError]=useState<string>();
  const packet=data.marriageSources;
  const update=(patch:Partial<MarriagePolicyData>)=>{if(packet)onChange({marriageSources:{...packet,...patch}});};
  function perform(action:()=>void){try{action();setError(undefined);}catch(caught){setError(caught instanceof Error?caught.message:'Check the actual marriage sources.');}}
  return <section><h5>Marriage-year Marketplace worksheet</h5>
    <p className="guided-hint">Use actual marriage records, dependent qualifications and corrected monthly benchmarks. The return compares the ordinary and alternative calculations to determine whether the alternative reduces advance-credit repayment.</p>
    <p className="guided-hint">This worksheet supports a joint return with full-month eligible coverage on policies issued to either spouse. For a wedding on the first day of February through December, alternative months stop before the wedding month. January 1 marriages cannot use this election. For self-employed health insurance, enter both the original marriage records and the actual health-plan payments. Shared-policy allocations require separate source coordination.</p>
    <button type="button" onClick={()=>perform(()=>onChange({marriageSources:captureMarriageSources(data,personal,filingStatus)}))}>Copy marriage household and original policies</button>
    <p className="guided-hint">Copy again after replacing the household or original statements. Copying clears the previous marriage answers and benchmarks.</p>
    {error&&<p role="alert">{error}</p>}
    {packet&&<>
      <p className="guided-hint">Copied {packet.policies.length} original policies and {packet.dependents.length} claimed dependents for {packet.sourceTaxYear}.</p>
      <div className="guided-form-grid">
        <TextFact label="Marriage worksheet reference" value={packet.sourceReference} onChange={sourceReference=>update({sourceReference})}/>
        <TextFact label="Actual marriage date (YYYY-MM-DD)" value={packet.marriageDate} onChange={marriageDate=>update({marriageDate})}/>
        {([
          ['primaryUnmarriedOnJanuary1','Primary taxpayer was unmarried on January 1'],
          ['spouseUnmarriedOnJanuary1','Spouse was unmarried on January 1'],
          ['marriedToEachOtherOnDecember31','These spouses were married to each other on December 31'],
          ['allPoliciesIncluded','All original policies are included in the marriage worksheet'],
          ['allDependentAssignmentsIncluded','Every claimed dependent has a separate-family assignment'],
        ] as const).map(([field,label])=><BooleanFact key={field} label={label} value={packet[field]} onChange={value=>update({[field]:value})}/>)}
      </div>
      {packet.dependents.map((person,index)=>{
        const prefix=`Marriage dependent ${index+1}`;
        const set=(patch:Partial<typeof person>)=>update({dependents:packet.dependents.map((current,i)=>i===index?{...current,...patch}:current)});
        return <fieldset key={index}><legend>{prefix}: {person.name}</legend>
          <p className="guided-hint">Use the separate dependency qualifications in Publication 974. If this person qualifies for both spouses, choose one alternative family.</p>
          <div className="guided-form-grid">
            <BooleanFact label={`${prefix}: Qualifies as primary taxpayer's dependent`} value={person.qualifiesForPrimary} onChange={qualifiesForPrimary=>set({qualifiesForPrimary})}/>
            <BooleanFact label={`${prefix}: Qualifies as spouse's dependent`} value={person.qualifiesForSpouse} onChange={qualifiesForSpouse=>set({qualifiesForSpouse})}/>
            <label className="guided-field"><span className="guided-field-label">{prefix}: Alternative family</span><select className="guided-input" value={person.alternativeFamilyOwner} onChange={event=>set({alternativeFamilyOwner:event.target.value as typeof person.alternativeFamilyOwner})}><option value="">Choose from actual qualifications</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse</option></select></label>
            <TextFact label={`${prefix}: Qualification source reference`} value={person.sourceReference} onChange={sourceReference=>set({sourceReference})}/>
          </div>
        </fieldset>;
      })}
      {packet.policies.map((policy,index)=>{
        const prefix=`Marriage policy ${index+1}`;
        const set=(patch:Partial<typeof policy>)=>update({policies:packet.policies.map((current,i)=>i===index?{...current,...patch}:current)});
        return <fieldset key={index}><legend>{prefix}: {policy.original.policyNumber}</legend><div className="guided-form-grid">
          <TextFact label={`${prefix}: Original statement reference`} value={policy.sourceReference} onChange={sourceReference=>set({sourceReference})}/>
          <BooleanFact label={`${prefix}: Covered people had full-month coverage`} value={policy.fullMonthCoverageConfirmed} onChange={fullMonthCoverageConfirmed=>set({fullMonthCoverageConfirmed})}/>
          <BooleanFact label={`${prefix}: All covered people met premium-credit coverage eligibility`} value={policy.allCoveredIndividualsEligibleForPtcConfirmed} onChange={allCoveredIndividualsEligibleForPtcConfirmed=>set({allCoveredIndividualsEligibleForPtcConfirmed})}/>
        </div></fieldset>;
      })}
      <button type="button" onClick={()=>perform(()=>update({benchmarks:copyMarriageBenchmarkGroups(data,personal,filingStatus)}))}>Copy alternative benchmark coverage groups</button>
      <p className="guided-hint">Complete the date and dependent assignments first. Copying sets up each spouse's rows from the original coverage periods and recipients. Enter the actual corrected SLCSP for the listed people; amounts stay blank until entered. Original statement and joint-household benchmarks stay separate.</p>
      {packet.benchmarks.map((row,index)=>{
        const prefix=`${row.owner==='primary'?'Primary':'Spouse'} month ${row.month}`;
        const set=(patch:Partial<typeof row>)=>update({benchmarks:packet.benchmarks.map((current,i)=>i===index?{...current,...patch}:current)});
        const people=row.coveredIndividualSsns.map(ssn=>data.policies.flatMap(policy=>policy.coveredIndividuals??[]).find(person=>person.ssn.replaceAll('-','')===ssn.replaceAll('-',''))?.name??'Unmatched source person');
        return <fieldset key={index}><legend>{prefix}: Alternative coverage benchmark</legend>
          <p className="guided-hint">Covered people: {people.length?people.join(', '):'No people in this original policy group for this month; confirm the actual zero benchmark.'}</p>
          <div className="guided-form-grid">
            <CurrencyField label={`${prefix}: Corrected alternative SLCSP premium`} value={row.slcsp} onChange={slcsp=>set({slcsp})}/>
            <TextFact label={`${prefix}: Benchmark source reference`} value={row.sourceReference} onChange={sourceReference=>set({sourceReference})}/>
            <BooleanFact label={`${prefix}: Benchmark source checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>set({sourceFactsConfirmed})}/>
          </div>
        </fieldset>;
      })}
      <BooleanFact label="Marriage sources checked after the last edit" value={packet.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>update({sourceFactsConfirmed})}/>
      <button type="button" onClick={()=>onChange({marriageSources:undefined})}>Remove marriage worksheet</button>
    </>}
  </section>;
}
