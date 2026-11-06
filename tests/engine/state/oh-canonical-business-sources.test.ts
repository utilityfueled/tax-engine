/** Spec: spec/state/oh-canonical-business-sources.yaml. No candidate product imports. */
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateOhioCanonicalBusinessSource } from '@/engine/state/oh-business-source.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { canonicalOhioBusinessFixture, canonicalOhioBusinessExpectations } from '../../fixtures/oh-canonical-business-sources.js';

type Packet = ReturnType<typeof canonicalOhioBusinessFixture>;
function run(packet: Packet) {
  return calculateOhioResidentReturnFromFederal({ taxInput: packet.input, federalResult: calculateFederalTax(packet.input), overlay: { residency: packet.facts } });
}
function owner(packet: Packet) {
  const value = packet.facts.owners[0];
  if (!value) throw new Error('Explicit fixture requires actual primary owner');
  return value;
}
function business(packet: Packet) {
  const value = packet.facts.businessSources.facts.businesses[0];
  if (!value) throw new Error('Explicit fixture requires actual C source');
  return value;
}
function rebind(packet: Packet) { packet.facts.originalFederalSources = structuredClone(packet.input); }
const cases = canonicalOhioBusinessExpectations.flatMap(row => (['nonresident', 'part_year_resident'] as const).map(status => [row.year, row.profit, status] as const));
it.each(cases)('matches actual canonical single-owner NRC business in %s with %s %s sources', (year, profit, status) => {
  const packet = canonicalOhioBusinessFixture(year, profit, status);
  const original = JSON.stringify(packet);
  const precision = Decimal.precision;
  if (year === 2026) {
    expect(() => calculateFederalTax(packet.input)).toThrow(/Tax year 2026 rule pack .* is incomplete; calculation is unavailable/);
    expect(JSON.stringify(packet)).toBe(original);
    return;
  }
  const federal = calculateFederalTax(packet.input);
  expect(federal.scheduleC?.netProfit.toFixed()).toBe(profit);
  expect(federal.selfEmploymentTax.toFixed()).toBe(packet.expected.SE);
  expect(federal.adjustmentsToIncome.toFixed()).toBe(packet.expected.halfSE);
  expect(federal.agi.toFixed()).toBe(packet.expected.federalAGI);
  const result = calculateOhioResidentReturnFromFederal({ taxInput: packet.input, federalResult: federal, overlay: { residency: packet.facts } });
  const nrc = result.nonresidentCreditResult;
  if (!nrc) throw new Error('Actual canonical source must produce the NRC worksheet');
  expect(result.scheduleOfAdjustments.line15_businessIncomeDeduction.toFixed()).toBe(packet.expected.BID);
  expect(result.it1040.line3_ohioAgi.toFixed()).toBe(packet.expected.OhioAGI);
  expect(result.it1040.line4_exemptions.toFixed()).toBe(packet.expected.exemption);
  expect(result.it1040.line8c_totalTax.toFixed()).toBe(packet.expected.taxBeforeNRC);
  expect(nrc.line5.toFixed()).toBe(packet.expected.sectionI5);
  expect(nrc.line6.toFixed()).toBe('0');
  expect(nrc.line14.toFixed()).toBe('0');
  expect(nrc.line19.toFixed(4)).toBe(packet.expected.nonresidentRatio);
  expect(nrc.line20.toFixed()).toBe(packet.expected.NRC);
  expect(result.it1040.line10_taxAfterCredits.toFixed()).toBe(packet.expected.taxAfterNRC);
  expect(result.lines.some(line => line.form === 'OH-IT-NRC-III')).toBe(true);
  expect(JSON.stringify(result.lines)).not.toContain(packet.input.taxpayer.primary.ssn);
  expect(JSON.stringify(packet)).toBe(original);
  expect(Decimal.precision).toBe(precision);
});

const negativeCases: [string, (packet: Packet) => void][] = [
  ['missing-business-packet', packet => { Reflect.deleteProperty(packet.facts, 'businessSources'); }],
  ['unconfirmed-business', packet => { Reflect.set(business(packet), 'sourceFactsConfirmed', false); }],
  ['business-year', packet => { business(packet).sourceTaxYear = 2026; }],
  ['business-owner', packet => { business(packet).accountHolder = 'spouse'; }],
  ['current-C-owner', packet => { if (!packet.input.scheduleC) throw new Error('Fixture requires actual C'); packet.input.scheduleC.accountHolder = 'spouse'; rebind(packet); }],
  ['current-C-identity', packet => { if (!packet.input.scheduleC) throw new Error('Fixture requires actual C'); packet.input.scheduleC.businessName = 'Same-money different current business'; rebind(packet); }],
  ['duplicate-business', packet => { packet.facts.businessSources.facts.businesses.push(structuredClone(business(packet))); }],
  ['missing-receipt', packet => { business(packet).sales.rows = []; }],
  ['duplicate-receipt', packet => { const receipt = business(packet).sales.rows[0]; if (!receipt) throw new Error('Fixture requires actual invoice'); business(packet).sales.rows.push(structuredClone(receipt)); }],
  ['factor-over-everywhere', packet => { business(packet).property.ownedBeginning.ohio = '999999'; }],
  ['unresolved-six-place', packet => { business(packet).property.ownedBeginning.everywhere = '30000'; business(packet).property.ownedEnd.everywhere = '30000'; }],
  ['unknown-special-industry', packet => { Reflect.set(business(packet), 'noSpecialIndustryOrAlternativeAllocationConfirmed', false); }],
  ['unknown-depreciation', packet => { Reflect.set(business(packet), 'noOhioDepreciationAdjustmentsConfirmed', false); }],
  ['unknown-deduction-timing', packet => { packet.facts.businessSources.federalDeductionSources = []; }],
  ['deduction-source-year', packet => { const row = packet.facts.businessSources.federalDeductionSources[0]; if (!row) throw new Error('Fixture requires actual deduction'); row.sourceTaxYear = 2026; }],
  ['deduction-source-owner', packet => { const row = packet.facts.businessSources.federalDeductionSources[0]; if (!row) throw new Error('Fixture requires actual deduction'); Reflect.set(row, 'accountHolder', 'spouse'); }],
  ['deduction-amount', packet => { const row = packet.facts.businessSources.federalDeductionSources[0]; if (!row) throw new Error('Fixture requires actual deduction'); Reflect.set(row.original, 'amount', '1'); }],
  ['deduction-invalid-date', packet => { const row = packet.facts.businessSources.federalDeductionSources[0]; if (!row) throw new Error('Fixture requires actual deduction'); row.original.date = '2025-02-30'; }],
  ['duplicate-deduction', packet => { const row = packet.facts.businessSources.federalDeductionSources[0]; if (!row) throw new Error('Fixture requires actual deduction'); packet.facts.businessSources.federalDeductionSources.push(structuredClone(row)); }],
  ['false-resident-deduction', packet => { const amounts = owner(packet).amounts; const adjustment = amounts.federalAdjustments; if (!adjustment) throw new Error('Fixture requires actual federal adjustment'); adjustment.residentAmount = packet.expected.halfSE; }],
  ['extra-federal-adjustment', packet => { packet.input.adjustments = { iraDeduction: '100' }; rebind(packet); }],
  ['actual-other-business', packet => { packet.input.form1099Nec = [{ payer: 'Explicit other fictional actual payer', accountHolder: 'primary', taxYear: 2025, nonemployeeCompensation: '100', federalWithheld: '0' }]; rebind(packet); }],
  ['actual-district', packet => { Reflect.set(packet.facts, 'schoolDistrictStatus', 'actual_district_sources_required'); }],
];
it.each(negativeCases)('rejects incomplete or contradictory actual canonical business sources %s', (_name, mutate) => {
  const packet = canonicalOhioBusinessFixture(2025, '1000000', 'part_year_resident');
  mutate(packet);
  const original = JSON.stringify(packet);
  expect(() => run(packet)).toThrow();
  expect(JSON.stringify(packet)).toBe(original);
});

it('binds equal-money business identity replacements without mutating source originals', () => {
  const first = canonicalOhioBusinessFixture();
  const before = buildOhioResidentReturnInput(first.input, calculateFederalTax(first.input), { residency: first.facts });
  const changed = canonicalOhioBusinessFixture();
  if (!changed.input.scheduleC) throw new Error('Fixture requires actual C');
  changed.input.scheduleC.businessName = 'Explicit newly supplied same-money business original';
  const changedBusiness = business(changed);
  changedBusiness.originalBusiness = structuredClone(changed.input.scheduleC) as typeof changedBusiness.originalBusiness;
  rebind(changed);
  const original = JSON.stringify(changed);
  const after = buildOhioResidentReturnInput(changed.input, calculateFederalTax(changed.input), { residency: changed.facts });
  expect(before.residencySourceDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(after.residencySourceDigest).not.toBe(before.residencySourceDigest);
  expect(run(changed).it1040.line10_taxAfterCredits.toFixed()).toBe('1877');
  expect(JSON.stringify(changed)).toBe(original);
});

it('preserves the original existing-shape unsupported C guard without invented business proof', () => {
  const packet = canonicalOhioBusinessFixture();
  Reflect.deleteProperty(packet.facts, 'businessSources');
  packet.facts.noBusinessIncomeConfirmed = true;
  expect(() => run(packet)).toThrow(/business\/rental originals require Section II\/III/);
});

// Spec retained-family-scope: schema-valid retained statements are not C-only facts,
// including zero statements. No other-family calculation or eligibility is asserted.
function retainedFamilySource(family: string, value: string): Record<string, unknown> {
  switch (family) {
    case 'formSSA1099': return { formSSA1099: [{ recipient: 'Separate fictional SSA original', netBenefits: value, federalWithheld: '0' }] };
    case 'formRRB1099': return { formRRB1099: [{ recipient: 'Separate fictional RRB original', netSocialSecurityEquivalentBenefitPortion: value, federalWithheld: '0' }] };
    case 'form1099SA': return { form1099SA: [{ payer: 'Separate fictional HSA original', accountHolder: 'primary', grossDistribution: value, earningsOnExcessContributions: '0', distributionCode: '1', accountType: 'hsa', trusteeToTrusteeTransfer: false }] };
    case 'form1099C': return { form1099C: [{ creditor: 'Separate fictional creditor original', amountDischarged: value, interestIncluded: '0', personallyLiable: true }] };
    case 'form1099Q': return { form1099Q: [{ payerName: 'Separate fictional education original', sourceId: 'education-source', accountId: 'education-account', beneficiaryId: 'primary', recipientOwner: 'primary', taxYear: 2026, accountType: '529', grossDistribution: value, earnings: '0', basis: value, isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: 'none' } }] };
    case 'form4797': return { form4797: { netSection1231GainOrLoss: value, nonrecapturedNetSection1231Losses: '0', propertySales: [] } };
    case 'homeSales': return { homeSales: [{ accountHolder: 'primary', salePrice: value, purchasePrice: value, daysOwned: 730, daysUsedAsResidence: 730, usedExclusionInPrior2Years: false }] };
    case 'form6252': return { form6252: [{ description: 'Separate fictional installment original', accountHolder: 'primary', isYearOfSale: true, sellingPrice: value, costBasis: value, paymentsReceived: value }] };
    case 'form6781': return { form6781: { accountHolder: 'primary', section1256Gains: value, section1256Losses: value, adjustments: '0', carrybackElection: false } };
    case 'form8814': return { form8814: [{ taxableInterest: value, taxExemptInterest: '0', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0' }] };
    case 'form8824': return { form8824: [{ description: 'Separate fictional exchange original', fmvLikeKindPropertyReceived: value, adjustedBasisLikeKindPropertyGivenUp: value }] };
    case 'savingsBondRedemptions': return { savingsBondRedemptions: [{ sourceId: 'separate-fictional-bond', proceeds: value, faceValue: value, interest: '0', bondType: 'series_i', issueDate: '2000-01-01', redemptionDate: '2026-08-01', ownerDateOfBirth: '1970-01-01', registeredOwner: 'taxpayer', ownershipConfirmed: true, priorYearInterestReported: '0' }] };
    default: throw new Error('Independent retained-family control requires a declared family');
  }
}
const retainedFamilies = ['formSSA1099', 'formRRB1099', 'form1099SA', 'form1099C', 'form1099Q', 'form4797', 'homeSales', 'form6252', 'form6781', 'form8814', 'form8824', 'savingsBondRedemptions'];
const retainedCases = retainedFamilies.flatMap(family => ['0', '100'].map(value => [family, value] as const));
it.each(retainedCases)('rejects retained unhandled %s original even with source amount %s in the explicit draft', (family, value) => {
  const packet = canonicalOhioBusinessFixture(2026);
  const parsed = TaxYearInputSchema.parse({ ...packet.input, ...retainedFamilySource(family, value) });
  // Only the separately supplied retained family is replaced; the actual C original stays byte-exact.
  Reflect.set(packet.input, family, Reflect.get(parsed, family));
  rebind(packet);
  const original = JSON.stringify(packet);
  expect(() => calculateOhioCanonicalBusinessSource({ taxInput: packet.input, residencyFacts: packet.facts, draft2026: true })).toThrow('other actual income or business originals require their separate source composition');
  expect(JSON.stringify(packet)).toBe(original);
});
