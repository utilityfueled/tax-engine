// @vitest-environment jsdom
// Spec: state/pa-resident-credit-guided-sources.yaml native-entry/native-account-events.
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { PAResidentCreditDetails } from '@/components/guided-interview/pa-resident-credit-details';
import { calculatePAResidentCreditSources } from '@/engine/state/pa-resident-credit-sources';
import {
  assertGuidedPAResidentCreditPair,
  PAResidentCreditDraftSchema,
  type GuidedPAResidentCreditSources,
} from '@/lib/guided-pa-resident-credit-sources';
import type { PAResidentCreditSources } from '@/models/pa-resident-credit-sources';
import { paGuidedResidentCreditFixture } from '../../fixtures/pa-resident-credit-guided';
import { required } from '../../fixtures/guided-pa-ordinary-panels';
import { mountGuidedPanel } from './guided-panel-dom';

type Dom = Awaited<ReturnType<typeof mountGuidedPanel>>;
type Packet = PAResidentCreditSources;
type Claim = Packet['claims'][number];
type Identity = Pick<Packet, 'sourceTaxYear' | 'accountName' | 'accountSsn' | 'sourceReference'> & { state: string };
const confirm = 'Confirm actual PA resident-credit originals after the last edit';

async function enter(dom: Dom, rows: ReadonlyArray<readonly [string, string | number | null]>) {
  for (const [label, value] of rows) await dom.change(label, value === null ? '' : String(value));
}
async function identity(dom: Dom, label: string, source: Identity) {
  await enter(dom, [
    [label + ' actual tax year', source.sourceTaxYear],
    [label + ' actual account name', source.accountName],
    [label + ' actual account SSN', source.accountSsn],
    [label + ' actual state', source.state],
    [label + ' original source reference', source.sourceReference],
  ]);
}
async function enterClaim(dom: Dom, claim: Claim) {
  await dom.click('Add actual other-state resident-credit claim');
  await enter(dom, [['Resident-credit claim 1 actual state', claim.state], ['Resident-credit claim 1 original source reference', claim.sourceReference]]);
  const work = required(claim.wages[0]);
  await dom.click('Add actual work source to claim 1');
  await enter(dom, [['Claim 1 work 1 actual entered W2', work.w2Index], ['Claim 1 work 1 actual payroll source', work.payrollIndex]]);
  await identity(dom, 'Claim 1 work 1', work.workOriginal);
  await enter(dom, [
    ['Claim 1 work 1 actual pay date', work.workOriginal.paidOn],
    ['Claim 1 work 1 actual service start date', work.workOriginal.serviceFrom],
    ['Claim 1 work 1 actual service end date', work.workOriginal.serviceThrough],
    ['Claim 1 work 1 actual compensation', work.workOriginal.compensation],
    ['Claim 1 work 1 ordinary employee, not a shareholder exception', 'true'],
    ['Claim 1 work 1 all physical services in this actual state', 'true'],
  ]);
  const filed = claim.filedReturn;
  await identity(dom, 'Resident-credit claim 1 filed return', filed);
  await enter(dom, [
    ['Resident-credit claim 1 actual return identifier', filed.returnId],
    ['Resident-credit claim 1 actual filed return kind', filed.returnKind],
    ['Resident-credit claim 1 actual filing status', filed.filingStatus],
    ['Resident-credit claim 1 actual other-state residency', filed.residency],
    ['Resident-credit claim 1 actual filed date', filed.filedOn],
    ['Resident-credit claim 1 complete filed return and schedules checked', 'true'],
    ['Resident-credit claim 1 all actual nonpayment credits reviewed', 'true'],
    ['Resident-credit claim 1 ordinary compensation with no expense or other adjustment', 'true'],
    ['Resident-credit claim 1 all other income classes actually known zero', 'true'],
    ['Resident-credit claim 1 original taxable compensation', filed.reportedTaxableCompensation],
    ['Resident-credit claim 1 original tax before nonpayment credits', filed.taxBeforeNonpaymentCredits],
    ['Resident-credit claim 1 original tax after nonpayment credits', filed.taxAfterNonpaymentCredits],
  ]);
  for (const [index, payment] of claim.payments.entries()) {
    await dom.click('Add actual tax payment to claim 1');
    const label = `Claim 1 tax payment ${index + 1}`;
    await identity(dom, label, payment);
    await enter(dom, [
      [label + ' actual confirmation number', payment.confirmationNumber],
      [label + ' actual payment kind', payment.kind],
      [label + ' actual posted date', payment.date],
      [label + ' actual amount applied to tax', payment.amountAppliedToTax],
      [label + ' actual W2 for withholding only', payment.w2Index],
    ]);
  }
  await identity(dom, 'Resident-credit claim 1 tax account', claim.account);
  await enter(dom, [
    ['Resident-credit claim 1 account complete through date', claim.account.completeThroughDate],
    ['Resident-credit claim 1 all actual payments, refunds, transfers and offsets reviewed', 'true'],
    ['Resident-credit claim 1 actual account confirms no amendments, assessments or other adjustments', 'true'],
    ['Resident-credit claim 1 actual net tax payments reported', claim.account.netTaxPaymentsReported],
    ['Resident-credit claim 1 actual unpaid tax reported', claim.account.unpaidTaxReported],
    ['Resident-credit claim 1 actual outstanding overpayment reported', claim.account.overpaymentOutstandingReported],
  ]);
}

async function mount(status: 'resident' | 'part_year', saved?: { draft: GuidedPAResidentCreditSources; packet: Packet }) {
  const f = paGuidedResidentCreditFixture(status);
  let latest: GuidedPAResidentCreditSources | undefined = saved?.draft;
  let canonical: Packet | undefined = saved?.packet;
  let changes = 0;
  function Harness() {
    const [draft, setDraft] = useState<GuidedPAResidentCreditSources | undefined>(saved?.draft);
    const [packet, setPacket] = useState<Packet | undefined>(saved?.packet);
    return <PAResidentCreditDetails originalInput={f.input} ordinaryFacts={f.facts} data={draft} confirmedSources={packet} onChange={(d, p) => {
      changes++; latest = d; canonical = p; setDraft(d); setPacket(p);
    }} />;
  }
  const dom = await mountGuidedPanel(<Harness />);
  const harness = { f, dom, get latest() { return latest; }, get canonical() { return canonical; }, get changes() { return changes; } };
  if (saved) return harness;
  await dom.click('Add actual PA resident-credit sources');
  expect(latest?.sourceTaxYear).toBeNull();
  expect(latest?.originalFederalSources).toBeUndefined();
  await enter(dom, [
    ['PA resident-credit actual source tax year', f.packet.sourceTaxYear],
    ['PA resident-credit original source reference', f.packet.sourceReference],
    ['PA resident-credit actual account name', f.packet.accountName],
    ['PA resident-credit actual account SSN', f.packet.accountSsn],
    ['PA resident-credit complete account through date', f.packet.completeThroughDate],
    ['All claimed filed returns and actual source periods reviewed', 'true'],
  ]);
  return harness;
}

it.each([['resident', '1535'], ['part_year', '614']] as const)(
  'native PA resident-credit entry confirms an entire actual claim and preserves it after reopening: %s',
  async (status, credit) => {
    let h = await mount(status);
    try {
      const before = structuredClone(h.f.input);
      await enterClaim(h.dom, required(h.f.claim));
      expect(h.canonical).toBeUndefined();
      expect(h.latest?.sourceFactsConfirmed).toBeNull();
      await h.dom.click(confirm);
      expect(h.canonical).toEqual(h.f.packet);
      expect(h.latest).toEqual(h.f.packet);
      const saved = JSON.stringify(h.latest);
      const reopened = PAResidentCreditDraftSchema.parse(JSON.parse(saved));
      const result = calculatePAResidentCreditSources(h.f.input, h.f.facts, assertGuidedPAResidentCreditPair(h.f.input, h.f.facts, reopened, h.canonical));
      expect(result.totalCredit.toFixed()).toBe(credit);
      expect(result.perState[0]?.actualNetPayments.toFixed()).toBe('2000');
      expect(result.filingEligible).toBe(false);
      expect(h.f.input).toEqual(before);
      const savedCanonical = JSON.parse(JSON.stringify(h.canonical)) as Packet;
      await h.dom.dispose();
      h = await mount(status, { draft: reopened, packet: savedCanonical });
      expect(h.changes).toBe(0);
      expect(h.dom.control('Claim 1 work 1 actual compensation').value).toBe(status === 'resident' ? '50000' : '20000');
      expect(h.dom.control('Claim 1 tax payment 1 actual amount applied to tax').value).toBe('1200');
      expect(h.dom.container.textContent).toContain('source originals are current');
      expect(h.latest).toEqual(reopened);
      expect(h.canonical).toEqual(savedCanonical);
      await h.dom.change('Claim 1 work 1 actual compensation', '0');
      expect(h.latest?.claims[0]?.wages[0]?.workOriginal.compensation).toBe('0');
      expect(h.latest?.sourceFactsConfirmed).toBeNull();
      expect(h.canonical?.sourceFactsConfirmed).toBeNull();
      await h.dom.click(confirm);
      expect(h.latest?.sourceFactsConfirmed).toBeNull();
      expect(h.dom.container.textContent).toContain('do not reconcile');
      expect(h.latest?.originalFederalSources).toEqual(reopened.originalFederalSources);
    } finally { await h.dom.dispose(); }
  },
);

it('native PA credit entry retains actual returned cents and zero credits, and blocks incomplete or duplicate events', async () => {
  const h = await mount('resident');
  try {
    const claim = structuredClone(required(h.f.claim));
    // Independently stated fictional account: 1200.20 balance +800 withholding
    // less an actual .20 refund leaves net paid2000; no extra credit is created.
    required(claim.payments[0]).amountAppliedToTax = '1200.20';
    await enterClaim(h.dom, claim);
    await h.dom.click('Add actual refund, offset or transfer to claim 1');
    expect(h.latest?.claims[0]?.refunds[0]?.kind).toBe('');
    await h.dom.click(confirm);
    expect(h.canonical).toBeUndefined();
    const label = 'Claim 1 returned tax 1';
    await identity(h.dom, label, { ...claim.account, sourceReference: 'Fictional original DE refund receipt .20' });
    await enter(h.dom, [[label + ' actual confirmation number', 'Fictional-DE-refund-20-cents'], [label + ' actual event kind', 'refund'], [label + ' actual posted date', '2026-02-20'], [label + ' actual amount applied to tax', '0.20']]);
    await h.dom.click('Add actual nonpayment credit to claim 1');
    await enter(h.dom, [
      ['Claim 1 nonpayment credit 1 original source reference', 'Fictional filed line explicitly zero'],
      ['Claim 1 nonpayment credit 1 original return line', 'Other-credit-line-zero'],
      ['Claim 1 nonpayment credit 1 actual credit classification', 'other_than_pa_resident_credit'],
      ['Claim 1 nonpayment credit 1 original amount', '0'],
    ]);
    await h.dom.click(confirm);
    const packet = required(h.canonical);
    expect(packet.claims[0]?.refunds[0]?.amountAppliedToTax).toBe('0.20');
    expect(packet.claims[0]?.filedReturn.nonpaymentCredits[0]?.amount).toBe('0');
    const result = calculatePAResidentCreditSources(h.f.input, h.f.facts, packet);
    expect(result.totalCredit.toFixed()).toBe('1535');
    expect(result.perState[0]?.actualNetPayments.toFixed()).toBe('2000');
    await h.dom.change(label + ' actual confirmation number', required(claim.payments[0]).confirmationNumber);
    await h.dom.click(confirm);
    expect(h.latest?.sourceFactsConfirmed).toBeNull();
    expect(h.dom.container.textContent).toContain('duplicate actual payment/refund');
    await h.dom.click('Remove Claim 1 returned tax 1');
    await h.dom.click(confirm);
    expect(h.latest?.sourceFactsConfirmed).toBeNull();
    expect(h.dom.container.textContent).toContain('balances do not reconcile');
    expect(h.latest?.claims[0]?.payments[0]?.amountAppliedToTax).toBe('1200.20');
    expect(h.latest?.claims[0]?.account.netTaxPaymentsReported).toBe('2000');
    await h.dom.click('Remove Claim 1 nonpayment credit 1');
    await h.dom.click('Remove Claim 1 tax payment 2');
    await h.dom.click('Remove Claim 1 work 1');
    expect(h.latest?.claims[0]?.filedReturn.nonpaymentCredits).toEqual([]);
    expect(h.latest?.claims[0]?.payments).toHaveLength(1);
    expect(h.latest?.claims[0]?.wages).toEqual([]);
    await h.dom.click('Remove resident-credit claim 1');
    expect(h.latest?.claims).toEqual([]);
    expect(h.latest?.sourceFactsConfirmed).toBeNull();
  } finally { await h.dom.dispose(); }
});
