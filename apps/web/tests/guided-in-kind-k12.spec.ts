// Spec: spec/federal/form-1099-q-in-kind-k12.yaml.
import { expect, test } from '@playwright/test';
import { inKindK12Fixture } from '../../../tests/fixtures/education-in-kind-k12';
import { taxpayerFacts2025 } from './guided-fixtures';

const input = inKindK12Fixture(2025);
const personal = { ...taxpayerFacts2025, firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn };
const w2 = { employerName: 'Synthetic employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '50000', federalWithheld: '0',
  socialSecurityWages: '50000', socialSecurityTips: '0', socialSecurityWithheld: '3100', medicareWages: '50000', medicareWithheld: '725',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
const sources = { ...input.qualifiedEducationExpenses?.sourceFacts, taxYear: '2025',
  forms: input.form1099Q.map(({ transfer, ...fields }) => ({ fields: { ...fields, taxYear: '2025' }, transfer })) };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) test.describe(`Prepaid K12 sources at ${viewport.width}px`, () => {
  test('preserves actual prepaid program facts and unknown cash sources', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const requests: string[] = [];
    page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, w2, sources }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 3, completedSections: ['personal-info', 'income-w2', 'deductions'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' },
          education: { aocStudents: [], llcExpenses: '' }, energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, educationDistributions: sources } } }));
    }, { id, personal, w2, sources });
    await page.reload();
    const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    const sponsor = page.getByRole('combobox', { name: 'K-12 prepaid program sponsor', exact: true });
    const checked = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
    const cash = page.getByRole('combobox', { name: 'Outside K-12 amount includes only cash distributions (required for prepaid benefits)', exact: true });
    await expect(sponsor).toHaveValue('state');
    await sponsor.selectOption('eligible_educational_institutions');
    await expect(checked).toHaveValue('');
    await expect(hero).toHaveText('Enter more info for an estimate');
    await page.getByRole('combobox', { name: 'Institutional prepaid program has its required qualified trust', exact: true }).selectOption('true');
    const determination = page.getByRole('textbox', { name: 'Institutional prepaid program IRS ruling or determination reference', exact: true });
    await determination.fill('synthetic-private-institutional-determination');
    await checked.selectOption('true');
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.educationDistributions?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload();
    await expect(sponsor).toHaveValue('eligible_educational_institutions');
    await expect(determination).toHaveValue('synthetic-private-institutional-determination');
    await expect(cash).toHaveValue('true');
    await cash.selectOption(''); await expect(checked).toHaveValue('');
    await checked.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.educationDistributions?.beneficiaries?.[0]?.outsideK12CashOnlyConfirmed, id)).toBeNull();
    await page.reload(); await expect(cash).toHaveValue('');
    await cash.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`prepaid-k12-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const secret of ['synthetic-private-institutional-determination', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
  });
});
