import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`preserves original brokerage withholding after reload at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const bodies: string[] = []; page.on('request', request => bodies.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic workspace');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, facts }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 1, completedSections: ['personal-info'],
        segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null }, sectionData: { 'personal-info': facts, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [{ broker: 'Actual source broker', accountHolder: 'primary', stateTaxReporting: 'none', federalWithheld: '', transactions: [] }] } } }));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    await page.getByText('Stock & Asset Sales (1099-B)', { exact: true }).click();
    const card = page.locator('.guided-w2-card').filter({ has: page.getByText('1099-B #1 — Actual source broker', { exact: true }) });
    await card.getByLabel('Original brokerage statement ID', { exact: true }).fill('synthetic-private-broker-source');
    await card.getByLabel('Original brokerage tax year', { exact: true }).fill('2025');
    const box4 = card.getByRole('textbox', { name: /^Box 4 broker federal income tax withheld/ });
    await box4.fill('9007199254740993.03');
    await card.getByRole('button', { name: 'Add withholding-only open short sale', exact: true }).click();
    await card.getByLabel('Original open short-sale description', { exact: true }).fill('Actual unclosed synthetic short sale');
    await card.getByLabel('Actual short-sale opening date', { exact: true }).fill('2025-04-03');
    await card.getByRole('combobox', { name: 'Short sale remained open at year end', exact: true }).selectOption('true');
    await card.getByRole('combobox', { name: 'Other numbered boxes are blank on the original statement', exact: true }).selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.brokerageEntries?.[0]?.withholdingOnlyOpenShortSale?.otherNumberedBoxesBlankConfirmed, id)).toBe(true);
    await page.reload();
    await page.getByText('Stock & Asset Sales (1099-B)', { exact: true }).click();
    await expect(box4).toHaveValue('9,007,199,254,740,993.03');
    await expect(card.getByLabel('Original brokerage statement ID', { exact: true })).toHaveValue('synthetic-private-broker-source');
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.brokerageEntries?.[0]?.federalWithheld, id)).toBe('9,007,199,254,740,993.03');
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.brokerageEntries?.[0]?.transactions, id)).toEqual([]);
    await box4.fill('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.brokerageEntries?.[0]?.federalWithheld, id)).toBe('');
    await card.getByText('Original brokerage withholding', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`brokerage-withholding-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(bodies.join('\n')).not.toContain('synthetic-private-broker-source'); expect(bodies.join('\n')).not.toContain('900-70-0001');
  });
}
