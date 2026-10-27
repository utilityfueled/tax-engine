import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { guidedK1PriorRiskSources } from '../../../tests/fixtures/k1-prior-charitable-at-risk-guide-sources';
import { taxpayerFacts2025 } from './guided-fixtures';
function requireRiskSource<T>(value: T | null | undefined): T {
    if (value == null) throw new Error('Missing actual fictional prior-risk original');
    return value;
}
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test.describe(`Actual prior at-risk sources at ${viewport.width}px`, () => {
        test('retains actual prior deduction histories through confirmation reload and review download', async ({ page }, testInfo) => {
            await page.setViewportSize(viewport);
            const requests: Array<{ url: string; body: string }> = [];
            page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
            await page.goto('/returns/new');
            await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
            const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
            await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
            const sources = guidedK1PriorRiskSources();
            const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
                segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null },
                sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', lastName: 'Source', ssn: '123-45-6789' },
                    'income-w2': { entries: [{ employerName: 'Fictional original employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0', socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
                    adjustments: { k1LossSources: sources.qualifiedLoss }, deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: sources.charity } } };
            const history = requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources).statements)[0].atRisk).priorLossHistory).characterSources);
            history.sourceFactsConfirmed = null;
            await page.evaluate(({ id, state }) => {
                localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
                localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
            }, { id, state });
            await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
            await expect(hero).toHaveText('Enter more info for an estimate');
            const open = async () => {
                await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
                await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
            };
            await open();
            const prefix = 'Charitable K-1 1 prior at-risk character';
            const confirmation = page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true });
            await expect(confirmation).toHaveValue(''); await confirmation.selectOption('true');
            await expect(hero).not.toHaveText('Enter more info for an estimate');
            await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
            await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$90,000');
            await page.reload(); await open(); await expect(confirmation).toHaveValue('true');
            await page.getByText(`${prefix} deduction 1`, { exact: true }).click();
            const use = page.getByRole('textbox', { name: `${prefix} deduction 1 use 1 amount allowed`, exact: true });
            await expect(use).toHaveValue('10000');
            const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
            history.sourceFactsConfirmed = true;
            expect(saved.deductions.k1CharitableSources).toEqual(state.sectionData.deductions?.k1CharitableSources);
            expect(saved.adjustments.k1LossSources).toEqual(state.sectionData.adjustments?.k1LossSources);
            expect(saved.deductions.k1CharitableSources.statements[0].atRisk.priorLossHistory.characterSources.records[0]).not.toHaveProperty('allowed');
            expect(requests.some(request => request.body.includes('Fictional character and use attachment'))).toBe(false);
            await use.scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`prior-risk-${viewport.width}.png`) });
            await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
            const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true }); await expect(bundle).toContainText('It is not a filing copy');
            const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
            await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click(); expect((await response).status()).toBe(200);
            const output = testInfo.outputPath(`prior-risk-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
            const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
                'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
            const text = pages.join(' ').replace(/\s+/g, ' ');
            for (const value of ['Earlier at-risk use: $20000; opening suspension: $20000', 'Allowed this year: $10000; closing at-risk suspension: $10000',
                'Allowed this year: $5000; closing at-risk suspension: $5000', '465, origin 2022: suspended $10000; qualified $10000']) expect(text).toContain(value);
            for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
            for (const secret of ['123-45-6789', '123456789', 'old-ordinary', 'old-cash']) expect(text).not.toContain(secret);
            for (const request of requests.filter(request => request.body.includes('Fictional character and use attachment'))) {
                expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
            }
            await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`prior-risk-review-${viewport.width}.png`) });
            await page.getByRole('button', { name: 'Start guided interview', exact: true }).click(); await open();
            await page.getByText(`${prefix} deduction 1`, { exact: true }).click(); await use.fill('9999.99');
            await expect(hero).toHaveText('Enter more info for an estimate'); await expect(confirmation).toHaveValue('');
            await page.reload(); await open(); await page.getByText(`${prefix} deduction 1`, { exact: true }).click();
            await expect(use).toHaveValue('9999.99'); await expect(hero).toHaveText('Enter more info for an estimate');
        });
    });
}
