// Spec: spec/federal/cod-title-11-chapter-13.yaml guide and spec/federal/form-1099-da-sources.yaml gift-lots.
import { expect, test, type Page } from '@playwright/test';
import { actualGuidedCodNol } from '../../../tests/fixtures/guided-cod-nol';
import { actualGuidedDigitalAsset } from '../../../tests/fixtures/guided-digital-asset-sources';
import { actualGuidedNolSources } from '../../../tests/fixtures/guided-net-operating-loss';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0', socialSecurityWages: '100000', socialSecurityTips: '0',
  socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

async function seed(page: Page, segmentation: object, sectionData: object) {
  await page.goto('/returns/new');
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
  await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
  await page.evaluate(({ id, segmentation, sectionData }) => {
    localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'], segmentation, sectionData }));
  }, { id, segmentation, sectionData });
  await page.reload();
  return id;
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`New source fields at ${viewport.width}px`, () => {
    test('collects chapter 13 facts through edits and reload', async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      const prior = structuredClone(actualGuidedNolSources), original = prior.vintages?.[0]; if (!original || !prior.alternativeTax) throw new Error('Missing synthetic loss sources');
      const first = { ...original, originalLoss: '100000', openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] };
      prior.vintages = [first, { ...first, sourceId: 'regular2022', lossTaxYear: '2022' }]; prior.alternativeTax.vintages = structuredClone(prior.vintages);
      await seed(page, { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['cancelled-debt'], stateCode: null },
        { 'personal-info': personal, 'income-w2': { entries: [w2] }, adjustments: { netOperatingLossSources: prior, codNolSources: actualGuidedCodNol() } });
      const open = () => page.getByText('Canceled debt, insolvency and bankruptcy', { exact: true }).click(); await open();
      const chapter = page.getByRole('combobox', { name: 'Bankruptcy chapter', exact: true });
      await expect(chapter).toHaveCount(0);
      await page.getByRole('combobox', { name: 'Debt was discharged in a title 11 bankruptcy case', exact: true }).selectOption('true');
      await chapter.selectOption('13');
      const reference = page.getByRole('textbox', { name: 'Bankruptcy discharge order or plan reference', exact: true });
      await reference.fill('Fictional discharge order');
      await page.getByRole('combobox', { name: "You were a debtor under the court's jurisdiction", exact: true }).selectOption('true');
      await page.getByRole('combobox', { name: 'Bankruptcy records checked', exact: true }).selectOption('true');
      await expect(page.getByText('still needed to limit basis reduction', { exact: false })).toBeVisible();
      await page.reload(); await open();
      await expect(chapter).toHaveValue('13');
      await expect(reference).toHaveValue('Fictional discharge order');
      await reference.fill('Corrected order');
      await expect(page.getByRole('combobox', { name: 'Bankruptcy records checked', exact: true })).toHaveValue('');
    });

    test('collects gift lot facts through edits and reload', async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await seed(page, { filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null },
        { 'personal-info': personal, 'income-w2': { entries: [w2] }, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [], digitalAssetEntries: [actualGuidedDigitalAsset()] } });
      const open = () => page.getByText('Original digital assets (1099-DA)', { exact: true }).click(); await open();
      const giftDate = page.getByRole('textbox', { name: 'DA 1 sale 1 — Gift date', exact: true });
      await expect(giftDate).toHaveCount(0);
      await page.getByRole('combobox', { name: 'DA 1 sale 1 — Actual original acquisition', exact: true }).selectOption('gift');
      await giftDate.fill('2023-03-01');
      await page.getByRole('combobox', { name: 'DA 1 sale 1 — This came from a spouse, or a former spouse in a divorce', exact: true }).selectOption('false');
      const value = page.getByRole('textbox', { name: 'DA 1 sale 1 — Value on the gift date', exact: true });
      await value.fill('8000'); await value.press('Tab'); await expect(value).toHaveValue('8,000');
      const records = page.getByRole('combobox', { name: "DA 1 sale 1 — Records support the donor's basis, the value and the gift date", exact: true });
      await records.selectOption('true');
      await page.reload(); await open();
      await expect(giftDate).toHaveValue('2023-03-01');
      await expect(value).toHaveValue('8,000');
      await page.getByRole('textbox', { name: 'DA 1 sale 1 — Completed taxpayer cost basis', exact: true }).fill('1');
      await expect(records).toHaveValue('');
    });
  });
}
