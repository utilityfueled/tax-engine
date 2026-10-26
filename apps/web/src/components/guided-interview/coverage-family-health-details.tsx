"use client";

import { useState } from 'react';
import { captureCoverageFamilyHealthSources, emptyCoverageFamilyHealth, emptyCoverageFamilyHealthMonth, type CoverageFamilyHealthData, type CoverageFamilyHealthMonthData } from '@/lib/guided-coverage-family-health';
import type { MarketplacePolicyOption } from '@/lib/guided-marketplace-health-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function PersonChoice({ label, value, people, onChange }: { label: string; value: string; people: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Choose the actual covered person</option>
    {value && !people.some(([id]) => id === value) && <option value={value}>Saved person needs reconciliation</option>}
    {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select></label>;
}
function Members({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return <fieldset><legend>{label}: Actual benchmark members</legend>
    {values.map((value, index) => <div className="guided-form-grid" key={index}>
      <TextFact label={`${label} member ${index + 1}: SSN`} value={value} onChange={next => onChange(values.map((current, position) => position === index ? next : current))} />
      <button type="button" onClick={() => onChange(values.filter((_, position) => position !== index))}>{label} member {index + 1}: Remove</button>
    </div>)}
    <button type="button" onClick={() => onChange([...values, ''])}>{label}: Add benchmark member</button>
  </fieldset>;
}
export function CoverageFamilyHealthDetails({ prefix, data, people, sourceIds, policies, onChange }: {
  prefix: string; data?: CoverageFamilyHealthData; people: readonly (readonly [string, string])[];
  sourceIds: string[]; policies: MarketplacePolicyOption[]; onChange: (value: CoverageFamilyHealthData | undefined) => void;
}) {
  const [error, setError] = useState<string>();
  if (!data) return <button type="button" onClick={() => onChange(emptyCoverageFamilyHealth())}>{prefix}: Add monthly coverage-family sources</button>;
  const label = `${prefix} coverage family`, update = (patch: Partial<CoverageFamilyHealthData>) => onChange({ ...data, ...patch });
  const copy = () => { try { onChange(captureCoverageFamilyHealthSources(sourceIds, policies)); setError(undefined); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Check the actual original policy links.'); } };
  return <fieldset><legend>{label}: Monthly eligibility and benchmarks</legend>
    <p className="guided-hint">Use this worksheet when the plan covers someone outside the PTC coverage family. Keep full original premiums and advances. Enter each person's actual monthly coverage and other minimum essential coverage, plus the separate Marketplace benchmarks for the coverage family and the other covered family members. These facts do not replace the payment records or a shared-policy allocation.</p>
    <button type="button" onClick={copy}>{label}: Copy linked original policies</button>
    <p className="guided-hint">Copying replaces this family worksheet with the linked original records. Eligibility, benchmarks and confirmations must be entered again.</p>
    {error && <p role="alert">{error}</p>}
    <ul>{data.policies.map((row, index) => <li key={index}>{row.sourceId}: {row.original.marketplace || 'Marketplace unknown'} / {row.original.policyNumber || 'policy unknown'} / {row.original.taxYear || 'year unknown'} ({row.original.monthlyPremiums.length} original months)</li>)}</ul>
    <div className="guided-form-grid">
      <TextFact label={`${label}: Source tax year`} value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label={`${label}: Source reference`} value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label={`${label}: All original policies for this plan are included`} value={data.allPolicySourcesIncluded} onChange={allPolicySourcesIncluded => update({ allPolicySourcesIncluded })} />
    </div>
    {data.persons.map((person, index) => {
      const row = `${label} person ${index + 1}`;
      const change = (patch: Partial<typeof person>) => update({ persons: data.persons.map((current, position) => position === index ? { ...current, ...patch } : current) });
      return <div key={index} className="guided-form-grid">
        <PersonChoice label={`${row}: Health worksheet person`} value={person.personId} people={people} onChange={personId => change({ personId })} />
        <TextFact label={`${row}: Original covered person SSN`} value={person.coveredIndividualSsn} onChange={coveredIndividualSsn => change({ coveredIndividualSsn })} />
        <button type="button" onClick={() => update({ persons: data.persons.filter((_, position) => position !== index) })}>{row}: Remove link</button>
      </div>;
    })}
    <button type="button" onClick={() => update({ persons: [...data.persons, { personId: '', coveredIndividualSsn: '' }] })}>{label}: Add person link</button>
    {data.months.map((month, index) => {
      const row = `${label} month ${index + 1}`;
      const change = (patch: Partial<CoverageFamilyHealthMonthData>) => update({ months: data.months.map((current, position) => position === index ? { ...current, ...patch } : current) });
      return <fieldset key={index}><legend>{row}</legend><div className="guided-form-grid">
        <TextFact label={`${row}: Actual month (1–12)`} value={month.month} onChange={month => change({ month })} />
        <TextFact label={`${row}: Eligibility source reference`} value={month.sourceReference} onChange={sourceReference => change({ sourceReference })} />
        <BooleanFact label={`${row}: Every covered tax-family person has an eligibility record`} value={month.allCoveredPersonsIncludedConfirmed} onChange={allCoveredPersonsIncludedConfirmed => change({ allCoveredPersonsIncludedConfirmed })} />
      </div>
        {month.personFacts.map((person, position) => {
          const personLabel = `${row} person ${position + 1}`;
          const set = (patch: Partial<typeof person>) => change({ personFacts: month.personFacts.map((current, i) => i === position ? { ...current, ...patch } : current) });
          return <fieldset key={position}><legend>{personLabel}</legend><div className="guided-form-grid">
            <PersonChoice label={`${personLabel}: Health worksheet person`} value={person.personId} people={people} onChange={personId => set({ personId })} />
            <TextFact label={`${personLabel}: Eligibility source reference`} value={person.sourceReference} onChange={sourceReference => set({ sourceReference })} />
            <BooleanFact label={`${personLabel}: Marketplace coverage meets the full-month rule`} value={person.fullCoverageMonthConfirmed} onChange={fullCoverageMonthConfirmed => set({ fullCoverageMonthConfirmed })} />
            <BooleanFact label={`${personLabel}: Eligible for other minimum essential coverage`} value={person.otherMecEligible} onChange={otherMecEligible => set({ otherMecEligible })} />
          </div><button type="button" onClick={() => change({ personFacts: month.personFacts.filter((_, i) => i !== position) })}>{personLabel}: Remove eligibility</button></fieldset>;
        })}
        <button type="button" onClick={() => change({ personFacts: [...month.personFacts, { personId: '', sourceReference: '', fullCoverageMonthConfirmed: null, otherMecEligible: null }] })}>{row}: Add person eligibility</button>
        <div className="guided-form-grid">
          <CurrencyField label={`${row}: Coverage-family SLCSP`} value={month.coverageFamilySlcsp} onChange={coverageFamilySlcsp => change({ coverageFamilySlcsp })} />
          <TextFact label={`${row}: Coverage-family benchmark source`} value={month.coverageFamilySourceReference} onChange={coverageFamilySourceReference => change({ coverageFamilySourceReference })} />
          <CurrencyField label={`${row}: Noncoverage-family SLCSP`} value={month.nonCoverageFamilySlcsp} onChange={nonCoverageFamilySlcsp => change({ nonCoverageFamilySlcsp })} />
          <TextFact label={`${row}: Noncoverage-family benchmark source`} value={month.nonCoverageFamilySourceReference} onChange={nonCoverageFamilySourceReference => change({ nonCoverageFamilySourceReference })} />
        </div>
        <Members label={`${row} coverage family`} values={month.coverageFamilyMemberSsns} onChange={coverageFamilyMemberSsns => change({ coverageFamilyMemberSsns })} />
        <BooleanFact label={`${row}: All coverage-family benchmark members are included`} value={month.allCoverageFamilyMembersIncludedConfirmed} onChange={allCoverageFamilyMembersIncludedConfirmed => change({ allCoverageFamilyMembersIncludedConfirmed })} />
        <Members label={`${row} noncoverage family`} values={month.nonCoverageFamilyMemberSsns} onChange={nonCoverageFamilyMemberSsns => change({ nonCoverageFamilyMemberSsns })} />
        <BooleanFact label={`${row}: All noncoverage-family benchmark members are included`} value={month.allNonCoverageFamilyMembersIncludedConfirmed} onChange={allNonCoverageFamilyMembersIncludedConfirmed => change({ allNonCoverageFamilyMembersIncludedConfirmed })} />
        <button type="button" onClick={() => update({ months: data.months.filter((_, position) => position !== index) })}>{row}: Remove month</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => update({ months: [...data.months, emptyCoverageFamilyHealthMonth()] })}>{label}: Add actual month</button>
    <BooleanFact label={`${label}: Sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>{label}: Remove monthly family worksheet</button>
  </fieldset>;
}
