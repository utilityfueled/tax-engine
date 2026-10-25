import { expect, test } from '@playwright/test';
import { actualGuidedNolSources } from '../../../tests/fixtures/guided-net-operating-loss';
import { taxpayerFacts2025 } from './guided-fixtures';
const personalFacts = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2Facts = { employerName: 'Synthetic NOL Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0', socialSecurityWages: '0', socialSecurityTips: '0', socialSecurityWithheld: '0', medicareWages: '0', medicareWithheld: '0', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`preserves independent NOL histories at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, w2, sources }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'], segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-w2': { entries: [{ ...w2, wages: '100000' }] }, adjustments: { netOperatingLossSources: sources } },
      }));
    }, { id, personal: personalFacts, w2: w2Facts, sources: actualGuidedNolSources });
    await page.reload();
    const open = () => page.getByText('Net operating loss carry sources', { exact: true }).click(); await open();
    await page.getByRole('textbox', { name: 'Regular loss 1 history 1 NOL used', exact: true }).fill('5001');
    await page.getByRole('textbox', { name: 'Regular loss 1 opening carryforward', exact: true }).fill('53999');
    await page.getByRole('textbox', { name: 'NOL carry packet reference', exact: true }).fill('synthetic-private-nol-source');
    for (const label of ['Regular NOL sources checked after the last edit', 'AMT NOL sources checked after the last edit']) await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveValue('');
    await page.getByRole('combobox', { name: 'AMT NOL sources checked after the last edit', exact: true }).selectOption('true');
    await page.getByRole('combobox', { name: 'Regular NOL sources checked after the last edit', exact: true }).selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await open();
    await expect(page.getByRole('textbox', { name: 'Regular loss 1 opening carryforward', exact: true })).toHaveValue('53,999');
    await expect(page.getByRole('textbox', { name: 'Regular loss 1 history 1 NOL used', exact: true })).toHaveValue('5,001');
    await expect(page.getByRole('textbox', { name: 'AMT loss 1 original filed loss', exact: true })).toHaveValue('40000');
    await expect(page.getByRole('combobox', { name: 'Regular NOL sources checked after the last edit', exact: true })).toHaveValue('true');
    await expect(page.getByRole('combobox', { name: 'AMT NOL sources checked after the last edit', exact: true })).toHaveValue('true');
    const originatingInvestmentLoss = page.getByRole('textbox', { name: /^Regular loss 1 originating Section 1411 loss(?:\s|$)/ });
    await originatingInvestmentLoss.fill('');
    await expect(page.getByRole('combobox', { name: 'Regular NOL sources checked after the last edit', exact: true })).toHaveValue('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.vintages?.[0]?.section1411OriginalLoss, id)).toBe('');
    await originatingInvestmentLoss.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`nol-history-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-nol-source', personalFacts.ssn]) expect(requests.join('\n')).not.toContain(value);
  });
}
