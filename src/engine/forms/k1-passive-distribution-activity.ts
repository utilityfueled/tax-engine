/** Original single-activity classification; spec/federal/k1-passive-distribution-gain.yaml. */
import Decimal from 'decimal.js';
import type { ScheduleK1 } from '@/models/inputs.js';
import type { K1PassiveDistributionSources } from '@/models/k1-passive-distribution-sources.js';
import { d, sum } from '@/utils/decimal.js';
export interface K1PassiveDistributionActivity {
  valuationDate:string; fairMarketValue:Decimal; adjustedBasis:Decimal;
}
function actual(value:string|undefined,label:string,signed=false):Decimal {
  if(typeof value!=='string'||!(signed?/^-?\d+(\.\d+)?$/:/^\d+(\.\d+)?$/).test(value)||!d(value).isFinite())
    throw new Error(`K1 passive distribution requires actual ${label}`);
  return d(value);
}
function confirmed(value:boolean|undefined,label:string):void {
  if(value!==true) throw new Error(`K1 passive distribution requires confirmed ${label}`);
}
function text(value:string|undefined,label:string):string {
  if(!value?.trim()) throw new Error(`K1 passive distribution requires actual ${label}`);
  return value.trim();
}
function actualDate(value:string|undefined):string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    ||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value) throw new Error('K1 passive distribution requires an actual valuation date and property acquisition dates');
  return value;
}
export function calculateK1PassiveDistributionActivity(k1:ScheduleK1,distributionDate:string,source:K1PassiveDistributionSources|undefined):K1PassiveDistributionActivity {
  if(!source||source.sourceTaxYear!==k1.taxYear||source.sourceFactsConfirmed!==true)
    throw new Error('K1 passive distribution requires confirmed actual source-year activity evidence');
  text(source.sourceReference,'entity activity/valuation source reference');
  if(text(source.activityName,'activity identity').toLocaleLowerCase('en-US')!==k1.partnershipName.trim().toLocaleLowerCase('en-US'))
    throw new Error('K1 passive distribution actual activity identity differs from its original K1');
  if(k1.isPassiveActivity!==true||k1.qbiMateriallyParticipated!==false||k1.isPubliclyTradedPartnership||k1.ptpFullyDisposedInTaxableTransaction||k1.isForeignPartnership)
    throw new Error('K1 passive distribution requires the actual continuing ordinary non-PTP passive business');
  for(const key of ['allActivitiesAndAssetsIncludedConfirmed','continuingActivityConfirmed','noMaterialParticipationTestMetConfirmed',
    'noTieredOrSpecialAllocationConfirmed','allPreDistributionEventsIncludedConfirmed'] as const) confirmed(source[key],key);
  if(actual(source.combinedParticipationHours,'combined owner/spouse participation hours').gt(100))
    throw new Error('K1 passive distribution significant participation requires its separate recharacterization method');
  const ownerValue=actual(source.beginningHolderInterestValue,'beginning owner interest value');
  let exception=actual(source.appreciatedContributionsFmv,'appreciated property contribution FMV').gt(ownerValue.times('0.10'))
    ||actual(source.depreciatedContributionsBasis,'depreciated property contribution basis').gt(ownerValue.times('0.10'));
  if(!Array.isArray(source.activityEvents)||source.activityEvents.length===0) throw new Error('K1 passive distribution requires complete actual pre-distribution activity events, including zero');
  const eventIds=new Set<string>(),activityNames=new Set<string>();
  for(const event of source.activityEvents){
    const id=text(event.sourceId,'activity event identity');text(event.sourceReference,'activity event reference');
    const name=text(event.activityName,'activity identity for the complete annual event aggregate').toLocaleLowerCase('en-US');
    if(activityNames.has(name)) throw new Error('K1 passive distribution event rows must have distinct actual activity identities');activityNames.add(name);
    if(eventIds.has(id)) throw new Error('K1 passive distribution activity event identities must be unique');eventIds.add(id);
    const beginning=actual(event.beginningActivityValue,'beginning activity value'),disposed=actual(event.activityInterestDisposedValue,'disposed activity beginning value');
    const property=actual(event.beginningPropertyValue,'beginning property value'),propertyDisposed=actual(event.propertyDisposedValue,'disposed property beginning value');
    if(disposed.gt(beginning)||propertyDisposed.gt(property)) throw new Error('K1 passive distribution original disposed beginning values exceed their complete beginning sources');
    exception ||= disposed.gt(beginning.times('0.10'))||propertyDisposed.gt(property.times('0.10'));
  }
  if(source.entitySelectedValuationDate!=='year_start'&&source.entitySelectedValuationDate!=='distribution_date')
    throw new Error('K1 passive distribution requires the actual entity-selected valuation date method');
  const preceding=new Date(`${distributionDate}T00:00:00Z`);preceding.setUTCDate(preceding.getUTCDate()-1);
  const expected=exception?preceding.toISOString().slice(0,10):source.entitySelectedValuationDate==='year_start'?`${k1.taxYear}-01-01`:distributionDate;
  const valuationDate=actualDate(source.valuationDate);
  if(valuationDate!==expected) throw new Error('K1 passive distribution valuation date does not match the original entity selection and actual transaction exception');
  if(!Array.isArray(source.assets)||source.assets.length===0) throw new Error('K1 passive distribution requires the complete actual underlying asset ledger');
  const assetIds=new Set<string>(),fmvs:Decimal[]=[],bases:Decimal[]=[];
  for(const asset of source.assets){
    const id=text(asset.sourceId,'asset identity');text(asset.sourceReference,'asset source reference');
    if(assetIds.has(id)) throw new Error('K1 passive distribution asset identities must be unique');assetIds.add(id);
    if(asset.character!=='ordinary_business_property'&&asset.character!=='business_cash')
      throw new Error('K1 passive distribution portfolio rental oil/gas licensing or unknown assets require their separate source allocation');
    if(actualDate(asset.acquiredDate)>valuationDate) throw new Error('K1 passive distribution asset was acquired after the actual valuation date');
    confirmed(asset.continuousPassiveUseConfirmed,'continuous passive use throughout the relevant owner holding period');
    confirmed(asset.noNonpassiveRecharacterizationConfirmed,'absence of actual nonpassive property/history recharacterization');
    confirmed(asset.noRecaptureOrSpecialCapitalGainConfirmed,'absence of recapture or special capital-gain lookthrough');
    const fmv=actual(asset.fairMarketValue,'original asset FMV'),basis=actual(asset.adjustedBasis,'original asset basis'),adjustment=actual(asset.ownerBasisAdjustment,'actual owner-specific basis adjustment',true);
    if(asset.character==='business_cash'&&(!fmv.eq(basis)||!adjustment.isZero()))
      throw new Error('K1 passive distribution actual U.S. business cash must retain equal FMV and basis without an owner basis adjustment');
    if(basis.plus(adjustment).lt(0)) throw new Error('K1 passive distribution adjusted original asset basis cannot be negative');
    if(k1.entityType==='s_corporation'&&!adjustment.isZero()) throw new Error('K1 passive distribution S stock cannot use a partnership owner basis adjustment');
    fmvs.push(fmv);bases.push(basis.plus(adjustment));
  }
  const fairMarketValue=sum(...fmvs),adjustedBasis=sum(...bases);
  if(fairMarketValue.lte(0)) throw new Error('K1 passive distribution requires positive actual underlying activity value');
  return {valuationDate,fairMarketValue,adjustedBasis};
}
