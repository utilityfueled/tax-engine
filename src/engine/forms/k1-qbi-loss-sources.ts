/** Actual ordinary K-1 source validation, without calculated loss overrides.
 * Spec: spec/federal/k1-qbi-loss-sources.yaml.
 */
import Decimal from 'decimal.js';
import type { ScheduleK1, TaxYearInput } from '@/models/inputs.js';
import type { QbiLossHistorySource } from '@/engine/forms/qbi-loss-character.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';
import { d, sum } from '@/utils/decimal.js';

type Identity=Pick<TaxYearInput['taxpayer']['primary'],'firstName'|'lastName'|'ssn'>;
export interface K1QbiLossSourceInput {
  taxpayer:{taxYear:number;filingStatus:TaxYearInput['taxpayer']['filingStatus'];primary:Identity;spouse?:Identity};
  scheduleK1:ScheduleK1[];
  qbiLossSources?:TaxYearInput['qbiLossSources'];
  k1CharitableSources?:TaxYearInput['k1CharitableSources'];
  standardDeductionFacts?:TaxYearInput['standardDeductionFacts'];
  eic?:Pick<NonNullable<TaxYearInput['eic']>,'claimantEligibility'>;
  priorYear?:Pick<NonNullable<TaxYearInput['priorYear']>,'suspendedPassiveLosses'>;
  rentalProperties?:Array<Pick<TaxYearInput['rentalProperties'][number],'description'>>;
}
export interface ValidatedK1QbiLossSource {
  sourceId:string;k1Index:number;accountHolder:'primary'|'spouse';
  ordinaryIncome:Decimal;qualifiedBusinessIncome:Decimal;priorPassiveLoss:Decimal;passiveCapitalGain:Decimal;
  basisHistory:QbiLossHistorySource;atRiskHistory:QbiLossHistorySource;passiveHistory:QbiLossHistorySource;
}
const ordinaryOnlyZeroFields=[
  'netRentalIncome','otherNetRentalIncome','guaranteedPayments','interestIncome','ordinaryDividends','qualifiedDividends','royalties',
  'netShortTermCapitalGain','netLongTermCapitalGain','unrecapturedSection1250Gain','collectiblesGain','section1231Gain','otherIncome',
  'section179Deduction','otherDeductions','charitableCash','charitableCapitalGain30','charitableCapitalGain20','investmentInterestExpense',
  'excessBusinessInterest','foreignTaxPaid','foreignSourceIncome','amtDepreciationAdjustment','amtAdjustedGainOrLoss','amtDepletion','amtOtherItems',
  'taxExemptInterest','otherTaxExemptIncome','nondeductibleExpenses','distributions','investmentIncome','investmentExpenses','excessTaxableIncome',
  'excessBusinessInterestIncome','section199AQualifiedReitDividends','section199AQualifiedPTPIncome','section199APTPW2Wages','section199APTPUBIA',
  'lowIncomeHousingCredit42j5','lowIncomeHousingCreditOther','qualifiedRehabilitationExpenditures','otherRentalRealEstateCredits',
  'otherRentalCredits','otherCredits','ptpDispositionGainOrLoss','beginningDebtBasis','additionalLoansToScorp','priorDebtBasisReduction',
] as const satisfies readonly (keyof ScheduleK1)[];
function amount(value:string|undefined,label:string,nonnegative=false,whole=false):Decimal {
  if(typeof value!=='string'||!/^[-]?\d+(\.\d+)?$/.test(value)) throw new Error(`K1 QBI ${label} requires an actual source amount`);
  const valueD=d(value);
  if(!valueD.isFinite()||(nonnegative&&valueD.lt(0))||(whole&&!valueD.isInteger())) throw new Error(`K1 QBI ${label} requires a finite ${whole?'whole-dollar ':''}${nonnegative?'nonnegative ':''}source amount`);
  return valueD;
}
function text(value:string|undefined,label:string):string {
  if(!value?.trim()) throw new Error(`K1 QBI requires actual ${label}`);
  return value.trim();
}
function name(value:string):string {return value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');}
function known(value:boolean|undefined,label:string):boolean {
  if(typeof value!=='boolean') throw new Error(`K1 QBI requires a known ${label} source answer`);
  return value;
}
function evidence<T extends {sourceTaxYear?:number;sourceReference?:string;sourceFactsConfirmed?:boolean}|undefined>(value:T,year:number,label:string):asserts value is T & {sourceTaxYear:number;sourceReference:string;sourceFactsConfirmed:true} {
  if(!value||value.sourceTaxYear!==year||value.sourceFactsConfirmed!==true) throw new Error(`K1 QBI ${label} requires confirmed actual source year`);
  text(value.sourceReference,`${label} source reference`);
}
function history(value:QbiLossHistorySource|undefined,year:number,opening:Decimal,materialParticipation:boolean):QbiLossHistorySource {
  evidence(value,year-1,'prior passive history');
  if(!value||!Array.isArray(value.vintages)) throw new Error('K1 QBI prior passive history requires an explicit vintage list, including none');
  const seen=new Set<number>();
  const balances=value.vintages.map(row=>{
    if(!Number.isInteger(row.taxYear)||row.taxYear<1||row.taxYear>=year||seen.has(row.taxYear)) throw new Error('K1 QBI history requires unique actual earlier origin years');
    seen.add(row.taxYear);
    const original=amount(row.originalLoss,'original history',true,true),qualified=amount(row.qualifiedOriginalLoss,'original qualified history',true,true);
    const remaining=amount(row.remainingLoss,'remaining history',true,true),qualifiedRemaining=amount(row.qualifiedRemainingLoss,'remaining qualified history',true,true);
    if(qualified.gt(original)||remaining.gt(original)||qualifiedRemaining.gt(remaining)||qualifiedRemaining.gt(qualified)
      ||remaining.minus(qualifiedRemaining).gt(original.minus(qualified))) throw new Error('K1 QBI original and remaining history must conserve qualified character');
    if(row.taxYear<2018&&(!qualified.isZero()||!qualifiedRemaining.isZero())) throw new Error('K1 QBI pre-2018 history cannot be qualified');
    if(row.materiallyParticipatedInCurrentYear!==undefined&&row.materiallyParticipatedInCurrentYear!==materialParticipation) throw new Error('K1 QBI prior history participation must match the actual current activity');
    return remaining;
  });
  if(!sum(...balances).eq(opening)) throw new Error('K1 QBI passive history must reconcile to the actual opening balance');
  return value;
}

export function validateK1QbiLossSources(input:K1QbiLossSourceInput):ValidatedK1QbiLossSource[] {
  const charitable=calculateK1CharitableReturnSources(input);
  const packet=input.qbiLossSources;
  if(packet===undefined) return [];
  const year=input.taxpayer.taxYear;
  if(![2025,2026].includes(year)) throw new Error('K1 QBI requires an actual supported source year');
  evidence(packet,year,'complete source packet');
  if(packet.allK1ActivitiesIncluded!==true||!Array.isArray(packet.activities)||packet.activities.length!==input.scheduleK1.length) throw new Error('K1 QBI complete sources must represent every original activity once');
  const seen=new Set<number>(), names=new Set<string>(), eins=new Set<string>();
  return packet.activities.map(source=>{
    const id=text(source.k1SourceId,'original K1 source identity'), match=/^scheduleK1:(0|[1-9]\d*)$/.exec(id);
    if(!match) throw new Error('K1 QBI original index identity is invalid');
    const index=Number(match[1]),original=input.scheduleK1[index];
    if(!Number.isSafeInteger(index)||!original||seen.has(index)) throw new Error('K1 QBI original sources must appear once without duplicates');
    seen.add(index);
    text(source.sourceReference,'original statement reference');
    if(source.sourceTaxYear!==year||original.taxYear!==year) throw new Error('K1 QBI original statement year must match its actual source and return');
    const owner=source.accountHolder;
    if(!owner||owner!==original.accountHolder||(owner==='spouse'&&(input.taxpayer.filingStatus!=='married_filing_jointly'||!input.taxpayer.spouse))) throw new Error('K1 QBI original owner must match the actual return owner');
    const person=owner==='primary'?input.taxpayer.primary:input.taxpayer.spouse;
    if(!person||name(text(source.recipientName,'recipient identity'))!==name(`${person.firstName} ${person.lastName}`)
      ||!/^\d{9}$/.test(person.ssn.replaceAll('-',''))||!/^\d{4}$/.test(source.recipientTaxpayerIdLast4??'')
      ||person.ssn.replaceAll('-','').slice(-4)!==source.recipientTaxpayerIdLast4) throw new Error('K1 QBI recipient identity must match the actual return');
    const entityName=name(text(source.entityName,'entity name')),ein=text(source.entityEIN,'entity EIN').replaceAll('-','');
    if(entityName!==name(original.partnershipName)||!/^\d{9}$/.test(ein)||ein!==original.partnershipEIN.replaceAll('-','')
      ||!source.entityType||source.entityType!==original.entityType) throw new Error('K1 QBI original entity source must match its name EIN and type');
    if(names.has(entityName)||eins.has(ein)||(input.rentalProperties??[]).some(row=>name(row.description)===entityName)) throw new Error('K1 QBI duplicate activity identity requires its separate multi-activity source method');
    names.add(entityName);eins.add(ein);
    if(source.ordinaryBusinessOnlyConfirmed!==true||source.continuingActivityConfirmed!==true||original.isPubliclyTradedPartnership
      ||original.ptpFullyDisposedInTaxableTransaction||original.isForeignPartnership||original.section199APTPIsSST||original.election1367) throw new Error('K1 QBI requires continuing ordinary sources; PTP disposal foreign and other methods are separate');
    const distribution = charitable?.statements.find(row=>row.k1Index===index)?.distributionGain;
    const passiveCapitalGain=distribution?.passiveActivity?distribution.gain:d(0);
    for(const field of ordinaryOnlyZeroFields){
      if(field==='distributions'&&distribution?.passiveActivity) continue;
      if ((field==='charitableCash'||field==='charitableCapitalGain30'||field==='charitableCapitalGain20') && charitable?.statements.some(row=>row.k1Index===index)) continue;
      const value=d(original[field]);
      if(!value.isFinite()||!value.isZero()) throw new Error(`K1 QBI ordinary-only source conflicts with original ${field}; its separate method is required`);
    }
    const statement=source.statement;
    if(!statement) throw new Error('K1 QBI requires the actual original199A statement');
    if(original.entityType==='partnership'){
      if(original.selfEmploymentFactsConfirmed!==true||original.selfEmploymentIncomeType===undefined
        ||statement.selfEmploymentIncomeType!==original.selfEmploymentIncomeType) throw new Error('K1 QBI requires confirmed actual partnership self-employment classification');
      for(const field of ['selfEmploymentEarnings','selfEmploymentNetEarningsAfterAdjustments'] as const){
        if(field==='selfEmploymentNetEarningsAfterAdjustments'&&source.selfEmploymentTreatment!==undefined) continue;
        if(!amount(statement[field],`self-employment ${field}`).eq(amount(original[field],`original self-employment ${field}`))) {
          throw new Error('K1 QBI self-employment Box14A and adjusted partner earnings must match the original sources');
        }
      }
      if(source.selfEmploymentTreatment!==undefined){
        const treatment=source.selfEmploymentTreatment;
        evidence(treatment,year,'self-employment adjustment facts');
        evidence(treatment.priorLossHistory,year-1,'prior self-employment loss history');
        if(treatment.method!=='ordinary_current'||treatment.noOtherPartnerAdjustmentsConfirmed!==true
          ||!amount(treatment.priorLossHistory?.amount,'prior self-employment loss',true,true).isZero()) {
          throw new Error('K1 QBI ordinary self-employment requires actual no-other-adjustments and independent zero prior SE history');
        }
      }
    } else if((['selfEmploymentEarnings','selfEmploymentNetEarningsAfterAdjustments'] as const)
      .some(field=>!d(original[field]).isFinite()||!d(original[field]).isZero()||!d(statement[field]).isFinite()||!d(statement[field]).isZero())) {
      throw new Error('K1 QBI S-corporation sources cannot contain partnership self-employment earnings');
    }
    for(const field of ['ordinaryIncome','section199AQBI','section199AW2Wages','section199AUBIA'] as const){
      const reported=amount(statement[field],`${field} statement`,field==='section199AW2Wages'||field==='section199AUBIA');
      if(!reported.eq(amount(original[field],`original ${field}`))) throw new Error(`K1 QBI ${field} statement does not match its original source`);
    }
    for(const field of ['section199AIsSST','isPassiveActivity','qbiMateriallyParticipated'] as const){
      if(known(statement[field],field)!==known(original[field],`original ${field}`)) throw new Error(`K1 QBI ${field} statement must match its original source`);
    }
    const ordinary=amount(statement.ordinaryIncome,'ordinary statement'),qualified=amount(statement.section199AQBI,'qualified statement');
    if(qualified.abs().gt(ordinary.abs())||(!qualified.isZero()&&(ordinary.isZero()||qualified.isNegative()!==ordinary.isNegative()))) throw new Error('K1 QBI ordinary source and qualified character require the same supported net-income class');
    const basis=source.basis,atRisk=source.atRisk;
    evidence(basis,year-1,'opening basis');evidence(atRisk,year,'at-risk worksheet');
    if(!basis||basis.noOtherBasisChangesConfirmed!==true) throw new Error('K1 QBI actual basis changes require their separate source method');
    if(!amount(basis.beginningBasis,'opening basis',true).eq(amount(original.beginningBasis,'original beginning basis',true))) throw new Error('K1 QBI original beginning basis must match its source');
    if(!amount(basis.priorSuspendedLoss,'prior basis loss',true,true).isZero()
      ||Object.values(original.priorSuspendedLosses??{}).some(value=>!amount(value,'original prior basis loss',true,true).isZero())) throw new Error('K1 QBI positive prior basis loss requires its separate release method');
    if(!atRisk||atRisk.simplifiedMethodEligible!==true||!original.form6198) throw new Error('K1 QBI requires an actual eligible simplified at-risk worksheet');
    if(original.atRiskAmount!==undefined) throw new Error('K1 QBI current at-risk allowance overrides are not original source facts');
    if(!amount(atRisk.priorSuspendedLoss,'prior at-risk loss',true,true).isZero()) throw new Error('K1 QBI positive prior at-risk loss requires its separate release method');
    evidence(atRisk.priorLossHistory,year-1,'prior at-risk loss history');
    if(!Array.isArray(atRisk.priorLossHistory?.vintages)||atRisk.priorLossHistory.vintages.length!==0) throw new Error('K1 QBI current at-risk route requires an actual known-empty prior loss history');
    for(const field of ['adjustedBasisAtEffectiveDate','priorYearAmountAtRisk','currentYearIncreases','currentYearDecreases'] as const){
      if(!amount(atRisk[field],`at-risk ${field}`,true).eq(amount(original.form6198[field],`original at-risk ${field}`,true))) throw new Error(`K1 QBI original at-risk ${field} must match its source`);
    }
    const riskForm=original.form6198;
    if(name(riskForm.activityName)!==entityName||!d(riskForm.gainLossFromDispositions).eq(passiveCapitalGain)||(['otherIncomeGains','otherDeductionsLosses'] as const).some(field=>!d(riskForm[field]).isZero())) throw new Error('K1 QBI actual ordinary at-risk activity has other source income or deductions');
    if(source.sameRegularAmtTreatmentConfirmed!==true) throw new Error('K1 QBI requires independent same regular/AMT source treatment; differences need their separate method');
    if(source.sameOwnerHistoryConfirmed!==true) throw new Error('K1 QBI actual prior history must retain the same owner');
    const prior=amount(source.priorPassiveLoss,'prior passive opening',true,true);
    const priorRows=(input.priorYear?.suspendedPassiveLosses??[]).filter(row=>row.partnershipName===original.partnershipName);
    if(priorRows.length!==1||!prior.eq(amount(priorRows[0].amount,'original prior passive opening',true,true))) throw new Error('K1 QBI requires one matching actual prior passive opening record, including zero');
    if(!original.isPassiveActivity&&prior.gt(0)) throw new Error('K1 QBI former passive activity requires its separate current nonpassive release method');
    const passiveHistory=history(priorRows[0].qbiLossTracking,year,prior,known(original.qbiMateriallyParticipated,'material participation'));
    const basisHistory:QbiLossHistorySource={...basis,sourceFactsConfirmed:true,vintages:[]};
    const atRiskHistory:QbiLossHistorySource={...atRisk.priorLossHistory,sourceFactsConfirmed:true,vintages:[]};
    return {sourceId:id,k1Index:index,accountHolder:owner,ordinaryIncome:ordinary,qualifiedBusinessIncome:qualified,priorPassiveLoss:prior,passiveCapitalGain,basisHistory,atRiskHistory,passiveHistory};
  });
}
