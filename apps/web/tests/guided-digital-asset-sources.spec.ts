// Spec: spec/federal/guided-digital-asset-sources.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedDigitalAsset } from '../../../tests/fixtures/guided-digital-asset-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic digital employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '50000', federalWithheld: '3875',
  socialSecurityWages: '50000', socialSecurityTips: '0', socialSecurityWithheld: '3100', medicareWages: '50000', medicareWithheld: '725',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Original digital sources at ${viewport.width}px`, () => {
    test('preserves original digital sources and independent state basis', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const source = actualGuidedDigitalAsset();
      if (!source.transactions?.[0]) throw new Error('Missing synthetic original disposition');
      Object.assign(source.transactions[0], { paCostBasis: '80.24', paBasisSourceReference: 'Actual Pennsylvania acquisition ledger', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true });
      await page.evaluate(({ id, personal, w2, source }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: 'PA' },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] },
            'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [], digitalAssetEntries: [source] } } }));
      }, { id, personal, w2, source });
      await page.reload();
      // Published single Tax Table row34250-34300 gives3875 federal tax. Actual PA
      // wages50000 + reported gain20 at3.07% gives1536; federal Box4 adds0.10 refund.
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$1,536');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown').getByText('$50,010', { exact: true }).first()).toBeVisible();
      await expect(page.locator('.guided-ticker-breakdown').getByText('$3,875', { exact: true }).first()).toBeVisible();
      const open = () => page.getByText('Original digital assets (1099-DA)', { exact: true }).click(); await open();
      const statement = 'DA statement 1 — Sources checked after the last edit';
      const basis = 'DA 1 sale 1 — Basis records checked after the last edit';
      const paBasis = 'DA 1 sale 1 — Pennsylvania basis checked after the last edit';
      const federalAmount = page.getByRole('textbox', { name: 'DA 1 sale 1 — Completed taxpayer cost basis', exact: true });
      const stateAmount = page.getByRole('textbox', { name: 'DA 1 sale 1 — Actual Pennsylvania adjusted basis', exact: true });
      await expect(federalAmount).toHaveValue('90.24'); await expect(stateAmount).toHaveValue('80.24');
      await page.getByRole('textbox', { name: 'DA 1 sale 1 — Pennsylvania basis reference', exact: true }).fill('synthetic-private-PA-acquisition');
      for (const name of [basis, paBasis, statement]) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      for (const name of [basis, paBasis, statement]) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$1,536');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.digitalAssetEntries?.[0]?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(federalAmount).toHaveValue('90.24'); await expect(stateAmount).toHaveValue('80.24');
      await expect(page.getByRole('textbox', { name: 'DA 1 sale 1 — Original Box 1g reported basis', exact: true })).toHaveValue('');
      await expect(page.getByRole('combobox', { name: 'DA 1 sale 1 — Original Box 1g is blank', exact: true })).toHaveValue('true');
      for (const name of [basis, paBasis, statement]) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('true');
      await federalAmount.fill('');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      for (const name of [basis, paBasis, statement]) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.digitalAssetEntries?.[0]?.transactions?.[0]?.costBasis, id)).toBe('');
      await page.reload(); await open(); await expect(federalAmount).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.digitalAssetEntries?.[0], id);
      expect(saved.federalWithheld).toBe('0.10'); expect(saved.transactions[0]).toMatchObject({ proceeds: '100.49', paCostBasis: '80.24', costBasis: '', reportedCostBasis: '', reportedCostBasisBlank: true, paBasisSourceReference: 'synthetic-private-PA-acquisition' });
      await stateAmount.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`digital-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-PA-acquisition', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
