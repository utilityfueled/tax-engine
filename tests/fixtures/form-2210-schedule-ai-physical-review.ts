/** Source-first independent printed literals; no candidate PDF/result derivation. */
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs.js';
import {startCompleteInterview,completeW2Entry} from '../guided-interview/complete-facts.js';
import {emptyPaymentData,emptyDeductionData} from '@/lib/guided-interview-flow';
import {emptyEstimatedTaxFacts} from '@/lib/guided-estimated-tax-facts';
import {createWorkspaceRecord,syncGuidedFlowToWorkspace} from '@/lib/workspace-storage';
import {buildGuidedSyntheticDocuments,buildGuidedFactAnswers} from '@/lib/guided-interview-bridge';
import {simpleW2Fixture} from './simple-w2.js';
import {twoOwnerScheduleAiFixture,twoOwnerK1ScheduleAiFixture} from './two-owner-schedule-ai.js';
export type AIPhysicalKind='single'|'single-zero-penalty'|'itemizer'|'two-owner'|'two-owner-k1';
export const aiPhysicalKinds=['single','single-zero-penalty','itemizer','two-owner','two-owner-k1'] as const;
export function aiPhysicalRequired<T>(x:T|undefined|null):T{if(x===undefined||x===null)throw Error('Actual AI physical source required');return x;}
export function aiPhysicalFixture(kind:AIPhysicalKind):TaxYearInput{
 if(kind==='two-owner')return twoOwnerScheduleAiFixture();
 if(kind==='two-owner-k1')return twoOwnerK1ScheduleAiFixture();
 const original=structuredClone(simpleW2Fixture),w2=aiPhysicalRequired(original.w2s[0]);
 original.taxpayer.primary={...original.taxpayer.primary,firstName:'Avery',lastName:'Review',ssn:'900-70-0811'};
 original.w2s=[{...w2,accountHolder:'primary',employer:{name:'Fictional Original Annual Employer',ein:'91-7400811'},wages:'200000',federalWithheld:'0',socialSecurityWages:'176100',socialSecurityTips:'0',socialSecurityWithheld:'10918.20',medicareWages:'200000',medicareWithheld:'2900'}];
 original.adjustments={estimatedTaxPayments:[{date:kind==='single-zero-penalty'?'2025-04-15':'2026-01-15',amount:'33361',type:'federal'}]};
 original.form2210={calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,withholdingMethod:'equal-installments',priorYearTaxStatus:'no-return',calculationMethod:'annualized',annualizedIncomePeriods:['30000','60000','120000','200000'].map(adjustedGrossIncome=>({adjustedGrossIncome,itemizedDeductions:'0',qbiDeduction:'0',qualifiedDividends:'0',netCapitalGain:'0',netProfitFromSelfEmployment:'0',socialSecurityWages:'0',otherTaxes:'0',credits:'0'}))};
 if(kind==='itemizer'){original.deductionElection='itemized';original.donations=[['2025-03-15','5000'],['2025-05-15','3500'],['2025-08-15','6500'],['2025-12-15','5000']].map(([date,amount])=>({organization:'Fictional Qualified Public Charity',type:'cash' as const,dateOfDonation:aiPhysicalRequired(date),amount:aiPhysicalRequired(amount),qualifiedOrganization:true,recipientCategory:'fifty-percent' as const,supportingOrganization:false,donorAdvisedFund:false,isPrivateFoundation:false}));aiPhysicalRequired(original.form2210).annualizedIncomePeriods?.forEach((row,i)=>{row.itemizedDeductions=aiPhysicalRequired(['5000','8500','15000','20000'][i]);});}
 return TaxYearInputSchema.parse(original);
}
export const aiSourceBlankSHA256='6899ce672648b280bf00ab47200f1b0fbf40368cfbf137df507b945b8577159a';
export const aiPhysicalSourceWidgets=[
  {
    "line": 1,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line1[0].f3_1[0]",
    "rect": [
      288.0,
      659.97,
      359.25,
      671.97
    ],
    "placeholder": false
  },
  {
    "line": 1,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line1[0].f3_2[0]",
    "rect": [
      360.0,
      659.97,
      431.25,
      671.97
    ],
    "placeholder": false
  },
  {
    "line": 1,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line1[0].f3_3[0]",
    "rect": [
      432.0,
      659.97,
      503.25,
      671.97
    ],
    "placeholder": false
  },
  {
    "line": 1,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line1[0].f3_4[0]",
    "rect": [
      504.0,
      659.97,
      576.0,
      671.97
    ],
    "placeholder": false
  },
  {
    "line": 2,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line2[0].f3_5[0]",
    "rect": [
      359.0,
      647.971,
      360.0,
      659.97
    ],
    "placeholder": true
  },
  {
    "line": 2,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line2[0].f3_6[0]",
    "rect": [
      431.0,
      647.971,
      432.0,
      659.97
    ],
    "placeholder": true
  },
  {
    "line": 2,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line2[0].f3_7[0]",
    "rect": [
      503.0,
      647.971,
      504.0,
      659.97
    ],
    "placeholder": true
  },
  {
    "line": 2,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line2[0].f3_8[0]",
    "rect": [
      575.0,
      647.971,
      576.0,
      659.97
    ],
    "placeholder": true
  },
  {
    "line": 3,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line3[0].f3_9[0]",
    "rect": [
      288.0,
      635.972,
      359.25,
      647.971
    ],
    "placeholder": false
  },
  {
    "line": 3,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line3[0].f3_10[0]",
    "rect": [
      360.0,
      635.972,
      431.25,
      647.971
    ],
    "placeholder": false
  },
  {
    "line": 3,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line3[0].f3_11[0]",
    "rect": [
      432.0,
      635.972,
      503.25,
      647.971
    ],
    "placeholder": false
  },
  {
    "line": 3,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line3[0].f3_12[0]",
    "rect": [
      504.0,
      635.972,
      576.0,
      647.971
    ],
    "placeholder": false
  },
  {
    "line": 4,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line4[0].f3_13[0]",
    "rect": [
      288.0,
      599.972,
      359.25,
      611.972
    ],
    "placeholder": false
  },
  {
    "line": 4,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line4[0].f3_14[0]",
    "rect": [
      360.0,
      599.972,
      431.25,
      611.972
    ],
    "placeholder": false
  },
  {
    "line": 4,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line4[0].f3_15[0]",
    "rect": [
      432.0,
      599.972,
      503.25,
      611.972
    ],
    "placeholder": false
  },
  {
    "line": 4,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line4[0].f3_16[0]",
    "rect": [
      504.0,
      599.972,
      576.0,
      611.972
    ],
    "placeholder": false
  },
  {
    "line": 5,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line5[0].f3_17[0]",
    "rect": [
      359.0,
      587.973,
      360.0,
      599.972
    ],
    "placeholder": true
  },
  {
    "line": 5,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line5[0].f3_18[0]",
    "rect": [
      431.0,
      587.973,
      432.0,
      599.972
    ],
    "placeholder": true
  },
  {
    "line": 5,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line5[0].f3_19[0]",
    "rect": [
      503.0,
      587.973,
      504.0,
      599.972
    ],
    "placeholder": true
  },
  {
    "line": 5,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line5[0].f3_20[0]",
    "rect": [
      575.0,
      587.973,
      576.0,
      599.972
    ],
    "placeholder": true
  },
  {
    "line": 6,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line6[0].f3_21[0]",
    "rect": [
      288.0,
      575.974,
      359.25,
      587.973
    ],
    "placeholder": false
  },
  {
    "line": 6,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line6[0].f3_22[0]",
    "rect": [
      360.0,
      575.974,
      431.25,
      587.973
    ],
    "placeholder": false
  },
  {
    "line": 6,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line6[0].f3_23[0]",
    "rect": [
      432.0,
      575.974,
      503.25,
      587.973
    ],
    "placeholder": false
  },
  {
    "line": 6,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line6[0].f3_24[0]",
    "rect": [
      504.0,
      575.974,
      576.0,
      587.973
    ],
    "placeholder": false
  },
  {
    "line": 7,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line7[0].f3_25[0]",
    "rect": [
      288.0,
      527.975,
      359.25,
      539.974
    ],
    "placeholder": false
  },
  {
    "line": 7,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line7[0].f3_26[0]",
    "rect": [
      360.0,
      527.975,
      431.25,
      539.974
    ],
    "placeholder": false
  },
  {
    "line": 7,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line7[0].f3_27[0]",
    "rect": [
      432.0,
      527.975,
      503.25,
      539.974
    ],
    "placeholder": false
  },
  {
    "line": 7,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line7[0].f3_28[0]",
    "rect": [
      504.0,
      527.975,
      576.0,
      539.974
    ],
    "placeholder": false
  },
  {
    "line": 8,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line8[0].f3_29[0]",
    "rect": [
      288.0,
      515.976,
      359.25,
      527.975
    ],
    "placeholder": false
  },
  {
    "line": 8,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line8[0].f3_30[0]",
    "rect": [
      360.0,
      515.976,
      431.25,
      527.975
    ],
    "placeholder": false
  },
  {
    "line": 8,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line8[0].f3_31[0]",
    "rect": [
      432.0,
      515.976,
      503.25,
      527.975
    ],
    "placeholder": false
  },
  {
    "line": 8,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line8[0].f3_32[0]",
    "rect": [
      504.0,
      515.976,
      576.0,
      527.975
    ],
    "placeholder": false
  },
  {
    "line": 9,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line9[0].f3_33[0]",
    "rect": [
      288.0,
      479.976,
      359.25,
      491.976
    ],
    "placeholder": false
  },
  {
    "line": 9,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line9[0].f3_34[0]",
    "rect": [
      360.0,
      479.976,
      431.25,
      491.976
    ],
    "placeholder": false
  },
  {
    "line": 9,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line9[0].f3_35[0]",
    "rect": [
      432.0,
      479.976,
      503.25,
      491.976
    ],
    "placeholder": false
  },
  {
    "line": 9,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line9[0].f3_36[0]",
    "rect": [
      504.0,
      479.976,
      576.0,
      491.976
    ],
    "placeholder": false
  },
  {
    "line": 10,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line10[0].f3_37[0]",
    "rect": [
      288.0,
      467.977,
      359.25,
      479.976
    ],
    "placeholder": false
  },
  {
    "line": 10,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line10[0].f3_38[0]",
    "rect": [
      360.0,
      467.977,
      431.25,
      479.976
    ],
    "placeholder": false
  },
  {
    "line": 10,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line10[0].f3_39[0]",
    "rect": [
      432.0,
      467.977,
      503.25,
      479.976
    ],
    "placeholder": false
  },
  {
    "line": 10,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line10[0].f3_40[0]",
    "rect": [
      504.0,
      467.977,
      576.0,
      479.976
    ],
    "placeholder": false
  },
  {
    "line": 11,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line11[0].f3_41[0]",
    "rect": [
      288.0,
      455.978,
      359.25,
      467.977
    ],
    "placeholder": false
  },
  {
    "line": 11,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line11[0].f3_42[0]",
    "rect": [
      360.0,
      455.978,
      431.25,
      467.977
    ],
    "placeholder": false
  },
  {
    "line": 11,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line11[0].f3_43[0]",
    "rect": [
      432.0,
      455.978,
      503.25,
      467.977
    ],
    "placeholder": false
  },
  {
    "line": 11,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line11[0].f3_44[0]",
    "rect": [
      504.0,
      455.978,
      576.0,
      467.977
    ],
    "placeholder": false
  },
  {
    "line": 12,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line12[0].f3_45[0]",
    "rect": [
      288.0,
      431.977,
      359.25,
      443.978
    ],
    "placeholder": false
  },
  {
    "line": 12,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line12[0].f3_46[0]",
    "rect": [
      360.0,
      431.977,
      431.25,
      443.978
    ],
    "placeholder": false
  },
  {
    "line": 12,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line12[0].f3_47[0]",
    "rect": [
      432.0,
      431.977,
      503.25,
      443.978
    ],
    "placeholder": false
  },
  {
    "line": 12,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line12[0].f3_48[0]",
    "rect": [
      504.0,
      431.977,
      576.0,
      443.978
    ],
    "placeholder": false
  },
  {
    "line": 13,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line13[0].f3_49[0]",
    "rect": [
      288.0,
      419.978,
      359.25,
      431.977
    ],
    "placeholder": false
  },
  {
    "line": 13,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line13[0].f3_50[0]",
    "rect": [
      360.0,
      419.978,
      431.25,
      431.977
    ],
    "placeholder": false
  },
  {
    "line": 13,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line13[0].f3_51[0]",
    "rect": [
      432.0,
      419.978,
      503.25,
      431.977
    ],
    "placeholder": false
  },
  {
    "line": 13,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line13[0].f3_52[0]",
    "rect": [
      504.0,
      419.978,
      576.0,
      431.977
    ],
    "placeholder": false
  },
  {
    "line": 14,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_53[0]",
    "rect": [
      288.0,
      407.979,
      359.25,
      419.978
    ],
    "placeholder": false
  },
  {
    "line": 14,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_54[0]",
    "rect": [
      360.0,
      407.979,
      431.25,
      419.978
    ],
    "placeholder": false
  },
  {
    "line": 14,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_55[0]",
    "rect": [
      432.0,
      407.979,
      503.25,
      419.978
    ],
    "placeholder": false
  },
  {
    "line": 14,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_56[0]",
    "rect": [
      504.0,
      407.979,
      576.0,
      419.978
    ],
    "placeholder": false
  },
  {
    "line": 15,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line15[0].f3_57[0]",
    "rect": [
      288.0,
      395.98,
      359.25,
      407.979
    ],
    "placeholder": false
  },
  {
    "line": 15,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line15[0].f3_58[0]",
    "rect": [
      360.0,
      395.98,
      431.25,
      407.979
    ],
    "placeholder": false
  },
  {
    "line": 15,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line15[0].f3_59[0]",
    "rect": [
      432.0,
      395.98,
      503.25,
      407.979
    ],
    "placeholder": false
  },
  {
    "line": 15,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line15[0].f3_60[0]",
    "rect": [
      504.0,
      395.98,
      576.0,
      407.979
    ],
    "placeholder": false
  },
  {
    "line": 16,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line16[0].f3_61[0]",
    "rect": [
      288.0,
      359.98,
      359.25,
      371.98
    ],
    "placeholder": false
  },
  {
    "line": 16,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line16[0].f3_62[0]",
    "rect": [
      360.0,
      359.98,
      431.25,
      371.98
    ],
    "placeholder": false
  },
  {
    "line": 16,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line16[0].f3_63[0]",
    "rect": [
      432.0,
      359.98,
      503.25,
      371.98
    ],
    "placeholder": false
  },
  {
    "line": 16,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line16[0].f3_64[0]",
    "rect": [
      504.0,
      359.98,
      576.0,
      371.98
    ],
    "placeholder": false
  },
  {
    "line": 17,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line17[0].f3_65[0]",
    "rect": [
      288.0,
      347.981,
      359.25,
      359.98
    ],
    "placeholder": false
  },
  {
    "line": 17,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line17[0].f3_66[0]",
    "rect": [
      360.0,
      347.981,
      431.25,
      359.98
    ],
    "placeholder": false
  },
  {
    "line": 17,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line17[0].f3_67[0]",
    "rect": [
      432.0,
      347.981,
      503.25,
      359.98
    ],
    "placeholder": false
  },
  {
    "line": 17,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line17[0].f3_68[0]",
    "rect": [
      504.0,
      347.981,
      576.0,
      359.98
    ],
    "placeholder": false
  },
  {
    "line": 18,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line18[0].f3_69[0]",
    "rect": [
      288.0,
      323.98,
      359.25,
      335.981
    ],
    "placeholder": false
  },
  {
    "line": 18,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line18[0].f3_70[0]",
    "rect": [
      360.0,
      323.98,
      431.25,
      335.981
    ],
    "placeholder": false
  },
  {
    "line": 18,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line18[0].f3_71[0]",
    "rect": [
      432.0,
      323.98,
      503.25,
      335.981
    ],
    "placeholder": false
  },
  {
    "line": 18,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line18[0].f3_72[0]",
    "rect": [
      504.0,
      323.98,
      576.0,
      335.981
    ],
    "placeholder": false
  },
  {
    "line": 19,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line19[0].f3_73[0]",
    "rect": [
      288.0,
      311.981,
      359.25,
      323.98
    ],
    "placeholder": false
  },
  {
    "line": 19,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line19[0].f3_74[0]",
    "rect": [
      360.0,
      311.981,
      431.25,
      323.98
    ],
    "placeholder": false
  },
  {
    "line": 19,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line19[0].f3_75[0]",
    "rect": [
      432.0,
      311.981,
      503.25,
      323.98
    ],
    "placeholder": false
  },
  {
    "line": 19,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line19[0].f3_76[0]",
    "rect": [
      504.0,
      311.981,
      576.0,
      323.98
    ],
    "placeholder": false
  },
  {
    "line": 20,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line20[0].f3_77[0]",
    "rect": [
      359.0,
      299.982,
      360.0,
      311.981
    ],
    "placeholder": true
  },
  {
    "line": 20,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line20[0].f3_78[0]",
    "rect": [
      431.0,
      299.982,
      432.0,
      311.981
    ],
    "placeholder": true
  },
  {
    "line": 20,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line20[0].f3_79[0]",
    "rect": [
      503.0,
      299.982,
      504.0,
      311.981
    ],
    "placeholder": true
  },
  {
    "line": 20,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line20[0].f3_80[0]",
    "rect": [
      575.0,
      299.982,
      576.0,
      311.981
    ],
    "placeholder": true
  },
  {
    "line": 21,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line21[0].f3_81[0]",
    "rect": [
      288.0,
      287.983,
      359.25,
      299.982
    ],
    "placeholder": false
  },
  {
    "line": 21,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line21[0].f3_82[0]",
    "rect": [
      360.0,
      287.983,
      431.25,
      299.982
    ],
    "placeholder": false
  },
  {
    "line": 21,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line21[0].f3_83[0]",
    "rect": [
      432.0,
      287.983,
      503.25,
      299.982
    ],
    "placeholder": false
  },
  {
    "line": 21,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line21[0].f3_84[0]",
    "rect": [
      504.0,
      287.983,
      576.0,
      299.982
    ],
    "placeholder": false
  },
  {
    "line": 22,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line22[0].f3_85[0]",
    "rect": [
      288.0,
      251.983,
      359.25,
      263.982
    ],
    "placeholder": false
  },
  {
    "line": 22,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line22[0].f3_86[0]",
    "rect": [
      360.0,
      251.983,
      431.25,
      263.982
    ],
    "placeholder": false
  },
  {
    "line": 22,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line22[0].f3_87[0]",
    "rect": [
      432.0,
      251.983,
      503.25,
      263.982
    ],
    "placeholder": false
  },
  {
    "line": 22,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line22[0].f3_88[0]",
    "rect": [
      504.0,
      251.983,
      576.0,
      263.982
    ],
    "placeholder": false
  },
  {
    "line": 23,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line23[0].f3_89[0]",
    "rect": [
      288.0,
      239.984,
      359.25,
      251.983
    ],
    "placeholder": false
  },
  {
    "line": 23,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line23[0].f3_90[0]",
    "rect": [
      360.0,
      239.984,
      431.25,
      251.983
    ],
    "placeholder": false
  },
  {
    "line": 23,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line23[0].f3_91[0]",
    "rect": [
      432.0,
      239.984,
      503.25,
      251.983
    ],
    "placeholder": false
  },
  {
    "line": 23,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line23[0].f3_92[0]",
    "rect": [
      504.0,
      239.984,
      576.0,
      251.983
    ],
    "placeholder": false
  },
  {
    "line": 24,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line24[0].f3_93[0]",
    "rect": [
      288.0,
      227.985,
      359.25,
      239.984
    ],
    "placeholder": false
  },
  {
    "line": 24,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line24[0].f3_94[0]",
    "rect": [
      360.0,
      227.985,
      431.25,
      239.984
    ],
    "placeholder": false
  },
  {
    "line": 24,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line24[0].f3_95[0]",
    "rect": [
      432.0,
      227.985,
      503.25,
      239.984
    ],
    "placeholder": false
  },
  {
    "line": 24,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line24[0].f3_96[0]",
    "rect": [
      504.0,
      227.985,
      576.0,
      239.984
    ],
    "placeholder": false
  },
  {
    "line": 25,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line25[0].f3_97[0]",
    "rect": [
      288.0,
      215.986,
      359.25,
      227.985
    ],
    "placeholder": false
  },
  {
    "line": 25,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line25[0].f3_98[0]",
    "rect": [
      360.0,
      215.986,
      431.25,
      227.985
    ],
    "placeholder": false
  },
  {
    "line": 25,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line25[0].f3_99[0]",
    "rect": [
      432.0,
      215.986,
      503.25,
      227.985
    ],
    "placeholder": false
  },
  {
    "line": 25,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line25[0].f3_100[0]",
    "rect": [
      504.0,
      215.986,
      576.0,
      227.985
    ],
    "placeholder": false
  },
  {
    "line": 26,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line26[0].f3_101[0]",
    "rect": [
      288.0,
      203.987,
      359.25,
      215.986
    ],
    "placeholder": false
  },
  {
    "line": 26,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line26[0].f3_102[0]",
    "rect": [
      360.0,
      203.987,
      431.25,
      215.986
    ],
    "placeholder": false
  },
  {
    "line": 26,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line26[0].f3_103[0]",
    "rect": [
      432.0,
      203.987,
      503.25,
      215.986
    ],
    "placeholder": false
  },
  {
    "line": 26,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line26[0].f3_104[0]",
    "rect": [
      504.0,
      203.987,
      576.0,
      215.986
    ],
    "placeholder": false
  },
  {
    "line": 27,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line27[0].f3_105[0]",
    "rect": [
      288.0,
      179.986,
      359.25,
      191.987
    ],
    "placeholder": false
  },
  {
    "line": 27,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line27[0].f3_106[0]",
    "rect": [
      360.0,
      179.986,
      431.25,
      191.987
    ],
    "placeholder": false
  },
  {
    "line": 27,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line27[0].f3_107[0]",
    "rect": [
      432.0,
      179.986,
      503.25,
      191.987
    ],
    "placeholder": false
  },
  {
    "line": 27,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].Part1Table[0].Line27[0].f3_108[0]",
    "rect": [
      504.0,
      179.986,
      576.0,
      191.987
    ],
    "placeholder": false
  },
  {
    "line": 28,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line28[0].f3_109[0]",
    "rect": [
      288.0,
      155.97,
      359.25,
      167.969
    ],
    "placeholder": false
  },
  {
    "line": 28,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line28[0].f3_110[0]",
    "rect": [
      360.0,
      155.97,
      431.25,
      167.969
    ],
    "placeholder": false
  },
  {
    "line": 28,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line28[0].f3_111[0]",
    "rect": [
      432.0,
      155.97,
      503.25,
      167.969
    ],
    "placeholder": false
  },
  {
    "line": 28,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line28[0].f3_112[0]",
    "rect": [
      504.0,
      155.97,
      576.0,
      167.969
    ],
    "placeholder": false
  },
  {
    "line": 29,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line29[0].f3_113[0]",
    "rect": [
      359.0,
      143.971,
      360.0,
      155.97
    ],
    "placeholder": true
  },
  {
    "line": 29,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line29[0].f3_114[0]",
    "rect": [
      431.0,
      143.971,
      432.0,
      155.97
    ],
    "placeholder": true
  },
  {
    "line": 29,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line29[0].f3_115[0]",
    "rect": [
      503.0,
      143.971,
      504.0,
      155.97
    ],
    "placeholder": true
  },
  {
    "line": 29,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line29[0].f3_116[0]",
    "rect": [
      575.0,
      143.971,
      576.0,
      155.97
    ],
    "placeholder": true
  },
  {
    "line": 30,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line30[0].f3_117[0]",
    "rect": [
      288.0,
      107.971,
      359.25,
      119.971
    ],
    "placeholder": false
  },
  {
    "line": 30,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line30[0].f3_118[0]",
    "rect": [
      360.0,
      107.971,
      431.25,
      119.971
    ],
    "placeholder": false
  },
  {
    "line": 30,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line30[0].f3_119[0]",
    "rect": [
      432.0,
      107.971,
      503.25,
      119.971
    ],
    "placeholder": false
  },
  {
    "line": 30,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line30[0].f3_120[0]",
    "rect": [
      504.0,
      107.971,
      576.0,
      119.971
    ],
    "placeholder": false
  },
  {
    "line": 31,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line31[0].f3_121[0]",
    "rect": [
      288.0,
      95.972,
      359.25,
      107.971
    ],
    "placeholder": false
  },
  {
    "line": 31,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line31[0].f3_122[0]",
    "rect": [
      360.0,
      95.972,
      431.25,
      107.971
    ],
    "placeholder": false
  },
  {
    "line": 31,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line31[0].f3_123[0]",
    "rect": [
      432.0,
      95.972,
      503.25,
      107.971
    ],
    "placeholder": false
  },
  {
    "line": 31,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line31[0].f3_124[0]",
    "rect": [
      504.0,
      95.972,
      576.0,
      107.971
    ],
    "placeholder": false
  },
  {
    "line": 32,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line32[0].f3_125[0]",
    "rect": [
      359.0,
      83.973,
      360.0,
      95.972
    ],
    "placeholder": true
  },
  {
    "line": 32,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line32[0].f3_126[0]",
    "rect": [
      431.0,
      83.973,
      432.0,
      95.972
    ],
    "placeholder": true
  },
  {
    "line": 32,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line32[0].f3_127[0]",
    "rect": [
      503.0,
      83.973,
      504.0,
      95.972
    ],
    "placeholder": true
  },
  {
    "line": 32,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line32[0].f3_128[0]",
    "rect": [
      575.0,
      83.973,
      576.0,
      95.972
    ],
    "placeholder": true
  },
  {
    "line": 33,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line33[0].f3_129[0]",
    "rect": [
      288.0,
      71.974,
      359.25,
      83.973
    ],
    "placeholder": false
  },
  {
    "line": 33,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line33[0].f3_130[0]",
    "rect": [
      360.0,
      71.974,
      431.25,
      83.973
    ],
    "placeholder": false
  },
  {
    "line": 33,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line33[0].f3_131[0]",
    "rect": [
      432.0,
      71.974,
      503.25,
      83.973
    ],
    "placeholder": false
  },
  {
    "line": 33,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line33[0].f3_132[0]",
    "rect": [
      504.0,
      71.974,
      576.0,
      83.973
    ],
    "placeholder": false
  },
  {
    "line": 34,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line34[0].f3_133[0]",
    "rect": [
      359.0,
      59.975,
      360.0,
      71.974
    ],
    "placeholder": true
  },
  {
    "line": 34,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line34[0].f3_134[0]",
    "rect": [
      431.0,
      59.975,
      432.0,
      71.974
    ],
    "placeholder": true
  },
  {
    "line": 34,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line34[0].f3_135[0]",
    "rect": [
      503.0,
      59.975,
      504.0,
      71.974
    ],
    "placeholder": true
  },
  {
    "line": 34,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line34[0].f3_136[0]",
    "rect": [
      575.0,
      59.975,
      576.0,
      71.974
    ],
    "placeholder": true
  },
  {
    "line": 35,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line35[0].f3_137[0]",
    "rect": [
      288.0,
      47.976,
      359.25,
      59.975
    ],
    "placeholder": false
  },
  {
    "line": 35,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line35[0].f3_138[0]",
    "rect": [
      360.0,
      47.976,
      431.25,
      59.975
    ],
    "placeholder": false
  },
  {
    "line": 35,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line35[0].f3_139[0]",
    "rect": [
      432.0,
      47.976,
      503.25,
      59.975
    ],
    "placeholder": false
  },
  {
    "line": 35,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line35[0].f3_140[0]",
    "rect": [
      504.0,
      47.976,
      576.0,
      59.975
    ],
    "placeholder": false
  },
  {
    "line": 36,
    "column": "a",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line36[0].f3_141[0]",
    "rect": [
      288.0,
      35.977,
      359.25,
      47.976
    ],
    "placeholder": false
  },
  {
    "line": 36,
    "column": "b",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line36[0].f3_142[0]",
    "rect": [
      360.0,
      35.977,
      431.25,
      47.976
    ],
    "placeholder": false
  },
  {
    "line": 36,
    "column": "c",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line36[0].f3_143[0]",
    "rect": [
      432.0,
      35.977,
      503.25,
      47.976
    ],
    "placeholder": false
  },
  {
    "line": 36,
    "column": "d",
    "field": "topmostSubform[0].Page3[0].PartIITable[0].Line36[0].f3_144[0]",
    "rect": [
      504.0,
      35.977,
      576.0,
      47.976
    ],
    "placeholder": false
  }
] as const;
export const aiSinglePrinted={
  "a": {
    "1": "30000",
    "2": "",
    "3": "120000",
    "4": "0",
    "5": "",
    "6": "",
    "7": "15750",
    "8": "15750",
    "9": "0",
    "10": "15750",
    "11": "104250",
    "12": "0",
    "13": "104250",
    "14": "17867",
    "15": "0",
    "16": "0",
    "17": "17867",
    "18": "0",
    "19": "17867",
    "20": "",
    "21": "4020",
    "22": "",
    "23": "4020",
    "24": "8340",
    "25": "",
    "26": "8340",
    "27": "4020",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  },
  "b": {
    "1": "60000",
    "2": "",
    "3": "144000",
    "4": "0",
    "5": "",
    "6": "",
    "7": "15750",
    "8": "15750",
    "9": "0",
    "10": "15750",
    "11": "128250",
    "12": "0",
    "13": "128250",
    "14": "23627",
    "15": "0",
    "16": "0",
    "17": "23627",
    "18": "0",
    "19": "23627",
    "20": "",
    "21": "10632",
    "22": "4020",
    "23": "6612",
    "24": "8340",
    "25": "4320",
    "26": "12660",
    "27": "6612",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  },
  "c": {
    "1": "120000",
    "2": "",
    "3": "180000",
    "4": "0",
    "5": "",
    "6": "",
    "7": "15750",
    "8": "15750",
    "9": "0",
    "10": "15750",
    "11": "164250",
    "12": "0",
    "13": "164250",
    "14": "32267",
    "15": "0",
    "16": "0",
    "17": "32267",
    "18": "0",
    "19": "32267",
    "20": "",
    "21": "21780",
    "22": "10632",
    "23": "11148",
    "24": "8340",
    "25": "6048",
    "26": "14388",
    "27": "11148",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  },
  "d": {
    "1": "200000",
    "2": "",
    "3": "200000",
    "4": "0",
    "5": "",
    "6": "",
    "7": "15750",
    "8": "15750",
    "9": "0",
    "10": "15750",
    "11": "184250",
    "12": "0",
    "13": "184250",
    "14": "37067",
    "15": "0",
    "16": "0",
    "17": "37067",
    "18": "0",
    "19": "37067",
    "20": "",
    "21": "33360",
    "22": "21780",
    "23": "11580",
    "24": "8340",
    "25": "3240",
    "26": "11580",
    "27": "11580",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  }
} as const;
export const aiTwoOwnerPrinted={
  "a": {
    "1": "63185",
    "2": "",
    "3": "252740",
    "4": "0",
    "5": "",
    "6": "",
    "7": "31500",
    "8": "31500",
    "9": "15328",
    "10": "46828",
    "11": "205912",
    "12": "0",
    "13": "205912",
    "14": "35129",
    "15": "6723",
    "16": "0",
    "17": "41852",
    "18": "0",
    "19": "41852",
    "20": "",
    "21": "9417",
    "22": "",
    "23": "9417",
    "24": "9417",
    "25": "",
    "26": "9417",
    "27": "9417",
    "28": "9235",
    "29": "",
    "30": "44025",
    "31": "0",
    "32": "",
    "33": "0",
    "34": "",
    "35": "1071",
    "36": "1071"
  },
  "b": {
    "1": "105308",
    "2": "",
    "3": "252740",
    "4": "0",
    "5": "",
    "6": "",
    "7": "31500",
    "8": "31500",
    "9": "15328",
    "10": "46828",
    "11": "205912",
    "12": "0",
    "13": "205912",
    "14": "35129",
    "15": "6723",
    "16": "0",
    "17": "41852",
    "18": "0",
    "19": "41852",
    "20": "",
    "21": "18834",
    "22": "9417",
    "23": "9417",
    "24": "9417",
    "25": "0",
    "26": "9417",
    "27": "9417",
    "28": "15392",
    "29": "",
    "30": "73375",
    "31": "0",
    "32": "",
    "33": "0",
    "34": "",
    "35": "1071",
    "36": "1071"
  },
  "c": {
    "1": "168492",
    "2": "",
    "3": "252739",
    "4": "0",
    "5": "",
    "6": "",
    "7": "31500",
    "8": "31500",
    "9": "15328",
    "10": "46828",
    "11": "205911",
    "12": "0",
    "13": "205911",
    "14": "35128",
    "15": "6723",
    "16": "0",
    "17": "41851",
    "18": "0",
    "19": "41851",
    "20": "",
    "21": "28250",
    "22": "18833",
    "23": "9417",
    "24": "9417",
    "25": "0",
    "26": "9417",
    "27": "9417",
    "28": "24627",
    "29": "",
    "30": "117400",
    "31": "0",
    "32": "",
    "33": "0",
    "34": "",
    "35": "1071",
    "36": "1071"
  },
  "d": {
    "1": "252738",
    "2": "",
    "3": "252738",
    "4": "0",
    "5": "",
    "6": "",
    "7": "31500",
    "8": "31500",
    "9": "15328",
    "10": "46828",
    "11": "205910",
    "12": "0",
    "13": "205910",
    "14": "35128",
    "15": "6723",
    "16": "0",
    "17": "41851",
    "18": "0",
    "19": "41851",
    "20": "",
    "21": "37666",
    "22": "28250",
    "23": "9416",
    "24": "9417",
    "25": "0",
    "26": "9417",
    "27": "9416",
    "28": "36940",
    "29": "",
    "30": "176100",
    "31": "0",
    "32": "",
    "33": "0",
    "34": "",
    "35": "1071",
    "36": "1071"
  }
} as const;
export const aiSpousePrinted={
  "a": {
    "1": "",
    "2": "",
    "3": "",
    "4": "",
    "5": "",
    "6": "",
    "7": "",
    "8": "",
    "9": "",
    "10": "",
    "11": "",
    "12": "",
    "13": "",
    "14": "",
    "15": "",
    "16": "",
    "17": "",
    "18": "",
    "19": "",
    "20": "",
    "21": "",
    "22": "",
    "23": "",
    "24": "",
    "25": "",
    "26": "",
    "27": "",
    "28": "9235",
    "29": "",
    "30": "0",
    "31": "44025",
    "32": "",
    "33": "4581",
    "34": "",
    "35": "1071",
    "36": "5652"
  },
  "b": {
    "1": "",
    "2": "",
    "3": "",
    "4": "",
    "5": "",
    "6": "",
    "7": "",
    "8": "",
    "9": "",
    "10": "",
    "11": "",
    "12": "",
    "13": "",
    "14": "",
    "15": "",
    "16": "",
    "17": "",
    "18": "",
    "19": "",
    "20": "",
    "21": "",
    "22": "",
    "23": "",
    "24": "",
    "25": "",
    "26": "",
    "27": "",
    "28": "15392",
    "29": "",
    "30": "0",
    "31": "73375",
    "32": "",
    "33": "4581",
    "34": "",
    "35": "1071",
    "36": "5652"
  },
  "c": {
    "1": "",
    "2": "",
    "3": "",
    "4": "",
    "5": "",
    "6": "",
    "7": "",
    "8": "",
    "9": "",
    "10": "",
    "11": "",
    "12": "",
    "13": "",
    "14": "",
    "15": "",
    "16": "",
    "17": "",
    "18": "",
    "19": "",
    "20": "",
    "21": "",
    "22": "",
    "23": "",
    "24": "",
    "25": "",
    "26": "",
    "27": "",
    "28": "24627",
    "29": "",
    "30": "0",
    "31": "117400",
    "32": "",
    "33": "4581",
    "34": "",
    "35": "1071",
    "36": "5652"
  },
  "d": {
    "1": "",
    "2": "",
    "3": "",
    "4": "",
    "5": "",
    "6": "",
    "7": "",
    "8": "",
    "9": "",
    "10": "",
    "11": "",
    "12": "",
    "13": "",
    "14": "",
    "15": "",
    "16": "",
    "17": "",
    "18": "",
    "19": "",
    "20": "",
    "21": "",
    "22": "",
    "23": "",
    "24": "",
    "25": "",
    "26": "",
    "27": "",
    "28": "36940",
    "29": "",
    "30": "0",
    "31": "176100",
    "32": "",
    "33": "4581",
    "34": "",
    "35": "1071",
    "36": "5652"
  }
} as const;
export const aiItemizerPrinted={
  "a": {
    "1": "30000",
    "2": "",
    "3": "120000",
    "4": "5000",
    "5": "",
    "6": "20000",
    "7": "15750",
    "8": "20000",
    "9": "0",
    "10": "20000",
    "11": "100000",
    "12": "0",
    "13": "100000",
    "14": "16914",
    "15": "0",
    "16": "0",
    "17": "16914",
    "18": "0",
    "19": "16914",
    "20": "",
    "21": "3806",
    "22": "",
    "23": "3806",
    "24": "8111",
    "25": "",
    "26": "8111",
    "27": "3806",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  },
  "b": {
    "1": "60000",
    "2": "",
    "3": "144000",
    "4": "8500",
    "5": "",
    "6": "20400",
    "7": "15750",
    "8": "20400",
    "9": "0",
    "10": "20400",
    "11": "123600",
    "12": "0",
    "13": "123600",
    "14": "22511",
    "15": "0",
    "16": "0",
    "17": "22511",
    "18": "0",
    "19": "22511",
    "20": "",
    "21": "10130",
    "22": "3806",
    "23": "6324",
    "24": "8111",
    "25": "4305",
    "26": "12415",
    "27": "6324",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  },
  "c": {
    "1": "120000",
    "2": "",
    "3": "180000",
    "4": "15000",
    "5": "",
    "6": "22500",
    "7": "15750",
    "8": "22500",
    "9": "0",
    "10": "22500",
    "11": "157500",
    "12": "0",
    "13": "157500",
    "14": "30647",
    "15": "0",
    "16": "0",
    "17": "30647",
    "18": "0",
    "19": "30647",
    "20": "",
    "21": "20687",
    "22": "10130",
    "23": "10557",
    "24": "8111",
    "25": "6091",
    "26": "14202",
    "27": "10557",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  },
  "d": {
    "1": "200000",
    "2": "",
    "3": "200000",
    "4": "20000",
    "5": "",
    "6": "20000",
    "7": "15750",
    "8": "20000",
    "9": "0",
    "10": "20000",
    "11": "180000",
    "12": "0",
    "13": "180000",
    "14": "36047",
    "15": "0",
    "16": "0",
    "17": "36047",
    "18": "0",
    "19": "36047",
    "20": "",
    "21": "32442",
    "22": "20687",
    "23": "11756",
    "24": "8111",
    "25": "3645",
    "26": "11755",
    "27": "11755",
    "28": "",
    "29": "",
    "30": "",
    "31": "",
    "32": "",
    "33": "",
    "34": "",
    "35": "",
    "36": ""
  }
} as const;
export function aiPhysicalExpected(kind:AIPhysicalKind,spouse=false):Record<string,Record<string,string>>{return spouse?aiSpousePrinted:kind==='itemizer'?aiItemizerPrinted:kind.startsWith('two-owner')?aiTwoOwnerPrinted:aiSinglePrinted;}
export const aiPhysicalOracles={itemizer:{agi:'200000',taxable:'180000',tax:'36047',required:'32442',penalty:null,exactInstallments:['3805.65','6324.3','10556.775','11755.275']},single:{agi:'200000',taxable:'184250',tax:'37067',required:'33360',penalty:'744',exactInstallments:['4020.075','6612.075','11148.075','11579.775']},'single-zero-penalty':{agi:'200000',taxable:'184250',tax:'37067',required:'33360',penalty:'0',exactInstallments:['4020.075','6612.075','11148.075','11579.775']},'two-owner':{agi:'252738',taxable:'205910',tax:'41851',required:'37666',penalty:'1754',exactInstallments:['9416.5','9416.5','9416.5','9416.472']},'two-owner-k1':{agi:'252738',taxable:'205910',tax:'41851',required:'37666',penalty:'1754',exactInstallments:['9416.5','9416.5','9416.5','9416.472']}} as const;
export const aiOwnerLegend={x:36,y:26,size:7,primary:'REVIEW ONLY - PRIMARY PART II WORKSHEET',spouse:'REVIEW ONLY - SPOUSE PART II WORKSHEET'} as const;

/** Actual public guide/source builders, not a retained result or invented snapshot. */
export function aiPhysicalWorkspace(){
 const original=aiPhysicalFixture('single-zero-penalty'),w=aiPhysicalRequired(original.w2s[0]),f=aiPhysicalRequired(original.form2210);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null}),p=aiPhysicalRequired(state.sectionData['personal-info']);
 Object.assign(p,{firstName:original.taxpayer.primary.firstName,lastName:original.taxpayer.primary.lastName,ssn:original.taxpayer.primary.ssn,dateOfBirth:original.taxpayer.primary.dateOfBirth,addressLine1:original.taxpayer.address.street,city:original.taxpayer.address.city,state:original.taxpayer.address.state,zip:original.taxpayer.address.zip});
 state.sectionData['income-w2']={entries:[{...completeW2Entry,employerName:w.employer.name,employerEin:w.employer.ein??'',wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:w.socialSecurityWages??'',socialSecurityTips:w.socialSecurityTips??'',socialSecurityWithheld:w.socialSecurityWithheld??'',medicareWages:w.medicareWages??'',medicareWithheld:w.medicareWithheld??''}]};
 state.sectionData.deductions={...emptyDeductionData,method:'standard'};
 state.sectionData.payments={...emptyPaymentData,otherPayments:'0',estimatedPayments:[{date:'2025-04-15',amount:'33361'}],extensionPayments:[],priorYearAppliedCredits:[],estimatedTaxFacts:{...emptyEstimatedTaxFacts,sourceTaxYear:'2025',sourceReference:'PRIVATE original actual annualized payment history',sourceFactsConfirmed:true,allPaymentRecordsIncluded:true,calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,calculationMethod:'annualized',withholdingMethod:'equal-installments',priorYearTaxStatus:'no-return',earlyReturnExceptionClaimed:false,annualizedIncomePeriods:aiPhysicalRequired(f.annualizedIncomePeriods).map(row=>({adjustedGrossIncome:aiPhysicalRequired(row.adjustedGrossIncome),itemizedDeductions:aiPhysicalRequired(row.itemizedDeductions),qbiDeduction:aiPhysicalRequired(row.qbiDeduction),qualifiedDividends:aiPhysicalRequired(row.qualifiedDividends),netCapitalGain:aiPhysicalRequired(row.netCapitalGain),netProfitFromSelfEmployment:aiPhysicalRequired(row.netProfitFromSelfEmployment),socialSecurityWages:aiPhysicalRequired(row.socialSecurityWages),otherTaxes:aiPhysicalRequired(row.otherTaxes),credits:aiPhysicalRequired(row.credits),schedule1AAdjustment:'0'}))}};
 const workspace=syncGuidedFlowToWorkspace(createWorkspaceRecord('ai-physical-actual-workspace',{now:'2026-11-04T00:00:00.000Z'}),buildGuidedSyntheticDocuments(state),buildGuidedFactAnswers(state),state);
 return{workspace,state};
}
