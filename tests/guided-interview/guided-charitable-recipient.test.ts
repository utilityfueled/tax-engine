// Spec: spec/federal/charitable-recipient-classification.yaml.
import { expect,it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { buildDonationsInput, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyAdjustmentData, emptyDeductionData, emptyDonationEntry, loadGuidedFlowState, parseGuidedFlowState, saveGuidedFlowState, startInterview, updateSectionData, validateSection, type DonationEntryData } from '@/lib/guided-interview-flow';
import { buildGuidedNetOperatingLoss } from '@/lib/guided-net-operating-loss';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

it('reopens a 2026 saved nonfoundation gift as pending actual category', () => {
 const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: null });
 state.taxYear = 2026;
 const gift = { ...emptyDonationEntry, organization: 'Synthetic eligible nonprofit cemetery', type: 'cash' as const,
  cashAmountBasis: 'net-contribution' as const, amount: '500.00', date: '2026-03-31', qualifiedOrganization: true,
  isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false };
 state.sectionData.deductions = { ...emptyDeductionData, method: 'standard', donationEntries: [gift] };
 const restored = parseGuidedFlowState(JSON.stringify(state));
 if (!restored?.sectionData.deductions) throw new Error('Expected reopened donation facts');
 const restoredDeductions = restored.sectionData.deductions;
 expect(restoredDeductions.donationEntries?.[0]).toEqual(gift);
 expect(validateSection(restored, 'deductions').fieldErrors).toHaveProperty('donation-0-classification');
 expect(buildTaxInputFromGuidedData(restored)).toBeNull();

 const deduction = (change: Partial<DonationEntryData>) => {
  const updated = updateSectionData(restored, 'deductions', { ...restoredDeductions, donationEntries: [{ ...gift, ...change }] });
  expect(validateSection(updated, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(updated));
  expect(input.donations[0]).toMatchObject({ organization: change.organization ?? gift.organization, dateOfDonation: gift.date });
  expect(input.donations[0].isPrivateFoundation).toBe(change.isPrivateFoundation === null ? undefined : false);
  return calculateScheduleA(input, new Decimal('75000'), 'single', FEDERAL_2026_CONSTANTS).nonitemizerCharitableDeduction.toFixed(2);
 };
 expect(deduction({ recipientCategory: 'other-thirty-percent' })).toBe('0.00');
 expect(deduction({ organization: 'Synthetic 50%-limit charity', recipientCategory: 'fifty-percent' })).toBe('500.00');
 expect(deduction({ qualifiedOrganization: false })).toBe('0.00');
 expect(deduction({ amount: '0.00', isPrivateFoundation: null })).toBe('0.00');
 expect(deduction({ cashAmountBasis: 'gross-payment', cashBenefitValue: '500.00', isPrivateFoundation: null })).toBe('0.00');
});

it('keeps a 2026 gross payment offset by benefits out of NOL charitable history', () => {
 const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: ['net-operating-loss'], stateCode: null });
 state.taxYear = 2026;
 const source = { ...actualGuidedNolSources, sourceTaxYear: '2026', vintages: [],
  alternativeTax: { ...actualGuidedNolSources.alternativeTax, vintages: [] } };
 state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: source };
 expect(buildTaxInputFromGuidedData(state)?.netOperatingLoss?.vintages).toEqual([]);

 const gift = { ...emptyDonationEntry, organization: 'Synthetic qualified recipient', type: 'cash' as const,
  cashAmountBasis: 'gross-payment' as const, cashBenefitValue: '500.00', amount: '500.00', date: '2026-03-31',
  qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false };
 state.sectionData.deductions = { ...emptyDeductionData, method: 'standard', charitableContributions: '500.00', donationEntries: [gift] };
 const reopened = parseGuidedFlowState(JSON.stringify(state));
 if (!reopened) throw new Error('Expected reopened NOL and donation facts');
 expect(validateSection(reopened, 'deductions').status).toBe('complete');
 const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
 expect(input.netOperatingLoss?.vintages).toEqual([]);
 expect(input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory).toBeUndefined();
 expect(input.donations[0]).toMatchObject({ amount: '0', organization: gift.organization, dateOfDonation: gift.date });
});

it('leaves pending 2026 direct charity facts to Deductions during NOL navigation', () => {
 const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: ['net-operating-loss'], stateCode: null });
 state.taxYear = 2026;
 const source = structuredClone(actualGuidedNolSources);
 source.sourceTaxYear = '2026';
 for (const vintage of [...source.vintages ?? [], ...source.alternativeTax?.vintages ?? []]) vintage.adjustedThroughTaxYear = '2025';
 state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: source };
 expect(validateSection(state, 'adjustments').status).toBe('complete');

 const gift = { ...emptyDonationEntry, organization: 'Synthetic qualified recipient', type: 'cash' as const,
  cashAmountBasis: 'net-contribution' as const, amount: '500.00', date: '2026-03-31', qualifiedOrganization: true,
  isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false };
 const baseline = { ...emptyDeductionData, method: 'standard' as const };
 for (const [entry, field] of [
  [gift, 'donation-0-classification'],
  [{ ...gift, cashAmountBasis: 'gross-payment' as const, recipientCategory: 'fifty-percent' as const }, 'donation-0-cash-basis'],
 ] as const) {
  state.sectionData.deductions = { ...baseline, donationEntries: [entry] };
  const reopened = parseGuidedFlowState(JSON.stringify(state));
  if (!reopened) throw new Error('Expected reopened NOL and donation facts');
  expect(validateSection(reopened, 'adjustments').status).toBe('complete');
  expect(validateSection(reopened, 'deductions').fieldErrors).toHaveProperty(field);
  expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
 }

 state.sectionData.deductions = { ...baseline, donationEntries: [{ ...gift, recipientCategory: 'fifty-percent' }] };
 expect(validateSection(state, 'deductions').status).toBe('complete');
 expect(() => buildGuidedNetOperatingLoss(source, 2026, 'single', completePersonalInfo, state.sectionData.deductions)).toThrow(/complete independent prior regular and AMT charitable histories/);
 expect(buildTaxInputFromGuidedData(state)).toBeNull();
 if (!source.alternativeTax) throw new Error('Expected an independent AMT source');
 source.alternativeTax.charitableCarryoverHistory = { sourceTaxYear: '2025', sourceReference: 'Synthetic independent zero carry histories',
  sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [] };
 const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
 expect(input.netOperatingLoss?.vintages[0].openingCarryforward).toBe('54000');
 expect(input.donations[0]).toMatchObject({ amount: '500.00', recipientCategory: 'fifty-percent' });
});

it('preserves actual category and legacy facts while revoking stale history confirmation',()=>{
 const old={...emptyDonationEntry,organization:'Actual operating foundation',type:'cash' as const,cashAmountBasis:'net-contribution' as const,amount:'6000.01',date:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:true};
 const data={...emptyDeductionData,method:'itemized' as const,charitableContributions:'6000.01',donationEntries:[old],charitableCarryoverSources:actualGuidedCharitableCarryover()};
 const before=JSON.stringify(data);
 expect(()=>buildDonationsInput(data,2025)).toThrow(/classification|category/i);
 expect(JSON.stringify(data)).toBe(before);
 const resolved={...data,donationEntries:[{...old,recipientCategory:'fifty-percent' as const}]};
 expect(buildDonationsInput(resolved,2025)[0]).toMatchObject({recipientCategory:'fifty-percent',isPrivateFoundation:true,amount:'6000.01',organization:'Actual operating foundation'});
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:[],lifeEvents:[],stateCode:null});state.sectionData.deductions=data;
 expect(updateSectionData(state,'deductions',resolved).sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
 const publicLegacy={...data,donationEntries:[{...old,isPrivateFoundation:false}]};
 expect(buildDonationsInput(publicLegacy,2025)[0]).not.toHaveProperty('recipientCategory');
 expect(()=>buildDonationsInput({...publicLegacy,donationEntries:[{...old,isPrivateFoundation:false,recipientCategory:null}]},2025)).toThrow(/classification|category/i);
 expect(buildDonationsInput({...data,donationEntries:[{...old,qualifiedOrganization:false}]},2025)[0]).toMatchObject({qualifiedOrganization:false,isPrivateFoundation:true});
});

it.each([2025, 2026])('reopens noncash gifts to a known unqualified recipient in %i', (year) => {
 const state = updateSectionData(startInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null }, year), 'personal-info', completePersonalInfo);
 state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, sourceTaxYear: String(year), wages: '75000', federalWithheld: '10000' }] };
 const gift = { ...emptyDonationEntry, organization: 'Fictional unqualified recipient', type: 'property' as const,
  amount: '600.25', date: `${year}-03-31`, qualifiedOrganization: false };
 const explicit = { ...gift, date: `${year}-04-01`, costBasis: '0', isLongTermCapitalGain: false };
 const saved = updateSectionData(state, 'deductions', { ...emptyDeductionData, method: 'itemized', donationEntries: [gift, explicit] });
 const entries = new Map<string, string>();
 const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => entries.set(key, value),
  removeItem: (key: string) => entries.delete(key),
 } as Storage;
 expect(saveGuidedFlowState(storage, 'fictional-donation', saved)).toBe(true);
 const reopened = loadGuidedFlowState(storage, 'fictional-donation');
 if (!reopened?.sectionData.deductions) throw new Error('Expected the reopened donation sources.');
 expect(reopened.taxYear).toBe(year);
 expect(reopened.sectionData.deductions.donationEntries).toEqual([gift, explicit]);
 expect(validateSection(reopened, 'deductions').status).toBe('complete');
 const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
 expect(input.donations[0]).toMatchObject({ organization: gift.organization, type: 'property', amount: '600.25',
  dateOfDonation: gift.date, qualifiedOrganization: false });
 expect(input.donations[0]).not.toHaveProperty('costBasis');
 expect(input.donations[0]).not.toHaveProperty('isLongTermCapitalGain');
 expect(input.donations[1]).toMatchObject({ costBasis: '0', isLongTermCapitalGain: false });
 const scheduleA = year === 2025 ? calculateFederalTax(input).scheduleA
  : calculateScheduleA(input, new Decimal('75000'), 'single', FEDERAL_2026_CONSTANTS);
 expect(scheduleA?.charitableCurrentNoncash.toFixed()).toBe('0');
 expect(scheduleA?.charitableTotal.toFixed()).toBe('0');
 if (year === 2026) expect(() => calculateFederalTax(input)).toThrow(/incomplete/i);

 const newlyQualified = updateSectionData(reopened, 'deductions', { ...reopened.sectionData.deductions,
  donationEntries: [{ ...gift, qualifiedOrganization: true, recipientCategory: 'fifty-percent' }, explicit] });
 expect(validateSection(newlyQualified, 'deductions').fieldErrors).toMatchObject({
  'donation-0-basis': expect.any(String), 'donation-0-capital-gain': expect.any(String),
 });
 expect(buildTaxInputFromGuidedData(newlyQualified)).toBeNull();
});
