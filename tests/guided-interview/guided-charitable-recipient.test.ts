// Spec: spec/federal/charitable-recipient-classification.yaml.
import { expect,it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { buildDonationsInput, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, loadGuidedFlowState, saveGuidedFlowState, startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';
it('preserves actual category and legacy facts while revoking stale history confirmation',()=>{
 const old={...emptyDonationEntry,organization:'Actual operating foundation',type:'cash' as const,amount:'6000.01',date:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:true};
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
