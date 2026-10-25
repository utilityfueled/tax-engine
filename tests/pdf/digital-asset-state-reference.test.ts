// Spec: spec/state/digital-asset-sources.yaml, review.
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillOhioReferenceForms } from '@/pdf/fill-oh-reference-forms.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { fillPAScheduleDReference } from '@/pdf/mappings/2025/fill-pa-schedule-d.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { actualDigitalAssetSource } from '../fixtures/digital-asset-sources.js';

it('renders original digital withholding once in the Ohio reference packet', async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], form1099DA: [{ ...actualDigitalAssetSource,
    sourceId: 'Private DA source', accountReference: 'Private DA account', sourceReference: 'Private purchase ledger',
    stateTaxReporting: 'single', state: 'OH', stateWithheld: '0.10' }] });
  const directory = await mkdtemp(join(tmpdir(), 'tax-oh-digital-reference-'));
  try {
    const packet = await fillOhioReferenceForms(input, calculateFederalTax(input), directory);
    const path = packet.filledForms.find(file => basename(file) === 'oh-schedule-of-withholding-reference.pdf');
    expect(path).toBeDefined(); if (!path) throw new Error('Missing actual DA withholding reference.');
    const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))', path], { encoding: 'utf8', timeout: 30000 });
    expect(text.match(/Line 5g: Ohio withholding from original 1099-DA statements/g)).toHaveLength(1);
    expect(text).toContain('Value: 0.1'); expect(text).toContain('REFERENCE SUMMARY ONLY');
    for (const value of ['Private DA source', 'Private DA account', 'Private purchase ledger']) expect(text).not.toContain(value);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('renders the actual Pennsylvania digital gain and disclosure in its reference record', async () => {
  const source = structuredClone(actualDigitalAssetSource);
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], form1099DA: [{ ...source,
    transactions: source.transactions.map(row => ({ ...row, paCostBasis: '80.24', paBasisSourceReference: 'Private Pennsylvania basis record', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true })) }] });
  const directory = await mkdtemp(join(tmpdir(), 'tax-pa-digital-reference-'));
  try {
    const path = await fillPAScheduleDReference(calculatePAReturn(input).scheduleD, directory);
    const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))', path], { encoding: 'utf8', timeout: 30000 });
    expect(text).toContain('Digital asset question'); expect(text).toContain('Yes'); expect(text).toContain('$20');
    expect(text).toContain('REFERENCE SUMMARY ONLY'); expect(text).not.toContain('Private Pennsylvania basis record');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
