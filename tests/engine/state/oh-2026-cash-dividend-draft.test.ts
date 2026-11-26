import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { Form1099DivSchema } from '@/models/inputs.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';

const scenarios = {
  full_year_resident: { method: 'full-year', declaration: 'full-year', ohioWages: '50000', allocation: '4000', ratio: '0.0000', credit: '0', tax: '1042', refund: '208' },
  part_year_resident: { method: 'part-year', declaration: 'part-year', ohioWages: '30000', allocation: '1000', ratio: '0.4259', credit: '444', tax: '598', refund: '402' },
  nonresident: { method: 'nonresident', declaration: 'nonresident', ohioWages: '10000', allocation: '0', ratio: '0.8148', credit: '849', tax: '193', refund: '807' },
} as const;

type Status = keyof typeof scenarios;

function dividendFixture(status: Status = 'part_year_resident') {
  const scenario = scenarios[status];
  const { input, sources } = ohio2026OrdinaryFixture(status, '50000', scenario.ohioWages);
  input.taxpayer.stateResidency = scenario.declaration;
  const [w2] = input.w2s;
  const stateLocal = w2?.stateLocalSources;
  const stateRow = stateLocal?.stateRows[0];
  const allocation = input.ohioResidency?.owners[0]?.amounts.interestDividends;
  if (!w2 || !stateLocal || !stateRow || !allocation) throw new Error('Complete Ohio wage originals required');
  if (status === 'full_year_resident') {
    w2.stateTaxWithheld = stateLocal.originalW2.stateTaxWithheld = stateRow.withheld = '1250';
  } else if (status === 'nonresident') {
    w2.stateWages = stateLocal.originalW2.stateWages = stateRow.wages = '10000';
  }
  const accountReference = 'PRIVATE-ACCT-009';
  const payer = 'Fictional Domestic Corporation';
  const payerTin = '55-5555512';
  const form = Form1099DivSchema.parse({
    taxYear: 2026, payer, payerTin, accountReference, accountHolder: 'primary', ordinaryDividends: '4000',
    qualifiedDividends: '0', totalCapitalGainDistributions: '0', section1250Gain: '0', section1202Gain: '0',
    collectiblesGain: '0', nondividendDistributions: '0', federalWithheld: '0', section199ADividends: '0',
    foreignTaxPaid: '0', exemptInterestDividends: '0', specifiedPrivateActivityBondInterest: '0', stateWithheld: '0',
  });
  input.form1099Div = [form];
  allocation.federalAmount = '4000';
  allocation.residentAmount = scenario.allocation;
  const { firstName, lastName, ssn } = input.taxpayer.primary;
  const juneDomicile = status === 'full_year_resident' ? 'OH' : 'VA';
  const julyDomicile = status === 'nonresident' ? 'VA' : 'OH';
  const original = {
    sourceTaxYear: 2026, sourceReference: 'PRIVATE-2026-DIV-STATEMENT', payerName: payer, payerTin, accountReference,
    recipient: { accountHolder: 'primary', firstName, lastName, ssn },
    currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
    noOtherOriginalReportingConfirmed: true, completeAccountReferenceConfirmed: true,
    cashMethodOrdinaryDirectDomesticHoldingConfirmed: true,
    completeActualCashDistributionsConfirmed: true,
    credits: [
      { sourceReference: 'PRIVATE-DIV-JUNE', accountReference, creditedOn: '2026-06-30', amount: '3000', domicileStateAtCredit: juneDomicile, availableOnCreditDateConfirmed: true },
      { sourceReference: 'PRIVATE-DIV-JULY', accountReference, creditedOn: '2026-07-01', amount: '1000', domicileStateAtCredit: julyDomicile, availableOnCreditDateConfirmed: true },
    ],
  };
  const packet = { input, sources: { ...sources, methodId: `oh-2026-${scenario.method}-cash-dividend-employee-draft-v1`, cashDividendOriginal: original }, form, allocation, original };
  rebindOhio2026Ordinary(packet);
  return packet;
}

type Packet = ReturnType<typeof dividendFixture>;
const run = ({ input, sources }: Pick<Packet, 'input' | 'sources'>) => calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources });

function matchAccountReferences(packet: Packet, accountReference: string) {
  packet.form.accountReference = packet.original.accountReference = accountReference;
  for (const credit of packet.original.credits) credit.accountReference = accountReference;
  rebindOhio2026Ordinary(packet);
}

describe('Ohio 2026 private ordinary cash dividend draft', () => {
  it.each(Object.entries(scenarios) as [Status, (typeof scenarios)[Status]][])('allocates verified ordinary cash dividends for %s', (status, expected) => {
    const saved: Packet = JSON.parse(JSON.stringify(dividendFixture(status)));
    const before = JSON.stringify(saved);
    const result = run(saved);
    expect(result).toMatchObject({
      ruleVersion: saved.sources.methodId, taxYear: 2026, calculationStatus: 'incomplete',
      reviewStatus: 'independent-review-pending', filingQualified: false,
    });
    expect(result.federalAgi.toFixed()).toBe('54000');
    expect(result.ohioAgi.toFixed()).toBe('54000');
    // 332 + (54000 - 2150 - 26050) * .0275 = 1041.50 before whole-dollar rounding.
    expect(result.taxBeforeCredits.toFixed()).toBe('1042');
    expect(result.nonresidentRatio.toFixed(4)).toBe(expected.ratio);
    expect(result.nonresidentCredit.toFixed()).toBe(expected.credit);
    expect(result.incomeTax.toFixed()).toBe(expected.tax);
    expect(result.refund.toFixed()).toBe(expected.refund);
    expect(result.lines.find(line => line.line === 'ohio-ordinary-cash-dividends')?.value.toFixed()).toBe(expected.allocation);
    const nrc = result.lines.filter(line => line.form === 'OH-IT-NRC');
    if (status === 'full_year_resident') expect(nrc).toHaveLength(0);
    if (status === 'part_year_resident') expect(nrc.find(line => line.line === '10')?.value.toFixed()).toBe('1000');
    if (status === 'nonresident') {
      expect(nrc.some(line => /^1[0-5]$/.test(line.line))).toBe(false);
      expect(nrc.find(line => line.line === '18')?.value.toFixed()).toBe('44000');
    }
    expect(JSON.stringify(saved)).toBe(before);
    const audit = JSON.stringify(result.lines);
    for (const fact of [saved.original.recipient.ssn, saved.original.payerTin, saved.original.accountReference, saved.original.credits[0].sourceReference]) {
      expect(audit).not.toContain(fact);
    }
  });

  it('reconciles exact cents before rounding combined wages and dividends', () => {
    const packet = dividendFixture();
    packet.form.ordinaryDividends = packet.allocation.federalAmount = '4000.50';
    packet.original.credits[0].amount = '3000.25';
    packet.original.credits[1].amount = packet.allocation.residentAmount = '1000.25';
    rebindOhio2026Ordinary(packet);
    const result = run(packet);
    expect(result.federalAgi.toFixed()).toBe('54001');
    expect(result.ohioAgi.toFixed()).toBe('54001');
    expect(result.lines.find(line => line.line === 'ohio-ordinary-cash-dividends')?.value.toFixed()).toBe('1000.25');
  });

  it.each(['BROKER-XXXX-1234', 'XXXX-XXXX-1234', 'BROKER****1234'])('holds repeated masked references on matched dividend originals (%s)', reference => {
    const packet = dividendFixture();
    matchAccountReferences(packet, reference);
    expect(() => run(packet)).toThrow(/stable account reference/);
  });

  it.each(['BROKER-AXXXX-1234', 'BROKER-XXXXA-1234', 'BROKER-X7XX-1234', 'BROKER-XXXX-ALPHA-1234'])('accepts matching literal account references containing X characters (%s)', reference => {
    const packet = dividendFixture();
    matchAccountReferences(packet, reference);
    expect(run(packet).incomeTax.toFixed()).toBe('598');
  });

  it.each<[string, (p: Packet) => void, RegExp]>([
    ['prior-year original', p => { p.form.taxYear = 2025; }, /current original Form 1099-DIV/],
    ['different account', p => { p.original.credits[1].accountReference = 'PRIVATE-ACCT-010'; }, /account differs/],
    ['masked matching account', p => {
      p.form.accountReference = p.original.accountReference = '****1234';
      for (const credit of p.original.credits) credit.accountReference = p.original.accountReference;
    }, /stable account reference/],
    ['unconfirmed complete account', p => { p.original.completeAccountReferenceConfirmed = false; }, /complete confirmed current source packets/],
    ['different payer', p => { p.original.payerTin = '55-5555513'; }, /recipient, payer or account differs/],
    ['different recipient', p => { p.original.recipient.ssn = '555-55-5513'; }, /recipient, payer or account differs/],
    ['qualified subset', p => { p.form.qualifiedDividends = '1'; }, /other dividend reporting/],
    ['unknown primary box', p => { Reflect.deleteProperty(p.form, 'ordinaryDividends'); }, /current original Form 1099-DIV/],
    ['unknown secondary box', p => { Reflect.deleteProperty(p.form, 'qualifiedDividends'); }, /unknown original boxes/],
    ['nonpositive primary box', p => { p.form.ordinaryDividends = '0'; }, /positive Box 1a/],
    ['duplicate original receipt', p => { p.original.credits[1].sourceReference = p.original.credits[0].sourceReference; }, /distinct original/],
    ['prior-year credit', p => { p.original.credits[0].creditedOn = '2025-12-31'; }, /current calendar 2026/],
    ['unavailable credit', p => { p.original.credits[0].availableOnCreditDateConfirmed = false; }, /complete confirmed current source packets/],
    ['conflicting move-day receipt', p => { p.original.credits[1].domicileStateAtCredit = 'VA'; }, /domicile at payment differs/],
    ['inexact box reconciliation', p => { p.form.ordinaryDividends = '4000.01'; }, /do not reconcile to Box 1a/],
    ['inexact residency allocation', p => { p.allocation.residentAmount = '1000.01'; }, /actual source categories and service allocation differ/],
    ['wrong residency method', p => { p.sources.methodId = 'oh-2026-full-year-cash-dividend-employee-draft-v1'; }, /confirmed primary domicile differ/],
  ])('holds unsupported or contradictory cash dividend facts (%s)', (_label, mutate, error) => {
    const packet = dividendFixture();
    mutate(packet);
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(error);
  });

  it('holds changed originals without rebinding and keeps the wage method separate', () => {
    const packet = dividendFixture();
    packet.form.ordinaryDividends = '4001';
    expect(() => run(packet)).toThrow(/original.*(changed|differ)|unchanged|bound/i);
    const { sources } = ohio2026OrdinaryFixture('part_year_resident', '50000', '30000');
    const wages = { input: packet.input, sources };
    rebindOhio2026Ordinary(wages);
    expect(() => run(wages)).toThrow(/separate actual method/);
  });
});
