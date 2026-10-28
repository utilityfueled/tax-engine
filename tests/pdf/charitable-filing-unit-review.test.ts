// Spec: spec/federal/charitable-filing-unit-history.yaml review-binding.
import { expect, it } from 'vitest';
import { calculateNonitemizedCharitableCarryover } from '@/engine/forms/nonitemized-charitable-carryover.js';
import { calculateCharitableCategoryUse } from '@/engine/forms/charitable-category-use.js';
import { d } from '@/utils/decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareCharitableReview, charitableReviewOriginalSourceInput, type PreparedCharitableReview } from '@/pdf/charitable-review-context.js';
import { PDFDocument } from 'pdf-lib';
import { buildCharitableFilingUnitReview, fillCharitableFilingUnitReview } from '@/pdf/mappings/2025/charitable-filing-unit-review.js';
import { fillScheduleA, SCHEDULE_A_FIELDS } from '@/pdf/fill-schedule-a.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { charitableFilingUnitFixture } from '../fixtures/charitable-filing-unit-history.js';
import { priorCharitableNolInput } from '../fixtures/charitable-prior-nol.js';

it('binds actual filing history and the complete calculation before template access', async () => {
  const input = charitableFilingUnitFixture(), result = calculateFederalTax(input), token = prepareCharitableReview(input);
  expect(result.scheduleA?.charitableTotal.toString()).toBe('6000');
  expect(charitableReviewOriginalSourceInput(redactReviewIdentifiers(input), result, token)).toEqual(input);
  const income = structuredClone(input); income.w2s[0].wages = '85001';
  await expect(fillScheduleA(income, result, 'missing.pdf', token)).rejects.toThrow(/charitable.*(source|stale|calculation)/i);
  const source = structuredClone(input); source.charitableCarryoverSources!.vintages![0].filingUnitOrigin!.separateComputations![0].originalExcess = '12001';
  await expect(fillScheduleA(source, result, 'missing.pdf', token)).rejects.toThrow(/charitable.*(source|stale)/i);
  const removed = structuredClone(input); removed.charitableCarryoverSources = undefined;
  await expect(fillScheduleA(removed, result, 'missing.pdf')).rejects.toThrow(/charitable.*(original|filing|source|history)/i);
  await expect(fillReturn(removed, result, { blankFormsDir: '/missing/templates', outputDir: '/missing/output' })).rejects.toThrow(/charitable.*(original|filing|source|history)/i);
  expect(() => charitableReviewOriginalSourceInput(input, { ...result, agi: result.agi.plus(1) }, token)).toThrow(/calculation|reconcile/i);
  expect(() => charitableReviewOriginalSourceInput(input, result, {} as PreparedCharitableReview)).toThrow(/original.*source/i);
});

it('retains original filing history through nonitemized public cash consumption', async () => {
  const input = charitableFilingUnitFixture(), sources = input.charitableCarryoverSources!, vintage = sources.vintages![0];
  input.taxpayer.taxYear = 2026; input.deductionElection = 'standard'; input.w2s[0].wages = '5000';
  sources.sourceTaxYear = 2026; vintage.category = 'cash_60'; vintage.medium = 'cash'; vintage.adjustedThroughTaxYear = 2025;
  vintage.history!.push({ taxYear: 2025, treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic2025 separate use',
    filingUnitUses: [{ returnSourceId: 'jane-2025', treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic2025 zero' }] });
  sources.filingUnitHistory!.returns!.push({ sourceId: 'jane-2026', taxYear: 2026, filingStatus: 'single', primaryPersonId: 'jane', sourceReference: 'Synthetic current return' });
  sources.filingUnitHistory!.currentReturnSourceId = 'jane-2026';
  const context = { contributionBase: d(5000), current: {
    cashPublic: d(0), noncashPublic: d(0), capitalGainPublic: d(0), cashPrivate: d(0), noncashPrivate: d(0), capitalGainPrivate: d(0),
  } };
  const original = JSON.stringify(input), result = calculateCharitableCategoryUse(input, context);
  expect(() => calculateNonitemizedCharitableCarryover(input, context)).toThrow(/floor.*prior|prior.*floor/i);
  expect(result.carryforwards[0].amount.toString()).toBe('3000');
  expect(result.detail[0].amountUsed.toString()).toBe('0');
  expect(result.lines.some(row => row.form === 'Charitable Filing History')).toBe(true);
  expect(result.detail[0].filingUnitSources?.[0].openingBalance).toEqual({ numerator: '6000', denominator: '1' });
  const zeroBase = structuredClone(input); zeroBase.w2s[0].wages = '0';
  const noFloor = calculateNonitemizedCharitableCarryover(zeroBase, { ...context, contributionBase: d('0') });
  expect(noFloor.carryforwards[0].amount.toString()).toBe('6000');
  expect(noFloor.totalDeduction.toString()).toBe('0');
  expect(noFloor.detail[0].filingUnitSources).toEqual(result.detail[0].filingUnitSources);
  expect(JSON.stringify(input)).toBe(original);
  expect(() => calculateFederalTax(input)).toThrow(/2026.*unavailable|2026.*incomplete/i);
});

it('renders original ownership ratios and physical prior deduction without identifiers', async () => {
  const input = charitableFilingUnitFixture(), original = JSON.stringify(input), result = calculateFederalTax(input), token = prepareCharitableReview(input);
  const rows = buildCharitableFilingUnitReview(redactReviewIdentifiers(input), result, token);
  const text = rows.join(' ');
  for (const value of ['Original contribution year: 2022', 'Original excess: $20000', 'Original separate excess: $12000', 'First separate allocation', 'Current opening: 6000 / 1', 'Selected charitable carryforward: $0']) expect(text).toContain(value);
  for (const privateValue of ['123-45-6789', '6789', 'original-joint-property', 'Synthetic2023', 'Jane Doe', 'Alex Roe']) expect(text).not.toContain(privateValue);
  const doc = await fillCharitableFilingUnitReview(redactReviewIdentifiers(input), result, token);
  expect((await PDFDocument.load(await doc.save())).getPageCount()).toBeGreaterThan(0);
  const schedule = await fillScheduleA(redactReviewIdentifiers(input), result, 'forms/blank/2025/f1040sa.pdf', token);
  const reopened = await PDFDocument.load(await schedule.save());
  expect(reopened.getForm().getTextField(SCHEDULE_A_FIELDS.line13).getText()).toBe('6000');
  expect(reopened.getForm().getTextField(SCHEDULE_A_FIELDS.ssn).getText()).toBeUndefined();
  expect(JSON.stringify(input)).toBe(original);
});

it('binds independent AMT-only filing history with an explicitly empty regular ledger', async () => {
  const input = priorCharitableNolInput({ regular: '0', alternative: '6000', category: 'noncash_50' });
  const loss = input.netOperatingLoss!, history = loss.alternativeTax!.charitableCarryoverHistory!;
  loss.vintages = []; loss.alternativeTax!.vintages = [];
  history.alternativeCarryoverSources = charitableFilingUnitFixture().charitableCarryoverSources;
  history.priorAlternativeCarryovers = [{ taxYear: 2022, category: 'noncash_50', amount: '6000', sourceReference: 'Synthetic independent AMT summary' }];
  const before = JSON.stringify(input), result = calculateFederalTax(input), token = prepareCharitableReview(input);
  expect(result.scheduleA?.charitableTotal.toString()).toBe('0');
  expect(result.netOperatingLoss?.priorCharitableAlternativeAdjustment?.amount.toString()).toBe('-6000');
  expect(result.form6251?.amti.toString()).toBe('94000');
  expect(buildCharitableFilingUnitReview(redactReviewIdentifiers(input), result, token).join(' ')).toContain('Alternative original filing-unit sources');
  expect(charitableReviewOriginalSourceInput(redactReviewIdentifiers(input), result, token)).toEqual(input);
  const removed = structuredClone(input); removed.netOperatingLoss!.alternativeTax!.charitableCarryoverHistory = undefined;
  await expect(fillReturn(removed, result, { blankFormsDir: '/missing/templates', outputDir: '/missing/output' })).rejects.toThrow(/charitable.*(original|filing|source|history)/i);
  const changed = structuredClone(input); changed.netOperatingLoss!.alternativeTax!.charitableCarryoverHistory!.alternativeCarryoverSources!.filingUnitHistory!.returns![0].sourceReference = 'Different actual filed return';
  await expect(fillScheduleA(changed, result, 'missing.pdf', token)).rejects.toThrow(/charitable.*(source|stale)/i);
  expect(JSON.stringify(input)).toBe(before);
});
