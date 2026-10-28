/** Complete original sources for the zero/unique-excess NOL method. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableCategory, CharitableContributionWorksheetInput } from '@/engine/forms/charitable-contribution-worksheet.js';
import { validateCharitableCarryoverSources, type CharitableCarryoverBalance, type CharitableSourceValidationInput } from '@/engine/forms/charitable-carryover-source-validation.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { calculateCryptoDonations } from '@/engine/forms/crypto-lot-matching.js';
import { readCurrentCharitableReceiptAmounts } from './charitable-current-receipts.js';
import { charitableSourceDigest } from './charitable-source-digest.js';
import { d } from './decimal.js';
import { isNonitemizedPriorPropertySource } from './k1-nonitemized-prior-property.js';

type AmountKey = keyof CharitableContributionWorksheetInput['amounts'];
type Ledger = 'regular' | 'alternative';
export const charitableNolAmountKinds: Readonly<Record<AmountKey, readonly [CharitableCategory,'cash'|'noncash']>> = {
  cashPublic:['cash_60','cash'], noncashPublic:['noncash_50','noncash'], capitalGainPublic:['capital_gain_30','noncash'],
  cashPrivate:['other_30','cash'], noncashPrivate:['other_30','noncash'], capitalGainPrivate:['capital_gain_20','noncash'],
};
export interface CharitableNolOrigin {
  kind:'current'|'prior'; sourceId:string; contributionYear:number; category:CharitableCategory;
  medium:'cash'|'noncash'; amount:Decimal;
}
export interface CharitableNolOrigins {
  current:CharitableContributionWorksheetInput['amounts']; regular:CharitableCarryoverBalance[];
  alternative:CharitableCarryoverBalance[]; sourceDigest:string;
}
/** Never an input field: constructed from complete original sources in the NOL replay. */
export interface CharitableNolOriginLimit {
  method:'determined_origins'; ledger:Ledger; sourceDigest:string;
  rows:Array<Omit<CharitableNolOrigin,'amount'> & { retainedAmount:Decimal }>;
}
type HistoryInput = Pick<TaxYearInput,'standardDeductionFacts'|'netOperatingLoss'|'priorYear'|'charitableCarryoverSources'> & { taxpayer:CharitableSourceValidationInput['taxpayer'] };

/** A new current loss does not itself trigger the carried-NOL charity reduction.
 * Complete original histories use the established old-carry comparison first;
 * Form172 adds its independently derived current loss only afterward. */
export function usesCurrentOriginCharitableHistories(input:TaxYearInput):boolean {
  const loss=input.netOperatingLoss,history=loss?.alternativeTax?.charitableCarryoverHistory;
  if(!input.form172 || !Array.isArray(loss?.vintages)
    || !Array.isArray(loss.alternativeTax?.vintages)) return false;
  const current=input.donations.length>0 || input.k1CharitableSources!==undefined || (input.cryptoIncome?.donations.length??0)>0;
  const completeCurrentWithOldLoss=current && (loss.vintages.length>0 || loss.alternativeTax.vintages.length>0)
    && input.charitableCarryoverSources!==undefined && history?.alternativeCarryoverSources!==undefined;
  return (input.charitableCarryoverSources?.vintages?.length??0)>0
    || (history?.alternativeCarryoverSources?.vintages?.length??0)>0 || completeCurrentWithOldLoss;
}

/** Existing single-source methods remain separate; no new user switch. */
export function usesDeterminedCharitableNolOrigins(input:TaxYearInput):boolean {
  if(input.form172) return usesCurrentOriginCharitableHistories(input);
  if(!input.netOperatingLoss || input.form982NolSources) return false;
  const history=input.netOperatingLoss.alternativeTax?.charitableCarryoverHistory;
  if(!history?.alternativeCarryoverSources) return false;
  const regular=input.charitableCarryoverSources?.vintages,alternative=history.alternativeCarryoverSources.vintages;
  const current=input.donations.length>0 || input.k1CharitableSources!==undefined || (input.cryptoIncome?.donations.length??0)>0
    || input.scheduleK1.some(row=>[row.charitableCash,row.charitableCapitalGain30,row.charitableCapitalGain20].some(value=>!d(value).isZero()));
  const different=regular?.[0] && alternative?.[0] && (regular[0].contributionYear!==alternative[0].contributionYear
    || regular[0].category!==alternative[0].category || regular[0].medium!==alternative[0].medium);
  return current || input.taxpayer.taxYear===2026 || (regular?.length??0)>1 || (alternative?.length??0)>1 || !!different;
}

/** Facts-only collector contract; no income, allowance or deduction estimate. */
export function validateCharitableNolOriginHistories(input:HistoryInput): Pick<CharitableNolOrigins,'regular'|'alternative'> {
  const history=input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (![2025,2026].includes(input.taxpayer.taxYear) || history?.sourceTaxYear!==input.taxpayer.taxYear-1
    || !history.sourceReference?.trim() || history.sourceFactsConfirmed!==true || history.allCarryoversIncluded!==true
    || !input.charitableCarryoverSources || !history.alternativeCarryoverSources) {
    throw new Error('Charitable NOL origins require complete independent regular and alternative source histories');
  }
  const regular=validateCharitableCarryoverSources(input);
  const alternative=validateCharitableCarryoverSources({ taxpayer:input.taxpayer,standardDeductionFacts:input.standardDeductionFacts,charitableCarryoverSources:history.alternativeCarryoverSources });
  for (const [records,summary] of [[regular,history.priorRegularCarryovers],[alternative,history.priorAlternativeCarryovers]] as const) {
    if (summary===undefined) continue;
    const remaining=[...records];
    for (const row of summary) {
      if (!row.sourceReference?.trim() || row.amount===undefined || !/^\d+(?:\.\d+)?$/.test(row.amount)) {
        throw new Error('Charitable NOL original summaries require actual source amounts');
      }
      const index=remaining.findIndex(source=>source.taxYear===row.taxYear && source.category===row.category && source.amount.eq(d(row.amount)));
      if(index<0) throw new Error('Charitable NOL original summary must reconcile its complete independent source history');
      remaining.splice(index,1);
    }
    if(remaining.length) throw new Error('Charitable NOL original summary omits an actual independent source');
  }
  return {regular,alternative};
}

export function readCharitableNolOrigins(input:TaxYearInput):CharitableNolOrigins {
  const {regular,alternative}=validateCharitableNolOriginHistories(input);
  if((input.form172 || input.form982NolSources) && !usesCurrentOriginCharitableHistories(input)) {
    throw new Error('Determined charitable NOL origins require the separate current-origin or COD composition method');
  }
  const k1=calculateK1CharitableReturnSources(input);
  if(!k1 && input.scheduleK1.some(row=>[row.charitableCash,row.charitableCapitalGain30,row.charitableCapitalGain20,row.priorSuspendedLosses?.charitable].some(value=>!d(value).isZero()))) {
    throw new Error('Charitable NOL origins require complete actual K1 basis and receipt sources');
  }
  // Only the validated release is available section170 value. The explicit
  // 2026 property-source admission still requires the later actual floor proof.
  if(input.taxpayer.taxYear!==2025 && k1?.statements.some(row=>row.basis.charitableSources?.records.some(record=>!record.current
    && record.availableAfterBasis.gt(0) && !row.firstAdmissions?.some(admission => admission.sourceId === record.sourceId) && !isNonitemizedPriorPropertySource(input.taxpayer.taxYear,input.deductionElection,record.category)))) {
    throw new Error('Prior K1 basis releases require their separate NOL contribution-year method');
  }
  const current=readCurrentCharitableReceiptAmounts(input,{capitalStockOnly:true,includeK1:true});
  if(input.donations.some(row=>row.qualifiedOrganization!==false && !row.organization.trim())) throw new Error('Charitable NOL original recipient is missing');
  if(input.cryptoIncome?.donations.length) {
    const crypto=calculateCryptoDonations(input.cryptoIncome.donations,input.taxpayer.taxYear);
    if(!crypto.sourceFactsVerified || input.cryptoIncome.donations.some(row=>row.isQualifiedOrganization!==false && (!row.charityName.trim() || !row.asset.trim()))) {
      throw new Error('Charitable NOL origins require confirmed actual digital-asset receipts');
    }
    for(const key of Object.keys(current) as AmountKey[]) current[key]=current[key].plus(crypto.contributionAmounts[key]);
  }
  const sourceDigest=bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({
    taxpayer:input.taxpayer, charitable:charitableSourceDigest(input), history:input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory,
  }))));
  return {current,regular,alternative,sourceDigest};
}

export function charitableNolOriginRows(input:TaxYearInput,sources:CharitableNolOrigins,ledger:Ledger):CharitableNolOrigin[] {
  const current=(Object.keys(sources.current) as AmountKey[]).filter(key=>sources.current[key].gt(0)).map(key=>{
    const [category,medium]=charitableNolAmountKinds[key];
    return {kind:'current' as const,sourceId:`current-${category}-${medium}`,contributionYear:input.taxpayer.taxYear,category,medium,amount:sources.current[key]};
  });
  return [...current,...sources[ledger].map(row=>({kind:'prior' as const,sourceId:row.sourceId,contributionYear:row.taxYear,category:row.category,medium:row.medium,amount:row.amount}))];
}
export function createCharitableNolOriginLimit(input:TaxYearInput,ledger:Ledger,retained?:ReadonlyMap<string,Decimal>):CharitableNolOriginLimit {
  const sources=readCharitableNolOrigins(input);
  const rows=charitableNolOriginRows(input,sources,ledger).map(({amount,...row})=>({ ...row,retainedAmount:retained?.get(`${row.kind}:${row.sourceId}`)??amount }));
  if(retained && (retained.size!==rows.length || rows.some(row=>!retained.has(`${row.kind}:${row.sourceId}`)))) throw new Error('Charitable NOL retained vector must include every original source');
  const limit:CharitableNolOriginLimit={method:'determined_origins',ledger,sourceDigest:sources.sourceDigest,rows};
  validateCharitableNolOriginLimit(input,limit);
  return limit;
}
export function validateCharitableNolOriginLimit(input:TaxYearInput,limit:CharitableNolOriginLimit):CharitableNolOrigins {
  const sources=readCharitableNolOrigins(input);
  if(!limit || limit.method!=='determined_origins' || !['regular','alternative'].includes(limit.ledger)
    || limit.sourceDigest!==sources.sourceDigest || !Array.isArray(limit.rows)) throw new Error('Charitable NOL internal ledger must match its original source');
  const originals=charitableNolOriginRows(input,sources,limit.ledger),seen=new Set<string>();
  if(limit.rows.length!==originals.length) throw new Error('Charitable NOL internal ledger requires every original source exactly once');
  for(const row of limit.rows) {
    const key=`${row.kind}:${row.sourceId}`,original=originals.find(source=>source.kind===row.kind && source.sourceId===row.sourceId);
    if(seen.has(key) || !original || row.contributionYear!==original.contributionYear || row.category!==original.category || row.medium!==original.medium
      || !Decimal.isDecimal(row.retainedAmount) || !row.retainedAmount.isFinite() || row.retainedAmount.lt(0) || row.retainedAmount.gt(original.amount)) {
      throw new Error('Charitable NOL retained amount must reconcile to original year category medium and complete source');
    }
    seen.add(key);
  }
  return sources;
}
export function resolveCharitableNolOriginLimit(input:TaxYearInput,limit:CharitableNolOriginLimit):{
  current:CharitableNolOrigins['current'];prior:CharitableCarryoverBalance[];
} {
  const sources=validateCharitableNolOriginLimit(input,limit),current={...sources.current};
  for(const key of Object.keys(current) as AmountKey[]) {
    const [category,medium]=charitableNolAmountKinds[key];
    const row=limit.rows.find(value=>value.kind==='current' && value.category===category && value.medium===medium);
    if(row) current[key]=row.retainedAmount;
  }
  const prior=sources[limit.ledger].map(row=>{
    const retained=limit.rows.find(value=>value.kind==='prior' && value.sourceId===row.sourceId);
    if(!retained) throw new Error('Missing original charitable NOL prior source');
    return {...row,amount:retained.retainedAmount};
  });
  return {current,prior};
}
