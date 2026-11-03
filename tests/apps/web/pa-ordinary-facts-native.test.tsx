// @vitest-environment jsdom
// Spec: spec/state/pa-ordinary-facts-native.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { PAOrdinaryReturnDetails } from '@/components/guided-interview/pa-ordinary-return-details';
import { buildGuidedPAOrdinaryReturnFacts } from '@/lib/guided-pa-ordinary-return-facts';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return.js';
import { calculatePAOrdinaryReturnFacts } from '@/engine/state/pa-ordinary-return-facts.js';
import { PAOrdinaryReturnFactsSchema, PA_SP_OTHER_LINES, type PAOrdinaryReturnFacts } from '@/models/pa-ordinary-return-facts.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { paOrdinaryReturnFixture, paOrdinaryReturnRefundFixture } from '../../fixtures/pa-ordinary-return';
import { paNonchildHouseholdFixture } from '../../fixtures/pa-nonchild-dependent-household';
import { paOrdinaryInvestmentFixture } from '../../fixtures/pa-ordinary-investment-sources';
import { mountGuidedPanel } from './guided-panel-dom';

type Panel = Awaited<ReturnType<typeof mountGuidedPanel>>;
const confirm = 'Confirm all actual PA return sources after the last edit';

async function mount(input: TaxYearInput, initial?: PAOrdinaryReturnFacts) {
  let saved = initial;
  function Harness() {
    const [facts, setFacts] = useState(initial);
    return <PAOrdinaryReturnDetails originalInput={input} data={facts} onChange={next => {
      saved = next;
      setFacts(next);
    }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  return {
    panel,
    draft() {
      if (!saved) throw new Error('Expected a retained PA return draft');
      return saved;
    },
    canonical: () => buildGuidedPAOrdinaryReturnFacts(input, saved),
  };
}

async function enter(panel: Panel, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) await panel.change(label, value);
}

async function enterAccount(panel: Panel, prefix: string, input: TaxYearInput) {
  const person = input.taxpayer.primary;
  await panel.change(prefix + ' actual account name', person.firstName + ' ' + person.lastName);
  await panel.change(prefix + ' actual account SSN', person.ssn);
}

it('Native ordinary entry reconciles refund elections on the complete return', async () => {
  const { input, facts, sources } = paOrdinaryReturnRefundFixture();
  const h = await mount(input);
  let stored: PAOrdinaryReturnFacts;
  try {
    await h.panel.click('Add Pennsylvania return facts');
    expect(h.draft().sourceTaxYear).toBeNull();
    await enter(h.panel, {
      'PA return source tax year': '2025',
      'PA return original source reference': facts.sourceReference,
      'Actual PA return owner': 'primary',
      'Filing and household original source reference': facts.filing.sourceReference,
      'Actual Pennsylvania filing choice': 'S',
      'Actual household marital status': 'unmarried',
      'Owner alive for the entire calendar year': 'true',
      'Final Return records establish no PA taxable income next year': 'false',
      'Actually claimed as a dependent on another federal return': 'false',
      'Actual filing and dependency records checked': 'true',
      'All actual estimated and extension receipts are included, including known none': 'true',
      'Actual prior return history': 'no_return',
      'Prior return history original source reference': facts.payments.priorReturn.sourceReference,
      'Actual available prior credit': 'none',
      'Prior credit original source reference': facts.payments.priorCredit.sourceReference,
      'Actual as-of date': facts.timing.asOfDate,
      'Filing date source': 'expected',
      'Actual or expected filing date': facts.timing.date,
      'Original or amended return': 'original',
      'Actual filing extension': 'none',
      'Actual payment extension': 'none',
      'Independent remaining-tax payment source': 'no_remaining_tax',
      'Remaining-tax payment original source reference': facts.timing.remainingTaxPayment.sourceReference,
      'Actual taxable purchase source status': 'none',
      'Use-tax original source reference': facts.useTax.sourceReference,
    });
    for (const line of PA_SP_OTHER_LINES) {
      await h.panel.change('SP ' + line + ' actual source status', 'known_none');
      await h.panel.change('SP ' + line + ' category original source reference', facts.sp.categories[line].sourceReference);
    }
    await enter(h.panel, {
      'All actual worldwide eligibility-income sources reviewed and included': 'true',
      'Actual overpayment election status': 'allocation',
      'Overpayment election original source reference': facts.disposition.sourceReference,
      'Actual requested refund': '700',
      'Actual requested next-year credit': '200',
    });
    await h.panel.click('Add actual donation election');
    await h.panel.change('Donation 1 actual published code', 'A');
    await h.panel.change('Donation 1 actual whole-dollar amount', '100');
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.click(confirm);
    const result = calculatePAOrdinaryReturn(input, h.canonical(), sources);
    expect(result.pa40.totalPATaxableIncome.toFixed()).toBe('50120');
    expect(result.pa40.taxLiability.toFixed()).toBe('1539');
    expect(result.pa40.netOverpayment.toFixed()).toBe('1000');
    expect(result.refundDisposition.refund.toFixed()).toBe('700');
    expect(result.refundDisposition.nextYearCredit.toFixed()).toBe('200');
    expect(result.refundDisposition.donations.map(d => [d.code, d.amount.toFixed()])).toEqual([['A', '100']]);
    expect(h.panel.container.textContent).not.toContain(input.taxpayer.primary.ssn);
    expect(h.panel.container.querySelector('textarea, input[type="hidden"]')).toBeNull();
    expect(JSON.stringify(result.lines)).not.toContain(input.taxpayer.primary.ssn);
    stored = JSON.parse(JSON.stringify(h.draft()));
  } finally { await h.panel.dispose(); }

  const reopened = await mount(input, stored);
  try {
    expect(reopened.draft()).toEqual(stored);
    expect(reopened.canonical().originalFederalSources).toEqual(stored.originalFederalSources);
    await reopened.panel.change('Actual requested refund', '701');
    expect(reopened.draft().sourceFactsConfirmed).toBeNull();
    expect(reopened.canonical).toThrow(/confirm/i);
    await reopened.panel.click(confirm);
    expect(() => calculatePAOrdinaryReturn(input, reopened.canonical(), sources)).toThrow(/allocation|overpayment/i);
  } finally { await reopened.panel.dispose(); }
});

it('Native payment originals keep installments separate from a prior election', async () => {
  const { input, facts } = paOrdinaryReturnFixture();
  const h = await mount(input, facts);
  try {
    for (const [index, amount] of ['125.39', '70.62'].entries()) {
      const label = 'Payment ' + (index + 1);
      await h.panel.click('Add actual payment receipt');
      await enterAccount(h.panel, label, input);
      await enter(h.panel, {
        [label + ' source reference']: 'Private Q1 receipt ' + index,
        [label + ' actual intended installment (1–4; blank for extension)']: '1',
        [label + ' original tax year']: '2025',
        [label + ' actual return type']: 'pa40',
        [label + ' actual payment kind']: 'estimated',
        [label + ' original date']: '2025-04-15',
        [label + ' original confirmation number']: 'PRIVATE-Q1-' + index,
        [label + ' original amount']: amount,
      });
    }
    await h.panel.change('Actual available prior credit', 'available');
    await h.panel.change('Prior credit original source reference', 'Prior election and current account transcript');
    await enterAccount(h.panel, 'Prior original credit election', input);
    await enterAccount(h.panel, 'Current original tax account', input);
    await enter(h.panel, {
      'Prior election actual tax year': '2024',
      'Prior original elected credit': '37',
      'Current account actual tax year': '2025',
      'Current original available credit': '36',
      'Current source confirms no offsets, reversals or refund of elected credit': 'true',
    });
    await h.panel.click(confirm);
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/requires actual prior return/i);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await h.panel.change('Actual prior return history', 'return');
    await h.panel.change('Prior return history original source reference', 'Fictional filed 2024 PA-40 with credit election');
    await h.panel.click('Enter actual prior PA40 original');
    await enterAccount(h.panel, 'Prior PA40', input);
    await enter(h.panel, {
      'Prior PA40 original tax year': '2024',
      'Prior PA40 original return type': 'pa40',
      'Prior PA40 original residency': 'resident',
      'Prior PA40 original filing status': 'S',
      'Prior PA40 original filed date': '2025-03-24',
      'Prior PA40 original taxable income': '10000',
      'Prior PA40 original tax forgiveness credit': '0',
      'Prior return actually filed': 'true',
      'Prior return actual full-year resident source confirmed': 'true',
    });
    await h.panel.click(confirm);
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/available account credit must match/i);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await h.panel.change('Current original available credit', '37');
    await h.panel.click(confirm);
    const result = calculatePAOrdinaryReturnFacts(input, h.canonical());
    expect(result.priorYearPATaxableIncome?.toFixed()).toBe('10000');
    expect(result.priorYearTaxForgivenessCredit?.toFixed()).toBe('0');
    expect(result.estimatedPayments.toFixed()).toBe('196.01');
    expect(result.quarterlyEstimatedPayments.map(n => n.toFixed())).toEqual(['196.01', '0', '0', '0']);
    expect(result.priorCreditCarryforward.toFixed()).toBe('37');
    expect(result.extensionPayment.toFixed()).toBe('0');
    expect(JSON.stringify(result.lines)).not.toContain('PRIVATE-Q1');
    await h.panel.change('Payment 2 original amount', '');
    expect(h.draft().payments.rows[1].original.amount).toBe('');
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
    const incomplete = await mount(input, JSON.parse(JSON.stringify(h.draft())));
    try {
      expect(incomplete.panel.control('Payment 2 original amount').value).toBe('');
      expect(incomplete.draft().payments.priorCredit.currentOriginalAccount?.availableCredit).toBe('37');
      expect(incomplete.canonical).toThrow(/confirm/i);
    } finally { await incomplete.panel.dispose(); }
    await h.panel.change('Payment 2 original amount', '70.62');
    await h.panel.change('Payment 2 original confirmation number', 'PRIVATE-Q1-0');
    await h.panel.click(confirm);
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/duplicate/i);
    await h.panel.click('Remove payment 2');
    await h.panel.click(confirm);
    expect(calculatePAOrdinaryReturnFacts(input, h.canonical()).estimatedPayments.toFixed()).toBe('125.39');
  } finally { await h.panel.dispose(); }
});

it('Native household review counts one child and retains two nonchild originals', async () => {
  const { input, facts, sources } = paNonchildHouseholdFixture();
  const original = PAOrdinaryReturnFactsSchema.parse(facts);
  const h = await mount(input, { ...original, filing: {
    ...original.filing, dependentChildren: [], otherFederalDependents: [],
  }, sourceFactsConfirmed: null });
  try {
    await h.panel.click('Add actual PA dependent child');
    await enter(h.panel, {
      'Child 1 original source reference': facts.filing.dependentChildren[0].sourceReference,
      'Child 1 entered federal dependent': '0',
      'Child 1 actual relationship': 'natural_child',
      'Child 1: actual original facts checked': 'true',
      'Child 1: actually claimed on the federal return': 'true',
      'Child 1: no other parent may claim this child by agreement or decree': 'true',
    });
    for (const [index, original] of facts.filing.otherFederalDependents.entries()) {
      const label = 'Nonchild federal dependent ' + (index + 1);
      await h.panel.click('Add actual nonchild federal dependent');
      await enter(h.panel, {
        [label + ' original source reference']: original.sourceReference,
        [label + ' entered federal dependent']: String(original.originalIndex),
        [label + ' actual relationship']: original.relationship,
        [label + ' actual relationship description']: original.actualRelationshipDescription,
        [label + ': actual original family records checked']: 'true',
        [label + ': actually claimed on the federal return']: 'true',
        [label + ': records establish no natural, adopted, step, grandchild or foster child relationship to claimant']: 'true',
      });
    }
    await h.panel.click(confirm);
    const canonical = h.canonical();
    expect(canonical.filing.otherFederalDependents?.map(p => p.originalFederalDependent)).toEqual(input.taxpayer.dependents.slice(1));
    expect(calculatePAOrdinaryReturn(input, canonical, sources).dependentChildren).toBe(1);
    expect(h.panel.container.textContent).not.toContain(input.taxpayer.dependents[2].ssn);
    await h.panel.change('Nonchild federal dependent 2 entered federal dependent', '1');
    await h.panel.click(confirm);
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.click('Remove nonchild federal dependent 2');
    await h.panel.click(confirm);
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/every actual federal dependent/i);
  } finally { await h.panel.dispose(); }
});

it('Native prior PA40 and completed SP must agree on actual forgiveness', async () => {
  const { input, facts } = paOrdinaryReturnFixture();
  const h = await mount(input, facts);
  try {
    await h.panel.change('Actual prior return history', 'return');
    await h.panel.change('Prior return history original source reference', 'Filed 2024 PA-40 and Schedule SP');
    await h.panel.click('Enter actual prior PA40 original');
    await enterAccount(h.panel, 'Prior PA40', input);
    await enter(h.panel, {
      'Prior PA40 original tax year': '2024',
      'Prior PA40 original return type': 'pa40',
      'Prior PA40 original residency': 'resident',
      'Prior PA40 original filing status': 'S',
      'Prior PA40 original filed date': '2025-03-24',
      'Prior PA40 original taxable income': '3000',
      'Prior PA40 original tax forgiveness credit': '92',
      'Prior return actually filed': 'true',
      'Prior return actual full-year resident source confirmed': 'true',
    });
    await h.panel.click('Add actual prior completed SP');
    await enterAccount(h.panel, 'Prior completed SP', input);
    await enter(h.panel, {
      'Prior completed SP original source reference': 'Filed 2024 SP and complete worldwide income records',
      'Prior completed SP actual source year': '2024',
      'Prior completed SP actual filing category': 'unmarried',
      'Prior completed SP actual qualified dependent children': '0',
      'Prior completed SP original PA taxable income': '3000',
      'Prior completed SP original nontaxable eligibility income': '0',
      'Prior completed SP original PA tax liability': '92',
      'Prior completed SP original resident credit': '0',
      'Prior completed SP reported forgiveness percentage (0–100)': '100',
      'Prior completed SP original reported tax forgiveness credit': '92',
      'Prior completed SP complete worldwide sources confirmed': 'true',
      'Prior completed SP original completed schedule checked': 'true',
    });
    await h.panel.click(confirm);
    const result = calculatePAOrdinaryReturnFacts(input, h.canonical());
    expect(result.priorYearPATaxableIncome?.toFixed()).toBe('3000');
    expect(result.priorYearTaxForgivenessCredit?.toFixed()).toBe('92');
    expect(result.priorYear100PercentForgiveness).toBe(true);
    await h.panel.change('Prior PA40 original tax forgiveness credit', '0');
    await h.panel.click(confirm);
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/amounts differ/i);
    expect(h.canonical).toThrow(/confirm/i);
    await h.panel.click('Remove Prior completed SP');
    await h.panel.click(confirm);
    const withoutSchedule = calculatePAOrdinaryReturnFacts(input, h.canonical());
    expect(withoutSchedule.priorYearTaxForgivenessCredit?.toFixed()).toBe('0');
    expect(withoutSchedule.priorYear100PercentForgiveness).toBe(false);
  } finally { await h.panel.dispose(); }
});

it('Native purchase and worldwide receipts produce the documented PA liability', async () => {
  const { input, facts, sources } = paOrdinaryReturnFixture();
  const h = await mount(input, facts);
  try {
    await h.panel.change('Actual taxable purchase source status', 'itemized');
    await h.panel.change('Use-tax original source reference', 'Philadelphia purchases and tax paid');
    await h.panel.change('Actual purchase tax locality', 'philadelphia');
    await h.panel.change('Actual taxable classification and allowable sales tax paid checked', 'true');
    await h.panel.click('Add actual taxable purchase');
    await enter(h.panel, {
      'Purchase 1 source reference': 'Fictional taxable goods receipt',
      'Purchase 1 actual date': '2025-05-31',
      'Purchase 1 actual taxable kind': 'goods',
      'Purchase 1 actual taxable amount': '125',
      'Purchase 1 actual allowable tax paid': '2',
      'Purchase 1 original receipt number': 'PRIVATE-MERCHANT-157',
      'Purchase 1 original receipt date': '2025-05-31',
      'Purchase 1 original receipt amount': '125',
      'Purchase 1 original receipt tax paid': '2',
      'Independent remaining-tax payment source': 'expected_payment',
      'Remaining-tax payment original source reference': 'Fictional scheduled 2026-04-15 payment',
      'Independent actual or expected tax-payment date': '2026-04-15',
      'Actual or expected amount applied to tax': '8',
      'SP 5 actual source status': 'entries',
      'SP 5 category original source reference': 'Fictional worldwide gift records',
    });
    await h.panel.click('Add actual SP 5 source entry');
    await enter(h.panel, {
      'SP 5 entry 1 original reference': 'Fictional outside-household gift receipt',
      'SP 5 entry 1 actual date': '2025-12-25',
      'SP 5 entry 1 actual amount': '125.50',
      'SP 5 entry 1 is not reported elsewhere': 'true',
    });
    await h.panel.click(confirm);
    const canonical = h.canonical();
    const projection = calculatePAOrdinaryReturnFacts(input, canonical);
    expect(projection.spOtherIncomeByLine['5'].toFixed()).toBe('126');
    const result = calculatePAOrdinaryReturn(input, canonical, sources);
    expect(result.scheduleSP.eligibilityIncome.toFixed()).toBe('50246');
    expect(result.pa40.useTax.toFixed()).toBe('8');
    expect(result.pa40.taxDue.toFixed()).toBe('8');
    await h.panel.change('Purchase 1 original receipt tax paid', '0');
    await h.panel.click(confirm);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/original.*differ/i);
  } finally { await h.panel.dispose(); }
});

it('Native filed balance payment stays separate from estimated and extension payments', async () => {
  const { input, facts } = paOrdinaryInvestmentFixture('part_year');
  const h = await mount(input, facts);
  try {
    // The original expected April 15 principal is 839 tax less 799 withheld.
    expect(h.canonical().timing.remainingTaxPayment.original).toBeUndefined();
    await enter(h.panel, {
      'Filing date source': 'filed',
      'Actual as-of date': '2026-04-15',
      'Independent remaining-tax payment source': 'actual_payment',
      'Remaining-tax payment original source reference': 'Fictional posted 2025 PA-40 balance receipt',
      'Independent actual or expected tax-payment date': '2026-04-15',
      'Actual or expected amount applied to tax': '40',
    });
    await h.panel.click(confirm);
    expect(h.draft().sourceFactsConfirmed).toBeNull();
    await enterAccount(h.panel, 'Remaining tax payment', input);
    await enter(h.panel, {
      'Remaining tax payment original tax year': '2025',
      'Remaining tax payment actual return type': 'pa40',
      'Remaining tax payment actual payment kind': 'balance',
      'Remaining tax payment original date': '2026-04-15',
      'Remaining tax payment original confirmation number': 'PRIVATE-PA-BALANCE-40',
      'Remaining tax payment original amount': '40',
    });
    await h.panel.click(confirm);
    const result = calculatePAOrdinaryReturnFacts(input, h.canonical());
    expect(result.timing.kind).toBe('filed');
    expect(result.timing.remainingTaxPayment.amountAppliedToTax).toBe('40');
    expect(result.timing.remainingTaxPayment.original?.kind).toBe('balance');
    expect(result.estimatedPayments.toFixed()).toBe('0');
    expect(result.extensionPayment.toFixed()).toBe('0');
    await h.panel.change('Remaining tax payment actual payment kind', 'estimated');
    await h.panel.click(confirm);
    expect(h.panel.container.querySelector('[role="status"]')?.textContent).toMatch(/remaining payment.*differs/i);
    expect(h.canonical).toThrow(/confirm/i);
  } finally { await h.panel.dispose(); }
});
