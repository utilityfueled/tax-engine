// Spec: spec/federal/current-charitable-receipt-categories.yaml.
import {expect,it} from 'vitest';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {emptyDeductionData,emptyDonationEntry,validateSection} from '@/lib/guided-interview-flow';
import {calculateScheduleA} from '@/engine/schedules/schedule-a.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {FEDERAL_2026_CONSTANTS} from '@/models/federal-2026-indexed.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {d} from '@/utils/decimal.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {currentCategoryFixture} from '../fixtures/current-charitable-categories.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
import {actualGuidedCharitableCarryover} from '../fixtures/guided-charitable-carryover';
import {completeW2Entry,startCompleteInterview} from './complete-facts';
it('preserves the full ordinary receipt packet and closed year boundaries',async()=>{
 const state=startCompleteInterview({filingStatus:'mfs',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.taxYear=2026;
 const personal=state.sectionData['personal-info'];if(!personal?.standardDeductionFacts)throw Error('Missing actual source');personal.standardDeductionFacts.spouseItemizes=true;
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'10000',federalWithheld:'1000'}]};
 const history=actualGuidedCharitableCarryover();history.sourceTaxYear='2026';history.vintages=[];
 const receipts=currentCategoryFixture('1000','500','1000','2000','1500').donations;
 state.sectionData.deductions={...emptyDeductionData,method:'nonitemized',medicalExpenses:'0',stateLocalTaxes:'0',realEstateTaxes:'0',mortgageInterest:'0',casualtyLosses:'0',otherItemized:'0',gamblingWinnings:'0',nonW2IncomeTaxesDeductedElsewhere:'0',charitableContributions:'6000',charitableCarryoverSources:history,
 donationEntries:receipts.map(row=>({...emptyDonationEntry,organization:row.organization,type:row.type,amount:row.amount,date:row.dateOfDonation,costBasis:row.costBasis??'',isLongTermCapitalGain:row.isLongTermCapitalGain??null,qualifiedOrganization:row.qualifiedOrganization,recipientCategory:row.recipientCategory,supportingOrganization:false,donorAdvisedFund:false}))};
 const before=JSON.stringify(state);const validation=validateSection(state,'deductions');expect(validation.status,JSON.stringify(validation)).toBe('complete');
 const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));expect(input.donations.map(row=>[row.type,row.amount,row.recipientCategory])).toEqual(receipts.map(row=>[row.type,row.amount,row.recipientCategory]));
 const r=calculateScheduleA(input,d('10000'),'married_filing_separately',FEDERAL_2026_CONSTANTS);expect(r.charitableTotal.toFixed()).toBe('5450');expect(r.currentCharitableCandidates?.nonitemizedCarryforwards.map(row=>[row.category,row.medium,row.amount.toFixed()])).toEqual([['capital_gain_20','noncash','550']]);
 expect(computeGuidedPreview(state)).toBeNull();expect(()=>calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
 await expect(fillReturn(input,{...calculateFederalTax(simpleW2Fixture),taxYear:2026,deductionUsed:'nonitemized'},{outputDir:'tmp/unsupported-five-category-current'})).rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
 expect(JSON.stringify(state)).toBe(before);
 const rows=state.sectionData.deductions.donationEntries;if(!rows)throw Error('Missing source');rows[3].isLongTermCapitalGain=null;expect(validateSection(state,'deductions').status).toBe('partial');expect(buildTaxInputFromGuidedData(state)).toBeNull();
 rows[3].isLongTermCapitalGain=true;history.sourceFactsConfirmed=null;expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
