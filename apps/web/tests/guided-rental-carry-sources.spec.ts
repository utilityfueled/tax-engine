import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { actualGuidedRentalCarry } from '../../../tests/fixtures/guided-rental-carry';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Rental loss sources at ${viewport.width}px`, () => {
    test('preserves actual rental carry history', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
      await page.evaluate(({ id, personal, carry }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 1, completedSections: ['personal-info'], segmentation: { filingStatus: 'single', incomeTypes: ['rental'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-rental': { entries: [{ description: '100 Actual Rental Road, Columbus OH 43215', propertyType: 'single_family',
            accountHolder: 'primary', ownershipPercentage: '100', minimumOwnershipPercentage: '100', personalUseDays: '0', rentalDays: '300', sourceFactsConfirmed: true,
            heldForRental: true, amountsAreWholeProperty: true, isActiveParticipant: true, allInvestmentAtRisk: true, realEstateProfessional: false, substantialServices: false, selfRental: false, additionalWorksheetRequired: false,
            priorYearUnallowedLoss: '3000', priorYearUnallowedCredits: '0', qualifiesForQBI: false, qbiMateriallyParticipated: false,
            advertising: '0', autoTravel: '0', cleaning: '0', commissions: '0', legalProfessional: '0', managementFees: '0', otherInterest: '0', supplies: '0',
            rents: '10000', mortgageInterest: '0', taxes: '0', insurance: '0', repairs: '0', utilities: '0', depreciation: '0', otherExpenses: '0', priorLossSources: carry,
          }] } },
        }));
      }, { id, personal, carry: actualGuidedRentalCarry });
      await page.reload();
      const open = () => page.getByText('Prior rental loss source history', { exact: true }).click(); await open();
      await page.getByRole('textbox', { name: 'Rental carry packet reference', exact: true }).fill('synthetic-private-rental-carry');
      await page.getByRole('textbox', { name: 'Prior-year unallowed rental losses', exact: true }).fill('2999');
      await page.getByRole('textbox', { name: 'Loss year 1 remaining suspended loss', exact: true }).fill('2999');
      await page.getByRole('textbox', { name: 'Loss year 1 remaining qualified loss', exact: true }).fill('2999');
      await page.getByRole('textbox', { name: 'Loss year 1 remaining qualified loss', exact: true }).press('Tab');
      const confirmed = page.getByRole('combobox', { name: 'Rental carry sources checked after the last edit', exact: true });
      await expect(confirmed).toHaveValue(''); await confirmed.selectOption('true');
      await page.getByRole('combobox', { name: 'Have you checked the actual property, ownership, use, income and expense facts after the latest edits?', exact: true }).selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-rental']?.entries?.[0]?.priorLossSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(page.getByRole('textbox', { name: 'Loss year 1 remaining suspended loss', exact: true })).toHaveValue('2,999');
      await expect(page.getByRole('textbox', { name: 'Loss year 1 remaining qualified loss', exact: true })).toHaveValue('2,999');
      await expect(confirmed).toHaveValue('true');
      const comparison = page.getByRole('combobox', { name: 'AMT prior suspended loss matches the regular filed carry', exact: true });
      await comparison.selectOption(''); await expect(confirmed).toHaveValue('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-rental']?.entries?.[0]?.priorLossSources?.amtPriorLossMatches, id)).toBeNull();
      await page.reload(); await open(); await expect(comparison).toHaveValue('');
      await comparison.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`rental-carry-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const value of ['synthetic-private-rental-carry', 'Synthetic separate AMT rental comparison', personal.ssn]) expect(requests.join('\n')).not.toContain(value);
    });
  });
}
