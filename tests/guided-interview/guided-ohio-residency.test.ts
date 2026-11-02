/** Spec: spec/state/guided-ohio-residency.yaml */
import { it, expect } from 'vitest';
import { ohioResidencyFactErrors, buildGuidedOhioResidencyFacts, type OhioResidencyDraft } from '../../apps/web/src/lib/guided-ohio-residency-facts.js';
import { ohioResidencyFacts } from '../fixtures/oh-residency.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
function draft() { const f = ohioResidencyFacts(); Object.assign(f.owners[0]!.amounts.wages, { federalAmount: '85000', nonresidentOhioAmount: '20000' }); return { ...f, taxYear: '2025' } as OhioResidencyDraft; }
it('preserves actual source allocations and copies only confirmed current originals', () => { const original = structuredClone(simpleW2Fixture); original.w2s![0]!.accountHolder = 'primary'; const facts = buildGuidedOhioResidencyFacts(draft(), original); expect(facts.owners[0]!.amounts!.wages.nonresidentOhioAmount).toBe('20000'); expect(facts.originalFederalSources).toEqual(original); expect(facts.originalFederalSources).not.toBe(original); });
it('requires actual whole-year source facts rather than assuming mailing-address residency', () => { expect(ohioResidencyFactErrors(undefined, 2025, 'single')).not.toEqual({}); const d = draft(); d.owners[0]!.status = 'full_year_resident'; d.owners[0]!.periods = [{ from: '2025-01-01', to: '2025-12-31', domicileState: 'OH' }]; expect(ohioResidencyFactErrors(d, 2025, 'single')).toEqual({}); expect(buildGuidedOhioResidencyFacts(d, simpleW2Fixture).owners[0]!.amounts).toBeUndefined(); });
it.each(['blankZero', 'unconfirmed', 'staleYear', 'timelineGap', 'missingSpouse'])('does not manufacture source answers %s', kind => { const d = draft(); if (kind === 'blankZero')
    d.owners[0]!.amounts!.pensions.federalAmount = ''; if (kind === 'unconfirmed')
    d.sourceFactsConfirmed = null; if (kind === 'staleYear')
    d.taxYear = '2024'; if (kind === 'timelineGap')
    d.owners[0]!.periods[0]!.from = '2025-01-02'; expect(ohioResidencyFactErrors(d, 2025, kind === 'missingSpouse' ? 'married_filing_jointly' : 'single')).not.toEqual({}); expect(() => buildGuidedOhioResidencyFacts(d, { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: kind === 'missingSpouse' ? 'married_filing_jointly' : 'single' } })).toThrow(); });

it('normalizes valid displayed grouping losslessly without manufacturing blank zero',()=>{const d=draft();d.owners[0]!.amounts!.wages.federalAmount='85,000';d.owners[0]!.amounts!.wages.nonresidentOhioAmount='20,000';const original=structuredClone(simpleW2Fixture);original.w2s![0]!.accountHolder='primary';const actual=buildGuidedOhioResidencyFacts(d,original);expect(actual.owners[0]!.amounts!.wages.federalAmount).toBe('85000');expect(actual.owners[0]!.amounts!.wages.nonresidentOhioAmount).toBe('20000');d.owners[0]!.amounts!.pensions.federalAmount='';expect(ohioResidencyFactErrors(d,2025,'single')).not.toEqual({});});
