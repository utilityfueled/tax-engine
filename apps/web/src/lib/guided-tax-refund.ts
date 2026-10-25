import { TaxableRefundWorksheetSchema, type TaxableRefundWorksheetInput } from '@/models/inputs';
import { calculateTaxableRefundWorksheet } from '@/engine/forms/taxable-refund-worksheet';
import { parseGuidedCurrency } from './guided-currency';
import { amountError, hasEnteredAmount } from './guided-required-facts';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import type { FilingStatus, PersonalInfoData } from './guided-interview-flow';
import type { UnemploymentEntryData } from './guided-unemployment-facts';

export interface GuidedRefundSource {
  payer: string; payerTin: string; accountReference: string; accountHolder: string;
  recipientTaxIdLast4: string; sourceTaxYear: string; amount: string;
  refundTaxYear: string; refundExpenseTaxYear: string;
}
export interface GuidedTaxRefundData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  allRefundSourcesIncluded?: boolean | null; allRefundedTaxesPaidInExpenseYear?: boolean | null;
  returnMembershipUnchanged?: boolean | null; primaryName?: string; primaryTaxpayerIdLast4?: string;
  spouseName?: string; spouseTaxpayerIdLast4?: string; priorYearFilingStatus?: FilingStatus | '';
  priorTaxYear?: string; priorYearItemized?: boolean | null; priorYearStateLocalTaxElection?: 'income' | 'sales' | '';
  priorYearItemizedTotal?: string; priorYearStandardDeduction?: string; priorYearMandatoryItemization?: boolean | null;
  priorYearSaltMagi?: string; priorYearStateLocalTaxesPaid?: string; priorYearPropertyTaxesPaid?: string;
  priorYearAlternativeGeneralSalesTaxDeduction?: string; priorYearTaxableIncome?: string; priorYearRegularTax?: string;
  priorYearAmt?: string; priorYearUnusedTaxCredits?: string; otherItemizedRecoveries?: string;
  priorRecoveriesBeforeReceiptYear?: string; priorYearNolCarryover?: string;
  priorYearCapitalRateWorksheetUsed?: boolean | null; priorYearCouldBeClaimedAsDependent?: boolean | null;
  originalRefundSources?: GuidedRefundSource[];
}
export interface RefundRecoveryContext {
  mortgageWorksheet?: { recoveries?: { originTaxYear?: string; refundReceived?: string }[] };
}
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
const text = (value: string | undefined, label: string): string => {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}.`);
  return value.trim();
};
const money = (value: string | undefined, label: string) => {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value);
};
const year = (value: string | undefined, label: string): number => {
  if (!/^\d{4}$/.test(value ?? '')) throw new Error(`Enter the actual ${label}.`);
  return Number(value);
};
const normalizedName = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

/** Original sources only; no payment year, amount or taxpayer is inferred. */
export function captureGuidedRefundSources(entries: UnemploymentEntryData[]): GuidedRefundSource[] {
  const keys = new Set<string>();
  return entries.flatMap(entry => {
    const amount = money(entry.stateOrLocalTaxRefund, 'original Box 2 refund');
    if (amount.isZero()) return [];
    const source = {
      payer: text(entry.payer, 'refund payer'), payerTin: text(entry.payerTin, 'refund payer TIN').replaceAll('-', ''),
      accountReference: text(entry.accountReference, 'refund statement reference'), accountHolder: text(entry.accountHolder, 'refund recipient'),
      recipientTaxIdLast4: text(entry.recipientTaxIdLast4, 'refund recipient last four'),
      sourceTaxYear: text(entry.sourceTaxYear, 'refund receipt year'), amount: amount.toFixed(),
      refundTaxYear: text(entry.refundTaxYear, 'original Box 3 tax year'),
      refundExpenseTaxYear: text(entry.refundExpenseTaxYear, 'actual year the refunded taxes were paid and deducted'),
    };
    if (!/^\d{9}$/.test(source.payerTin) || !['primary','spouse'].includes(source.accountHolder)
      || !/^\d{4}$/.test(source.recipientTaxIdLast4)) throw new Error('Confirm the actual refund payer TIN and recipient identity.');
    const receipt=year(source.sourceTaxYear,'original receipt year');
    const box3=year(source.refundTaxYear,'original Box 3 year');
    year(source.refundExpenseTaxYear,'actual expense year');
    if (![2025,2026].includes(receipt) || box3<1900 || box3>receipt) throw new Error('Reconcile the actual refund statement years.');
    const key=JSON.stringify([source.payerTin,source.accountReference.toLowerCase(),source.accountHolder,source.sourceTaxYear]);
    if (keys.has(key)) throw new Error('Reconcile duplicate original refund statements.'); keys.add(key);
    return [source];
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function buildGuidedTaxRefund(data: GuidedTaxRefundData | undefined, entries: UnemploymentEntryData[], taxYear?: number | null,
  filingStatus?: FilingStatus | null, personal?: PersonalInfoData, otherSources?: RefundRecoveryContext): TaxableRefundWorksheetInput | undefined {
  const positive = entries.some(entry => !amountError(entry.stateOrLocalTaxRefund, 'refund') && parseGuidedCurrency(entry.stateOrLocalTaxRefund).gt(0));
  if (!data && !positive) return undefined;
  if (!data) throw new Error('Complete the actual historical tax-benefit worksheet for the income-tax refund.');
  if ((taxYear!==2025 && taxYear!==2026) || !filingStatus || !personal) throw new Error('Confirm the actual refund receipt year and household before binding the prior return.');
  if (year(data.sourceTaxYear,'refund worksheet receipt year') !== taxYear || data.sourceFactsConfirmed !== true
    || data.allRefundSourcesIncluded !== true || data.allRefundedTaxesPaidInExpenseYear !== true || data.returnMembershipUnchanged !== true) {
    throw new Error('Confirm the actual refund year, complete original sources, payment-year allocation and unchanged return membership.');
  }
  text(data.sourceReference,'historical return and refund worksheet reference');
  const priorTaxYear=year(data.priorTaxYear,'historical paid/deducted year');
  if(priorTaxYear<2018 || priorTaxYear>=taxYear) throw new Error('This historical worksheet requires one actual 2018-or-later deduction year before receipt; same-year or mixed-year refunds need their separate method.');
  const sources=captureGuidedRefundSources(entries);
  if (!sources.length || !Array.isArray(data.originalRefundSources)
    || JSON.stringify(sources)!==JSON.stringify([...data.originalRefundSources].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))) {
    throw new Error('Reconcile the captured original refund records with every current statement.');
  }
  for(const source of sources) {
    if(year(source.sourceTaxYear,'original receipt year')!==taxYear || year(source.refundExpenseTaxYear,'actual expense year')!==priorTaxYear
      || year(source.refundTaxYear,'original Box 3 year')>taxYear) throw new Error('Original refund source years must match the actual receipt and historical worksheet.');
    const recipient=source.accountHolder==='primary' ? personal : filingStatus==='mfj' ? personal.spouse : undefined;
    if (!recipient || !/^\d{9}$/.test(recipient.ssn.replaceAll('-',''))
      || source.recipientTaxIdLast4!==recipient.ssn.replaceAll('-','').slice(-4)) throw new Error('The original refund recipient must match the actual individual or joint-return household.');
  }
  const priorStatus=data.priorYearFilingStatus;
  if(!priorStatus || !Object.hasOwn(statuses,priorStatus) || (priorStatus==='mfj')!==(filingStatus==='mfj')) throw new Error('Historical joint-return changes require their separate recovery allocation method.');
  const checkPerson=(name:string|undefined,last4:string|undefined,person:Pick<PersonalInfoData,'firstName'|'lastName'|'ssn'>|undefined,middle?:string)=>{
    const first=[person?.firstName,middle?.replace(/[^A-Za-z]/g,'').charAt(0).toUpperCase()].filter(Boolean).join(' ');
    if(!person || normalizedName(text(name,'prior-return taxpayer name'))!==normalizedName(`${first} ${person.lastName}`)
      || !/^\d{4}$/.test(last4??'') || last4!==person.ssn.replaceAll('-','').slice(-4)) throw new Error('Historical refund taxpayer identity must match the actual return household.');
  };
  checkPerson(data.primaryName,data.primaryTaxpayerIdLast4,personal,personal.middleName);
  if(priorStatus==='mfj') checkPerson(data.spouseName,data.spouseTaxpayerIdLast4,personal.spouse);
  else if(data.spouseName?.trim() || data.spouseTaxpayerIdLast4?.trim()) throw new Error('Individual refund history must not include another joint-return member.');
  if(typeof data.priorYearItemized!=='boolean' || typeof data.priorYearMandatoryItemization!=='boolean') throw new Error('Confirm actual historical itemization and any mandatory-itemization restriction.');
  const standard=money(data.priorYearStandardDeduction,'historical available standard deduction');
  if(data.priorYearMandatoryItemization ? priorStatus!=='mfs' || !data.priorYearItemized || !standard.isZero() : !standard.gt(0)) throw new Error('Reconcile the actual available standard deduction and mandatory-itemization source.');
  let saltMagi:string|undefined;
  if(priorTaxYear>=2025) {
    text(data.priorYearSaltMagi,'historical SALT MAGI'); const magi=parseGuidedCurrency(data.priorYearSaltMagi);
    if(!magi.isFinite()) throw new Error('Historical SALT MAGI must be finite.'); saltMagi=magi.toFixed();
  }
  if(data.priorYearItemized && !['income','sales'].includes(data.priorYearStateLocalTaxElection??'')) throw new Error('Confirm the actual prior Schedule A income-tax or general-sales-tax election.');
  const itemized=data.priorYearItemized ? money(data.priorYearItemizedTotal,'historical Schedule A total').toFixed() : undefined;
  const incomeTaxes=data.priorYearItemized ? money(data.priorYearStateLocalTaxesPaid,'historical state/local income taxes paid').toFixed() : undefined;
  const propertyTaxes=data.priorYearItemized ? money(data.priorYearPropertyTaxesPaid,'historical property taxes paid').toFixed() : undefined;
  const salesTaxes=data.priorYearItemized ? money(data.priorYearAlternativeGeneralSalesTaxDeduction,'actual historical alternative general sales tax deduction').toFixed() : undefined;
  if(data.priorYearItemized && data.priorYearStateLocalTaxElection==='income') {
    if(!money(data.priorRecoveriesBeforeReceiptYear,'amounts recovered before this receipt year for the historical deductions').isZero()
      || !money(data.priorYearNolCarryover,'historical NOL carryover affecting the recovery worksheet').isZero()) {
      throw new Error('The actual earlier recovery or historical NOL carryover requires its separate prior-return tax-benefit adjustment.');
    }
    if(!money(data.priorYearTaxableIncome,'historical taxable income').gt(0) || !money(data.priorYearRegularTax,'historical regular tax').gt(0)
      || !money(data.priorYearAmt,'historical AMT').isZero() || !money(data.priorYearUnusedTaxCredits,'historical unused tax credits').isZero()
      || !money(data.otherItemizedRecoveries,'other recoveries from the same deduction year').isZero()
      || data.priorYearCapitalRateWorksheetUsed!==false || data.priorYearCouldBeClaimedAsDependent!==false) {
      throw new Error('The actual historical AMT, capital-rate, credit, dependency, negative-income or other-recovery facts require their separate tax-benefit method.');
    }
    const total=sources.reduce((sum,row)=>sum.plus(row.amount),parseGuidedCurrency('0'));
    if(incomeTaxes===undefined || total.gt(incomeTaxes)) throw new Error('Reconcile refunds exceeding the actual income taxes paid in this deduction year.');
    for(const recovery of otherSources?.mortgageWorksheet?.recoveries??[]) {
      if((!recovery.originTaxYear || recovery.originTaxYear===String(priorTaxYear)) && hasEnteredAmount(recovery.refundReceived)
        && money(recovery.refundReceived,'other actual recovery').gt(0)) throw new Error('The actual mortgage recovery requires a combined historical recovery allocation.');
    }
  }
  const worksheet=TaxableRefundWorksheetSchema.parse({ priorTaxYear, priorYearFilingStatus:statuses[priorStatus],
    priorYearItemized:data.priorYearItemized, priorYearStateLocalTaxElection:data.priorYearStateLocalTaxElection || undefined,
    priorYearItemizedTotal:itemized, priorYearStandardDeduction:standard.toFixed(), priorYearSaltMagi:saltMagi,
    priorYearStateLocalTaxesPaid:incomeTaxes, priorYearPropertyTaxesPaid:propertyTaxes, priorYearAlternativeGeneralSalesTaxDeduction:salesTaxes });
  calculateTaxableRefundWorksheet(sources.map(source=>({stateLocalIncomeTaxRefund:source.amount,refundTaxYear:Number(source.refundTaxYear),refundExpenseTaxYear:Number(source.refundExpenseTaxYear)})),worksheet,taxYear);
  return worksheet;
}
export function guidedTaxRefundErrors(...args: Parameters<typeof buildGuidedTaxRefund>): Record<string,string> {
  try { buildGuidedTaxRefund(...args); return {}; } catch(error) { return { taxRefund: error instanceof Error ? error.message : 'Complete the actual historical refund worksheet.' }; }
}
export function updateGuidedTaxRefund(previous: GuidedTaxRefundData, patch: Partial<GuidedTaxRefundData>): GuidedTaxRefundData {
  const next={...previous,...patch}; return guidedSourceValuesChanged(previous,next) ? {...next,sourceFactsConfirmed:null} : next;
}
