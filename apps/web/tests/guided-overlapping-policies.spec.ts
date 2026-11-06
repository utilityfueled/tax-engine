// Spec: spec/federal/form-8962-overlapping-policies.yaml.
import { expect, test } from '@playwright/test';
import { actualOverlappingPolicyData } from '../../../tests/fixtures/guided-overlapping-policy';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '20000', federalWithheld: '0', socialSecurityWages: '20000', socialSecurityTips: '0', socialSecurityWithheld: '1240', medicareWages: '20000', medicareWithheld: '290', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) test.describe(`Overlapping policy at ${viewport.width}px`, () => {
  test('preserves actual overlapping coverage groups', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, w2, coverage }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3,
        completedSections: ['personal-info', 'income-w2', 'deductions'], segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
          energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: coverage } } }));
    }, { id, personal, w2, coverage: actualOverlappingPolicyData() });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Copy overlapping unshared months', exact: true }).click();
    const outer = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    const inner = page.getByRole('combobox', { name: 'Allocation sources checked after the last edit', exact: true });
    const groupConfirmed = page.getByRole('combobox', { name: 'Overlapping benchmark sources checked after the last edit', exact: true });
    await expect(inner).toHaveValue(''); await expect(groupConfirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await page.getByRole('textbox', { name: 'Overlapping benchmark worksheet reference', exact: true }).fill('synthetic-private-overlap-source');
    await page.getByRole('combobox', { name: 'All overlapping benchmark months are included', exact: true }).selectOption('true');
    await page.getByRole('button', { name: 'Month 1: Add actual benchmark group', exact: true }).click();
    const prefix = 'Month 1 group 1';
    await page.getByRole('textbox', { name: `${prefix}: Source ID`, exact: true }).fill('actual-group-one');
    await page.getByRole('textbox', { name: `${prefix}: Source reference`, exact: true }).fill('synthetic-private-group-record');
    await page.getByRole('textbox', { name: `${prefix}: Rating area`, exact: true }).fill('WA-area-one');
    for (const index of [2, 3]) await page.getByRole('checkbox', { name: `${prefix}: Include original policy ${index}`, exact: true }).check();
    const benchmark = page.getByRole('textbox', { name: `${prefix}: Applicable benchmark`, exact: true });
    await expect(benchmark).toHaveValue(''); await benchmark.fill('450'); await benchmark.press('Tab');
    await page.getByRole('combobox', { name: `${prefix}: All unshared coverage-family members are included`, exact: true }).selectOption('true');
    await page.getByRole('combobox', { name: `${prefix}: These people share this rating area`, exact: true }).selectOption('true');
    await groupConfirmed.selectOption('true'); await inner.selectOption('true');
    await page.getByRole('button', { name: 'Calculate household amounts from allocation', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
    for (const [label, amount] of [['Eligible enrollment premium', '1450'], ['Corrected household SLCSP premium', '750'], ['Reconciled advance credit', '250']]) await expect(page.getByRole('textbox', { name: `Coverage month 1: ${label}`, exact: true })).toHaveValue(amount);
    await groupConfirmed.selectOption('true'); await inner.selectOption('true'); await outer.selectOption('true'); await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.premiumTaxCredit?.sharedPolicyAllocations?.overlappingCoverage?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await expect(benchmark).toHaveValue('450'); await expect(groupConfirmed).toHaveValue('true');
    await benchmark.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`overlap-${viewport.width}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await benchmark.fill(''); await benchmark.press('Tab'); await expect(groupConfirmed).toHaveValue(''); await expect(inner).toHaveValue(''); await expect(outer).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.premiumTaxCredit?.sharedPolicyAllocations?.overlappingCoverage?.months?.[0]?.groups?.[0]?.slcsp, id)).toBe('');
    await page.reload(); await expect(benchmark).toHaveValue('');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.premiumTaxCredit, id);
    expect(saved.policies).toEqual(actualOverlappingPolicyData().policies); expect(saved.monthlyReconciliation).toHaveLength(1); expect(saved.monthlyReconciliation[0].slcsp).toBe('750');
    expect(saved.sharedPolicyAllocations.overlappingCoverage.months[0].groups[0].coveredIndividualSsns).toEqual(['111-22-3333']);
    for (const secret of ['synthetic-private-overlap-source', 'synthetic-private-group-record', personal.ssn, '444-55-6666', 'own-overlap-1']) expect(requests.join('\n')).not.toContain(secret);
  });
});
