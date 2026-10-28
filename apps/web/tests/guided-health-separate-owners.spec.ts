// Spec: spec/federal/marketplace-health-separate-owners.yaml browser.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { marketplaceHealthSeparateOwnerRecords } from '../../../tests/fixtures/marketplace-health-separate-owners-records';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '1990-02-15',
  livedWithSpouseAtAnyTimeDuringYear: true, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false,
    spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1992-09-10', usResidencyMonths: '12',
    employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) test.describe(`${viewport.width}px`, () => {
  test('retains independent owner sources through actual controls and saved review', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: { url: string; body: string }[] = [];
    page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing fictional return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const records = marketplaceHealthSeparateOwnerRecords();
    // Focused seeded source edit, reconfirmation and export; personal/W2 were
    // already visited. This does not claim an upload-to-deletion release run.
    await page.evaluate(({ id, personal, records }) => {
      const workspaces = JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}');
      workspaces.workspaces[id].returnSummary.targetTaxYear = 2025;
      localStorage.setItem('tax-engine.return-workspaces.v1', JSON.stringify(workspaces));
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
        segmentation: { filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-w2': records.wages, payments: records.payments,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' },
            premiumTaxCredit: records.coverage } } }));
    }, { id, personal, records });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Adjustments to Income', exact: true })).toBeVisible();
    const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect(page.getByRole('combobox', { name: 'Plan 3: Business or shareholder employer', exact: true })).toHaveValue('formW2:2');
    const reference = page.getByRole('textbox', { name: 'Plan 3 payment 1: Payment source label', exact: true });
    const advance = page.getByRole('textbox', { name: 'Plan 1 payment 1: Actual advance premium tax credit', exact: true });
    const choice = page.getByRole('combobox', { name: 'Credit allocation choice checked after the last edit', exact: true });
    const health = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
    const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    await reference.fill('fictional-private-third-owner-payment'); await reference.press('Tab');
    for (const confirmation of [choice, health, marketplace]) await expect(confirmation).toHaveValue('');
    await expect(hero).toHaveText('Enter more info for an estimate');
    const reconfirm = async () => { for (const field of [choice, health, marketplace]) await field.selectOption('true'); };
    await advance.fill(''); await advance.press('Tab'); await reconfirm();
    await expect(hero).toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Adjustments to Income', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip this section', exact: true })).toHaveCount(0);
    await page.reload(); await expect(advance).toHaveValue('');
    await advance.fill('0'); await advance.press('Tab'); await reconfirm();
    await expect(hero).toHaveText('Enter more info for an estimate');
    await reference.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`separate-owner-source-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (let step = 0; step < 8 && !(await page.getByRole('heading', { name: 'Payments & Withholding', exact: true }).isVisible()); step++) {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
    const payment = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
    await expect(payment).toHaveValue(''); await payment.selectOption('true');
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.reload(); await expect(payment).toHaveValue('true');
    for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
    const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
    await expect(bundle).toContainText('Filing exports are not yet qualified');
    const saved = await page.evaluate(id => ({ state: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'),
      workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id] }), id);
    writeFileSync(testInfo.outputPath('actual-confirmed-source.json'), JSON.stringify(saved, null, 2) + '\n');
    expect(saved.state.sectionData['income-w2']).toEqual(records.wages);
    expect(saved.state.sectionData.payments).toEqual(records.payments);
    const originals = saved.state.sectionData.adjustments.healthInsuranceFacts;
    expect(originals.plans.map((plan: { businessSourceId: string; accountHolder: string }) => [plan.businessSourceId, plan.accountHolder]))
      .toEqual([['formW2:0', 'primary'], ['formW2:1', 'spouse'], ['formW2:2', 'primary']]);
    expect(originals.plans[0].payments[0].advancePremiumTaxCredit).toBe('0');
    expect(originals.plans[2].payments[0].sourceId).toBe('fictional-private-third-owner-payment');
    expect(originals.marketplaceCreditAllocation.sourceFactsConfirmed).toBe(true);
    expect(saved.state.completedSections).toEqual(['personal-info', 'income-w2', 'adjustments', 'deductions', 'credits', 'payments', 'review', 'final-review']);
    const downloading = page.waitForEvent('download');
    const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
    await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
    expect((await response).status()).toBe(200);
    const output = testInfo.outputPath(`separate-owner-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['Schedule 1 line 17 transfer: $7050', 'Pub974 Worksheet W line 13: $80000', 'Pub974 Worksheet W line 14: $2400',
      'Pub974 Worksheet W line 15: $77600', 'Final Form 8962 credit: $3980']) expect(text).toContain(literal);
    for (const source of ['formW2:0; owner primary', 'formW2:1; owner spouse', 'formW2:2; owner primary']) expect(text).toContain(source);
    for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
    for (const secret of ['111-22-3333', '111223333', '222-33-4444', '222334444']) expect(text).not.toContain(secret);
    for (const request of requests.filter(request => ['fictional-private-third-owner-payment', '111-22-3333', '222-33-4444'].some(secret => request.body.includes(secret)))) {
      expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
      expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
    }
    await bundle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`separate-owner-review-${viewport.width}.png`) });
  });
});
