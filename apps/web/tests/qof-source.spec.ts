import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`retains actual QOF answers after reload at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const bodies: string[] = []; page.on('request', request => bodies.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic workspace');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, facts }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 1, completedSections: ['personal-info'],
        segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null }, sectionData: { 'personal-info': facts, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [] } } }));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    await page.getByRole('button', { name: 'Add actual QOF disposition answer', exact: true }).click();
    const answer = page.getByRole('combobox', { name: 'Disposed of a qualified opportunity fund investment during this year', exact: true });
    const confirmation = page.getByRole('combobox', { name: 'QOF sources checked after the last edit', exact: true });
    await expect(answer).toHaveValue(''); await expect(confirmation).toHaveValue('');
    await page.getByLabel('QOF source tax year', { exact: true }).fill('2025');
    await page.getByLabel('QOF investment record reference', { exact: true }).fill('synthetic-private-QOF-review-reference');
    await answer.selectOption('false');
    await page.getByRole('combobox', { name: 'All actual investment records reviewed for QOF dispositions', exact: true }).selectOption('true');
    await confirmation.selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.qofDispositionFacts?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await expect(answer).toHaveValue('false'); await expect(confirmation).toHaveValue('true');
    await answer.selectOption('true'); await expect(confirmation).toHaveValue('');
    await expect(page.getByRole('status').filter({ hasText: 'Add each investment' })).toContainText('Form 8997');
    await page.getByRole('button', { name: 'Add QOF investment', exact: true }).click();
    await page.getByRole('combobox', { name: 'QOF investment 1: Inclusion event', exact: true }).selectOption('sale_or_exchange');
    await expect(page.getByLabel('QOF investment 1: Sale proceeds', { exact: true })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'QOF investment 1: No Form 8997 special gain code applies', exact: true })).toHaveValue('');
    await expect(page.getByLabel('QOF investment record reference', { exact: true })).toHaveValue('synthetic-private-QOF-review-reference');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.qofDispositionFacts?.disposedOfQofInvestment, id)).toBe(true);
    await page.getByRole('heading', { name: 'Qualified opportunity fund investments', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`qof-source-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(bodies.join('\n')).not.toContain('synthetic-private-QOF-review-reference'); expect(bodies.join('\n')).not.toContain('900-70-0001');
  });
}
