// Spec: spec/federal/marketplace-other-return-cash.yaml, review.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206, FORM_7206_FIELDS as H } from '@/pdf/fill-form-7206';
import { savePdf } from '@/pdf/pdf-utils';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { d } from '@/utils/decimal';
import { attachOutsideCashSources, positiveOtherReturnCashInput } from '../fixtures/marketplace-other-return-cash';

it('prints gross cash refunds and other tax separately and rejects stale original context', async () => {
  const { input } = positiveOtherReturnCashInput('cash');
  for (const payment of input.form7206!.plans![0].payments!) {
    payment.ownerOrBusinessPaid = '550.01'; payment.otherPersonPaid = '1324.99';
    payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '100.01';
  }
  const cash = attachOutsideCashSources(input, '3000', '25.02');
  cash.otherReturnTaxPayments.push({ sourceId: 'other-tax', datePaid: '2026-04-15', amount: '7000', sourceReference: 'Actual Treasury tax payment, not insurer cash' });
  const before = structuredClone(input), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-other-return-cash-'));
  try {
    const doc = await fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(result), 'forms/blank/2025/f7206.pdf', 'scheduleC', 'primary', undefined, prepared);
    const path = join(dir, 'health.pdf'); await savePdf(doc, path);
    const parsed: { pages: string[]; fields: Record<string,string> } = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader;import json,sys;r=PdfReader(sys.argv[1]);print(json.dumps({"pages":[p.extract_text() or "" for p in r.pages],"fields":{k:str(v.get("/V","")) for k,v in (r.get_fields() or {}).items()}}))', path], { encoding: 'utf8', timeout: 5000 }));
    const text = parsed.pages.join(' ').replace(/\s+/g, ' ');
    expect([parsed.fields[H.line1],parsed.fields[H.line14]]).toEqual(['6300','6300']);
    for (const literal of ['Completed other-return Form8962 line24 $3000', 'gross insurer cash $100.01', 'actual reimbursements $25.02', 'net insurer cash $74.99',
      'Other-return tax payment other-tax', '$7000', 'not included in deductible insurer cash', 'Actual refund bank entry premium-1',
      'all advances attributable to this return are zero']) expect(text).toContain(literal);
    for (const page of parsed.pages) { expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321|234.?56.?7890/); }
    for (const mutation of ['refund-source', 'credit', 'tax-source', 'cash-date'] as const) {
      const stale = structuredClone(input), record = stale.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0];
      if (mutation === 'refund-source') record.cashPaymentSources!.premiumPayments![0].reimbursements![0].sourceReference += ' revised';
      if (mutation === 'credit') record.form8962Line24 = '3000.01';
      if (mutation === 'tax-source') record.cashPaymentSources!.otherReturnTaxPayments![0].sourceReference += ' revised';
      if (mutation === 'cash-date') record.cashPaymentSources!.premiumPayments![0].datePaid = '2025-01-02';
      await expect(fillForm7206(redactReviewIdentifiers(stale), redactReviewIdentifiers(result), join(dir,'missing','template.pdf'), 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/stale|conflict/i);
    }
    const tampered = calculateFederalTax(input); tampered.form7206!.coverageFamilyAllocations![0].outsideNetCash = d('75');
    await expect(fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(tampered), join(dir,'missing','template.pdf'), 'scheduleC', 'primary', undefined, prepared)).rejects.toThrow(/reconcile|conflict/i);
    expect(existsSync(join(dir,'missing'))).toBe(false); expect(input).toEqual(before);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

function ordinaryHalfInput(belowHalf: boolean) {
  const { input, cashSources } = positiveOtherReturnCashInput('ordinary');
  for (const [index, receipt] of cashSources.premiumPayments.entries()) receipt.reimbursements = [{
    sourceId: `physical-refund-${index}`, dateReceived: '2025-12-31',
    amount: index === 0 ? '99.5' : receipt.cashPaidToInsurer!, sourceReference: 'Actual insurer reimbursement by original receipt',
  }];
  if (belowHalf) cashSources.premiumPayments[0].reimbursements.push({
    sourceId: 'physical-small-refund', dateReceived: '2025-12-31', amount: '0.' + '0'.repeat(39) + '1',
    sourceReference: 'Actual separate small insurer reimbursement',
  });
  return input;
}

it('rounds physical nonspecified fields from exact annual source ratios', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tax-other-cash-physical-precision-'));
  try {
    for (const belowHalf of [true, false]) {
      const input = ordinaryHalfInput(belowHalf);
      const before = structuredClone(input), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(belowHalf ? '3000' : '3001');
      const doc = await fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(result), 'forms/blank/2025/f7206.pdf', 'scheduleC', 'primary', undefined, prepared);
      const path = join(dir, belowHalf ? 'below-half.pdf' : 'exact-half.pdf'); await savePdf(doc, path);
      const fields: Record<string,string> = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader;import json,sys;r=PdfReader(sys.argv[1]);print(json.dumps({k:str(v.get("/V","")) for k,v in (r.get_fields() or {}).items()}))', path], { encoding: 'utf8', timeout: 5000 }));
      const expected = belowHalf ? '5000' : '5001';
      expect([fields[H.line1], fields[H.line3], fields[H.line14]]).toEqual([expected, expected, expected]);
      expect(result.form7206!.businesses[0].medicalPremiums.toFixed()).toBe(belowHalf ? '5000.4' + '9'.repeat(39) : '5000.5');
      expect(fields[H.ssn]).toBe(''); expect(input).toEqual(before);
    }
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

it('preserves the actual business minimum beside exact nonspecified source rounding', async () => {
  const input = ordinaryHalfInput(true); input.scheduleC!.grossReceipts = '5000';
  const before = structuredClone(input), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4646');
  const doc = await fillForm7206(redactReviewIdentifiers(input), redactReviewIdentifiers(result), 'forms/blank/2025/f7206.pdf', 'scheduleC', 'primary', undefined, prepared);
  const dir = mkdtempSync(join(tmpdir(), 'tax-other-cash-binding-minimum-'));
  try {
    const path = join(dir, 'binding.pdf'); await savePdf(doc, path);
    const fields: Record<string,string> = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader;import json,sys;r=PdfReader(sys.argv[1]);print(json.dumps({k:str(v.get("/V","")) for k,v in (r.get_fields() or {}).items()}))', path], { encoding: 'utf8', timeout: 5000 }));
    expect([fields[H.line1], fields[H.line3], fields[H.line13], fields[H.line14]]).toEqual(['5000','5000','4646','4646']);
    expect(input).toEqual(before);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
