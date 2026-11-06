// Spec: spec/federal/eic-claimant-review.yaml; literal official2025 widget.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm1040 } from '@/pdf/fill-form-1040.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { fictionalEmptyEicHistory } from '../fixtures/eic-disallowance.js';

const box = 'topmostSubform[0].Page2[0].c2_13[0]';
const blank = 'forms/blank/2025/f1040.pdf';
function source(otherChild: boolean) {
  const input = TaxYearInputSchema.parse({ ...structuredClone(simpleW2Fixture),
    taxpayer: { ...simpleW2Fixture.taxpayer,
      primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }],
    eic: { claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'Actual Rule10 relationship and other-person filing records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: otherChild,
      primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } } } });
  if (!input.eic) throw new Error('Missing fictional claimant source');
  input.eic.disallowanceSources = fictionalEmptyEicHistory(input.taxpayer);
  return input;
}

it('preserves actual Rule10 sources in the saved official checkbox', async () => {
  const trueInput = source(true);
  trueInput.taxpayer.primary.dateOfBirth = '2007-01-15';
  trueInput.taxpayer.dependents = [{ firstName: 'Synthetic', lastName: 'Child', ssn: '333-44-5555',
    dateOfBirth: '2023-01-15', relationship: 'child', monthsLivedWithYou: 12,
    qualifiesForEIC: true, qualifiesForCTC: false, qualifiesForODC: false }];
  if (!trueInput.eic?.claimantEligibility) throw new Error('Missing synthetic claimant source');
  delete trueInput.eic.claimantEligibility.primaryChildless;
  const result = calculateFederalTax(trueInput);
  expect(result.earnedIncomeCredit.toFixed()).toBe('0');
  const rendering = structuredClone(trueInput);
  rendering.taxpayer.primary.ssn = 'XXX-XX-XXXX';
  for (const child of rendering.taxpayer.dependents) child.ssn = 'XXX-XX-XXXX';
  const saved = await PDFDocument.load(await (await fillForm1040(rendering, result, blank)).save());
  expect(trueInput.taxpayer.primary.ssn).toBe(simpleW2Fixture.taxpayer.primary.ssn);
  const printedValues = saved.getForm().getFields().map(field => field.acroField.dict.get(PDFName.of('V'))?.toString()).join(' ');
  expect(printedValues).not.toContain('123456789');
  expect(printedValues).not.toContain('333445555');
  const checked = saved.getForm().getCheckBox(box);
  expect(checked.isChecked()).toBe(true);
  // Independently identified neighboring27b clergy checkbox must stay empty.
  expect(saved.getForm().getCheckBox('topmostSubform[0].Page2[0].c2_12[0]').isChecked()).toBe(false);
  for (const widget of checked.acroField.getWidgets()) {
    const state = widget.getAppearanceState();
    expect(state?.toString()).toBe(checked.acroField.getValue().toString());
    const normal = widget.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFDict);
    expect(state && normal.get(state)).toBeDefined();
  }
  const exception = source(false);
  const facts = exception.eic?.claimantEligibility;
  if (!facts?.primaryChildless) throw new Error('Missing synthetic claimant source');
  // Completed Rule10 answer is false after the known nonfiling/refund-only
  // exception; an underlying dependent relationship does not set this checkbox.
  exception.standardDeductionFacts = { ...exception.standardDeductionFacts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: '10000' };
  facts.primaryChildless.dependentException = { sourceReference: 'Actual potential-claimant no-filing obligation and withholding-only return',
    allPotentialClaimantsNotRequiredToFile: true, allPotentialClaimantsDidNotFileOrRefundOnly: true };
  const exceptionResult = calculateFederalTax(exception);
  expect(exceptionResult.earnedIncomeCredit.toFixed()).toBe('649');
  const exceptionSaved = await PDFDocument.load(await (await fillForm1040(exception, exceptionResult, blank)).save());
  expect(exceptionSaved.getForm().getCheckBox(box).isChecked()).toBe(false);
  const unknown = source(false); delete unknown.eic;
  const unknownSaved = await PDFDocument.load(await (await fillForm1040(unknown, calculateFederalTax(unknown), blank)).save());
  expect(unknownSaved.getForm().getCheckBox(box).isChecked()).toBe(false);
});

it('rejects conflicting claimant sources and a stale positive credit before PDF access', async () => {
  const input = source(true); const result = calculateFederalTax(input);
  result.earnedIncomeCredit = new Decimal(649);
  await expect(fillForm1040(input, result, '/missing/never-read.pdf')).rejects.toThrow(/qualifying.child.*positive.*EIC|Rule10.*credit/i);
  const contradiction = source(true);
  const facts = contradiction.eic?.claimantEligibility;
  if (!facts?.primaryChildless) throw new Error('Missing synthetic claimant source');
  facts.primaryChildless.qualifyingChildOfAnotherTaxpayer = false;
  await expect(fillForm1040(contradiction, calculateFederalTax(source(true)), '/missing/never-read.pdf')).rejects.toThrow(/qualifying.child.*conflict/i);
});

it('keeps the2026 review gate closed', async () => {
  const input = source(true); const result = calculateFederalTax(input);
  input.taxpayer.taxYear = 2026; result.taxYear = 2026;
  await expect(fillForm1040(input, result, '/missing/never-read.pdf')).rejects.toThrow(/2026|year/i);
});
