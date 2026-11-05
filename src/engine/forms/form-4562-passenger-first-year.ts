/** Spec: spec/federal/form-4562-passenger-first-year.yaml. Standalone only. */
import Decimal from 'decimal.js';
import type {Form4562Input} from '@/models/inputs.js';
import type {Form4562Result} from './form-4562.js';
import {PassengerFirstYearSourcesSchema} from '@/models/passenger-auto-first-year-sources.js';
import {SECTION_280F_LIMITS} from '@/models/constants.js';
import {roundDollar} from '@/utils/decimal.js';
import {AuditTrail} from '@/utils/audit.js';
const fail=(detail:string):never=>{throw new Error(`Standalone passenger first-year worksheet: ${detail}`);};
function stable(v:unknown):unknown{
 if(v===null||typeof v==='string'||typeof v==='boolean')return v;
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(Array.isArray(v))return v.map(stable);
 if(typeof v==='object'&&v!==null&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,stable(x)]));
 return fail('originals must contain only actual JSON facts');
}
/** One new2026car; no deductions, export or owner validation outside this form. */
export function calculatePassengerFirstYear(input:Form4562Input,taxYear:number):Form4562Result{
 // Admitted source strings are at most100characters; exact products fit within256digits.
 // A fresh constructor keeps caller/global Decimal settings outside this calculation.
 const ExactDecimal=Decimal.clone({precision:256,rounding:Decimal.ROUND_HALF_UP});
 function amount(v:unknown):Decimal{
  if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))return fail('explicit finite nonnegative amounts are required');
  const n=new ExactDecimal(v);if(!n.isFinite())return fail('finite amounts are required');return n;
 }

 const parsed=PassengerFirstYearSourcesSchema.safeParse(input.passengerFirstYearSources);
 if(!parsed.success)return fail('complete original documentary facts are required');
 const s=parsed.data,zero=new ExactDecimal(0);
 if(input.taxYear!==2026||taxYear!==2026)return fail('explicit actual2026year required');
 const {passengerFirstYearSources:_packet,...current}=input;void _packet;
 if(JSON.stringify(stable(s.originalForm))!==JSON.stringify(stable(current)))return fail('original form or asset changed');
 if(input.assets?.length!==1||input.amortizableAssets?.length)return fail('one sole asset and activity required');
 const a=input.assets[0];
 if(a.basisSources!==undefined||a.dispositionSources!==undefined||a.isListedProperty!==true||a.isPassengerAutomobile!==true||a.disposedDuringYear!==false||a.recoveryPeriod!=='5'||a.method!=='200DB'||a.convention!=='halfYear'||a.section280FRecaptureTriggered!==false)return fail('unsupported asset or history');
 if(!/^2026-0[1-9]-\d{2}$/.test(a.placedInServiceDate)||!Number.isFinite(Date.parse(a.placedInServiceDate))||new Date(a.placedInServiceDate).toISOString().slice(0,10)!==a.placedInServiceDate)return fail('actual January through September2026placement required');
 if(s.purchaseContractDate<='2025-01-19'||s.acquisitionDate<='2025-01-19'||s.purchaseContractDate>s.acquisitionDate||s.acquisitionDate>a.placedInServiceDate)return fail('unsupported acquisition or contract dates');
 const weight=amount(s.unloadedVehicleWeightPounds);if(weight.lte(0)||weight.gt(6000))return fail('ordinary passenger car weight required');
 const use=amount(s.businessUsePercentage),businessMiles=amount(s.mileage.businessMiles),commuting=amount(s.mileage.commutingMiles),personal=amount(s.mileage.otherPersonalMiles),miles=amount(s.mileage.totalMiles);
 if(use.lte(50)||use.gt(100)||typeof a.businessUsePercentage!=='number'||!use.eq(String(a.businessUsePercentage))||miles.lte(0)||!businessMiles.plus(commuting).plus(personal).eq(miles)||!businessMiles.times(100).eq(use.times(miles)))return fail('actual qualified annual mileage and percentage disagree');
 if(!amount(a.cumulativePriorMacrsDeductions).isZero()||!amount(a.cumulativePriorAdsDeductions).isZero())return fail('prior depreciation history unsupported');
 const gross=amount(s.grossCostBasis),businessBasis=gross.times(use).div(100),pi=s.partI,section179=amount(pi.allowedSection179),income=amount(pi.businessIncomeLimit);
 if(gross.lte(0)||!amount(a.costBasis).eq(gross.minus(section179)))return fail('gross and legacy after-business179basis disagree');
 if(!amount(pi.maximum).eq('2560000')||!amount(pi.threshold).eq('4090000')||!amount(pi.totalCost).eq(businessBasis)||!amount(pi.electedCost).eq(section179)||!amount(pi.priorCarryover).isZero()||!amount(pi.nextCarryover).isZero()||businessBasis.gt('4090000')||section179.gt('2560000')||section179.gt(businessBasis)||section179.gt(income)||!section179.eq(roundDollar(section179)))return fail('unsupported limited election, carryover or incomplete PartI');
 const pairs=[['section179MaximumDeduction',pi.maximum],['section179ThresholdCost',pi.threshold],['section179TotalCost',pi.totalCost],['section179ElectedCost',pi.electedCost],['section179BusinessIncomeLimit',pi.businessIncomeLimit],['section179ExpenseDeduction',pi.allowedSection179],['section179CarryoverFromPriorYear',pi.priorCarryover],['section179CarryoverToNextYear',pi.nextCarryover]] as const;
 for(const [key,v] of pairs)if(!amount(input[key]).eq(amount(v)))return fail('actual PartI and form scalars disagree');
 for(const key of ['specialDepreciationAllowance','section168f1Depreciation','otherDepreciation','macrsPre2025AssetsDepreciation','macrsCurrentYearGdsDepreciation','macrsCurrentYearAdsDepreciation','listedPropertyDepreciation','currentYearAmortization','priorYearAmortization'] as const)if(!amount(input[key]).isZero())return fail('other or separate summary deductions unsupported');
 const limits=SECTION_280F_LIMITS[2026],ordinaryLimit=new ExactDecimal(limits.withoutBonus[0].toString()),bonusLimit=new ExactDecimal(limits.withBonus[0].toString()),baseCap=roundDollar(ordinaryLimit.times(use).div(100)),bonus=s.bonus.treatment==='qualified_100_percent';
 if(a.firstYearBonusEligible!==bonus)return fail('actual claimed bonus treatment and asset flag disagree');
 // Finite positive100% branch requires a genuinely positive remaining allowance.
 // Reject a proposed179amount beyond the ordinary ceiling, rather than use an
 // unclaimed bonus amount to manufacture the additional ceiling.
 if(section179.gt(baseCap)||(bonus&&roundDollar(businessBasis.minus(section179)).lte(0)))return fail('section179 exceeds supported passenger election or exhausts bonus basis');
 const cap=bonus?roundDollar(bonusLimit.times(use).div(100)):baseCap;
 const remainingCap=cap.minus(section179),tentativeBasis=businessBasis.minus(section179),tentativeBonus=bonus?tentativeBasis:zero;
 const allowedBonus=bonus?ExactDecimal.min(roundDollar(tentativeBonus),remainingCap):zero;
 const tentativeRegular=bonus?zero:roundDollar(tentativeBasis.times('0.20'));
 const regular=ExactDecimal.min(remainingCap.minus(allowedBonus),tentativeRegular),line21=allowedBonus.plus(regular),line22=section179.plus(line21);
 const worksheet={'7':bonus?bonusLimit:ordinaryLimit,'8':use,'9':cap,'10':section179,'11':remainingCap,'12':gross,'13':businessBasis,'14':section179,'15':tentativeBasis,'16-tentative':tentativeBonus,'16-allowed':allowedBonus,'17':remainingCap.minus(allowedBonus),...(!bonus?{'18':tentativeBasis}:allowedBonus.eq(roundDollar(tentativeBasis))?{'18':zero}:{}),'19':tentativeRegular,'20':regular};
 const audit=new AuditTrail();
 for(const [line,value] of Object.entries(worksheet))audit.record('Passenger first-year worksheet',line,'Standalone passenger worksheet amount',value,'Original-bound first-year worksheet; no owner or future-year qualification');
 for(const [line,value] of Object.entries({'7':section179,'12':section179,'14':zero,'25':allowedBonus,'26(h)':regular,'26(i)':section179,'28':line21,'29':section179,'21':line21,'22':line22}))audit.record('Form 4562',line,'Standalone passenger allocation',value,'Section179 via29/7/12; listed bonus and regular via25/26/28/21, counted once');
 return {line1:amount(pi.maximum),line2:roundDollar(businessBasis),line3:amount(pi.threshold),line4:zero,line5:amount(pi.maximum),line7:section179,line8:section179,line9:section179,line10:zero,line11:roundDollar(ExactDecimal.min(income,amount(pi.maximum))),line12:section179,line13:zero,line14:zero,line15:zero,line16:zero,line17:zero,line19:zero,line20:zero,line21,line22,line25:allowedBonus,line28:line21,line29:section179,line42:zero,line43:zero,line44:zero,assetResults:[],listedPropertyResults:[],midQuarterRequired:false,amortizationResults:[],section280FRecaptureIncome:zero,lines:audit.getLines(),passengerFirstYearWorksheet:worksheet};
}
