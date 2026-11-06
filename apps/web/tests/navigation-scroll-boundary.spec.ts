// Spec: spec/federal/navigation-scroll-boundary.yaml; actual app, native controls.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { guidedSchoolDistrictFixture } from '../../../tests/fixtures/guided-oh-school-district-complete';
import { buildSectionRoute } from '../src/lib/guided-interview-flow';

function nonemptySource(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Actual nonempty synthetic privacy marker required');
  return value;
}
function provenanceMarkers(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(provenanceMarkers);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    /^(sourceReference|sourceId|originalId|payrollId)$/i.test(key)
      ? [nonemptySource(item)] : provenanceMarkers(item));
}
function control(page: Page, label: string) {
  return page.locator('label').getByText(label, { exact: true }).locator('..').locator('input,select');
}
async function geometry(target: Locator) {
  return target.evaluate(node => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    if (!nav) throw new Error('Actual navigation is required');
    const rect = node.getBoundingClientRect(), header = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, navBottom: header.bottom, navHeight: header.height,
      viewportHeight: innerHeight, viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
      uncovered: hit === node || !!hit && node.contains(hit), focused: document.activeElement === node };
  });
}
async function expectClear(target: Locator) {
  await expect.poll(async () => {
    const actual = await geometry(target);
    return actual.top >= actual.navBottom + 4 && actual.bottom <= actual.viewportHeight && actual.uncovered;
  }).toBe(true);
  const actual = await geometry(target);
  expect(actual.documentWidth).toBeLessThanOrEqual(actual.viewportWidth);
  return actual;
}
async function saved(page: Page, id: string) {
  return page.evaluate(id => localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`), id);
}
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Native navigation boundary at ${viewport.width}px`, () => {
    test('keeps actual guided controls below navigation across scroll focus and resize', async ({ page }, info) => {
      await page.setViewportSize(viewport);
      const pageErrors: string[] = [], consoleErrors: string[] = [], requests: Array<{ url: string; body: string }> = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      if (!id || id === 'new') throw new Error('Distinct local synthetic workspace required');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = structuredClone(guidedSchoolDistrictFixture().state);
      state.sectionData['state-return'] = { stateEstimatedPayments: [], additionalStateWithholding: '' };
      const person = state.sectionData['personal-info'], employer = state.sectionData['income-w2']?.entries[0];
      const ssn = nonemptySource(person?.ssn), employerEin = nonemptySource(employer?.employerEin);
      const provenance = provenanceMarkers(state);
      expect(provenance.length).toBeGreaterThan(0);
      const privateMarkers = [...new Set([ssn, ssn.replace(/\D/g, ''),
        nonemptySource(person?.addressLine1), nonemptySource(employer?.employerName),
        employerEin, employerEin.replace(/\D/g, ''), ...provenance])];
      for (const marker of privateMarkers) expect(marker.trim().length).toBeGreaterThan(0);
      const route = buildSectionRoute(state.segmentation), index = route.findIndex(section => section.id === 'state-return');
      expect(index).toBeGreaterThanOrEqual(0);
      state.phase = 'interview'; state.currentSectionIndex = index;
      state.completedSections = route.slice(0, index).map(section => section.id);
      // Sole initial seed contains unrelated fictional federal facts, no Ohio roots.
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      await page.getByRole('button', { name: 'Add Ohio residency source facts', exact: true }).click();
      await page.getByRole('button', { name: 'Add primary owner domicile source', exact: true }).click();
      const year = control(page, 'Ohio residency source year'), reference = control(page, 'Ohio residency source reference');
      await expect(year).toHaveCount(1); await expect(reference).toHaveCount(1);
      const initial = await saved(page, id);
      await year.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await info.attach('initial-scroll-geometry', { body: JSON.stringify(await geometry(year)), contentType: 'application/json' });
      await expectClear(year);
      await year.focus(); await page.keyboard.press('Tab'); await expect(reference).toBeFocused();
      await expectClear(reference);
      await reference.click(); await expect(reference).toBeFocused();
      const alternate = viewport.width === 1280 ? { width: 390, height: 844 } : { width: 1280, height: 900 };
      await page.setViewportSize(alternate);
      await year.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await expectClear(year);
      await year.focus(); await page.keyboard.press('Tab'); await expect(reference).toBeFocused();
      await expectClear(reference); await reference.click();
      await info.attach('resized-scroll-geometry', { body: JSON.stringify(await geometry(reference)), contentType: 'application/json' });
      expect(await saved(page, id)).toBe(initial);
      expect(pageErrors).toEqual([]); expect(consoleErrors).toEqual([]);
      for (const request of requests) {
        expect(request.url).not.toMatch(/thefinder\.tax\.ohio\.gov|api\.stripe\.com|api\.openai\.com/i);
        for (const secret of privateMarkers) {
          expect(request.url + '\n' + request.body).not.toContain(secret);
          expect(request.url + '\n' + request.body).not.toContain(encodeURIComponent(secret));
        }
      }
    });
  });
}
