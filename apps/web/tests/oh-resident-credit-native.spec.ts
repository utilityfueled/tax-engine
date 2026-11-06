/** Spec: spec/state/oh-resident-credit-native-browser.yaml. Actual native sources, not injected RC cash. */
import { expect, test } from '../scripts/browser-cpu-diagnostics/fixture';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  cash, captures, changedReference, confirmedMoney, confirm, control, enter, geometry,
  noCaptures, openWorkspace, packet, pendingMoney, personalSecrets,
  pin, required, residentCreditAddLabel, residentCreditConfirmLabel, reviewDownload,
  saved, seedUnrelated, typeOriginals,
} from './helpers/oh-resident-credit-browser';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  for (const cohort of ['distinct', 'cents'] as const) {
    test.describe(`Actual Ohio resident credit ${cohort} at ${viewport.width}px`, () => {
      test('types actual Virginia originals and preserves source-bound review lifecycle', async ({ page }, info) => {
        await page.setViewportSize(viewport);
        const pageErrors: string[] = [], consoleErrors: string[] = [], downloads: string[] = [];
        const requests: Array<{ url: string; method: string; body: string }> = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        page.on('download', download => downloads.push(download.suggestedFilename()));
        page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() ?? '' }));
        const { id, facts, original, seed } = await seedUnrelated(page, cohort);
        const active = page.locator('.guided-section-transition');
        await expect(active).toHaveCount(1);
        expect((await saved(page, id)).sectionData['state-return']?.ohioResidency).not.toHaveProperty('residentCreditSources');
        const income = page.locator('.guided-ticker-item').filter({ has: page.getByText('Total Income', { exact: true }) });
        await expect(income).toHaveCount(1); await expect(income.locator('.guided-ticker-value')).toHaveText('$100,000');
        await page.getByRole('button', { name: residentCreditAddLabel, exact: true }).click();
        const native = page.getByRole('region', { name: 'Ohio credit for tax paid to Virginia', exact: true });
        for (const label of ['Virginia source year', 'Virginia owner', 'Virginia source reference', 'Virginia completed account unapplied payments']) {
          await expect(control(page, label)).toHaveValue('');
        }
        let draft = await packet(page, id);
        noCaptures(draft); expect(draft.sourceFactsConfirmed).toBeNull();
        expect(draft.paymentsReviewed).toBeNull(); expect(draft.refundsReviewed).toBeNull();
        expect(draft.completedAccount.payments).toBeNull(); expect(draft.completedAccount.refunds).toBeNull();
        expect((await saved(page, id)).sectionData['state-return']?.ohioResidency?.sourceFactsConfirmed).not.toBe(true);
        await native.getByRole('button', { name: residentCreditConfirmLabel, exact: true }).click();
        await expect(native.getByRole('alert')).toHaveCount(1);
        noCaptures(await packet(page, id)); await pendingMoney(active);
        await geometry(page, info, 'blank-source-validation', native, native.getByRole('alert'));
        const blank = await packet(page, id);
        await page.reload(); expect(await packet(page, id)).toEqual(blank); noCaptures(await packet(page, id));
        await expect(control(page, 'Virginia source year')).toHaveValue('');
        await pendingMoney(active);

        await typeOriginals(page, facts);
        draft = await packet(page, id); noCaptures(draft); expect(draft.sourceFactsConfirmed).not.toBe(true);
        expect(draft.filedReturn.federalAgi).toBe('100,000');
        expect(draft.filedReturn.incomeTaxBeforeCredits).toBe(cohort === 'cents' ? '2,500.5' : '2,500');
        await pendingMoney(active);
        await confirm(page, id);
        draft = await packet(page, id);
        const receiptReference = required(required(facts.source.completedAccount.payments)[1]).sourceReference;
        pin(draft, cohort, receiptReference);
        expect(draft.originalW2).toEqual(JSON.parse(JSON.stringify(required(original.w2s[0]))));
        expect(draft.originalFederalSources).not.toHaveProperty('ohioResidency');
        await confirmedMoney(active, cohort);
        await geometry(page, info, 'actual-records-confirmed', native, native.getByRole('button', { name: residentCreditConfirmLabel, exact: true }));

        const beforeEdit = structuredClone(draft), oldCaptures = captures(beforeEdit);
        await enter(page, 'Virginia completed account payment 2 source reference', changedReference);
        draft = await packet(page, id);
        expect(draft.sourceFactsConfirmed).not.toBe(true);
        expect((await saved(page, id)).sectionData['state-return']?.ohioResidency?.sourceFactsConfirmed).not.toBe(true);
        expect(captures(draft)).toEqual(oldCaptures);
        expect(required(required(draft.completedAccount.payments)[1]).amount).toBe(required(required(beforeEdit.completedAccount.payments)[1]).amount);
        expect(required(required(draft.completedAccount.payments)[1]).transactionOriginals).toEqual(required(required(beforeEdit.completedAccount.payments)[1]).transactionOriginals);
        await pendingMoney(active);
        await geometry(page, info, 'same-cash-source-invalidated', native, control(page, 'Virginia completed account payment 2 source reference'));
        const edited = await packet(page, id);
        await page.reload(); expect(await packet(page, id)).toEqual(edited); expect(captures(await packet(page, id))).toEqual(oldCaptures);
        await pendingMoney(active); await confirm(page, id); pin(await packet(page, id), cohort, changedReference);
        await confirmedMoney(active, cohort);

        const beforeUnknown = structuredClone(await packet(page, id));
        await enter(page, 'Virginia completed account unapplied payments', '');
        draft = await packet(page, id);
        expect(draft.completedAccount.unappliedPayments).toBe(''); expect(draft.sourceFactsConfirmed).not.toBe(true);
        expect((await saved(page, id)).sectionData['state-return']?.ohioResidency?.sourceFactsConfirmed).not.toBe(true);
        expect(captures(draft)).toEqual(captures(beforeUnknown));
        await native.getByRole('button', { name: residentCreditConfirmLabel, exact: true }).click();
        await expect(native.getByRole('alert')).toHaveCount(1); expect(captures(await packet(page, id))).toEqual(captures(beforeUnknown));
        await pendingMoney(active);
        const unknown = await packet(page, id);
        await page.reload(); expect(await packet(page, id)).toEqual(unknown);
        await expect(control(page, 'Virginia completed account unapplied payments')).toHaveValue('');
        await pendingMoney(active);
        await enter(page, 'Virginia completed account unapplied payments', '0'); await confirm(page, id);
        const final = await packet(page, id); pin(final, cohort, changedReference); await confirmedMoney(active, cohort);
        const current = await saved(page, id);
        expect(current.sectionData['income-w2']).toEqual(seed.sectionData['income-w2']);
        expect(current.sectionData['state-return']?.ohioPayments).toEqual(seed.sectionData['state-return']?.ohioPayments);
        expect(current.sectionData['state-return']?.ohioResidency?.owners).toEqual(seed.sectionData['state-return']?.ohioResidency?.owners);
        await expect(income.locator('.guided-ticker-value')).toHaveText('$100,000');

        await openWorkspace(page);
        const first = await reviewDownload(page, info, cohort, 'initial'); expect(downloads).toHaveLength(1);
        await page.goto('/'); await page.goto(`/returns/${id}`);
        expect(await packet(page, id)).toEqual(final);
        expect((await saved(page, id)).sectionData['state-return']?.ohioPayments).toEqual(seed.sectionData['state-return']?.ohioPayments);
        const reviewButton = page.getByRole('button', { name: 'Download Review PDF', exact: true });
        await geometry(page, info, 'actual-workspace-reopened', reviewButton.locator('xpath=ancestor::section[1]'), reviewButton);
        const second = await reviewDownload(page, info, cohort, 'reopened');
        expect(second.projection).toEqual(first.projection); expect(downloads).toHaveLength(2);
        expect(await packet(page, id)).toEqual(final);
        const payload = await page.evaluate(id => ({
          workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces[id],
          guidedFlowState: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? 'null'), purpose: 'filing',
        }), id);
        const filing = await page.request.post(first.endpoint, { data: payload });
        expect(filing.status()).toBe(400);
        expect(await filing.json()).toEqual({ error: 'Filing exports are not qualified. Only review downloads are available.' });
        expect(downloads).toHaveLength(2);
        for (const request of requests) {
          if (request.url === first.endpoint && request.method === 'POST') continue;
          for (const secret of [...personalSecrets, changedReference]) expect(request.url + '\n' + request.body).not.toContain(secret);
        }
        expect(requests.filter(request => request.url === first.endpoint && request.method === 'POST')).toHaveLength(2);
        expect(pageErrors).toEqual([]); expect(consoleErrors).toEqual([]);
        await writeFile(info.outputPath('actual-lifecycle-safe-evidence.json'), JSON.stringify({
          cohort, viewport, downloads: downloads.length, reviewResponses: 2, filingStatus: filing.status(),
          capturedSourcesSha256: createHash('sha256').update(JSON.stringify(captures(final))).digest('hex'),
          actualState: { credit: cash[cohort].credit, tax: cash[cohort].tax, requestedRefund: cash[cohort].refund },
          initialUnrelatedSeedOnly: true, postSeedStorageWrites: 0, pageErrors, consoleErrors,
          requests: requests.map(request => ({ origin: new URL(request.url).origin, pathname: new URL(request.url).pathname, method: request.method })),
          fictionalSourceRecords: true, receivedOhioRefundProved: false, filingQualified: false,
        }, null, 2));
      });
    });
  }
}
