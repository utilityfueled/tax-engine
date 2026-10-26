/** Actual461-origin regular NOL character; spec/federal/qbi-ebl-nol.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { CodNolVintageReduction } from './cod-nol-reductions.js';
import { calculateNetOperatingLoss, type NetOperatingLossResult, type NetOperatingLossVintageSource } from './net-operating-loss.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';

export type QbiEblNolInput=Pick<TaxYearInput,'qbiLossSources'|'netOperatingLoss'> & {
  taxpayer:Pick<TaxYearInput['taxpayer'],'taxYear'|'filingStatus'> & {
    primary:Pick<TaxYearInput['taxpayer']['primary'],'firstName'|'lastName'|'ssn'>;
    spouse?:Pick<TaxYearInput['taxpayer']['primary'],'firstName'|'lastName'|'ssn'>;
  };
};
export interface QbiEblNolVintage {
  sourceId:string;lossTaxYear:number;accountHolder:'primary'|'spouse';
  materiallyParticipatedInCurrentYear?:boolean;
  originalLoss:Decimal;originalQualifiedLoss:Decimal;openingCarryforward:Decimal;qualifiedOpeningCarryforward:Decimal;
  deduction?:Decimal;qualifiedDeduction?:Decimal;absorbed?:Decimal;qualifiedAbsorbed?:Decimal;
  attributeReduction?:Decimal;qualifiedAttributeReduction?:Decimal;expired?:Decimal;qualifiedExpired?:Decimal;
  remainingCarryforward?:Decimal;qualifiedRemainingCarryforward?:Decimal;
}
export interface QbiEblNolResult {
  sourceFactsVerified:true;calculationComplete:boolean;currentQualifiedDeduction?:Decimal;currentActiveQualifiedDeduction?:Decimal;
  vintages:QbiEblNolVintage[];lines:CalculatedLine[];
}
function text(value:string|undefined,label:string):string {
  if(!value?.trim()) throw new Error(`EBL QBI requires actual ${label}`);
  return value.trim();
}
function amount(value:string|undefined,label:string):Decimal {
  if(value===undefined||!/^\d+$/.test(value)||!d(value).isFinite()) throw new Error(`EBL QBI requires actual nonnegative filed whole-dollar ${label}`);
  return d(value);
}
function canonical(value:Decimal|undefined,label:string):Decimal {
  if(!Decimal.isDecimal(value)||!value.isFinite()||value.lt(0)||!value.isInteger()) throw new Error(`EBL QBI requires completed canonical ${label}`);
  return value;
}
function name(value:string):string {return value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');}
function snapshotMatches(a:NetOperatingLossVintageSource,b:NetOperatingLossVintageSource):boolean {
  const fields=['sourceId','lossTaxYear','sourceReference','originKind','originalLoss','openingCarryforward','carrybackTreatment',
    'adjustedThroughTaxYear','historySourceReference','allHistoryIncluded','farmingLossIncluded'] as const;
  if(fields.some(key=>a[key]!==b[key])||!Array.isArray(a.history)||!Array.isArray(b.history)||a.history.length!==b.history.length) return false;
  const otherHistory=b.history;
  return a.history.every(row=>otherHistory.filter(other=>other.taxYear===row.taxYear&&other.nolUsed===row.nolUsed
    &&other.attributeReduction===row.attributeReduction&&other.sourceReference===row.sourceReference).length===1);
}
function qualifiedPortion(total:Decimal,opening:Decimal,qualifiedOpening:Decimal,original:Decimal,qualifiedOriginal:Decimal):Decimal {
  const portion=total.eq(opening)?qualifiedOpening:roundDollar(total.times(qualifiedOriginal).div(original));
  if(portion.gt(total)||portion.gt(qualifiedOpening)||total.minus(portion).gt(opening.minus(qualifiedOpening))) {
    throw new Error('EBL QBI fixed originating ratio and actual opening character do not conserve the canonical use');
  }
  return portion;
}

export function calculateQbiEblNol(input:QbiEblNolInput,context?:{regular:NetOperatingLossResult;codVintages?:CodNolVintageReduction[]}):QbiEblNolResult {
  const facts=input.netOperatingLoss,packet=input.qbiLossSources,year=input.taxpayer.taxYear;
  const recorded=packet?.excessBusinessLossHistories;
  if(!facts) {
    if(recorded?.length) throw new Error('EBL QBI history requires its actual regular NOL source');
    return {sourceFactsVerified:true,calculationComplete:context!==undefined,...(context?{currentQualifiedDeduction:d('0')}:{}),vintages:[],lines:[]};
  }
  const source=calculateNetOperatingLoss({taxYear:year,filingStatus:input.taxpayer.filingStatus,taxpayer:input.taxpayer,facts});
  const originals=source.vintages.filter(row=>row.originKind==='excess_business_loss');
  if(originals.length===0) {
    if(recorded?.length) throw new Error('EBL QBI history cannot bind an ordinary or alternative-tax NOL');
    return {sourceFactsVerified:true,calculationComplete:context!==undefined,...(context?{currentQualifiedDeduction:d('0')}:{}),vintages:[],lines:[]};
  }
  if(!packet||packet.sourceTaxYear!==year||packet.sourceFactsConfirmed!==true||!packet.sourceReference?.trim()
    ||packet.allExcessBusinessLossHistoriesIncluded!==true||!Array.isArray(recorded)||recorded.length!==originals.length) {
    throw new Error('EBL QBI requires complete actual originating character histories, once per regular vintage');
  }
  const seen=new Set<string>(),audit=new AuditTrail();
  const vintages:QbiEblNolVintage[]=recorded.map(history=>{
    const id=text(history.nolSourceId,'original NOL source identity'),original=originals.find(row=>row.sourceId===id);
    const record=facts.vintages?.find(row=>row.sourceId===id);
    if(!original||!record||seen.has(id)) throw new Error('EBL QBI original history must bind each regular source once without duplicates');
    seen.add(id);
    if(history.sourceTaxYear!==year-1||history.sourceFactsConfirmed!==true||!history.sourceReference?.trim()
      ||history.allHistoryIncluded!==true||!Array.isArray(history.history)) throw new Error('EBL QBI requires complete actual preceding-year qualified history');
    if(!history.originalNol||!snapshotMatches(history.originalNol,record)) throw new Error('EBL QBI original NOL snapshot must match the actual source and history');
    const owner=history.accountHolder,person=owner==='primary'?input.taxpayer.primary:owner==='spouse'?input.taxpayer.spouse:undefined;
    if(!owner||!person||(owner==='spouse'&&input.taxpayer.filingStatus!=='married_filing_jointly')
      ||name(text(history.recipientName,'recipient identity'))!==name(`${person.firstName} ${person.lastName}`)
      ||!/^\d{9}$/.test(person.ssn.replaceAll('-',''))||!/^\d{4}$/.test(history.recipientTaxpayerIdLast4??'')
      ||person.ssn.replaceAll('-','').slice(-4)!==history.recipientTaxpayerIdLast4) throw new Error('EBL QBI history owner identity must match the actual continuing taxpayer');
    text(history.activityName,'origin activity name');text(history.limitationSourceReference,'origin461 and qualified-character record');
    if(!/^\d{2}-?\d{7}$/.test(history.activityEIN??'')) throw new Error('EBL QBI requires the original activity EIN');
    const qualifiedOriginal=amount(history.originalQualifiedLoss,'original qualified loss'),qualifiedOpening=amount(history.qualifiedOpeningCarryforward,'qualified opening carry');
    if(qualifiedOriginal.gt(original.originalLoss)||qualifiedOpening.gt(original.openingCarryforward)) throw new Error('EBL QBI qualified source character exceeds its original regular amount');
    const regularHistory=record.history;
    if(!regularHistory||history.history.length!==regularHistory.length) throw new Error('EBL QBI complete qualified history must include every actual regular history row');
    const years=new Set<number>();
    const reductions=history.history.map(row=>{
      const regular=regularHistory.find(value=>value.taxYear===row.taxYear);
      if(row.taxYear===undefined||years.has(row.taxYear)||!regular||!row.sourceReference?.trim()) throw new Error('EBL QBI history requires unique actual regular use years and records');
      years.add(row.taxYear);
      const used=amount(row.qualifiedNolAbsorption,'qualified historical absorption'),reduced=amount(row.qualifiedAttributeReduction,'qualified historical attribute reduction');
      if(used.gt(amount(regular.nolUsed,'original historical use'))||reduced.gt(amount(regular.attributeReduction,'original historical attribute reduction'))) throw new Error('EBL QBI historical character cannot exceed each actual regular history amount');
      return used.plus(reduced);
    });
    if(!qualifiedOriginal.minus(sum(...reductions)).eq(qualifiedOpening)
      ||original.openingCarryforward.minus(qualifiedOpening).gt(original.originalLoss.minus(qualifiedOriginal))) throw new Error('EBL QBI original, historical and opening qualified character must reconcile separately');
    audit.record('EBL QBI Carry Sources',id,'Actual qualified opening regular NOL',qualifiedOpening,
      'Filed originating qualified character less actual qualified absorption and attribute reductions; independent of ordinary QBI and AMT carries',
      {'Origin year':String(original.lossTaxYear),'Original regular loss':original.originalLoss,'Original qualified loss':qualifiedOriginal,'Opening regular carry':original.openingCarryforward});
    return {sourceId:id,lossTaxYear:original.lossTaxYear,accountHolder:owner,materiallyParticipatedInCurrentYear:history.materiallyParticipatedInCurrentYear,originalLoss:original.originalLoss,originalQualifiedLoss:qualifiedOriginal,
      openingCarryforward:original.openingCarryforward,qualifiedOpeningCarryforward:qualifiedOpening};
  }).sort((a,b)=>a.lossTaxYear-b.lossTaxYear);
  if(!context) return {sourceFactsVerified:true,calculationComplete:false,vintages,lines:audit.getLines()};
  const regular=context.regular;
  if(regular.sourceFactsVerified!==true||!regular.calculationComplete||regular.vintages.length!==source.vintages.length
    ||!canonical(regular.deduction,'regular deduction').eq(sum(...regular.vintages.map(row=>canonical(row.deduction,'vintage deduction'))))
    ||!canonical(regular.carryforward,'regular carry').eq(sum(...regular.vintages.map(row=>canonical(row.remainingCarryforward,'vintage carry'))))) {
    throw new Error('EBL QBI requires completed actual regular canonical NOL vintages');
  }
  for(const row of source.vintages) {
    const matches=regular.vintages.filter(other=>other.sourceId===row.sourceId),actual=matches[0];
    if(matches.length!==1||actual.lossTaxYear!==row.lossTaxYear||actual.originKind!==row.originKind
      ||!actual.originalLoss.eq(row.originalLoss)||!actual.openingCarryforward.eq(row.openingCarryforward)
      ||!sum(canonical(actual.absorbed,'absorption'),canonical(actual.expired,'expiry'),canonical(actual.remainingCarryforward,'remaining carry')).eq(row.openingCarryforward)) {
      throw new Error('EBL QBI canonical NOL source and closing balances must conserve the actual original history');
    }
  }
  for(const row of vintages) {
    const actual=regular.vintages.find(value=>value.sourceId===row.sourceId);
    if(!actual) throw new Error('EBL QBI canonical source vintage is missing');
    const deduction=canonical(actual.deduction,'current deduction'),absorbed=canonical(actual.absorbed,'current absorption');
    const expired=canonical(actual.expired,'current expiry'),remaining=canonical(actual.remainingCarryforward,'remaining carry');
    if(deduction.gt(row.openingCarryforward)||absorbed.lt(deduction)||!expired.isZero()||!actual.expiredBeforeYear.isZero()) {
      throw new Error('EBL QBI canonical claim, modified absorption and post2020 nonexpiring carry require a reconciled supported context');
    }
    const qualifiedDeduction=qualifiedPortion(deduction,row.openingCarryforward,row.qualifiedOpeningCarryforward,row.originalLoss,row.originalQualifiedLoss);
    const qualifiedAbsorbed=qualifiedPortion(absorbed,row.openingCarryforward,row.qualifiedOpeningCarryforward,row.originalLoss,row.originalQualifiedLoss);
    let attributeReduction=d('0'),qualifiedAttributeReduction=d('0'),closing=remaining,qualifiedClosing=row.qualifiedOpeningCarryforward.minus(qualifiedAbsorbed);
    if(context.codVintages!==undefined) {
      const matches=context.codVintages.filter(value=>value.sourceId===row.sourceId),cod=matches[0];
      if(matches.length!==1||cod.lossTaxYear!==row.lossTaxYear||!cod.originalLoss.eq(row.originalLoss)
        ||!canonical(cod.beforeReduction,'COD opening').eq(remaining)||!canonical(cod.expiredAfterReduction,'COD expiry').isZero()
        ||!sum(canonical(cod.attributeReduction,'COD reduction'),canonical(cod.remainingCarryforward,'COD closing')).eq(remaining)) throw new Error('EBL QBI current COD must conserve each actual regular source');
      attributeReduction=cod.attributeReduction;closing=cod.remainingCarryforward;
      if(attributeReduction.eq(remaining)) qualifiedAttributeReduction=qualifiedClosing;
      else if(qualifiedClosing.eq(remaining)) qualifiedAttributeReduction=attributeReduction;
      else if(attributeReduction.gt(0)&&qualifiedClosing.gt(0)) throw new Error('EBL QBI mixed-character attribute reduction requires its separate allocation method');
      qualifiedClosing=qualifiedClosing.minus(qualifiedAttributeReduction);
    }
    Object.assign(row,{deduction,qualifiedDeduction,absorbed,qualifiedAbsorbed,attributeReduction,qualifiedAttributeReduction,
      expired,qualifiedExpired:d('0'),remainingCarryforward:closing,qualifiedRemainingCarryforward:qualifiedClosing});
    audit.record('EBL QBI Current Deduction',row.sourceId,'Qualified portion of actual regular NOL deduction',qualifiedDeduction,
      'Completed actual regular deduction times fixed original qualified fraction; modified absorption and after-tax attribute reductions are not current deductions',
      {'Regular deduction':deduction,'Qualified original loss':row.originalQualifiedLoss,'Original regular loss':row.originalLoss,
        'Modified regular absorption':absorbed,'Qualified absorption':qualifiedAbsorbed,'Regular attribute reduction':attributeReduction,
        'Qualified attribute reduction':qualifiedAttributeReduction,'Qualified remaining carry':qualifiedClosing});
  }
  const activeKnown=vintages.every(row=>canonical(row.qualifiedDeduction,'qualified deduction').isZero()||row.materiallyParticipatedInCurrentYear!==undefined);
  return {sourceFactsVerified:true,calculationComplete:true,currentQualifiedDeduction:sum(...vintages.map(row=>canonical(row.qualifiedDeduction,'qualified deduction'))),
    ...(activeKnown?{currentActiveQualifiedDeduction:sum(...vintages.filter(row=>row.materiallyParticipatedInCurrentYear).map(row=>canonical(row.qualifiedDeduction,'qualified deduction')))}:{}),vintages,lines:audit.getLines()};
}
