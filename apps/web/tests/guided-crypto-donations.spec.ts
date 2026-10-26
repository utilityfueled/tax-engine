// Spec: spec/federal/guided-crypto-donations.yaml browser.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { inspectCryptoDonationPdf } from '../../../tests/fixtures/crypto-donation-pdf-inspection';

// Browser source records are plain data: importing the unit fixture would pull
// application aliases into Playwright's fixture-loader context.
function actualCryptoDonationInterview() {
  return { factsVersion: 2, taxYear: 2025,
    segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
    sectionData: {
      'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', dateOfBirth: '1990-02-15', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
      'income-w2': { entries: [{ employerName: 'Synthetic Employer', employerEin: '12-3456789', accountHolder: 'primary',
        wages: '100000', federalWithheld: '20000', socialSecurityWages: '100000', socialSecurityWithheld: '6200',
        medicareWages: '100000', medicareWithheld: '1450', socialSecurityTips: '0', box10DependentCareBenefits: '0',
        box12CodeW: '0', stateTaxReporting: 'none', stateWages: '', stateWithheld: '' }] },
      deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0',
        charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [],
        cryptoDonations: [{ asset: 'BTC', quantity: '0.0000000001234567890123456789123', dateAcquired: '2023-01-01', dateDonated: '2025-06-01',
          fairMarketValueAtDonation: '20000.00', costBasis: '1000.00', charityName: 'Synthetic public charity', charityEIN: '12-3456789',
          isQualifiedOrganization: true, recipientCategory: 'fifty-percent', capitalAsset: true, fullOwnershipInterestDonated: true,
          noGoodsOrServicesReceived: true, substantiationRequirementsMet: true, appraisalRequired: true, qualifiedAppraisalObtained: true, sourceFactsConfirmed: true }] },
    } };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual digital-asset gifts at ${viewport.width}px`, () => {
    test('preserves original digital-asset gifts through local reload and review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = actualCryptoDonationInterview();
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ ...state, phase: 'interview', currentSectionIndex: 2,
          completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'] }));
      }, { id, state });
      await page.reload();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Deductions');
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const open = async () => page.getByText('Digital assets donated to charity', { exact: true }).click();
      await open();
      const text = (label: string) => page.getByRole('textbox', { name: `Digital-asset gift 1 ${label}`, exact: true });
      const select = (label: string) => page.getByRole('combobox', { name: `Digital-asset gift 1 ${label}`, exact: true });
      await expect(text('exact quantity')).toHaveValue('0.0000000001234567890123456789123');
      await text('recipient name').fill('Synthetic changed public charity');
      await expect(select('checked after the last edit')).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await select('checked after the last edit').selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await text('original cost basis').fill(''); await select('checked after the last edit').selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.deductions.cryptoDonations[0].costBasis, id)).toBe('');
      await page.reload(); await open(); await expect(text('original cost basis')).toHaveValue('');
      await text('original cost basis').fill('0'); await text('original cost basis').press('Tab');
      await select('checked after the last edit').selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.deductions.cryptoDonations[0].sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(text('original cost basis')).toHaveValue('0');
      await expect(text('recipient name')).toHaveValue('Synthetic changed public charity');
      await expect(select('qualified appraisal is required after reviewing all similar-property gifts')).toHaveValue('true');
      const source = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.deductions.cryptoDonations[0], id);
      expect(source.dateAcquired).toBe('2023-01-01'); expect(source.dateDonated).toBe('2025-06-01');
      expect(source.quantity).toBe('0.0000000001234567890123456789123'); expect(source.costBasis).toBe('0');
      expect(source).not.toHaveProperty('allowedDeduction'); expect(source).not.toHaveProperty('agi');
      for (const secret of ['111-22-3333', 'Synthetic changed public charity', source.quantity]) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await text('original cost basis').scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`crypto-donation-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`crypto-donation-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const read = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', inspectCryptoDonationPdf,
        resolve('../../forms/blank/2025/f1040sa.pdf'), output], { encoding: 'utf8', timeout: 30_000 })) as {
          pages: string[]; noncash: string[]; charitable: string[]; itemized: string[]; flattened: boolean;
        };
      expect(read.flattened).toBe(true); expect(read.noncash).toEqual(['20000']); expect(read.charitable).toEqual(['20000']); expect(read.itemized).toEqual(['20000']);
      for (const pageText of read.pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333']) expect(read.pages.join('\n')).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes(source.quantity))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`crypto-donation-review-${viewport.width}.png`) });
    });
  });
}
