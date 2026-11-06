// @vitest-environment jsdom
/** Spec: state/oh-school-district-currency-noop.yaml. Actual ReactDOM source controls. */
import React, { act, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { OhioSchoolDistrictDetails } from '@/components/guided-interview/ohio-school-district-details';
import { TaxYearInputSchema } from '@/models/inputs';
import { confirmGuidedOhioResidencyFacts } from '@/lib/guided-ohio-residency-facts';
import { confirmGuidedOhioPaymentFacts } from '@/lib/guided-ohio-payment-facts';
import { buildGuidedOhioSchoolDistrictFacts, confirmGuidedOhioSchoolDistrictFacts, type OhioSchoolDistrictDraft } from '@/lib/guided-ohio-school-district-facts';
import { enteredSchoolDraft, guidedSchoolDistrictFixture, required } from '../../fixtures/guided-oh-school-district-complete';
import { rawPartYearSchoolOriginals, schoolDistrictPartYearFixture } from '../../fixtures/oh-school-district-part-year-sources';
import { mountGuidedPanel } from './guided-panel-dom';

afterEach(() => vi.unstubAllGlobals());
function fullYear() {
  const f = guidedSchoolDistrictFixture('estimates');
  // New fictional receipt originals supplied before confirmation; no result supplies these facts.
  const draft = structuredClone(f.draft);
  for (const row of draft.payments.paymentRows) { row.amount = '1000'; row.original.amount = '1000'; }
  draft.payments.account.estimatedPaymentsCredited = '4000';
  return { original: f.original, residency: f.data.ohioResidency, payments: f.data.ohioPayments,
    draft: confirmGuidedOhioSchoolDistrictFacts(f.original, draft, f.data.ohioResidency, f.data.ohioPayments),
    label: 'School account estimated payments credited' };
}
function partYear() {
  const actual = schoolDistrictPartYearFixture(), original = TaxYearInputSchema.parse(rawPartYearSchoolOriginals(actual));
  const residency = confirmGuidedOhioResidencyFacts(original, {
    ...structuredClone(actual.ohioResidency), taxYear: '2025', sourceFactsConfirmed: null,
    owners: actual.ohioResidency.owners.map(owner => ({ ...structuredClone(owner), stateAdditions: [], stateDeductions: [] })),
  });
  const payments = confirmGuidedOhioPaymentFacts(original, {
    ...structuredClone(actual.ohioPayments), taxYear: '2025', sourceFactsConfirmed: null,
    specialFacts: { farmingFishingIncome: 'known_none', militaryDisasterRelief: 'known_none' },
  });
  const py = actual.ohioSchoolDistrict.partYearWageSources;
  const draft: OhioSchoolDistrictDraft = { ...enteredSchoolDraft(actual.ohioSchoolDistrict),
    partYearWageSources: { ...structuredClone(py), payrollOriginals: py.payrollOriginals.map(row => ({ ...structuredClone(row), taxYear: String(row.taxYear) })) } };
  return { original, residency, payments,
    draft: confirmGuidedOhioSchoolDistrictFacts(original, draft, residency, payments), label: 'Part-year payroll 1 gross wages' };
}
async function mount(f: ReturnType<typeof partYear> | ReturnType<typeof fullYear>) {
  let latest = f.draft, writes = 0;
  function Harness() {
    const [data, setData] = useState(f.draft);
    return <OhioSchoolDistrictDetails originalInput={f.original} ohioResidency={f.residency} ohioPayments={f.payments} taxYear={2025} data={data}
      onChange={next => { const retained = required(next); latest = retained; writes += 1; setData(retained); }} />;
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const panel = await mountGuidedPanel(<Harness />);
  async function blur(label = f.label) {
    const input = panel.control(label);
    await act(async () => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  }
  return { panel, blur, draft: () => latest, writes: () => writes };
}

it.each(['full-year', 'part-year'] as const)('school currency blur preserves exact confirmed %s sources without a parent write', async kind => {
  const f = kind === 'full-year' ? fullYear() : partYear(), before = structuredClone(f.draft);
  const packet = buildGuidedOhioSchoolDistrictFacts(f.original, f.draft, f.residency, f.payments), h = await mount(f);
  try {
    await h.blur();
    expect(h.writes()).toBe(0);
    expect(h.draft()).toBe(f.draft);
    expect(h.draft()).toEqual(before);
    expect(h.draft().sourceFactsConfirmed).toBe(true);
    expect(buildGuidedOhioSchoolDistrictFacts(f.original, h.draft(), f.residency, f.payments)).toEqual(packet);
  } finally { await h.panel.dispose(); }
});

it.each([['real amount change', '40001'], ['equal cash different exact lexeme', '40000.00']])('school currency still revokes confirmation for %s', async (_kind, value) => {
  const f = partYear(), before = structuredClone(f.draft), h = await mount(f);
  try {
    await h.panel.change(f.label, value); await h.blur();
    expect(h.writes()).toBe(1);
    expect(h.draft().partYearWageSources?.payrollOriginals[0]?.grossWages).toBe(value);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
    expect(() => buildGuidedOhioSchoolDistrictFacts(f.original, h.draft(), f.residency, f.payments)).toThrow(/explicitly confirm/);
    expect(f.draft).toEqual(before);
  } finally { await h.panel.dispose(); }
});

it('same cash with changed source provenance still requires explicit confirmation', async () => {
  const f = partYear(), before = structuredClone(f.draft), h = await mount(f), reference = 'Changed actual source, same cash';
  try {
    await h.panel.change('School account reference', reference);
    expect(h.writes()).toBe(1);
    expect(h.draft().payments.account.sourceReference).toBe(reference);
    expect(h.draft().partYearWageSources).toEqual(before.partYearWageSources);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
    expect(() => buildGuidedOhioSchoolDistrictFacts(f.original, h.draft(), f.residency, f.payments)).toThrow(/explicitly confirm/);
  } finally { await h.panel.dispose(); }
});

it.each([['unknown blank', ''], ['explicit zero', '0'], ['malformed text', 'not-an-amount']])('school currency retains %s without inventing source facts', async (_kind, value) => {
  const f = partYear(), before = structuredClone(f.draft), h = await mount(f);
  try {
    await h.panel.change(f.label, value); await h.blur();
    expect(h.writes()).toBe(1);
    expect(h.draft().partYearWageSources?.payrollOriginals[0]?.grossWages).toBe(value);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.draft().originalFederalSources).toEqual(before.originalFederalSources);
    expect(f.draft).toEqual(before);
  } finally { await h.panel.dispose(); }
});
