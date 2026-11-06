import { Form1098Schema, Form1099MiscSchema } from '@/models/inputs';
import type { FilingStatus, MortgageEntryData } from './guided-interview-flow';
import type { MortgageWorksheetData } from './guided-mortgage-worksheet';
import { amountError, isActualDate } from './guided-required-facts';
import { parseGuidedCurrency } from './guided-currency';

export interface MortgageRecoveryData {
  sourceId?: string; sourceTaxYear?: string; sourceReference?: string;
  payer?: string; accountReference?: string; accountHolder?: '' | 'primary' | 'spouse' | 'joint';
  refundSource?: '' | 'form1098' | 'lender_statement'; form1098SourceId?: string;
  originTaxYear?: string; refundReceived?: string; taxableRecovery?: string; alreadyIncludedInOtherIncome?: string; miscSourceId?: string;
  entireRefundBelongsToReturn?: boolean | null; taxBenefitWorksheetReference?: string;
  priorReturnAndOtherRecoveriesReviewed?: boolean | null; taxBenefitWorksheetConfirmed?: boolean | null;
}
export interface RecoveryOnlyStatementData {
  lender?: string; accountReference?: string; accountHolder?: '' | 'primary' | 'spouse' | 'joint'; sourceTaxYear?: string;
  mortgageInterest?: string; outstandingPrincipal?: string; originationDate?: string; refundOfOverpaidInterest?: string;
  mortgageInsurancePremiums?: string; pointsPaid?: string; propertyTaxPaid?: string;
  noCurrentHomeDebtConfirmed?: boolean | null; sourceFactsConfirmed?: boolean | null;
}
export const recoveryMiscAmounts = {
  otherIncome: 'Original Form 1099-MISC Box 3 other income', federalWithheld: 'Original Form 1099-MISC Box 4 federal withholding',
  rents: 'Original Form 1099-MISC Box 1 rents', royalties: 'Original Form 1099-MISC Box 2 royalties', fishingBoatProceeds: 'Original Form 1099-MISC Box 5 fishing boat proceeds',
  medicalPayments: 'Original Form 1099-MISC Box 6 medical payments', substitutePayments: 'Original Form 1099-MISC Box 8 substitute payments', cropInsurance: 'Original Form 1099-MISC Box 9 crop insurance',
  grossAttorneyProceeds: 'Original Form 1099-MISC Box 10 attorney proceeds', fishPurchasedForResale: 'Original Form 1099-MISC Box 11 fish purchased for resale',
  section409ADeferrals: 'Original Form 1099-MISC Box 12 section 409A deferrals', nonqualifiedDeferredComp: 'Original Form 1099-MISC Box 15 nonqualified deferred compensation',
  stateWithheld: 'Original Form 1099-MISC Box 16 state withholding', stateIncome: 'Original Form 1099-MISC Box 18 state income',
} as const;
export interface RecoveryMiscData extends Partial<Record<keyof typeof recoveryMiscAmounts, string>> {
  sourceId?: string; sourceTaxYear?: string; sourceFormRevision?: '' | '2025-04' | '2026-12'; payer?: string; payerTin?: string; accountReference?: string; accountHolder?: '' | 'primary' | 'spouse';
  directSales?: boolean | null; fatcaFilingRequirement?: boolean | null; cashTips?: string; qualifiedOvertimeCompensation?: string; tippedOccupationCodePresent?: boolean | null;
  stateTaxReporting?: '' | 'none' | 'single' | 'multiple'; state?: string; payerStateId?: string;
  recoveryOnlyIncomeConfirmed?: boolean | null; sourceFactsConfirmed?: boolean | null;
}
const stateCodes = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const text = (value: string | undefined, label: string) => { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return value.trim(); };
const money = (value: string | undefined, label: string) => { const error = amountError(value, label); if (error) throw new Error(error); return parseGuidedCurrency(value); };
const key = (payer: string, account: string) => `${payer.trim()}:${account.trim()}`;
function owner(value: string | undefined, status?: FilingStatus | null, spouse?: unknown) {
  if (!['primary', 'spouse', 'joint'].includes(value ?? '')) throw new Error('Confirm the actual recovery source owner.');
  if (value !== 'primary' && (status !== 'mfj' || !spouse)) throw new Error('A spouse or joint recovery requires the actual joint-return spouse and payment allocation.');
  return value as 'primary' | 'spouse' | 'joint';
}

/** Preserve completed tax-benefit sources; never infer a prior tax benefit from this year's deduction. */
export function buildGuidedMortgageRecoveries(root: MortgageWorksheetData | undefined, entries: MortgageEntryData[], taxYear?: number | null, status?: FilingStatus | null, spouse?: unknown) {
  const rows = root?.recoveries ?? [], closed = root?.recoveryOnlyStatements ?? [], statements = root?.recoveryMiscStatements ?? [];
  const positiveBox4 = entries.some(entry => !amountError(entry.refundOfOverpaidInterest, 'Box4') && parseGuidedCurrency(entry.refundOfOverpaidInterest).gt(0));
  const present = root?.priorYearInterestRecoveriesPresent;
  if (present !== true) {
    if (rows.length || closed.length || statements.length || positiveBox4) throw new Error('Reconcile the actual earlier-year refund or recovery sources before answering no or leaving recovery facts unknown.');
    return { recoveries: [], recoveryOnlyForm1098: [], form1099Misc: [] };
  }
  if ((taxYear !== 2025 && taxYear !== 2026) || !status) throw new Error('Confirm the actual recovery receipt tax year and filing status.');
  if (root?.allRecoveriesIncluded !== true || !rows.length) throw new Error('Enter and confirm the complete actual mortgage recovery ledger.');
  const linked = new Map<string, { payer: string; account: string; owner: string; refund: string | undefined }>();
  function addLink(payer: string, account: string, accountHolder: string, refund: string | undefined) {
    const id = key(payer, account);
    if ([...linked.keys()].some(existing => existing.toLowerCase() === id.toLowerCase())) throw new Error('Duplicate mortgage refund statement identity.');
    linked.set(id, { payer, account, owner: accountHolder, refund }); return id;
  }
  for (const entry of entries) addLink(text(entry.lender, 'mortgage lender'), text(entry.accountReference, 'mortgage account'), owner(entry.accountHolder, status, spouse), entry.refundOfOverpaidInterest);
  const recoveryOnlyForm1098 = closed.map(entry => {
    const payer = text(entry.lender, 'closed-loan lender'), account = text(entry.accountReference, 'closed-loan account');
    const accountHolder = owner(entry.accountHolder, status, spouse);
    if (entry.sourceTaxYear !== String(taxYear) || entry.sourceFactsConfirmed !== true || entry.noCurrentHomeDebtConfirmed !== true) throw new Error('Confirm the actual closed-loan statement year and absence of current home debt.');
    if (!isActualDate(entry.originationDate) || String(entry.originationDate) >= `${taxYear}-01-01`) throw new Error('Enter the actual earlier-year closed-loan origination date.');
    const zeroFields = ['mortgageInterest', 'outstandingPrincipal', 'mortgageInsurancePremiums', 'pointsPaid', 'propertyTaxPaid'] as const;
    for (const field of zeroFields) if (!money(entry[field], `closed-loan ${field}`).isZero()) throw new Error('A current loan, interest, points, insurance or tax payment needs its actual current mortgage source worksheet; do not use the closed-loan recovery record.');
    const refund = money(entry.refundOfOverpaidInterest, 'closed-loan original Box4');
    const sourceId = addLink(payer, account, accountHolder, refund.toFixed());
    return Form1098Schema.parse({ sourceId, taxYear, lender: payer, mortgageInterestReceived: entry.mortgageInterest, outstandingMortgagePrincipal: entry.outstandingPrincipal, mortgageOriginationDate: entry.originationDate,
      refundOfOverpaidInterest: refund.toFixed(), mortgageInsurancePremiums: entry.mortgageInsurancePremiums, pointsPaid: entry.pointsPaid, propertyTax: entry.propertyTaxPaid });
  });
  const miscIds = new Set<string>(), miscIdentities = new Set<string>();
  const form1099Misc = statements.map(entry => {
    const sourceId = text(entry.sourceId, 'MISC source ID'), payer = text(entry.payer, 'MISC payer'), accountReference = text(entry.accountReference, 'MISC account reference');
    const accountHolder = owner(entry.accountHolder, status, spouse); if (accountHolder === 'joint') throw new Error('Use the actual individual MISC recipient owner.');
    const payerTin = text(entry.payerTin, 'MISC payer TIN').replace(/-/g, '');
    if (!/^\d{9}$/.test(payerTin)) throw new Error('Enter the actual nine-digit MISC payer TIN.');
    const identity = `${payerTin}|${accountReference.toLowerCase()}|${accountHolder}`;
    if (miscIds.has(sourceId) || miscIdentities.has(identity)) throw new Error('Duplicate original MISC statement; reconcile its recovery allocations once.');
    miscIds.add(sourceId); miscIdentities.add(identity);
    if (entry.sourceTaxYear !== String(taxYear) || entry.sourceFormRevision !== (taxYear === 2025 ? '2025-04' : '2026-12')) throw new Error('Confirm the actual MISC source year and applicable original revision.');
    if (entry.sourceFactsConfirmed !== true || entry.recoveryOnlyIncomeConfirmed !== true) throw new Error('Confirm the original MISC source contains only the actual taxable mortgage recovery in Box3. Other income needs its own classification.');
    if (entry.directSales !== false || entry.fatcaFilingRequirement !== false) throw new Error('Confirm original MISC direct-sales and FATCA facts; applicable or unknown special sources need their separate method.');
    const amounts = Object.fromEntries(Object.entries(recoveryMiscAmounts).map(([field, label]) => [field, money(entry[field as keyof typeof recoveryMiscAmounts], label).toFixed()])) as Record<keyof typeof recoveryMiscAmounts, string>;
    for (const field of ['rents', 'royalties', 'fishingBoatProceeds', 'medicalPayments', 'substitutePayments', 'cropInsurance', 'grossAttorneyProceeds', 'fishPurchasedForResale', 'section409ADeferrals', 'nonqualifiedDeferredComp'] as const) {
      if (!parseGuidedCurrency(amounts[field]).isZero()) throw new Error('A positive unrelated MISC box needs its actual income method; the mortgage recovery label cannot route it.');
    }
    if (taxYear === 2026 && (!money(entry.cashTips, 'MISC cash tips').isZero() || !money(entry.qualifiedOvertimeCompensation, 'MISC overtime').isZero() || entry.tippedOccupationCodePresent !== false)) throw new Error('MISC tip or overtime reporting needs its separate compensation source route.');
    if (taxYear === 2025 && (entry.tippedOccupationCodePresent === true || [entry.cashTips, entry.qualifiedOvertimeCompensation].some(value => value?.trim() && !money(value, 'saved MISC compensation amount').isZero()))) throw new Error('Saved MISC compensation reporting conflicts with the actual 2025 recovery-only source; reconcile the original year and boxes.');
    if (entry.stateTaxReporting === 'none') {
      if (!parseGuidedCurrency(amounts.stateWithheld).isZero() || !parseGuidedCurrency(amounts.stateIncome).isZero() || entry.state?.trim() || entry.payerStateId?.trim()) throw new Error('Original MISC state amounts or identifiers conflict with no state reporting.');
    } else if (entry.stateTaxReporting === 'single') {
      if (!stateCodes.has(entry.state?.trim().toUpperCase() ?? '') || !entry.payerStateId?.trim()) throw new Error('Enter the actual MISC state and payer state identification.');
    } else throw new Error('Confirm original MISC state reporting; multiple states need separate actual source allocation.');
    return Form1099MiscSchema.parse({ sourceId, accountReference, taxYear, sourceFormRevision: entry.sourceFormRevision, payer, payerTin, accountHolder, ...amounts,
      directSales: entry.directSales, fatcaFilingRequirement: entry.fatcaFilingRequirement, state: entry.state?.trim().toUpperCase() || undefined, payerStateId: entry.payerStateId?.trim() || undefined,
      ...(taxYear === 2026 ? { cashTips: entry.cashTips, qualifiedOvertimeCompensation: entry.qualifiedOvertimeCompensation, treasuryTippedOccupationCodes: [] } : {}) });
  });
  const ids = new Set<string>(), refunds = new Map<string, ReturnType<typeof parseGuidedCurrency>>(), included = new Map<number, ReturnType<typeof parseGuidedCurrency>>();
  const recoveries = rows.map(row => {
    const sourceId = text(row.sourceId, 'recovery ID'); if (ids.has(sourceId)) throw new Error('Duplicate mortgage recovery ID.'); ids.add(sourceId);
    text(row.sourceReference, 'original recovery record');
    const payer = text(row.payer, 'refund payer'), account = text(row.accountReference, 'refund loan account'), accountHolder = owner(row.accountHolder, status, spouse);
    if (row.sourceTaxYear !== String(taxYear) || !/^\d{4}$/.test(row.originTaxYear ?? '') || Number(row.originTaxYear) < 1913 || Number(row.originTaxYear) >= taxYear) throw new Error('Enter the actual current receipt year and earlier origin tax year.');
    if (row.entireRefundBelongsToReturn !== true) throw new Error('Confirm the original refund belongs entirely to this return; outside-owner shares need their actual allocation method.');
    if (row.priorReturnAndOtherRecoveriesReviewed !== true || row.taxBenefitWorksheetConfirmed !== true) throw new Error('Complete and confirm the actual prior-return tax-benefit worksheet, including other recoveries and special tax conditions.');
    const reference = text(row.taxBenefitWorksheetReference, 'completed tax-benefit worksheet reference');
    const refund = money(row.refundReceived, 'original prior-year refund'), taxable = money(row.taxableRecovery, 'completed taxable recovery'), reported = money(row.alreadyIncludedInOtherIncome, 'recovery already included in other income');
    if (taxable.gt(refund) || reported.gt(taxable)) throw new Error('Reconcile taxable and already-included recovery amounts to the original refund.');
    let form1098SourceId: string | undefined;
    if (row.refundSource === 'form1098') {
      form1098SourceId = text(row.form1098SourceId, 'original Form1098 source link'); const source = linked.get(form1098SourceId);
      if (!source || source.payer !== payer || source.account !== account || source.owner !== accountHolder) throw new Error('Recovery payer, account and owner must match the original Form1098 source.');
      refunds.set(form1098SourceId, (refunds.get(form1098SourceId) ?? parseGuidedCurrency('0')).plus(refund));
    } else if (row.refundSource !== 'lender_statement' || row.form1098SourceId?.trim()) throw new Error('Choose the actual original Form1098 or lender-refund source and reconcile its saved link.');
    let otherIncomeSource: { form1099MiscIndex: number } | undefined;
    if (row.miscSourceId?.trim()) {
      const index = statements.findIndex(statement => statement.sourceId?.trim() === row.miscSourceId?.trim());
      if (index < 0 || statements[index]?.accountHolder !== accountHolder) throw new Error('The actual MISC recovery source and recipient owner must match.');
      included.set(index, (included.get(index) ?? parseGuidedCurrency('0')).plus(reported)); otherIncomeSource = { form1099MiscIndex: index };
    } else if (reported.gt(0)) throw new Error('Positive already-included recovery needs its actual MISC Box3 source link.');
    return { sourceId, form1098SourceId, originTaxYear: Number(row.originTaxYear), refundReceived: refund.toFixed(), taxableRecovery: taxable.toFixed(), alreadyIncludedInOtherIncome: reported.toFixed(), otherIncomeSource,
      taxBenefitWorksheetReference: reference, taxBenefitWorksheetConfirmed: true };
  });
  for (const [id, source] of linked) if (!money(source.refund, 'original Form1098 Box4').eq(refunds.get(id) ?? parseGuidedCurrency('0'))) throw new Error('Original Form1098 Box4 must reconcile to the actual recovery ledger without duplication.');
  form1099Misc.forEach((source, index) => { if (!included.has(index) || !parseGuidedCurrency(source.otherIncome).eq(included.get(index) ?? parseGuidedCurrency('0'))) throw new Error('Every recovery-only MISC Box3 source must reconcile exactly to its actual linked already-included amounts.'); });
  return { recoveries, recoveryOnlyForm1098, form1099Misc };
}
