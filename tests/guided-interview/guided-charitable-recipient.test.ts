// Spec: spec/federal/charitable-recipient-classification.yaml.
import { expect,it } from 'vitest';
import { buildDonationsInput } from '@/lib/guided-interview-bridge';
import { emptyDeductionData,emptyDonationEntry,updateSectionData } from '@/lib/guided-interview-flow';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { startCompleteInterview } from './complete-facts';
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
