import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { guidedK1CharitableAtRiskSources, guidedK1CharitableAtRiskPayments } from '../../../tests/fixtures/k1-charitable-at-risk-guide-sources';
import { taxpayerFacts2025 } from './guided-fixtures';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test.describe(`Actual charitable activity allocation at ${viewport.width}px`, () => {
        test('retains actual activity sources through confirmation reload and review download', async ({ page }, testInfo) => {
            await page.setViewportSize(viewport); const requests: Array<{ url: string; body: string }> = [];
            page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
            await page.goto('/returns/new');
            await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
            const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
            await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
            const sources = guidedK1CharitableAtRiskSources(), payments = guidedK1CharitableAtRiskPayments();
            const assignment = sources.charity.statements?.[0].atRisk?.activityAllocation; if (!assignment) throw new Error('Missing fictional actual assignment');
            assignment.sourceFactsConfirmed = null;
            const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
                segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null },
                sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
                    'income-w2': { entries: [{ employerName: 'Fictional original employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '30000', socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
                    payments, adjustments: { k1LossSources: sources.qualifiedLoss }, deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: sources.charity } } };
            await page.evaluate(({ id, state }) => { localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true'); localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state)); }, { id, state });
            await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
            await expect(hero).toHaveText('Enter more info for an estimate');
            const open = async () => { await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click(); await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click(); };
            await open();
            const confirm = page.getByRole('combobox', { name: 'Charitable K-1 1 activity assignment checked after the last edit', exact: true });
            const sourceReference = page.getByRole('textbox', { name: 'Charitable K-1 1 activity assignment source reference', exact: true });
            await expect(sourceReference).toHaveValue('Fictional original activity membership attachment'); await expect(page.getByText('Explicitly recorded: no assigned gifts.', { exact: true })).toBeVisible(); await expect(confirm).toHaveValue('');
            await confirm.selectOption('true'); await expect(hero).not.toHaveText('Enter more info for an estimate');
            await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
            await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$75,000');
            await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' })).toContainText('$65,000');
            await page.reload(); await open(); await expect(confirm).toHaveValue('true'); await expect(sourceReference).toHaveValue('Fictional original activity membership attachment'); await expect(page.getByText('Explicitly recorded: no assigned gifts.', { exact: true })).toBeVisible();
            const savedState = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
            const saved = savedState.sectionData;
            writeFileSync(testInfo.outputPath(`ordinary-gift-actual-source-${viewport.width}.json`), JSON.stringify(savedState, null, 2) + '\n');
            expect(saved.payments).toEqual(payments);
            expect(saved['income-w2'].entries[0].federalWithheld).toBe('30000');
            assignment.sourceFactsConfirmed = true;
            expect(saved.deductions.k1CharitableSources).toEqual(sources.charity); expect(saved.adjustments.k1LossSources).toEqual(sources.qualifiedLoss);
            for (const name of ['allowed', 'suspended', 'deductionOverride']) expect(saved.deductions.k1CharitableSources.statements[0].atRisk.activityAllocation).not.toHaveProperty(name);
            expect(requests.some(request => request.body.includes('Fictional original activity membership attachment'))).toBe(false);
            await sourceReference.scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`charitable-risk-${viewport.width}.png`) });
            await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
            const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true }); await expect(bundle).toContainText('It is not a filing copy');
            const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
            await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click(); expect((await response).status()).toBe(200);
            const output = testInfo.outputPath(`charitable-risk-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
            const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", output], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 })) as string[];
            const text = pages.join(' ').replace(/\s+/g, ' ');
            for (const value of ['Ordinary amount after at risk: $-25000', 'Ordinary suspended at risk: $15000', 'Available after basis: $10000', 'Basis suspended: $10000', 'Available for section170: $10000', 'At-risk suspended: $0']) expect(text).toContain(value);
            for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
            for (const secret of ['111-22-3333', '111223333', 'original-gift-1', 'Fictional original activity membership attachment']) expect(text).not.toContain(secret);
            for (const request of requests.filter(request => request.body.includes('Fictional original activity membership attachment'))) { expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
            await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`charitable-risk-review-${viewport.width}.png`) });
            await page.getByRole('button', { name: 'Start guided interview', exact: true }).click(); await open();
            await page.getByRole('button', { name: 'Add Charitable K-1 1 assigned gift', exact: true }).click();
            const sourceId = page.getByRole('textbox', { name: 'Charitable K-1 1 assigned gift 1 original source ID', exact: true });
            await sourceId.fill('original-gift-1'); await expect(hero).toHaveText('Enter more info for an estimate');
            await expect(confirm).toHaveValue(''); await page.reload(); await open(); await expect(sourceId).toHaveValue('original-gift-1');
            await expect(hero).toHaveText('Enter more info for an estimate');
        });
    });
}
