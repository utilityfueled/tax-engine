'use client';

import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import type { PAOrdinaryEmployeeSources } from '@/models/pa-ordinary-employee-sources';
import type { PAResidencySources } from '@/models/pa-residency';
import { confirmGuidedPAResidencySources, updateGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { applyUnionDuesReceiptEligibility, createGuidedPAUnionDues, documentedUnionDuesCalendarRange, emptyGuidedPAUnionDuesReceipt, prepareGuidedPAUnionDues } from '@/lib/guided-pa-union-dues';
import { isGuidedPAUnionDues, unionDuesWageSource } from '@/engine/state/pa-guided-union-dues';
import { CurrencyField } from './currency-field';
import { BooleanFact, TextFact } from './fact-fields';

type Employer = PAOrdinaryEmployeeSources['employers'][number];
const rangeClassifications = [
  ['working', 'Physically worked in PA for pay, without work travel'],
  ['weekend_holiday', 'Weekend or holiday without work'],
  ['illness_disability', 'Illness or disability without work'],
  ['vacation_leave', 'Vacation or leave without work'],
] as const;
type Classification = typeof rangeClassifications[number][0];
const emptyRange = { from: '', through: '', reference: '', classification: '' as Classification | '' };

export function PAUnionDuesDetails({ input, data, onChange }: {
  input: TaxYearInput | null; data: PAResidencySources; onChange: (data: PAResidencySources) => void;
}) {
  const [range, setRange] = useState(emptyRange);
  const [errorMessage, setErrorMessage] = useState('');
  const packet = data.employeeSources;
  const eligible = unionDuesWageSource(input, data) !== undefined;
  const update = (employeeSources: PAOrdinaryEmployeeSources | undefined) => {
    setErrorMessage('');
    onChange(updateGuidedPAResidencySources(data, { employeeSources }));
  };
  if (packet === undefined) {
    if (!eligible || !input) return null;
    return <button type="button" onClick={() => update(createGuidedPAUnionDues(input, data))}>Add actual Pennsylvania union dues</button>;
  }
  const remove = <button type="button" onClick={() => { update(undefined); setRange(emptyRange); }}>Remove Pennsylvania employee expense sources</button>;
  if (!isGuidedPAUnionDues(packet) || !eligible) return <section aria-label="Retained Pennsylvania employee expense sources">
    <p>The saved Pennsylvania employee expense records need their original source method. You can remove these records after reviewing them.</p>{remove}
  </section>;

  const employer = packet.employers[0];
  const { statement, ue, calendar } = employer;
  const [employment] = employer.employmentPeriods;
  const edit = (patch: Partial<PAOrdinaryEmployeeSources>) => update({ ...packet, ...patch, sourceFactsConfirmed: null });
  const editEmployer = (patch: Partial<Employer>) => edit({ employers: [{ ...employer, ...patch }] });
  const editStatement = (patch: Partial<Employer['statement']>) => editEmployer({ statement: { ...statement, ...patch } });
  const editEmployment = (patch: Partial<typeof employment>) => editEmployer({ employmentPeriods: [{ ...employment, ...patch }] });
  const editUE = (patch: Partial<Employer['ue']>) => editEmployer({ ue: { ...ue, ...patch } });
  const editReceipt = (index: number, patch: Partial<Employer['ue']['expenses'][number]>) =>
    editUE({ expenses: ue.expenses.map((receipt, i) => i === index ? { ...receipt, ...patch } : receipt) });

  function addRange() {
    try {
      const additions = documentedUnionDuesCalendarRange(range.from, range.through, range.reference, range.classification);
      const dates = new Set(calendar.map(day => day.date));
      if (additions.some(day => dates.has(day.date))) throw new Error('Documented calendar ranges cannot overlap.');
      editEmployer({ calendar: [...calendar, ...additions].sort((a, b) => a.date.localeCompare(b.date)) });
      setRange(emptyRange);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Check the actual calendar range.'); }
  }

  return <fieldset className="guided-card"><legend>Actual Pennsylvania union dues</legend>
    <p className="guided-hint">Use the original 2025 records for required union dues from one PA employer. This section covers only dues you paid without any reimbursement and work performed entirely in Pennsylvania. Enter the full original calendar, including dates you did not work.</p>
    <TextFact label="Union dues employee packet reference" value={packet.sourceReference} onChange={sourceReference => edit({ sourceReference, employers: [{ ...employer, ue: { ...ue, sourceReference } }] })} />
    <TextFact label="Union dues records complete through" type="date" value={packet.asOfDate} onChange={asOfDate => edit({ asOfDate })} />
    <p>Original W-2 employer {employer.employer.name}. Review the linked payroll dates and amounts above.</p>
    <TextFact label="Employer address for union dues" value={employer.employer.address} onChange={address => editEmployer({ employer: { ...employer.employer, address } })} />
    <TextFact label="Employer telephone for union dues" value={employer.employer.telephone} onChange={telephone => editEmployer({ employer: { ...employer.employer, telephone } })} />
    <TextFact label="Job duties requiring union membership" value={employer.employer.jobDuties} onChange={jobDuties => editEmployer({ employer: { ...employer.employer, jobDuties } })} />
    <TextFact label="Actual employment record reference" value={employment.sourceReference} onChange={sourceReference => editEmployment({ sourceReference })} />
    <TextFact label="Actual employment first date" type="date" value={employment.from} onChange={from => editEmployment({ from })} />
    <TextFact label="Actual employment last date" type="date" value={employment.through} onChange={through => editEmployment({ through })} />
    <TextFact label="Signed employer verification reference" value={statement.documentReference} onChange={documentReference => editStatement({ documentReference })} />
    <TextFact label="Employer signer name" value={statement.signerName} onChange={signerName => editStatement({ signerName })} />
    <TextFact label="Employer signer role" value={statement.signerRole} onChange={signerRole => editStatement({ signerRole })} />
    <TextFact label="Employer statement signature date" type="date" value={statement.signedOn} onChange={signedOn => editStatement({ signedOn })} />
    <BooleanFact label="Signed employer statement is available and verifies the complete PA work calendar" value={statement.signed}
      onChange={value => editStatement({ signed: value, documentAvailableConfirmed: value, fullCalendarAndOutsideDaysVerifiedConfirmed: value })} />
    <fieldset><legend>Original work calendar</legend>
      <TextFact label="Original work calendar reference" value={range.reference} onChange={reference => setRange({ ...range, reference })} />
      <TextFact label="Calendar range first date" type="date" value={range.from} onChange={from => setRange({ ...range, from })} />
      <TextFact label="Calendar range last date" type="date" value={range.through} onChange={through => setRange({ ...range, through })} />
      <label className="guided-field"><span className="guided-field-label">Actual classification for each date in the range</span>
        <select className="guided-input" value={range.classification} onChange={event => setRange({ ...range, classification: event.target.value as Classification | '' })}>
          <option value="">Choose from the original</option>{rangeClassifications.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      <button type="button" onClick={addRange}>Add documented work calendar range</button>
      {calendar.length > 0 && <details><summary>Review {calendar.length} recorded calendar dates</summary>
        <ul>{calendar.map(day => <li key={day.date}>{day.sourceReference} · {rangeClassifications.find(([value]) => value === (day.kind === 'working' ? day.kind : day.nonworkingReason))?.[1]}
          {' '}<button type="button" onClick={() => editEmployer({ calendar: calendar.filter(row => row.date !== day.date) })}>Remove calendar date {day.date}</button></li>)}</ul></details>}
    </fieldset>
    {ue.expenses.map((receipt, index) => {
      const label = `Union dues receipt ${index + 1}`;
      return <fieldset key={index}><legend>{label}</legend>
        <TextFact label={`${label} union name`} value={receipt.description} onChange={description => editReceipt(index, { description })} />
        <TextFact label={`${label} original reference`} value={receipt.receiptReference} onChange={receiptReference => editReceipt(index, { receiptReference, sourceReference: receiptReference })} />
        <TextFact label={`${label} date paid`} type="date" value={receipt.paidOn} onChange={paidOn => editReceipt(index, { paidOn })} />
        <CurrencyField label={`${label} actual amount`} value={receipt.amount} onChange={amount => editReceipt(index, { amount })} />
        <p className="guided-hint">Confirm only actual dues required for this job, ordinary, reasonable, paid from your own funds and related to this job.</p>
        <BooleanFact label={`${label} qualifies as an actual required unreimbursed expense`} value={receipt.requiredLicenseOrUnionMembershipConfirmed}
          onChange={value => editReceipt(index, applyUnionDuesReceiptEligibility(value))} />
        <button type="button" onClick={() => editUE({ expenses: ue.expenses.filter((_, i) => i !== index) })}>Remove union dues receipt {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => editUE({ expenses: [...ue.expenses, emptyGuidedPAUnionDuesReceipt()] })}>Add actual union dues receipt</button>
    <BooleanFact label="Signed employer records confirm required dues and no reimbursement, and all sources were checked" value={ue.allExpenseAndReimbursementSourcesReviewedConfirmed}
      onChange={allExpenseAndReimbursementSourcesReviewedConfirmed => editUE({ allExpenseAndReimbursementSourcesReviewedConfirmed })} />
    <BooleanFact label="Other actual employee expense classes are known none" value={ue.otherExpenseClassesConfirmedNone}
      onChange={otherExpenseClassesConfirmedNone => editUE({ otherExpenseClassesConfirmedNone })} />
    <button type="button" onClick={() => {
      try {
        if (!input) throw new Error('Complete the actual W-2 and residency originals first.');
        onChange(confirmGuidedPAResidencySources(input, { ...data, employeeSources: prepareGuidedPAUnionDues(input, data) }));
        setErrorMessage('');
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Complete the actual original records before confirmation.'); }
    }}>Confirm actual PA union dues after the last edit</button>
    <p role="status">{errorMessage || (packet.sourceFactsConfirmed === true && data.sourceFactsConfirmed === true ? 'Actual Pennsylvania union dues and residency sources confirmed.' : 'Actual union dues records still need confirmation.')}</p>
    {remove}
  </fieldset>;
}
