import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { actualInvestmentInterestSources, investmentInterestChild } from '../../../tests/fixtures/guided-investment-interest';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Investment interest at ${viewport.width}px`, () => {
  test('preserves separate regular and AMT investment sources', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, child, sources }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 2, completedSections: ['personal-info', 'income-investments'], segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [], childElections: [child] },
          deductions: { method: 'itemized', medicalExpenses: '', stateLocalTaxes: '', realEstateTaxes: '', mortgageInterest: '', charitableContributions: '', casualtyLosses: '', otherItemized: '', investmentInterestExpense: '5000', investmentInterestSources: sources } },
      }));
    }, { id, personal: taxpayerFacts2025, child: investmentInterestChild, sources: actualInvestmentInterestSources });
    await page.reload();
    const open = () => page.getByText('Investment interest source worksheets (Form 4952)', { exact: true }).click();
    await open();
    await page.getByRole('textbox', { name: 'Regular parent gross investment income excluding children', exact: true }).fill('-1000.01');
    await page.getByRole('textbox', { name: 'Regular gross investment income', exact: true }).fill('1199.99');
    await page.getByLabel('Regular investment worksheet source reference', { exact: true }).fill('synthetic-private-interest-source');
    await expect(page.getByRole('combobox', { name: 'Regular investment worksheet checked after the last edit', exact: true })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'AMT investment worksheet checked after the last edit', exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByText('Report a child’s interest and dividends (Form 8814)', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Have you reviewed all child election sources?', exact: true }).selectOption('true');
    await expect(page.getByRole('combobox', { name: 'Have you reviewed all child election sources?', exact: true })).toHaveValue('true');
    const confirmedInvestments = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments'], id);
    expect(confirmedInvestments).toMatchObject({ interestEntries: [], dividendEntries: [], brokerageEntries: [] });
    expect(confirmedInvestments.oidEntries).toBeUndefined();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await open();
    for (const label of ['Regular child partition checked after the last edit', 'AMT child partition checked after the last edit', 'Regular investment worksheet checked after the last edit', 'AMT investment worksheet checked after the last edit']) await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.investmentInterestSources?.amt?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await open();
    const regular = page.getByRole('textbox', { name: 'Regular gross investment income', exact: true });
    await expect(regular).toHaveValue('1,199.99');
    await expect(page.getByRole('textbox', { name: 'Regular parent gross investment income excluding children', exact: true })).toHaveValue('-1,000.01');
    await expect(page.getByRole('textbox', { name: 'AMT gross investment income', exact: true })).toHaveValue('3000');
    await expect(page.getByRole('combobox', { name: 'Regular investment worksheet checked after the last edit', exact: true })).toHaveValue('true');
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.childElections?.[0]?.sourceFactsConfirmed, id)).toBe(true);
    await regular.fill('');
    await expect(page.getByRole('combobox', { name: 'Regular investment worksheet checked after the last edit', exact: true })).toHaveValue('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.investmentInterestSources?.regular?.grossInvestmentIncome, id)).toBe('');
    await page.getByText('Investment interest source worksheets (Form 4952)', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`investment-interest-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-interest-source', investmentInterestChild.ssn, taxpayerFacts2025.ssn]) expect(requests.join('\n')).not.toContain(value);
  });
  });
}
