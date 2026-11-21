import { expect, test } from '@playwright/test';
import { fillRequiredW2Facts, taxpayerFacts2025 } from './guided-fixtures';

const qof2026Question = 'Did you dispose of a Qualified Opportunity Fund investment in 2026 or hold deferred gain on December 31, 2026?';

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

    await page.getByRole('combobox', { name: 'Tax year for this interview', exact: true }).selectOption('2026');
    await page.evaluate(({ id, facts }) => {
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({
        factsVersion: 2,
        phase: 'interview',
        taxYear: 2026,
        currentSectionIndex: 0,
        completedSections: [],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': facts },
      }));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();

    const disclosure = page.getByRole('combobox', { name: qof2026Question, exact: true });
    const investments = page.locator('.guided-progress-steps').getByRole('button', { name: 'Investments', exact: true });
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toHaveValue('');
    await expect(investments).toHaveCount(0);
    await disclosure.selectOption('false');
    await expect(investments).toHaveCount(0);
    await expect.poll(() => page.evaluate(id => {
      const saved = JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}');
      return saved.sectionData?.review?.qof2026Disclosure;
    }, id)).toBe(false);
    await page.reload();
    await expect(disclosure).toHaveValue('false');
    await disclosure.selectOption('true');
    await expect(investments).toHaveCount(1);
    await expect.poll(() => page.evaluate(id => {
      const saved = JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}');
      return saved.sectionData?.review?.qof2026Disclosure;
    }, id)).toBe(true);
    await page.reload();
    await expect(disclosure).toHaveValue('true');
    await expect(investments).toHaveCount(1);
    await expect(page.getByText(/2026 rules and filing forms are not yet qualified/i)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('textbox', { name: /^Box 1 — Wages/ }).fill('50000');
    await fillRequiredW2Facts(page);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Qualified opportunity fund investments', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add actual QOF disposition answer', exact: true })).toBeVisible();
    expect(bodies.join('\n')).not.toContain('synthetic-private-QOF-review-reference'); expect(bodies.join('\n')).not.toContain('900-70-0001');
  });
}
