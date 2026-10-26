// Spec: spec/federal/nonitemized-charitable-categories.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, validateSection } from '@/lib/guided-interview-flow';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { nonitemizedCategoryFixture } from '../fixtures/nonitemized-charitable-categories.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { completeW2Entry, startCompleteInterview } from './complete-facts';
it('preserves all actual current and prior categories through existing intake',async()=>{
  const state=startCompleteInterview({filingStatus:'mfs',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.taxYear=2026;
  const personal=state.sectionData['personal-info'];if(!personal?.standardDeductionFacts)throw Error('Missing actual source');personal.standardDeductionFacts.spouseItemizes=true;
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'100000',federalWithheld:'30000'}]};
  const history=actualGuidedCharitableCarryover();history.sourceTaxYear='2026';
  history.vintages=([['cash_60','cash','10000'],['noncash_50','noncash','5000'],['capital_gain_30','noncash','10000'],['other_30','cash','10000'],['capital_gain_20','noncash','8000']] as const)
    .map(([category,medium,amount],index)=>({sourceId:`Actual synthetic vintage-${index}`,contributionYear:'2025',category,medium,
      sourceReference:'Actual synthetic prior worksheet',originalExcess:amount,originNolReduction:'0',openingCarryforward:amount,
      adjustedThroughTaxYear:'2025',allHistoryIncluded:true,ordinaryPercentageMethodConfirmed:true,history:[]}));
  const receipts=nonitemizedCategoryFixture().donations;
  state.sectionData.deductions={...emptyDeductionData,method:'nonitemized',medicalExpenses:'0',stateLocalTaxes:'0',realEstateTaxes:'0',mortgageInterest:'0',casualtyLosses:'0',otherItemized:'0',gamblingWinnings:'0',nonW2IncomeTaxesDeductedElsewhere:'0',charitableContributions:'60000',charitableCarryoverSources:history,
    donationEntries:receipts.map(row=>({...emptyDonationEntry,organization:row.organization,type:row.type,amount:row.amount,date:row.dateOfDonation,costBasis:row.costBasis??'',isLongTermCapitalGain:row.isLongTermCapitalGain??null,qualifiedOrganization:row.qualifiedOrganization,recipientCategory:row.recipientCategory,supportingOrganization:false,donorAdvisedFund:false}))};
  const before=JSON.stringify(state),validation=validateSection(state,'deductions');expect(validation.status,JSON.stringify(validation)).toBe('complete');
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.charitableCarryoverSources?.vintages?.map(row=>[row.contributionYear,row.category,row.medium,row.openingCarryforward]))
    .toEqual(history.vintages.map(row=>[2025,row.category,row.medium,row.openingCarryforward]));
  const r=calculateScheduleA(input,d('100000'),'married_filing_separately',FEDERAL_2026_CONSTANTS);
  expect(r.charitableTotal.toFixed()).toBe('0');expect(r.charitableCarryforward.toFixed()).toBe('53000');
  expect(r.nonitemizedCharitableCarryover?.priorTreatedAsPaid.toFixed()).toBe('15000');
  expect(r.nonitemizedCharitableCarryover?.method).toBe('2026_nonitemized_ordinary_categories');
  expect(computeGuidedPreview(state)).toBeNull();expect(()=>calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  await expect(fillReturn(input,{...calculateFederalTax(simpleW2Fixture),taxYear:2026,deductionUsed:'nonitemized'},{outputDir:'tmp/unsupported-nonitemized-category-carry'}))
    .rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  expect(JSON.stringify(state)).toBe(before);
  history.sourceFactsConfirmed=null;expect(validateSection(state,'deductions').status).toBe('partial');expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
