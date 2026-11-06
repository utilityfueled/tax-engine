import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { actualGuidedChild } from '../../../tests/fixtures/guided-child-election';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`retains child election sources after edits and reopen at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = [];
    page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing synthetic workspace');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, child }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 1, completedSections: ['personal-info'], segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [], childElections: [child] } },
      }));
    }, { id, personal: taxpayerFacts2025, child: actualGuidedChild });
    await page.reload();
    async function openElection() { await page.getByText('Report a child’s interest and dividends (Form 8814)', { exact: true }).click(); }
    await openElection();
    const income = page.getByRole('textbox', { name: 'Child taxable interest', exact: true });
    const confirmed = page.getByRole('combobox', { name: 'Have you reviewed all child election sources?', exact: true });
    await expect(income).toHaveValue('4000.25');
    await income.fill('4000.26');
    await expect(confirmed).toHaveValue('');
    await confirmed.selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.childElections?.[0]?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await openElection();
    await expect(income).toHaveValue('4000.26'); await expect(confirmed).toHaveValue('true');
    const parentBank = page.locator('.guided-w2-card').filter({ has: page.locator('strong', { hasText: '1099-INT #1' }) });
    await parentBank.getByLabel('Payer (bank or institution)', { exact: true }).fill('Different actual parent source');
    await expect(confirmed).toHaveValue(''); await expect(income).toHaveValue('4000.26');
    await page.getByText('Child tax-exempt interest and AMT sources', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Child statement 1 specified preference', exact: true })).toHaveValue('125.10');
    await page.screenshot({ path: testInfo.outputPath(`child-election-${viewport.width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requests.join('\n')).not.toContain(actualGuidedChild.ssn);
    expect(requests.join('\n')).not.toContain('actual-child-bank');
  });
}
