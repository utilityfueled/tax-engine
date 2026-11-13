// Spec: spec/federal/form-2210-schedule-ai.yaml, ordinary-preferential-guide-browser.
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

test('retains actual preferential period amounts and invalidates stale confirmations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const privateReference = 'synthetic-private-schedule-ai-sources';
  const requestBodies: string[] = [];
  page.on('request', request => requestBodies.push(request.postData() ?? ''));
  await page.goto('/returns/new');
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id) throw new Error('Missing synthetic return');
  await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
  const storageKey = `tax-engine.guided-flow-state.v1:${id}`;
  await page.evaluate(({ id, storageKey, personal }) => {
    localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
    localStorage.setItem(storageKey, JSON.stringify({
      factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3,
      completedSections: ['personal-info', 'deductions', 'credits'],
      segmentation: { filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: null },
      sectionData: { 'personal-info': personal },
    }));
  }, { id, storageKey, personal: taxpayerFacts2025 });
  await page.reload();
  await page.getByRole('button', { name: 'Add estimated-tax worksheet', exact: true }).click();
  const method = page.getByRole('combobox', { name: 'Estimated-tax calculation method', exact: true });
  await method.selectOption('annualized');
  const year = page.getByRole('textbox', { name: 'Estimated-tax source year', exact: true });
  await year.fill('2025');
  const reference = page.getByRole('textbox', { name: 'Estimated-tax source reference', exact: true });
  await reference.fill(privateReference);

  const dividends = page.getByRole('textbox', { name: 'Period 1: Qualified dividends', exact: true });
  const gain = page.getByRole('textbox', { name: 'Period 1: Net capital gain', exact: true });
  const unanswered = page.getByRole('textbox', { name: 'Period 2: Net capital gain', exact: true });
  const ordinary = page.getByRole('combobox', { name: 'All four periods use the ordinary qualified dividend and capital gain worksheet', exact: true });
  await expect(ordinary).toHaveCount(0);
  await dividends.fill('1234.56');
  await dividends.blur();
  await gain.fill('0');
  await gain.blur();
  await expect(ordinary).toHaveValue('');
  await ordinary.selectOption('true');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').sectionData?.payments?.estimatedTaxFacts?.ordinaryPreferentialPeriodsConfirmed, storageKey)).toBe(true);

  await page.reload();
  await expect(reference).toHaveValue(privateReference);
  await expect(dividends).toHaveValue('1,234.56');
  await expect(gain).toHaveValue('0');
  await expect(unanswered).toHaveValue('');
  await expect(ordinary).toHaveValue('true');
  await dividends.fill('1234.57');
  await dividends.blur();
  await expect(ordinary).toHaveValue('');
  await ordinary.selectOption('true');
  await year.fill('2026');
  await expect(ordinary).toHaveValue('');
  await year.fill('2025');
  await ordinary.selectOption('true');
  const replacement = `${privateReference}-replacement`;
  await reference.fill(replacement);
  await expect(ordinary).toHaveValue('');
  await ordinary.selectOption('true');
  await method.selectOption('regular');
  await expect(ordinary).toHaveCount(0);
  await method.selectOption('annualized');
  await expect(ordinary).toHaveValue('');
  await expect(dividends).toHaveValue('1,234.57');
  await expect(gain).toHaveValue('0');
  await expect(unanswered).toHaveValue('');
  expect(requestBodies.join('\n')).not.toContain(privateReference);
  expect(requestBodies.join('\n')).not.toContain(taxpayerFacts2025.ssn);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
