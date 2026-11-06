// Spec: spec/federal/charitable-determined-floor.yaml. No year gate substitution here.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, emptyDonationEntry, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { prepareCharitableReview, assertCharitableReviewSource } from '@/pdf/charitable-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { actualGuidedCharitableCarryover } from '../fixtures/guided-charitable-carryover';
import { completeW2Entry, startCompleteInterview } from './complete-facts';

it('preserves actual prior categories and current floor sources through guide and review gates',async()=>{
  const state=startCompleteInterview({filingStatus:'mfs',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});state.taxYear=2026;
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'100000',federalWithheld:'30000'}]};
  const history=actualGuidedCharitableCarryover();history.sourceTaxYear='2026';
  history.vintages=[{sourceId:'Fictional prior investment stock',contributionYear:'2025',category:'capital_gain_30',medium:'noncash',
    sourceReference:'Fictional actual filed2025 worksheet',originalExcess:'5000',originNolReduction:'0',openingCarryforward:'5000',
    adjustedThroughTaxYear:'2025',allHistoryIncluded:true,ordinaryPercentageMethodConfirmed:true,history:[]}];
  const stock={...emptyDonationEntry,organization:'Fictional current other recipient',type:'appreciated_stock' as const,amount:'500',
    costBasis:'100',isLongTermCapitalGain:true,date:'2026-06-01',qualifiedOrganization:true,recipientCategory:'other-thirty-percent' as const,
    supportingOrganization:false,donorAdvisedFund:false};
  state.sectionData.deductions={...emptyDeductionData,method:'itemized',medicalExpenses:'0',stateLocalTaxes:'0',realEstateTaxes:'0',
    mortgageInterest:'0',casualtyLosses:'0',otherItemized:'0',gamblingWinnings:'0',nonW2IncomeTaxesDeductedElsewhere:'0',
    charitableContributions:'500',charitableCarryoverSources:history,donationEntries:[stock]};
  expect(validateSection(state,'deductions').status).toBe('complete');
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const a=calculateScheduleA(input,d('100000'),'married_filing_separately',FEDERAL_2026_CONSTANTS);
  expect([a.charitableCurrentCash,a.charitableCurrentNoncash,a.charitablePriorYearUsed,a.charitableTotal].map(x=>x.toFixed())).toEqual(['0','0','5000','5000']);
  expect(a.determinedCharitableFloor?.currentFloorByCategory.capital_gain_20.toFixed()).toBe('500');
  const token=prepareCharitableReview(input);expect(()=>assertCharitableReviewSource(redactReviewIdentifiers(input),token)).not.toThrow();
  const changed=structuredClone(input);if(!changed.charitableCarryoverSources)throw Error('Missing original history');
  changed.charitableCarryoverSources.vintages[0].category='noncash_50';expect(()=>assertCharitableReviewSource(changed,token)).toThrow(/stale|conflict/i);
  expect(computeGuidedPreview(state)).toBeNull();expect(()=>calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  const old=calculateFederalTax(simpleW2Fixture);
  await expect(fillReturn(input,{...old,taxYear:2026,deductionUsed:'itemized'},{outputDir:'tmp/unsupported-determined-floor'})).rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  stock.isLongTermCapitalGain=null;expect(validateSection(state,'deductions').status).toBe('partial');expect(buildTaxInputFromGuidedData(state)).toBeNull();
  stock.isLongTermCapitalGain=true;history.sourceFactsConfirmed=null;expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
