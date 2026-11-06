import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { guidedOrdinaryCreditFixture } from '../../../tests/fixtures/guided-foreign-tax-ordinary';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Ordinary credit at ${viewport.width}px`, () => {
  test('preserves actual ordinary credit sources and confirmation', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const { facts, investment } = guidedOrdinaryCreditFixture();
    await page.evaluate(({ id, personal, facts, investment }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 4, completedSections: ['personal-info', 'income-investments', 'deductions', 'credits'],
        segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-investments': investment, 'other-taxes': {
          householdEmploymentWages: '', acknowledgedSETax: false, acknowledgedAdditionalMedicare: false, acknowledgedNIIT: false,
          foreignTaxElection: facts,
        } },
      }));
    }, { id, personal: taxpayerFacts2025, facts, investment });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Other Taxes', exact: true })).toBeVisible();
    const foreign = page.getByRole('textbox', { name: 'Ordinary income 1 foreign amount', exact: true });
    const ordinaryConfirmation = page.getByRole('combobox', { name: 'Ordinary credit sources checked after the last edit', exact: true });
    const annualConfirmation = page.getByRole('combobox', { name: 'Foreign-tax election sources checked after the last edit', exact: true });
    await foreign.fill('10000.01');
    await page.getByLabel('Ordinary income 1 source reference', { exact: true }).fill('synthetic-private-ordinary-credit-reference');
    await expect(ordinaryConfirmation).toHaveValue(''); await expect(annualConfirmation).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Simplified AMT election was made in the first claim year', exact: true })).toHaveValue('false');
    await expect(page.getByRole('button', { name: 'Add Regular prior-year capacity', exact: true })).toBeVisible();
    await ordinaryConfirmation.selectOption('true'); await annualConfirmation.selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload();
    await expect(foreign).toHaveValue('10,000.01');
    await expect(ordinaryConfirmation).toHaveValue('true'); await expect(annualConfirmation).toHaveValue('true');
    await expect(page.getByRole('textbox', { name: 'AMT prior capacity limitation', exact: true })).toHaveValue('0');
    await foreign.fill('');
    await expect(ordinaryConfirmation).toHaveValue(''); await expect(annualConfirmation).toHaveValue('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['other-taxes']?.foreignTaxElection?.creditWithForm1116?.incomeSources?.[0]?.foreignIncome, id)).toBe('');
    await page.reload(); await expect(foreign).toHaveValue('');
    await expect(ordinaryConfirmation).toHaveValue(''); await expect(annualConfirmation).toHaveValue('');
    await foreign.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`foreign-ordinary-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-ordinary-credit-reference', 'Private synthetic account A', '112233445', taxpayerFacts2025.ssn]) expect(requests.join('\n')).not.toContain(value);
  });
  });
}
