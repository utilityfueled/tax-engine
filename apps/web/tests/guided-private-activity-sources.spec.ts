import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`persists actual bond preferences and invalidates edited confirmations at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requestBodies: string[] = [];
    page.on('request', request => requestBodies.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing synthetic workspace identity');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, facts }) => {
      // Explicit fictional statement facts, never application defaults.
      const interest = { payer: 'Synthetic browser bank', accountHolder: 'primary', payerTin: '12-3456789',
        interestIncome: '100', federalWithheld: '0', earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0',
        foreignTaxPaid: '0', foreignCountry: '', taxExemptInterest: '0', privateActivityBondInterest: '0',
        marketDiscount: '0', bondPremium: '0', treasuryBondPremium: '0', taxExemptBondPremium: '0',
        stateTaxReporting: 'none', state: '', stateWithheld: '0' };
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2,
        phase: 'interview', taxYear: 2025, currentSectionIndex: 1, completedSections: ['personal-info'],
        segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': facts, 'income-investments': { interestEntries: [interest], dividendEntries: [], brokerageEntries: [] } },
      }));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    const card = page.locator('.guided-w2-card').filter({ has: page.locator('strong', { hasText: '1099-INT #1' }) });
    async function openWorksheet() {
      await card.getByText('Remaining actual 1099-INT boxes', { exact: true }).click();
      await card.getByText('Private activity bond preference worksheet', { exact: true }).click();
    }
    await openWorksheet();
    await card.getByRole('textbox', { name: /^Box 8 tax-exempt interest/ }).fill('500.25');
    await card.getByRole('textbox', { name: /^Box 9 private-activity bond interest/ }).fill('125.10');
    await card.getByLabel('Bond preference source tax year', { exact: true }).fill('2025');
    await card.getByLabel('Bond preference source record ID', { exact: true }).fill('synthetic-browser-bond-record');
    const deduction = card.getByRole('textbox', { name: /^Otherwise allowable bond preference deduction/ });
    await deduction.fill('5.05');
    await card.getByLabel('Bond deduction worksheet reference', { exact: true }).fill('Synthetic actual allowance worksheet');
    const allowance = card.getByRole('combobox', { name: 'Bond deduction is allowable and has not been deducted twice', exact: true });
    const recipient = card.getByRole('combobox', { name: 'Bond recipient amounts checked after the last edit', exact: true });
    await allowance.selectOption('true');
    await recipient.selectOption('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.interestEntries?.[0]?.pabRecipientAmountsConfirmed, id)).toBe('true');
    await page.reload();
    await openWorksheet();
    await expect(recipient).toHaveValue('true');
    await expect(allowance).toHaveValue('true');
    await expect(deduction).toHaveValue('5.05');
    await expect(card.getByRole('textbox', { name: /^Box 9 private-activity bond interest/ })).toHaveValue('125.10');
    await card.getByRole('textbox', { name: /^Box 9 private-activity bond interest/ }).fill('126.10');
    await expect(recipient).toHaveValue('');
    await expect(allowance).toHaveValue('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.interestEntries?.[0]?.pabRecipientAmountsConfirmed, id)).toBe('');
    await page.screenshot({ path: testInfo.outputPath(`private-activity-source-${viewport.width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requestBodies.join('\n')).not.toContain('synthetic-browser-bond-record');
    expect(requestBodies.join('\n')).not.toContain('900-70-0001');
  });
}
