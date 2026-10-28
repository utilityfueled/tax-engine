// Spec: spec/federal/cod-ordinary-attribute-sources.yaml, context/10a-basis.
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982.js';
import { codNolReviewOriginalSourceInput, prepareCodNolReview, type PreparedCodNolReview } from '@/pdf/cod-nol-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { buildForm1116ReferenceSummary } from '@/pdf/fill-form-1116.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { d } from '@/utils/decimal.js';
import { actualCodAttributesInput, actualCodBasisCapInput, codAttributeRecord, codPropertyRecord } from '../fixtures/cod-ordinary-attributes.js';
import { foreignTaxDirectCreditFixture } from '../fixtures/foreign-tax-direct-credit.js';
import { foreignTaxOrdinaryCreditFixture } from '../fixtures/foreign-tax-ordinary-credit.js';
import { carryFixture } from '../fixtures/foreign-tax-carryover.js';

it('keeps all actual property rows above the review footer across page boundaries', async () => {
  const input = actualCodBasisCapInput();
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.property.immediatelyAfter.properties = Array.from({ length: 10 }, (_, index) => codPropertyRecord(`actual-property-${index + 1}`, '550'));
    ledger.property.followingYear.properties = structuredClone(ledger.property.immediatelyAfter.properties);
  }
  const result = calculateFederalTax(input), directory = await mkdtemp(join(tmpdir(), 'cod-properties-page-'));
  expect(result.codAttributeReduction?.regular.property.properties.map(row => row.remainingBasis.toFixed())).toEqual(Array(10).fill('540'));
  try {
    const files = (await fillReturn(redactReviewIdentifiers(input), result, {
      outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: prepareCodNolReview(input),
    })).filledForms;
    const path = files.find(file => file.endsWith('f982-reference-filled.pdf'))!;
    const pages: Array<{ text: string; body: Array<{ text: string; y: number }> }> = JSON.parse(execFileSync(
      process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
import json,sys
from pypdf import PdfReader
pages=[]
for page in PdfReader(sys.argv[1]).pages:
    body=[]
    def visit(text,cm,tm,font,size):
        if text.strip() and text.strip()!=sys.argv[2]:
            body.append({"text":text.strip(),"y":tm[5]})
    text=page.extract_text(visitor_text=visit)
    pages.append({"text":text,"body":body})
print(json.dumps(pages))
`, path, REVIEW_PDF_NOTICE], { encoding: 'utf8', timeout: 5000 }));
    for (const page of pages) {
      expect(page.text.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      for (const line of page.body) {
        expect(line.y, line.text).toBeGreaterThanOrEqual(40);
        expect(line.y, line.text).toBeLessThanOrEqual(752);
      }
    }
    const text = pages.map(page => page.text).join(' ').replace(/\s+/g, ' ');
    for (const system of ['Regular', 'Alternative']) for (let index = 1; index <= 10; index++) {
      expect(text).toContain(`${system} property ${index} basis reduction: 10`);
      expect(text).toContain(`${system} property ${index} remaining basis: 540`);
    }
    expect(text).toContain('Regular unreduced excluded debt: 1400');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function checkForeignCreditPacket(method: 'direct' | 'ordinary', excluded = '300') {
    const input = actualCodAttributesInput(excluded);
    input.w2s[0]!.wages = '0'; input.w2s[0]!.federalWithheld = '0';
    const foreign = method === 'direct' ? foreignTaxDirectCreditFixture() : foreignTaxOrdinaryCreditFixture();
    const annual = foreign.foreignTaxElection!, facts = annual.creditWithoutForm1116 ?? annual.creditWithForm1116!;
    annual.noUnusedCreditCarryoversConfirmed = false;
    facts.carryovers = [{ originTaxYear: 2024, category: 'passive', amount: '600', sourceReference: 'Actual original regular foreign carry' }];
    facts.amtCarryovers = [{ originTaxYear: 2024, category: 'passive', amount: '300', sourceReference: 'Actual original alternative foreign carry' }];
    if (annual.creditWithForm1116) {
      foreign.form1099Int[0]!.interestIncome = '10000';
      annual.creditWithForm1116.incomeSources![0]!.reportedIncome = '10000';
      annual.creditWithForm1116.incomeSources![0]!.foreignIncome = '10000';
      for (const key of ['regularCarryback', 'amtCarryback'] as const) annual.creditWithForm1116[key] = {
        taxYear: 2024, election: 'form1116_credit', sourceFactsConfirmed: true, allPriorUseIncludedConfirmed: true,
        sourceReference: 'Actual prior return with no unused foreign-credit limitation', limitation: '0', currentTaxes: '0', priorCarryoversUsed: '0',
      };
    }
    input.form1099Int = foreign.form1099Int; input.foreignTaxElection = annual;
    for (const [ledger, amount] of [[input.form982AttributeSources.regular, '600'], [input.form982AttributeSources.alternativeTax, '300']] as const) {
      ledger.records = [{ ...codAttributeRecord('foreign_tax_credit', amount), foreignCategory: 'passive' }];
      if (method === 'ordinary') ledger.records.push({ ...codAttributeRecord('foreign_tax_credit', '900'),
        sourceId: 'foreign-current', originTaxYear: 2025, originalAmountMeaning: 'current_year_before_use', foreignCategory: 'passive' });
    }
    if (method === 'ordinary') {
      expect(() => calculateFederalTax(input)).toThrow(/NOL with general Form1116.*foreign-source loss allocation/i);
      return;
    }
    const result = calculateFederalTax(input), context = prepareCodNolReview(input);
    expect(result.foreignTaxCredit.toFixed()).toBe('0');
    expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed(6)).toBe(excluded === '1' ? '599.666667' : '500.000000');
    expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.map(row => row.amount.toFixed(6)))
      .toEqual(excluded === '1' ? ['299.666667'] : ['200.000000']);
    expect(result.codAttributeReduction!.regular.records[0]!.reductionRatio.amount.toFixed()).toBe(excluded);
    expect(result.codAttributeReduction!.regular.records[0]!.reductionRatio.denominator?.toFixed()).toBe('3');
    expect(() => buildForm1116ReferenceSummary(result)).not.toThrow();
    const summary = JSON.stringify(buildForm1116ReferenceSummary(result));
    expect(summary).toContain('after COD');
    for (const change of ['missing', 'duplicate', 'closing'] as const) {
      const modified = calculateFederalTax(input);
      if (change === 'missing') modified.codAttributeReduction = undefined;
      if (change === 'duplicate') modified.codAttributeReduction!.regular.records.push(modified.codAttributeReduction!.regular.records[0]!);
      if (change === 'closing') modified.codAttributeReduction!.regular.records[0]!.remaining = d('501');
      expect(() => buildForm1116ReferenceSummary(modified)).toThrow(/COD|credit|carry|balance/i);
    }
    const directory = await mkdtemp(join(tmpdir(), 'cod-foreign-packet-'));
    try {
      const files = (await fillReturn(redactReviewIdentifiers(input), result, {
        outputDir: directory, blankFormsDir: 'forms/blank', codNolReview: context,
      })).filledForms;
      const reference = files.find(file => file.endsWith('f1116-reference-filled.pdf'));
      expect(reference).toBeDefined(); expect((await readFile(reference!)).length).toBeGreaterThan(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
}

it('reconciles direct foreign-credit packets with independent after-tax COD closings', async () => {
  await checkForeignCreditPacket('direct');
});

it('preserves exact one-third credit reduction through the saved foreign reference', async () => {
  await checkForeignCreditPacket('direct', '1');
});

it('retains the ordinary foreign-credit and NOL source-allocation boundary', async () => {
  await checkForeignCreditPacket('ordinary');
});

it('retains the deduction-year foreign carry and NOL hypothetical-source boundary', () => {
  const input = actualCodAttributesInput('300');
  input.w2s[0]!.wages = '0'; input.w2s[0]!.federalWithheld = '0';
  const foreign = carryFixture();
  const annual = foreign.foreignTaxElection!;
  annual.deductionYearCarryover!.carryovers = [{ originTaxYear: 2024, category: 'passive', amount: '600', sourceReference: 'Actual original regular foreign carry' }];
  input.form1099Int = foreign.form1099Int; input.foreignTaxElection = annual;
  input.deductions = foreign.deductions;
  input.form982AttributeSources.regular.records = [{ ...codAttributeRecord('foreign_tax_credit', '600'), foreignCategory: 'passive' }];
  expect(() => calculateFederalTax(input)).toThrow(/NOL and foreign deduction-year carry.*hypothetical worksheet/i);
});

it('shows conserved actual later attributes without private original labels', () => {
  const input = actualCodBasisCapInput(), result = calculateFederalTax(input);
  const summary = buildForm982ReferenceSummary(result);
  expect(summary.reductions).toEqual(expect.arrayContaining([expect.objectContaining({ line: '10a', value: '100' })]));
  expect(summary.totals).toContainEqual({ label: 'Regular unreduced excluded debt', value: '1400' });
  expect(summary.totals).toContainEqual({ label: 'Regular remaining property basis', value: '5400' });
  expect(summary.totals).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Regular property 1 remaining basis' })]));
  for (const secret of ['furniture', 'jewelry', 'Fictional', '6789', 'sourceReference']) expect(JSON.stringify(summary)).not.toContain(secret);
});

it('replays original attributes and rejects stale output contexts before I/O', async () => {
  const input = actualCodAttributesInput();
  input.priorYear = { shortTermCapitalLoss: '-10000', longTermCapitalLoss: '0' };
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.records = [codAttributeRecord('capital_loss', '10000', '3000')];
  }
  const result = calculateFederalTax(input), token = prepareCodNolReview(input), redacted = redactReviewIdentifiers(input);
  expect(codNolReviewOriginalSourceInput(redacted, result, token)).toEqual(input);
  const changedSource = structuredClone(redacted);
  changedSource.form982AttributeSources.regular.records[0]!.sourceReference = 'Changed same-value original';
  expect(() => codNolReviewOriginalSourceInput(changedSource, result, token)).toThrow(/stale|source/i);
  expect(() => codNolReviewOriginalSourceInput(redacted, result, {} as PreparedCodNolReview)).toThrow(/context/i);
  for (const edit of [
    (value: typeof result) => { value.codAttributeReduction!.regular.records[0]!.remaining = d('2001'); },
    (value: typeof result) => { value.carryforwards.shortTermCapitalLoss = d('-2001'); },
    (value: typeof result) => { value.codAttributeReduction = undefined; },
  ]) {
    const changed = calculateFederalTax(input); edit(changed);
    expect(() => codNolReviewOriginalSourceInput(redacted, changed, token)).toThrow(/reconcile/i);
  }
  const directory = await mkdtemp(join(tmpdir(), 'cod-attributes-before-io-'));
  try {
    result.codAttributeReduction!.alternativeTax.unreducedExclusion = d('1');
    await expect(fillReturn(redacted, result, { outputDir: directory, blankFormsDir: 'forms/blank/2025', codNolReview: token })).rejects.toThrow(/reconcile/i);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
