// @vitest-environment jsdom
// Spec: spec/federal/guided-foreign-tax-ordinary-credit.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ForeignTaxElectionDetails } from '@/components/guided-interview/foreign-tax-election-details';
import { buildGuidedForeignTaxElection, type ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { guidedOrdinaryCreditFixture } from '../../fixtures/guided-foreign-tax-ordinary';

it('collects ordinary sources and AMT history from an empty worksheet', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const { facts, investment } = guidedOrdinaryCreditFixture();
  let latest: ForeignTaxElectionData | undefined;
  function Harness() { const [data, setData] = useState<ForeignTaxElectionData | undefined>({ ...facts, creditWithForm1116: undefined, sourceFactsConfirmed: null }); return <ForeignTaxElectionDetails data={data} investment={investment} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing field setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add ordinary Form 1116 worksheet');
    expect(latest?.creditWithForm1116?.electionConfirmed).toBeUndefined(); expect(latest?.creditWithForm1116?.amt).toBeUndefined();
    await change('The taxpayer elects the ordinary Form 1116 credit', 'true'); await change('Return on which the election is made', 'original_return');
    await change('Ordinary credit source reference', 'Actual ordinary source record');
    for (const label of ['All foreign gross income is passive income', 'All foreign income and taxes are on qualified payee statements', 'No required foreign-credit reduction applies', 'Prior regular and AMT credit history is complete']) await change(label, 'true');
    await change('Prior credits adjusted through tax year', '2024'); await change('Prior credit filing history', 'continuous_individual');
    await click('Add taxpayer status'); await change('Taxpayer status 1 owner', 'primary'); await change('Taxpayer status 1 actual status', 'us_citizen'); await change('Taxpayer status 1 source reference', 'Actual taxpayer status');
    await click('Confirm no regular prior credits'); await click('Confirm no AMT prior credits');
    await change('Ordinary credit source tax year', '2025'); await change('Ordinary credit calculation method', 'ordinary_passive');
    for (const label of ['All foreign income sources are recorded in this worksheet', 'No foreign or domestic loss-account adjustments apply', 'No CFC or qualified business-unit sources apply']) await change(label, 'true');
    await click('Add ordinary foreign income statement'); expect(latest?.creditWithForm1116?.incomeSources?.[0]?.foreignIncome).toBeUndefined();
    await change('Ordinary income statement 1', 'form1099Int:0'); await change('Ordinary income 1 foreign amount', '10000');
    await change('Ordinary income 1 passive group', 'withholding_under_15'); await change('Ordinary income 1 source reference', 'Actual foreign portion');
    await change('AMT foreign amounts match the actual regular source amounts', 'true'); await change('First post-1997 AMT foreign-credit claim year', '2025');
    await change('Simplified AMT election was made in the first claim year', 'false'); await change('No revocation of that AMT election applies', 'true'); await change('AMT source and election history reference', 'Actual original AMT history');
    await change('AMT source history checked after the last edit', 'true');
    await click('Add AMT prior-year capacity'); expect(latest?.creditWithForm1116?.amtCarryback?.limitation).toBeUndefined();
    await change('AMT prior capacity tax year', '2024'); await change('AMT prior capacity election', 'form1116_credit');
    for (const label of ['limitation', 'current taxes', 'prior credits used']) await change(`AMT prior capacity ${label}`, '0');
    await change('AMT prior capacity source reference', 'Actual completed prior return'); await change('AMT prior capacity includes all prior use', 'true'); await change('AMT prior capacity sources checked', 'true');
    await change('Ordinary credit sources checked after the last edit', 'true'); await change('Foreign-tax election sources checked after the last edit', 'true');
    const parsed = buildGuidedForeignTaxElection(latest, investment, 2025, 'single')?.creditWithForm1116;
    expect(parsed?.incomeSources?.[0]).toMatchObject({ reportedIncome: '20000', foreignIncome: '10000', passiveGroup: 'withholding_under_15' });
    expect(parsed?.amt).toMatchObject({ firstPost1997CreditClaimTaxYear: 2025, simplifiedElectionMadeInFirstClaimYear: false });
    expect(parsed?.amtCarryback).toMatchObject({ taxYear: 2024, limitation: '0' }); expect(parsed?.regularCarryback).toBeUndefined();
    await change('Ordinary income 1 foreign amount', '10000.01'); expect(latest?.creditWithForm1116?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change('Annual foreign-tax choice', 'deduction'); expect(latest?.creditWithForm1116?.incomeSources?.[0]?.foreignIncome).toBe('10000.01');
    expect(() => buildGuidedForeignTaxElection(latest, investment, 2025, 'single')).toThrow();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
