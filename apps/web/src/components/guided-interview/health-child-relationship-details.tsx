"use client";

import { emptyHealthChildRelationship, type HealthChildRelationshipData } from '@/lib/guided-health-insurance-facts';
import { BooleanFact, TextFact } from './fact-fields';

/** Actual relationship proof, independent of a marriage calculation's tax family. */
export function HealthChildRelationshipDetails({ prefix, data, onChange }: {
  prefix: string; data?: HealthChildRelationshipData; onChange: (data: HealthChildRelationshipData | undefined) => void;
}) {
  if (!data) return <button type="button" onClick={() => onChange(emptyHealthChildRelationship())}>{prefix}: Add actual source record</button>;
  const update = (patch: Partial<HealthChildRelationshipData>) => onChange({ ...data, ...patch });
  return <fieldset style={{ minWidth: 0, width: '100%', boxSizing: 'border-box', gridColumn: '1 / -1' }}>
    <legend>{prefix}</legend>
    <p className="guided-hint">For a marriage-year claim for a child on another tax return, use records showing your relationship and when it began. This does not add the child to your tax family. For a foster child, use the actual authorized agency or court placement record.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix}: Source tax year`} value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label={`${prefix}: Source reference`} value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <label className="guided-field"><span className="guided-field-label">{prefix}: Business owner</span><select className="guided-input" value={data.accountHolder} onChange={event => update({ accountHolder: event.target.value as HealthChildRelationshipData['accountHolder'] })}>
        <option value="">Confirm from actual records</option><option value="primary">You</option><option value="spouse">Spouse</option>
      </select></label>
      <TextFact label={`${prefix}: Owner SSN`} value={data.ownerSsn} onChange={ownerSsn => update({ ownerSsn })} />
      <TextFact label={`${prefix}: Child SSN on original policy`} value={data.coveredIndividualSsn} onChange={coveredIndividualSsn => update({ coveredIndividualSsn })} />
      <label className="guided-field"><span className="guided-field-label">{prefix}: Child relationship</span><select className="guided-input" value={data.childRelationship} onChange={event => update({ childRelationship: event.target.value as HealthChildRelationshipData['childRelationship'] })}>
        <option value="">Confirm from actual records</option><option value="son_or_daughter">Son or daughter</option><option value="stepchild">Stepchild</option><option value="adopted_child">Adopted child</option><option value="foster_child">Eligible foster child</option>
      </select></label>
      <TextFact label={`${prefix}: Relationship began on`} type="date" value={data.relationshipStartDate} onChange={relationshipStartDate => update({ relationshipStartDate })} />
      <BooleanFact label={`${prefix}: Sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    </div>
    <button type="button" onClick={() => onChange(undefined)}>{prefix}: Remove source record</button>
  </fieldset>;
}
