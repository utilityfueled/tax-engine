/** Actual C source replay before review-template I/O. No whole-return tax is invented. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {calculateScheduleC,type ScheduleCResult} from '@/engine/schedules/schedule-c.js';
import {calculateScheduleCSourceFacts} from '@/engine/schedules/schedule-c-source-facts.js';
import {calculateForm2441Benefits} from '@/engine/forms/form-2441-benefits.js';
import {calculateDependentCareBenefitSources} from '@/engine/forms/dependent-care-benefit-sources.js';

export function calculateScheduleCReviewSource(input:TaxYearInput,saved?:ScheduleCResult){
 const source=calculateScheduleCSourceFacts(input,input.scheduleC,saved);
 if(!source)return undefined;
 if(!saved)throw new Error('Schedule C actual source calculation is missing');
 const benefits=input.dependentCareBenefits?calculateForm2441Benefits({taxYear:input.taxpayer.taxYear,filingStatus:input.taxpayer.filingStatus,facts:input.dependentCareBenefits}):undefined;
 const care=calculateDependentCareBenefitSources(input,benefits);
 const fresh=calculateScheduleC(input,input.scheduleC,{dependentCareBenefitsAdjustment:care.scheduleCAdjustment});
 // Decimal serialization and sorted object keys compare values without making
 // saved audit/breakdown totals evidence for their own correctness.
 const canonical=(value:unknown):unknown=>{
  if(Decimal.isDecimal(value))return value.toString();
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
  return value;
 };
 if(JSON.stringify(canonical(fresh))!==JSON.stringify(canonical(saved)))throw new Error('Schedule C actual source calculation does not reconcile with saved expense totals and audit');
 return source;
}
