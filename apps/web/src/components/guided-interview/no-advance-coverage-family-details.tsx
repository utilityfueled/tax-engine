"use client";
import type { CoverageFamilyData, CoverageFamilyGroupData, NoAdvanceCoverageFamiliesData } from "@/lib/guided-shared-policy";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

export function NoAdvanceCoverageFamilyDetails({ value, onCapture, onChange }: {
  value?: NoAdvanceCoverageFamiliesData; onCapture: () => void; onChange: (value: NoAdvanceCoverageFamiliesData | undefined) => void;
}) {
  return <section><h5>Complete monthly coverage families</h5>
    <p className="guided-hint">For overlapping policies with no advance credit, obtain the full monthly benchmark for each tax family. Group its eligible people by their actual rating area. Every policy covering these people must be included in the original ledger. Copy the per-policy benchmark rows again after changing family assignments.</p>
    <button type="button" onClick={onCapture}>Copy complete overlapping coverage families</button>
    {value && <>
      <div className="guided-form-grid">
        <TextFact label="Complete coverage-family source year" value={value.sourceTaxYear} onChange={sourceTaxYear => onChange({ ...value, sourceTaxYear })} />
        <TextFact label="Complete coverage-family worksheet reference" value={value.sourceReference} onChange={sourceReference => onChange({ ...value, sourceReference })} />
        <BooleanFact label="All no-advance overlapping months are included" value={value.allBenchmarkMonthsIncluded} onChange={allBenchmarkMonthsIncluded => onChange({ ...value, allBenchmarkMonthsIncluded })} />
      </div>
      {value.months.map((row, monthIndex) => <fieldset key={monthIndex}><legend>Month {row.month}: Complete families</legend>
        {row.families.map((family, familyIndex) => {
          const prefix = `Month ${row.month} family ${familyIndex + 1}`;
          const set = (patch: Partial<CoverageFamilyData>) => onChange({ ...value, months: value.months.map((current, i) => i === monthIndex ? { ...current, families: current.families.map((member, j) => j === familyIndex ? { ...member, ...patch } : member) } : current) });
          return <fieldset key={familyIndex}><legend>{prefix}: {family.taxpayerName}</legend>
            <p className="guided-hint">Copied {family.coveredIndividuals.length} covered people from the original statements and family assignments.</p>
            <div className="guided-form-grid">
              <TextFact label={`${prefix}: Coverage source reference`} value={family.sourceReference} onChange={sourceReference => set({ sourceReference })} />
              <BooleanFact label={`${prefix}: All eligible covered members are included`} value={family.allCoverageFamilyMembersIncludedConfirmed} onChange={allCoverageFamilyMembersIncludedConfirmed => set({ allCoverageFamilyMembersIncludedConfirmed })} />
              <BooleanFact label={`${prefix}: All policies covering this family are in the original ledger`} value={family.allCoveragePoliciesIncludedConfirmed} onChange={allCoveragePoliciesIncludedConfirmed => set({ allCoveragePoliciesIncludedConfirmed })} />
            </div>
            {family.groups.map((group, groupIndex) => {
              const label = `${prefix} group ${groupIndex + 1}`;
              const setGroup = (patch: Partial<CoverageFamilyGroupData>) => set({ groups: family.groups.map((current, i) => i === groupIndex ? { ...current, ...patch } : current) });
              return <fieldset key={groupIndex}><legend>{label}</legend><div className="guided-form-grid">
                <TextFact label={`${label}: Source ID`} value={group.sourceId} onChange={sourceId => setGroup({ sourceId })} />
                <TextFact label={`${label}: Source reference`} value={group.sourceReference} onChange={sourceReference => setGroup({ sourceReference })} />
                <TextFact label={`${label}: Rating area`} value={group.ratingArea} onChange={ratingArea => setGroup({ ratingArea })} />
                <CurrencyField label={`${label}: Applicable benchmark`} value={group.slcsp} onChange={slcsp => setGroup({ slcsp })} />
              </div>
                {family.coveredIndividuals.map((person, index) => <label key={person.ssn} style={{ display: "block", marginBlock: 8 }}><input type="checkbox" aria-label={`${label}: Include covered person ${index + 1}`} checked={group.coveredIndividualSsns.includes(person.ssn)} onChange={event => setGroup({ coveredIndividualSsns: event.target.checked ? [...group.coveredIndividualSsns, person.ssn] : group.coveredIndividualSsns.filter(id => id !== person.ssn), slcsp: "", allCoveredPeopleShareRatingAreaConfirmed: null })} /> {person.name}</label>)}
                <BooleanFact label={`${label}: These people share this rating area`} value={group.allCoveredPeopleShareRatingAreaConfirmed} onChange={allCoveredPeopleShareRatingAreaConfirmed => setGroup({ allCoveredPeopleShareRatingAreaConfirmed })} />
                <button type="button" onClick={() => set({ groups: family.groups.filter((_, i) => i !== groupIndex) })}>{label}: Remove group</button>
              </fieldset>;
            })}
            <button type="button" onClick={() => set({ groups: [...family.groups, { sourceId: "", sourceReference: "", ratingArea: "", slcsp: "", coveredIndividualSsns: [], allCoveredPeopleShareRatingAreaConfirmed: null }] })}>{prefix}: Add actual location group</button>
          </fieldset>;
        })}
      </fieldset>)}
      <BooleanFact label="Complete coverage-family sources checked after the last edit" value={value.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...value, sourceFactsConfirmed })} />
      <button type="button" onClick={() => onChange(undefined)}>Remove complete coverage-family worksheet</button>
    </>}
  </section>;
}
