"use client";

import type { SharedMarketplaceHealthData } from "@/lib/guided-health-insurance-facts";
import { BooleanFact, TextFact } from "./fact-fields";

export function SharedMarketplaceHealthDetails({ prefix, data, people, onChange }: {
  prefix: string; data?: SharedMarketplaceHealthData; people: readonly (readonly [string, string])[];
  onChange: (value: SharedMarketplaceHealthData | undefined) => void;
}) {
  if (!data) return <button type="button" onClick={() => onChange({ sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null,
    allCoveredPersonsLinkedConfirmed: null, allThisReturnPersonsInCoverageFamilyConfirmed: null, persons: [] })}>{prefix}: Add shared-policy payment links</button>;
  const label = `${prefix} shared health`;
  const update = (patch: Partial<SharedMarketplaceHealthData>) => onChange({ ...data, ...patch });
  return <fieldset><legend>{label}: Original people and payment records</legend>
    <p className="guided-hint">For a policy shared with another tax family, keep the full original premiums, advances and payment records. Link every covered person to the original Form 1095-A. The actual payment records must separately establish each person's paid share and advances.</p>
    <div className="guided-form-grid">
      <TextFact label={`${label}: Source tax year`} value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label={`${label}: Source reference`} value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label={`${label}: Every original covered person is linked`} value={data.allCoveredPersonsLinkedConfirmed} onChange={allCoveredPersonsLinkedConfirmed => update({ allCoveredPersonsLinkedConfirmed })} />
      <BooleanFact label={`${label}: All this-return people are in its actual coverage family`} value={data.allThisReturnPersonsInCoverageFamilyConfirmed} onChange={allThisReturnPersonsInCoverageFamilyConfirmed => update({ allThisReturnPersonsInCoverageFamilyConfirmed })} />
    </div>
    {data.persons.map((person, index) => {
      const row = `${label} person ${index + 1}`;
      const change = (patch: Partial<typeof person>) => update({ persons: data.persons.map((value, position) => position === index ? { ...value, ...patch } : value) });
      return <div key={index} className="guided-form-grid">
        <label className="guided-field"><span className="guided-field-label">{row}: Health worksheet person</span><select className="guided-input" value={person.personId} onChange={event => change({ personId: event.target.value })}>
          <option value="">Choose the actual covered person</option>
          {person.personId && !people.some(([id]) => id === person.personId) && <option value={person.personId}>Saved person needs reconciliation</option>}
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <TextFact label={`${row}: Original covered person SSN`} value={person.coveredIndividualSsn} onChange={coveredIndividualSsn => change({ coveredIndividualSsn })} />
        <button type="button" onClick={() => update({ persons: data.persons.filter((_, position) => position !== index) })}>{row}: Remove link</button>
      </div>;
    })}
    <button type="button" onClick={() => update({ persons: [...data.persons, { personId: "", coveredIndividualSsn: "" }] })}>{label}: Add person link</button>
    <BooleanFact label={`${label}: Person links checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>{label}: Remove shared-policy payment links</button>
  </fieldset>;
}
