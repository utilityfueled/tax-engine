// Spec: spec/federal/cod-ordinary-attribute-sources.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualCodAttributesInput, actualCodBasisCapInput, codAttributeRecord, codPropertyRecord } from '../fixtures/cod-ordinary-attributes.js';
import { actualCodNolInput } from '../fixtures/cod-nol.js';
import { foreignTaxDirectCreditFixture } from '../fixtures/foreign-tax-direct-credit.js';
import { TaxYearInputSchema } from '@/models/inputs.js';

it('rejects missing later sources instead of claiming exhausted attributes', () => {
  const input = actualCodAttributesInput();
  const legacy = { ...input, form982AttributeSources: undefined, form982NolSources: undefined, netOperatingLoss: undefined };
  expect(() => calculateFederalTax(legacy)).toThrow(/COD.*actual.*attribute|COD.*complete.*source/i);
});

it('reduces the actual sole capital source and restores both negative closing signs', () => {
  const input = actualCodAttributesInput();
  input.priorYear = { shortTermCapitalLoss: '-10000', longTermCapitalLoss: '0' };
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.records = [codAttributeRecord('capital_loss', '10000', '3000')];
  }
  const original = JSON.stringify(input);
  const baseline = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined,
    form982NolSources: undefined, form982AttributeSources: undefined });
  const result = calculateFederalTax(input);
  expect(result.totalTax.eq(baseline.totalTax)).toBe(true);
  expect(result.carryforwards.capitalLoss.toFixed()).toBe('-2000');
  expect(result.carryforwards.shortTermCapitalLoss.toFixed()).toBe('-2000');
  expect(result.carryforwards.longTermCapitalLoss.toFixed()).toBe('0');
  expect(result.codAttributeReduction?.regular.records[0]?.attributeReduction.toFixed()).toBe('5000');
  expect(result.codAttributeReduction?.regular.unreducedExclusion.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(original);
});

it('uses the actual immediately-after cap and next-year bases separately', () => {
  const input = actualCodBasisCapInput();
  const result = calculateFederalTax(input), ordinary = result.codAttributeReduction?.regular;
  expect(ordinary?.property.basisCap.toFixed()).toBe('100');
  expect(ordinary?.property.attributeReduction.toFixed()).toBe('100');
  expect(ordinary?.property.remainingBasis.toFixed()).toBe('5400');
  expect(ordinary?.unreducedExclusion.toFixed()).toBe('1400');
  expect(ordinary?.property.properties.map(row => row.attributeReduction.toDecimalPlaces(0).toFixed())).toEqual(['91', '9']);
});

it('reconciles the sole passive activity closing with its reduced aggregate', () => {
  const input = actualCodAttributesInput();
  input.priorYear = { suspendedPassiveLosses: [{ partnershipName: 'Fictional retained passive activity', amount: '10000' }] };
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.records = [codAttributeRecord('passive_loss', '10000')];
  }
  const result = calculateFederalTax(input);
  expect(result.codAttributeReduction?.regular.records[0]?.attributeReduction.toFixed()).toBe('5000');
  expect(result.carryforwards.suspendedPassiveLosses.map(row => [row.partnershipName, row.amount.toFixed()]))
    .toEqual([['Fictional retained passive activity', '5000']]);
});

it('requires actual alternative records and exact canonical current use', () => {
  const input = actualCodAttributesInput();
  input.priorYear = { shortTermCapitalLoss: '-10000', longTermCapitalLoss: '0' };
  input.form982AttributeSources.regular.records = [codAttributeRecord('capital_loss', '10000', '2999')];
  input.form982AttributeSources.alternativeTax.records = [codAttributeRecord('capital_loss', '10000', '3000')];
  expect(() => calculateFederalTax(input)).toThrow(/COD.*capital.*reconcile|COD.*current.*use/i);
  input.form982AttributeSources.regular.records[0]!.currentYearUse = '3000';
  const missing = { ...input, form982AttributeSources: { ...input.form982AttributeSources, alternativeTax: undefined } };
  expect(() => calculateFederalTax(missing)).toThrow(/COD.*alternative.*source/i);
});

it('uses one actual shared credit source only in the complete equal-vector composition', () => {
  const input = actualCodAttributesInput('300');
  input.w2s[0]!.wages = '0'; input.w2s[0]!.federalWithheld = '0';
  input.priorYear = { generalBusinessCreditCarryforward: '3000' };
  input.form982AttributeSources.regular.records = [codAttributeRecord('general_business_credit', '3000')];
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.carryforwards.generalBusinessCredit.toFixed()).toBe('2900');
  expect(result.codAttributeReduction?.regular.records[0]?.incomeApplied.toFixed()).toBe('300');
  expect(result.codAttributeReduction?.alternativeTax.records[0]?.remaining.toFixed()).toBe('2900');
  expect(JSON.stringify(input)).toBe(before);
  // Same resulting shared credit is not evidence for a different AMTI chain.
  input.form982AttributeSources.alternativeTax.property.immediatelyAfter.money = '1';
  expect(() => calculateFederalTax(input)).toThrow(/COD.*shared.*vector|COD.*credit.*composition/i);
  input.form982AttributeSources.alternativeTax.property.immediatelyAfter.money = '0';
  input.form982AttributeSources.alternativeTax.records = [codAttributeRecord('general_business_credit', '3000')];
  expect(() => calculateFederalTax(input)).toThrow(/COD.*shared.*once|COD.*second.*credit/i);
  input.form982AttributeSources.alternativeTax.records = [];
  input.netOperatingLoss = actualCodNolInput().netOperatingLoss;
  input.form982AttributeSources.alternativeTax.property.immediatelyAfter.properties = [codPropertyRecord('actual-alternative-basis', '100')];
  input.form982AttributeSources.alternativeTax.property.followingYear.properties = [codPropertyRecord('actual-alternative-basis', '100')];
  const noRemaining = calculateFederalTax(input);
  expect(noRemaining.codNolReduction?.regular?.reduction.toFixed()).toBe('300');
  expect(noRemaining.codNolReduction?.alternativeTax?.reduction.toFixed()).toBe('300');
  expect(noRemaining.carryforwards.generalBusinessCredit.toFixed()).toBe('3000');
});

it('does not infer current disposition tax from an inventory reference', () => {
  const input = actualCodAttributesInput('50');
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.property.immediatelyAfter.properties = [codPropertyRecord('sold-chair', '100')];
    ledger.property.followingYear.dispositions = [{ propertyId: 'sold-chair', disposedDate: '2025-11-01',
      sourceReference: 'Actual subsequent disposition document', sourceFactsConfirmed: true }];
  }
  expect(() => calculateFederalTax(input)).toThrow(/COD.*disposition.*current|COD.*current.*disposition/i);
});

it('retains actual minimum passive and independent foreign credit closings', () => {
  const source = actualCodAttributesInput('300');
  source.w2s[0]!.wages = '0'; source.w2s[0]!.federalWithheld = '0';
  source.form982AttributeSources.regular.records = [codAttributeRecord('minimum_tax_credit', '3000')];
  const minimum = TaxYearInputSchema.parse({ ...source, form8801: {
    priorYear: 2024, sourceFactsConfirmed: true, priorYearFilingStatus: 'single',
    priorYearForm6251Line1And2e: '0', priorYearExclusionItemAdjustments: '0', priorYearAMT: '0',
    priorYearMinimumTaxCreditNOLDeduction: '0', priorYearMinimumTaxForeignTaxCredit: '0', priorYearForm6251Line10: '0',
    unusedMinimumTaxCreditCarryforward: '3000', priorYearUnallowedQualifiedElectricVehicleCredit: '0',
    priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
  } });
  expect(calculateFederalTax(minimum).carryforwards.minimumTaxCredit.toFixed()).toBe('2900');
  source.form982AttributeSources.regular.records = [codAttributeRecord('passive_credit', '3000')];
  const passive = calculateFederalTax(source);
  expect(passive.carryforwards.suspendedPassiveCredits?.map(row => [row.activityName, row.originTaxYear, row.amount.toFixed()]))
    .toEqual([['Fictional retained passive activity', 2024, '2900']]);

  const foreign = foreignTaxDirectCreditFixture();
  const election = foreign.foreignTaxElection;
  if (!election?.creditWithoutForm1116) throw new Error('Missing actual direct credit sources');
  election.noUnusedCreditCarryoversConfirmed = false;
  election.creditWithoutForm1116.carryovers = [{ originTaxYear: 2024, category: 'passive', amount: '600', sourceReference: 'Actual regular prior credit worksheet' }];
  election.creditWithoutForm1116.amtCarryovers = [{ originTaxYear: 2024, category: 'passive', amount: '300', sourceReference: 'Actual alternative prior credit worksheet' }];
  const input = actualCodAttributesInput('300');
  input.w2s[0]!.wages = '0'; input.w2s[0]!.federalWithheld = '0';
  input.form1099Int = foreign.form1099Int; input.foreignTaxElection = election;
  for (const [ledger, amount] of [[input.form982AttributeSources.regular, '600'], [input.form982AttributeSources.alternativeTax, '300']] as const) {
    ledger.records = [{ ...codAttributeRecord('foreign_tax_credit', amount), foreignCategory: 'passive' }];
  }
  const result = calculateFederalTax(input);
  expect(result.foreignTaxCredit.toFixed()).toBe('0');
  expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('500');
  expect(result.carryforwards.foreignTaxCreditCarryforwardByCategory.passive?.map(row => [row.taxYear, row.amount.toFixed()]))
    .toEqual([[2024, '500']]);
  expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.map(row => [row.taxYear, row.amount.toFixed()]))
    .toEqual([[2024, '200']]);
  expect(result.codAttributeReduction?.regular.unreducedExclusion.toFixed()).toBe('0');
  expect(result.codAttributeReduction?.alternativeTax.unreducedExclusion.toFixed()).toBe('0');

});

it('does not infer zero current minimum tax credit from an empty inventory', () => {
  const source = actualCodAttributesInput('300');
  source.w2s[0]!.federalWithheld = '100000';
  const input = TaxYearInputSchema.parse({ ...source, scheduleK1: [{ partnershipName: 'Actual deferral-only statement',
    partnershipEIN: '123456789', ordinaryIncome: '0', isPassiveActivity: false, amtOtherItems: '200000' }] });
  const baseline = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined,
    form982NolSources: undefined, form982AttributeSources: undefined, netOperatingLoss: undefined });
  expect(baseline.form6251?.amt.gt(0)).toBe(true);
  expect(() => calculateFederalTax(input)).toThrow(/COD.*current.*minimum.tax.credit/i);
  input.scheduleK1[0]!.amtOtherItems = '-1';
  expect(() => calculateFederalTax(input)).toThrow(/COD.*current.*minimum.tax.credit/i);
  input.scheduleK1[0]!.amtOtherItems = '0';
  expect(calculateFederalTax(input).codAttributeReduction?.regular.unreducedExclusion.toFixed()).toBe('300');
  input.form982AttributeSources!.currentMinimumTaxCredit!.sourceFactsConfirmed = false;
  expect(() => calculateFederalTax(input)).toThrow(/COD.*current.*minimum.tax.credit/i);
});

it('does not infer exclusion-only foreign credit from current AMT foreign credit', () => {
  const foreign = foreignTaxDirectCreditFixture();
  const input = actualCodAttributesInput('300');
  input.w2s[0]!.wages = '150000'; input.w2s[0]!.federalWithheld = '100000';
  input.form1099Int = foreign.form1099Int; input.foreignTaxElection = foreign.foreignTaxElection;
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.records = [{ ...codAttributeRecord('foreign_tax_credit', '200', '200'), originTaxYear: 2025,
      originalAmountMeaning: 'current_year_before_use', foreignCategory: 'passive' }];
  }
  const baseline = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined,
    form982NolSources: undefined, form982AttributeSources: undefined, netOperatingLoss: undefined });
  expect(baseline.amt.toFixed()).toBe('0');
  expect(baseline.foreignTaxDirectCredit?.creditAllowed.toFixed()).toBe('200');
  expect(() => calculateFederalTax(input)).toThrow(/COD.*current.*minimum.tax.credit/i);
});

it('binds unchanged capital closings to the actual prior and current originals', () => {
  const input = actualCodAttributesInput('5000');
  input.priorYear = { shortTermCapitalLoss: '-10000', longTermCapitalLoss: '0' };
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.records = [codAttributeRecord('capital_loss', '11000', '4000')];
  }
  expect(() => calculateFederalTax(input)).toThrow(/COD.*capital.*(original|opening|current)/i);
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.records = [{ ...codAttributeRecord('capital_loss', '10000', '3000'), originTaxYear: 2025, originalAmountMeaning: 'current_year_before_use' }];
  }
  expect(() => calculateFederalTax(input)).toThrow(/COD.*capital.*(original|opening|current)/i);
});

it('does not relabel a transferred estate capital carry as current transactions', () => {
  const source = actualCodAttributesInput('5000');
  for (const ledger of [source.form982AttributeSources.regular, source.form982AttributeSources.alternativeTax]) {
    ledger.records = [{ ...codAttributeRecord('capital_loss', '10000', '3000'), originTaxYear: 2025,
      originalAmountMeaning: 'current_year_before_use' }];
  }
  const input = TaxYearInputSchema.parse({ ...source, scheduleK1Form1041: [{
    estateTrustName: 'Actual terminating trust', estateTrustEIN: '123456789', isFinalK1: true,
    finalYearShortTermCapitalLoss: '-10000',
  }] });
  expect(() => calculateFederalTax(input)).toThrow(/COD.*transferred.*capital|COD.*estate.*original/i);
  input.scheduleK1Form1041![0]!.finalYearShortTermCapitalLoss = '0';
  input.form982AttributeSources!.regular!.records = [];
  input.form982AttributeSources!.alternativeTax!.records = [];
  expect(calculateFederalTax(input).codAttributeReduction?.regular.unreducedExclusion.toFixed()).toBe('5000');
});
