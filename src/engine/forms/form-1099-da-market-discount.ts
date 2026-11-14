// Spec: spec/federal/form-1099-da-market-discount.yaml.
import Decimal from 'decimal.js';
import type { Form1099DA, Form1099DATransaction, TaxYearInput } from '@/models/inputs.js';
import { Form1099DAMarketDiscountSourceSchema } from '@/models/form-1099-da-market-discount.js';
import { d } from '@/utils/decimal.js';

type InterestOriginals = Partial<Pick<TaxYearInput, 'form1099Int' | 'form1099OID'>>;
function amount(value: string, label: string): Decimal {
  const result = d(value);
  if (!value.trim() || !result.isFinite() || result.lt(0)) throw new Error(`Form1099DA market discount ${label} is unknown or invalid.`);
  return result;
}
function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error('Form1099DA market discount requires actual valid debt dates.');
  return value;
}
function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Allocate a source-confirmed full-sale amount; do not calculate accrued discount or make an election. */
export function calculateForm1099DAMarketDiscount(form: Form1099DA, row: Form1099DATransaction, originals: InterestOriginals, year: number) {
  if (row.marketDiscountSource === undefined) return undefined;
  const parsed = Form1099DAMarketDiscountSourceSchema.safeParse(row.marketDiscountSource);
  if (!parsed.success) throw new Error('Form1099DA market discount requires complete supported original debt, election and interest reconciliation facts.');
  const source = parsed.data, snapshot = source.originalDisposition;
  if (source.sourceTaxYear !== year || form.taxYear !== year || source.statementSourceId !== form.sourceId
    || source.transactionSourceId !== row.sourceId || source.accountHolder !== form.accountHolder
    || source.accountReference !== form.accountReference || source.securityIdentifier !== row.securityIdentifier)
    throw new Error('Form1099DA market discount original identity, account, year or security does not match.');
  for (const key of ['dateAcquired', 'dateSold', 'ordinaryIncome'] as const)
    if (snapshot[key] !== row[key]) throw new Error('Form1099DA market discount original disposition changed; confirm its actual source again.');
  for (const key of ['proceeds', 'costBasis', 'marketDiscount'] as const)
    if (row[key] === undefined || !amount(snapshot[key], key).eq(amount(row[key]!, key))) throw new Error('Form1099DA market discount original amount changed; confirm its actual source again.');
  const issue = date(source.issueDate), maturity = date(source.maturityDate), acquired = date(row.dateAcquired), sold = date(row.dateSold);
  const anniversary = `${Number(issue.slice(0, 4)) + 1}${issue.slice(4)}`;
  if (issue < '1984-07-19' || issue >= acquired || maturity <= anniversary || sold > maturity
    || (acquired < '2026-01-01' && row.noncoveredSecurity !== true))
    throw new Error('Form1099DA market discount short-term, original-issue, historical or inconsistent debt requires a separate source method.');
  if (row.assetOrigin !== 'purchase' || row.transactionType !== 'sale' || row.ordinaryIncome !== true || row.onlyCashProceeds !== true
    || typeof row.noncoveredSecurity !== 'boolean' || row.customerProvidedAcquisitionInformation !== false
    || row.basisSource !== 'broker_statement' || row.reportedDateAcquired !== acquired || row.reportedCostBasis == null
    || !amount(row.reportedCostBasis, 'reported basis').eq(amount(row.costBasis, 'basis')) || !row.basisReportedToIRS
    || row.basisCorrectionConfirmed === true || row.washSale !== false || !amount(row.washSaleDisallowed, 'wash adjustment').isZero()
    || !amount(row.sellingExpenses ?? '', 'selling expenses').isZero() || !amount(row.adjustments ?? '', 'other adjustment').isZero())
    throw new Error('Form1099DA market discount requires an actual ordinary-checked full cash sale without other basis, expense or wash adjustments.');
  for (const key of ['previouslyIncludedMarketDiscount', 'priorPartialPrincipalPayments', 'originalIssueDiscount', 'acquisitionPremium', 'bondPremium'] as const)
    if (!amount(source[key], key).isZero()) throw new Error('Form1099DA market discount historical inclusion, principal or OID/premium requires its separate source method.');
  const reconciliation = source.interestReportingReconciliation;
  if (originals.form1099Int === undefined || originals.form1099OID === undefined
    || canonical(reconciliation.originalForm1099Int) !== canonical(originals.form1099Int)
    || canonical(reconciliation.originalForm1099OID) !== canonical(originals.form1099OID))
    throw new Error('Form1099DA market discount requires matching complete original INT/OID statements and once-only interest reconciliation.');
  const interest = Decimal.min(Decimal.max(amount(row.proceeds, 'proceeds').minus(amount(row.costBasis, 'basis')), 0), amount(row.marketDiscount!, 'Box1h'));
  return { interest, originalDispositionKey: canonical([source.accountReference, source.securityIdentifier, source.originalDispositionReference]) };
}
