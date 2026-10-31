// Spec: spec/federal/form-1099-da-sources.yaml correction-boundaries.
import { expect, it } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildDigitalAssetInputs } from '@/lib/guided-digital-asset-facts';
import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { fillReturn } from '@/pdf/fill-return';
import { actualDigitalAssetSource } from '../fixtures/digital-asset-sources';
import { actualGuidedDigitalAsset } from '../fixtures/guided-digital-asset-sources';
import { simpleW2Fixture } from '../fixtures/simple-w2';

const personal = { firstName: 'Jane', lastName: 'Doe' } as PersonalInfoData;

it('passes both guided correction answers without defaulting them', () => {
  const entry = actualGuidedDigitalAsset();
  Object.assign(entry.transactions![0]!, { reportedCostBasis: '120', reportedCostBasisBlank: false, basisCorrectionConfirmed: true, sellingExpenses: '5', sellingCostsNotInProceedsConfirmed: true });
  const row = buildDigitalAssetInputs([entry], 'single', 2025, personal, [])![0]!.transactions[0]!;
  expect(row).toMatchObject({ basisCorrectionConfirmed: true, sellingCostsNotInProceedsConfirmed: true, sellingExpenses: '5' });
  Object.assign(entry.transactions![0]!, { basisCorrectionConfirmed: null, sellingCostsNotInProceedsConfirmed: null });
  expect(() => buildDigitalAssetInputs([entry], 'single', 2025, personal, [])).toThrow(/basis correction|Box 1f/);
});

it('prints a zero column g for a code B row', async () => {
  const form = structuredClone(actualDigitalAssetSource);
  Object.assign(form.transactions[0]!, { reportedCostBasis: '95', basisCorrectionConfirmed: true });
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099DA: [form] }), directory = await mkdtemp(join(tmpdir(), 'da-code-b-'));
  try {
    const files = (await fillReturn(input, calculateFederalTax(input), { outputDir: directory, blankFormsDir: 'forms/blank' })).filledForms;
    const fields = (await PDFDocument.load(await readFile(files.find(file => file.endsWith('f8949-filled.pdf'))!))).getForm().getFields()
      .map(field => { try { return (field as unknown as { getText: () => string }).getText(); } catch { return ''; } });
    expect(fields).toContain('B'); expect(fields).toContain('-0-');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
