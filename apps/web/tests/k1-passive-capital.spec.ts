import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { GuidedInterviewState } from '../src/lib/guided-interview-flow';
import originalState from '../../../tests/fixtures/guided-k1-passive-capital-browser.json' with { type: 'json' };

function requireRiskSource<T>(value: T | null | undefined): T {
    if (value == null) throw new Error('Missing fictional original capital source');
    return value;
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test.describe(`Actual capital character sources at ${viewport.width}px`, () => {
        test('retains actual capital sources through confirmation reload and review download', async ({ page }, testInfo) => {
            await page.setViewportSize(viewport);
            const requests: Array<{ url: string; body: string }> = [];
            page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
            await page.goto('/returns/new');
            await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
            const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
            await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
            const state = structuredClone(originalState) as GuidedInterviewState;
            state.currentSectionIndex = 2; state.completedSections = ['personal-info', 'income-w2'];
            const packet = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
            const capital = requireRiskSource(requireRiskSource(packet.statements)[0].capitalCharacter);
            capital.sourceFactsConfirmed = null;
            await page.evaluate(({ id, state }) => {
                localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
                localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
            }, { id, state });
            await page.reload();
            const hero = page.locator('.guided-ticker-value-hero').first();
            await expect(hero).toHaveText('Enter more info for an estimate');
            const open = async () => {
                await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
                await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
            };
            await open();
            const prefix = 'Charitable K-1 1 capital character';
            const confirmation = page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true });
            const prior = page.getByRole('textbox', { name: `${prefix} prior passive short-term loss`, exact: true });
            const reference = page.getByRole('textbox', { name: `${prefix} source reference`, exact: true });
            await expect(confirmation).toHaveValue(''); await expect(prior).toHaveValue('8000');
            await confirmation.selectOption('true');
            await expect(hero).not.toHaveText('Enter more info for an estimate');
            await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
            await page.locator('.guided-ticker-clickable').first().click();
            await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$100,000');
            await page.reload(); await open();
            await expect(confirmation).toHaveValue('true'); await expect(prior).toHaveValue('8000');
            const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
            capital.sourceFactsConfirmed = true;
            expect(saved.deductions.k1CharitableSources).toEqual(packet);
            expect(saved.adjustments.k1LossSources).toEqual(state.sectionData.adjustments?.k1LossSources);
            for (const key of ['allowed', 'suspended', 'deductionOverride']) expect(saved.deductions.k1CharitableSources.statements[0].capitalCharacter).not.toHaveProperty(key);
            expect(requests.some(request => request.body.includes('Actual filed prior capital worksheet'))).toBe(false);
            await prior.scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`passive-capital-${viewport.width}.png`) });
            await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
            const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true });
            await expect(bundle).toContainText('It is not a filing copy');
            const downloading = page.waitForEvent('download');
            const response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
            await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click();
            expect((await response).status()).toBe(200);
            const output = testInfo.outputPath(`passive-capital-review-${viewport.width}.pdf`);
            await (await downloading).saveAs(output);
            const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
                'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
            const text = pages.join(' ').replace(/\s+/g, ' ');
            for (const value of ['Form 8582 Part IX', 'Opening passive short-term loss: $8000; long-term loss: $0',
                'Original current short-term character: passive_activity', 'Allowed deduction $8000',
                'Ordinary passive loss allowed: $1333.333333333333333']) expect(text).toContain(value);
            for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
            for (const secret of ['123-45-6789', '123456789', 'Actual original short-term statement', 'Actual filed prior capital worksheet']) expect(text).not.toContain(secret);
            for (const request of requests.filter(request => request.body.includes('Actual filed prior capital worksheet'))) {
                expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
                expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
            }
            await bundle.scrollIntoViewIfNeeded();
            await page.screenshot({ path: testInfo.outputPath(`passive-capital-review-${viewport.width}.png`) });
            await page.getByRole('button', { name: 'Start guided interview', exact: true }).click(); await open();
            await reference.fill('Actual replacement capital statement');
            await expect(hero).toHaveText('Enter more info for an estimate'); await expect(confirmation).toHaveValue('');
            await page.reload(); await open();
            await expect(reference).toHaveValue('Actual replacement capital statement');
            await expect(hero).toHaveText('Enter more info for an estimate');
        });
    });
}
