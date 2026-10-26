import Decimal from 'decimal.js';
import { Form1099MiscSchema, type Form1099Misc } from '@/models/inputs';
import { RoyaltyPropertySourcesSchema, type RoyaltyPropertySources } from '@/models/royalty-property-sources';
import { calculateRoyaltyPropertySources } from '@/engine/forms/royalty-property-sources';
import type { GuidedFlowState } from './guided-interview-flow';
import { recoveryMiscAmounts, type RecoveryMiscData } from './guided-mortgage-recoveries';

type Draft<T> = T extends boolean ? boolean | null : T extends number ? string : T extends string ? T | '' : T extends (infer U)[] ? Draft<U>[] : T extends object ? { [K in keyof T]?: Draft<T[K]> } : T;
type Property = NonNullable<RoyaltyPropertySources['properties']>[number];
type Original = NonNullable<NonNullable<Property['incomeSources']>[number]['original']>;
export interface RoyaltyIncomeLinkData { sourceId?: string; allocatedGross?: string; original?: Draft<Original> }
export type RoyaltyPropertyData = Omit<Draft<Property>, 'incomeSources'> & { incomeSources?: RoyaltyIncomeLinkData[] };
export interface RoyaltyMiscData extends Omit<RecoveryMiscData, 'recoveryOnlyIncomeConfirmed'> { royaltyOnlyIncomeConfirmed?: boolean | null }
export type RoyaltyIncomeData = Omit<Draft<RoyaltyPropertySources>, 'properties'> & { statements?: RoyaltyMiscData[]; properties?: RoyaltyPropertyData[] };

export const royaltyPropertyFacts = {
  tradeOrBusiness: 'Is this royalty property part of a trade or business?',
  operatingInterest: 'Does the property include an operating or working interest?',
  capitalDisposition: 'Do these payments include a sale or disposition of rights?',
  foreignSource: 'Does the property include foreign-source royalties?',
  communityPropertyAllocationRequired: 'Does this property require a community-property allocation?',
  cashMethod: 'Do the actual property records use the cash method?',
  sameRegularAmtTreatmentConfirmed: 'Have the records established the same regular and AMT treatment?',
  currentYearExpensesComplete: 'Does this ledger include all actual current-year property expenses?',
} as const;
export const royaltyExcludedAmounts = {
  interestExpense: 'Actual property interest expense', depreciationExpense: 'Actual property depreciation',
  depletionExpense: 'Actual property depletion', otherExpenses: 'Other actual property expenses',
  priorUnallowedExpenses: 'Actual prior-year unallowed property expenses',
} as const;
export const royaltyExpenseFacts = {
  ordinaryNecessaryForProperty: 'Was this expense ordinary and necessary for this property?',
  relatesOnlyToCurrentYear: 'Does this expense relate only to the current tax year?',
  capitalOrImprovement: 'Was this a capital cost or improvement?',
  personalOrOwnLabor: 'Was this personal or the value of your own labor?', reimbursed: 'Was this amount reimbursed?',
} as const;
const statuses = { single:'single', mfj:'married_filing_jointly', mfs:'married_filing_separately', hoh:'head_of_household', qss:'qualifying_surviving_spouse' } as const;
const stateCodes = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const text = (value: string | undefined, label: string) => { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return value.trim(); };
function money(value: string | undefined, label: string): string {
  const raw = value?.trim();
  const cleaned = raw?.replaceAll(',', '');
  if (!raw || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(\.\d{1,2})?$/.test(raw) || !cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned) || !new Decimal(cleaned).isFinite()) throw new Error(`Enter the actual ${label}, including 0 when the original records establish zero.`);
  return cleaned;
}
const fact = (value: boolean | null | undefined) => value == null ? undefined : value;
function year(value: string | undefined): number | undefined { if (!value?.trim()) return undefined; if (!/^\d{4}$/.test(value.trim())) throw new Error('Enter the actual four-digit source year.'); return Number(value.trim()); }
function optionalMoney(value: string | undefined, label: string) { return value?.trim() ? money(value, label) : undefined; }

/** Copy only supplied original facts. This action does not confirm them or invent an allocation. */
export function copyRoyaltyOriginal(statement: RoyaltyMiscData): Draft<Original> {
  return { sourceId:statement.sourceId, accountReference:statement.accountReference, taxYear:statement.sourceTaxYear,
    sourceFormRevision:statement.sourceFormRevision, payer:statement.payer, accountHolder:statement.accountHolder, royalties:statement.royalties };
}

function originalStatements(data: RoyaltyIncomeData, state: GuidedFlowState): Form1099Misc[] {
  const taxYear = state.taxYear;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error('Confirm the actual supported royalty source year.');
  if (!data.statements?.length) throw new Error('Enter the actual original royalty statements.');
  return data.statements.map(entry => {
    const sourceId = text(entry.sourceId, 'royalty statement identifier'), payer = text(entry.payer, 'MISC payer');
    const accountReference = text(entry.accountReference, 'original MISC account reference');
    const payerTin = text(entry.payerTin, 'MISC payer TIN').replaceAll('-', '');
    if (!/^\d{9}$/.test(payerTin)) throw new Error('Enter the actual nine-digit MISC payer TIN.');
    if (entry.sourceTaxYear !== String(taxYear) || entry.sourceFormRevision !== (taxYear === 2025 ? '2025-04' : '2026-12')) throw new Error('Confirm the actual MISC year and original form revision.');
    const accountHolder = entry.accountHolder;
    if (!accountHolder || (accountHolder === 'spouse' && (state.segmentation.filingStatus !== 'mfj' || !state.sectionData['personal-info']?.spouse))) throw new Error('Confirm the original MISC recipient belongs to this return.');
    if (entry.sourceFactsConfirmed !== true || entry.royaltyOnlyIncomeConfirmed !== true) throw new Error('Check and confirm the original royalty-only MISC source after the latest edits.');
    if (entry.directSales !== false || entry.fatcaFilingRequirement !== false) throw new Error('Unknown or applicable MISC direct-sales and FATCA facts need their separate source method.');
    const amounts = Object.fromEntries(Object.entries(recoveryMiscAmounts).map(([key,label]) => [key,money(entry[key as keyof typeof recoveryMiscAmounts],label)])) as Record<keyof typeof recoveryMiscAmounts,string>;
    for (const key of ['rents','otherIncome','fishingBoatProceeds','medicalPayments','substitutePayments','cropInsurance','grossAttorneyProceeds','fishPurchasedForResale','section409ADeferrals','nonqualifiedDeferredComp'] as const) {
      if (!new Decimal(amounts[key]).isZero()) throw new Error('Other positive MISC income needs its own source method; the royalty label cannot route or duplicate a recovery statement.');
    }
    if (taxYear === 2026 && (!new Decimal(money(entry.cashTips,'MISC cash tips')).isZero() || !new Decimal(money(entry.qualifiedOvertimeCompensation,'MISC overtime')).isZero() || entry.tippedOccupationCodePresent !== false)) throw new Error('MISC compensation needs its separate source method.');
    if (taxYear === 2025 && (entry.tippedOccupationCodePresent === true || [entry.cashTips,entry.qualifiedOvertimeCompensation].some(value => value?.trim() && !new Decimal(money(value,'saved MISC compensation')).isZero()))) throw new Error('Saved MISC compensation conflicts with the original royalty year and boxes.');
    if (entry.stateTaxReporting === 'none') {
      if (!new Decimal(amounts.stateWithheld).isZero() || !new Decimal(amounts.stateIncome).isZero() || entry.state?.trim() || entry.payerStateId?.trim()) throw new Error('Original MISC state amounts and identifiers conflict with no state reporting.');
    } else if (entry.stateTaxReporting === 'single') {
      if (!stateCodes.has(entry.state?.trim().toUpperCase() ?? '') || !entry.payerStateId?.trim()) throw new Error('Enter the actual original MISC state and payer state identifier.');
    } else throw new Error('Confirm original MISC state reporting; multiple states require their separate allocation method.');
    return Form1099MiscSchema.parse({ sourceId,payer,payerTin,accountReference,taxYear,sourceFormRevision:entry.sourceFormRevision,accountHolder,...amounts,
      directSales:entry.directSales,fatcaFilingRequirement:entry.fatcaFilingRequirement,
      state:entry.state?.trim().toUpperCase() || undefined,payerStateId:entry.payerStateId?.trim() || undefined,
      ...(taxYear === 2026 ? {cashTips:entry.cashTips,qualifiedOvertimeCompensation:entry.qualifiedOvertimeCompensation,treasuryTippedOccupationCodes:[]} : {}) });
  });
}

/** Recovery indexes stay fixed; actual royalty statements are appended once and linked by source identity. */
export function buildGuidedRoyaltySources(state: GuidedFlowState, recoveryStatements: Form1099Misc[] = []) {
  const data = state.sectionData['income-royalties'];
  if (!data) {
    if (state.segmentation.incomeTypes.includes('royalties')) throw new Error('Enter the actual royalty source packet or remove the selected royalty income route.');
    return { form1099Misc:recoveryStatements, royaltyPropertySources:undefined };
  }
  const form1099Misc = [...recoveryStatements,...originalStatements(data,state)];
  const ids = new Set<string>(), identities = new Set<string>();
  for (const original of form1099Misc) {
    const id = text(original.sourceId,'original MISC source identifier');
    const identity = JSON.stringify([original.taxYear,original.accountHolder,original.payerTin?.replaceAll('-',''),original.accountReference?.trim().toLowerCase()]);
    if (ids.has(id) || identities.has(identity)) throw new Error('Duplicate original MISC source or payer/account/year/owner; reconcile it once across royalty and recovery records.');
    ids.add(id); identities.add(identity);
  }
  const royaltyPropertySources = RoyaltyPropertySourcesSchema.parse({ sourceTaxYear:year(data.sourceTaxYear),sourceReference:data.sourceReference,
    sourceFactsConfirmed:fact(data.sourceFactsConfirmed),allDirectRoyaltySourcesIncluded:fact(data.allDirectRoyaltySourcesIncluded),
    properties:data.properties?.map(property => ({ ...property,
      accountHolder:property.accountHolder || undefined,propertyType:property.propertyType || undefined,
      ...Object.fromEntries(Object.keys(royaltyPropertyFacts).map(key=>[key,fact(property[key as keyof typeof royaltyPropertyFacts])])),
      ...Object.fromEntries(Object.entries(royaltyExcludedAmounts).map(([key,label])=>[key,optionalMoney(property[key as keyof typeof royaltyExcludedAmounts],label)])),
      incomeSources:property.incomeSources?.map(link=>({ sourceIndex:form1099Misc.findIndex(original=>original.sourceId === link.sourceId?.trim()),
        allocatedGross:optionalMoney(link.allocatedGross,'property gross allocation'),original:link.original ? { ...link.original,sourceId:link.original.sourceId?.trim(),accountReference:link.original.accountReference?.trim(),payer:link.original.payer?.trim(),taxYear:year(link.original.taxYear),
          accountHolder:link.original.accountHolder || undefined,sourceFormRevision:link.original.sourceFormRevision || undefined,
          royalties:optionalMoney(link.original.royalties,'copied original Box 2') } : undefined })),
      expenses:property.expenses?.map(receipt=>({ ...receipt,category:receipt.category || undefined,amountPaid:optionalMoney(receipt.amountPaid,'expense paid amount'),
        ...Object.fromEntries(Object.keys(royaltyExpenseFacts).map(key=>[key,fact(receipt[key as keyof typeof royaltyExpenseFacts])])) })),
    })) });
  if (!state.segmentation.filingStatus || !state.taxYear) throw new Error('Confirm the actual royalty return year and filing status.');
  calculateRoyaltyPropertySources({ taxpayer:{taxYear:state.taxYear,filingStatus:statuses[state.segmentation.filingStatus],spouse:state.sectionData['personal-info']?.spouse},form1099Misc,royaltyPropertySources });
  return { form1099Misc,royaltyPropertySources };
}
export function royaltySourceFactErrors(state: GuidedFlowState): Record<string,string> {
  try { buildGuidedRoyaltySources(state); return {}; }
  catch(error) { return {royaltySources:error instanceof Error ? error.message : 'Reconcile the actual royalty sources.'}; }
}
export function invalidateRoyaltySources(data: RoyaltyIncomeData): RoyaltyIncomeData {
  return { ...data,sourceFactsConfirmed:null,statements:data.statements?.map(statement=>({...statement,sourceFactsConfirmed:null})) };
}
