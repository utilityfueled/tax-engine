/** Spec: spec/state/guided-ohio-residency.yaml */
import { it, expect } from 'vitest';
import { ohioResidencyFactErrors, confirmGuidedOhioResidencyFacts, buildGuidedOhioResidencyFacts, type OhioResidencyDraft } from '../../apps/web/src/lib/guided-ohio-residency-facts.js';
import { ohioResidencyFacts } from '../fixtures/oh-residency.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

function required<T>(value: T | null | undefined, description: string): T {
    if (value === null || value === undefined) throw new Error(`Synthetic Ohio fixture requires ${description}`);
    return value;
}

function draft() {
    const f = ohioResidencyFacts();
    const owner = required(f.owners[0], 'the primary owner');
    Object.assign(owner.amounts.wages, { federalAmount: '85000', nonresidentOhioAmount: '20000' });
    return { ...f, taxYear: '2025' } as OhioResidencyDraft;
}

it('preserves actual source allocations and copies only confirmed current originals', () => {
    const original = structuredClone(simpleW2Fixture);
    required(original.w2s?.[0], 'an actual W-2').accountHolder = 'primary';
    const facts = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(original, draft()), original);
    const owner = required(facts.owners[0], 'the computed primary owner');
    const amounts = required(owner.amounts, 'actual source allocation amounts');
    expect(amounts.wages.nonresidentOhioAmount).toBe('20000');
    expect(facts.originalFederalSources).toEqual(original);
    expect(facts.originalFederalSources).not.toBe(original);
});

it('requires actual whole-year source facts rather than assuming mailing-address residency', () => {
    expect(ohioResidencyFactErrors(undefined, 2025, 'single')).not.toEqual({});
    const d = draft();
    const owner = required(d.owners[0], 'the primary owner');
    owner.status = 'full_year_resident';
    owner.periods = [{ from: '2025-01-01', to: '2025-12-31', domicileState: 'OH' }];
    expect(ohioResidencyFactErrors(d, 2025, 'single')).toEqual({});
    const actual = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(simpleW2Fixture, d), simpleW2Fixture);
    expect(required(actual.owners[0], 'the computed primary owner').amounts).toBeUndefined();
});

it.each(['blankZero', 'unconfirmed', 'staleYear', 'timelineGap', 'missingSpouse'])('does not manufacture source answers %s', kind => {
    const d = draft();
    const owner = required(d.owners[0], 'the primary owner');
    if (kind === 'blankZero') required(owner.amounts, 'actual source allocation amounts').pensions.federalAmount = '';
    if (kind === 'unconfirmed') d.sourceFactsConfirmed = null;
    if (kind === 'staleYear') d.taxYear = '2024';
    if (kind === 'timelineGap') required(owner.periods[0], 'the actual domicile period').from = '2025-01-02';
    expect(ohioResidencyFactErrors(d, 2025, kind === 'missingSpouse' ? 'married_filing_jointly' : 'single')).not.toEqual({});
    expect(() => buildGuidedOhioResidencyFacts(d, { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: kind === 'missingSpouse' ? 'married_filing_jointly' : 'single' } })).toThrow();
});

it('normalizes valid displayed grouping losslessly without manufacturing blank zero', () => {
    const d = draft();
    const amounts = required(required(d.owners[0], 'the primary owner').amounts, 'actual source allocation amounts');
    amounts.wages.federalAmount = '85,000';
    amounts.wages.nonresidentOhioAmount = '20,000';
    const original = structuredClone(simpleW2Fixture);
    required(original.w2s?.[0], 'an actual W-2').accountHolder = 'primary';
    const actual = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(original, d), original);
    const actualAmounts = required(required(actual.owners[0], 'the computed primary owner').amounts, 'computed source allocation amounts');
    expect(actualAmounts.wages.federalAmount).toBe('85000');
    expect(actualAmounts.wages.nonresidentOhioAmount).toBe('20000');
    amounts.pensions.federalAmount = '';
    expect(ohioResidencyFactErrors(d, 2025, 'single')).not.toEqual({});
});
