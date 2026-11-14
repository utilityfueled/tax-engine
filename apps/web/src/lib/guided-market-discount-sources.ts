// Spec: spec/federal/guided-market-discount-sources.yaml.
import { Form1099IntSchema } from '@/models/inputs';
import { Form1099DAMarketDiscountSourceSchema } from '@/models/form-1099-da-market-discount';
import type { DigitalAssetEntryData, DigitalAssetTransactionData } from './guided-digital-asset-facts';
import type { FilingStatus, InterestEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { amountError } from './guided-required-facts';
import { buildInterestInputs } from './guided-interest-originals';
import { buildOidInputs, type OidEntryData } from './guided-oid-facts';

export const marketDiscountAmountFields = [
  ['previouslyIncludedMarketDiscount', 'Previously included market discount'], ['priorPartialPrincipalPayments', 'Prior partial principal payments'],
  ['originalIssueDiscount', 'Original issue discount'], ['acquisitionPremium', 'Acquisition premium'], ['bondPremium', 'Bond premium'],
] as const;
export const marketDiscountBooleanFields = [
  ['tokenizedDebtConfirmed', 'Actual asset is tokenized debt'], ['heldForInvestmentConfirmed', 'Debt was held for investment'],
  ['usDollarDenominated', 'Debt is denominated in US dollars'], ['fullDisposition', 'Sale disposed of the entire debt holding'],
  ['currentInclusionElectionApplies', 'Current-inclusion market discount election applies'], ['allInterestAsOidElectionApplies', 'All-interest-as-OID election applies'],
  ['strippedDebt', 'Debt is stripped'], ['contingentPaymentDebt', 'Debt has contingent payments'], ['borrowedToAcquireOrCarry', 'Borrowing financed acquisition or carrying'],
  ['installmentObligation', 'Debt is an installment obligation'], ['transferredBasis', 'Debt has transferred basis'], ['reorganizationDebt', 'Debt came from a reorganization'],
  ['allOriginalInterestStatementsIncludedConfirmed', 'All actual original INT and OID statements are included'],
  ['sameDiscountIncludedElsewhere', 'This same discount is already included in another interest source'],
  ['noOriginalIntStatementsConfirmed', 'Actual records establish no original INT statements'],
  ['noOriginalOidStatementsConfirmed', 'Actual records establish no original OID statements'],
] as const;
export type MarketDiscountDraft = Partial<Record<typeof marketDiscountAmountFields[number][0] | 'sourceReference' | 'originalDispositionReference' | 'issueDate' | 'maturityDate' | 'interestReconciliationReference', string>>
  & Partial<Record<typeof marketDiscountBooleanFields[number][0] | 'sourceFactsConfirmed', boolean | null>> & {
    issuerTaxTreatment?: 'taxable_corporate' | 'other' | '';
    ordinaryIncomeCause?: 'market_discount_only' | 'other' | '';
    /** Original guided values at the explicit confirmation; never an inferred default. */
    originalValues?: string;
  };
export type MarketDiscountContext = {
  interestEntries?: InterestEntryData[]; oidEntries?: OidEntryData[];
  filingStatus?: FilingStatus | null; taxYear?: number | null; stateCode?: string | null;
};
function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function marketDiscountOriginalValues(entry: DigitalAssetEntryData, row: DigitalAssetTransactionData, context: MarketDiscountContext): string {
  const facts = row.marketDiscountFacts;
  return stable({ statement: { ...entry, transactions: undefined, sourceFactsConfirmed: undefined },
    disposition: { ...row, marketDiscountFacts: undefined, basisFactsConfirmed: undefined, paBasisFactsConfirmed: undefined },
    facts: { ...facts, sourceFactsConfirmed: undefined, originalValues: undefined }, context });
}
export function marketDiscountConfirmationCurrent(entry: DigitalAssetEntryData, row: DigitalAssetTransactionData, context: MarketDiscountContext): boolean {
  return row.marketDiscountFacts?.sourceFactsConfirmed === true && row.marketDiscountFacts.originalValues === marketDiscountOriginalValues(entry, row, context);
}
export function confirmMarketDiscount(entry: DigitalAssetEntryData, row: DigitalAssetTransactionData, context: MarketDiscountContext, confirmed: boolean | null): MarketDiscountDraft {
  return { ...row.marketDiscountFacts, sourceFactsConfirmed: confirmed,
    originalValues: confirmed === true ? marketDiscountOriginalValues(entry, row, context) : undefined };
}
export function invalidateMarketDiscount(facts: MarketDiscountDraft | undefined): MarketDiscountDraft | undefined {
  return facts ? { ...facts, sourceFactsConfirmed: null, originalValues: undefined } : undefined;
}
export function marketDiscountInterestOriginals(context: MarketDiscountContext, facts: MarketDiscountDraft) {
  if ((!Array.isArray(context.interestEntries) && facts.noOriginalIntStatementsConfirmed !== true)
    || (!Array.isArray(context.oidEntries) && facts.noOriginalOidStatementsConfirmed !== true))
    throw new Error('Actual complete INT/OID originals or explicit known-no-original records are required; missing collections remain unknown.');
  for (const row of context.interestEntries ?? []) {
    if (!Object.values(row).some(value => typeof value === 'string' && value.trim() !== '')) continue;
    if (!row.payer.trim() || !context.taxYear || row.sourceTaxYear !== String(context.taxYear)
      || !['primary','spouse'].includes(row.accountHolder ?? '') || (row.accountHolder === 'spouse' && context.filingStatus !== 'mfj'))
      throw new Error('Match every actual original INT statement year, payer and owner before reconciliation.');
    for (const key of ['interestIncome','earlyWithdrawalPenalty','usSavingsBondInterest','federalWithheld','foreignTaxPaid','taxExemptInterest','privateActivityBondInterest','marketDiscount','bondPremium','treasuryBondPremium','taxExemptBondPremium'] as const)
      if (amountError(row[key],key)) throw new Error(`Enter the actual original INT ${key}, including known zero.`);
    if ((['marketDiscount','bondPremium','treasuryBondPremium','taxExemptBondPremium'] as const).some(key => !parseGuidedCurrency(row[key]).isZero()))
      throw new Error('Original INT bond adjustments require their separate actual source method before reconciliation.');
    if (row.stateTaxReporting !== 'none' && row.stateTaxReporting !== 'single') throw new Error('Confirm actual original INT state reporting.');
    if (row.stateTaxReporting === 'single' && (!/^[A-Z]{2}$/.test(row.state?.trim().toUpperCase() ?? '') || amountError(row.stateWithheld,'state withholding')))
      throw new Error('Complete actual original INT state records.');
  }
  const form1099Int = buildInterestInputs(context.interestEntries, context.taxYear).map(row => Form1099IntSchema.parse(row));
  const form1099OID = buildOidInputs(context.oidEntries, context.filingStatus, context.taxYear, context.stateCode);
  if ((facts.noOriginalIntStatementsConfirmed === true && form1099Int.length) || (facts.noOriginalOidStatementsConfirmed === true && form1099OID.length))
    throw new Error('Known-no-original interest answers conflict with actual INT/OID statements.');
  return { form1099Int, form1099OID };
}
export function buildGuidedMarketDiscountSource(entry: DigitalAssetEntryData, row: DigitalAssetTransactionData, context: MarketDiscountContext) {
  const facts = row.marketDiscountFacts;
  if (!facts) return undefined;
  if (!marketDiscountConfirmationCurrent(entry, row, context)) throw new Error('Confirm actual market discount originals again after the last source edit.');
  const originals = marketDiscountInterestOriginals(context, facts);
  return Form1099DAMarketDiscountSourceSchema.parse({
    ...Object.fromEntries(marketDiscountAmountFields.map(([key]) => [key, facts[key]?.trim().replace(/,/g, '')])),
    ...Object.fromEntries(marketDiscountBooleanFields.slice(0,12).map(([key]) => [key, facts[key] ?? undefined])),
    sourceReference: facts.sourceReference, sourceFactsConfirmed: true, statementSourceId: entry.sourceId, transactionSourceId: row.sourceId,
    sourceTaxYear: Number(entry.taxYear), accountHolder: entry.accountHolder, accountReference: entry.accountReference,
    securityIdentifier: row.securityIdentifier, originalDispositionReference: facts.originalDispositionReference,
    issuerTaxTreatment: facts.issuerTaxTreatment, issueDate: facts.issueDate, maturityDate: facts.maturityDate, ordinaryIncomeCause: facts.ordinaryIncomeCause,
    originalDisposition: { dateAcquired: row.dateAcquired, dateSold: row.dateSold,
      proceeds: row.proceeds?.trim().replace(/,/g, ''), costBasis: row.costBasis?.trim().replace(/,/g, ''), marketDiscount: row.marketDiscount?.trim().replace(/,/g, ''), ordinaryIncome: row.ordinaryIncome },
    interestReportingReconciliation: { sourceReference: facts.interestReconciliationReference,
      originalForm1099Int: originals.form1099Int, originalForm1099OID: originals.form1099OID,
      allOriginalInterestStatementsIncludedConfirmed: facts.allOriginalInterestStatementsIncludedConfirmed,
      sameDiscountIncludedElsewhere: facts.sameDiscountIncludedElsewhere },
  });
}
