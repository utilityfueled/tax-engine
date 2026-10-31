// Spec: spec/federal/form-1099-da-sources.yaml.
import Decimal from 'decimal.js';
import type { Form1099B, Form1099DA, TaxYearInput } from '@/models/inputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

type DigitalSourceInput = Pick<TaxYearInput, 'form1099DA'> & {
  form1099B: Array<Pick<Form1099B, 'sourceId'>>;
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {
    spouse?: Pick<NonNullable<TaxYearInput['taxpayer']['spouse']>, 'firstName' | 'lastName'>;
  };
};
type ResolvedBasis = ReadonlyMap<string, { costBasis: Decimal; dateAcquired: string }>;

function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !value.trim()) throw new Error(`Actual Form1099DA ${label} is unknown.`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Form1099DA ${label} must be finite and nonnegative.`);
  return result;
}

function actualDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`Form1099DA ${label} requires its actual valid date.`);
  }
  return value;
}

function isActualSource(form: Form1099DA, year: number): boolean {
  const statementFields = ['sourceId', 'taxYear', 'sourceReference', 'sourceFactsConfirmed', 'allTransactionsIncluded', 'federalWithheld', 'stateTaxReporting', 'accountReference'] as const;
  const transactionFields = ['sourceId', 'digitalAssetCode', 'reportedDateAcquired', 'reportedCostBasis', 'basisSource', 'basisSourceReference', 'basisFactsConfirmed',
    'proceedsType', 'sellingExpenses', 'marketDiscount', 'qof', 'lossNotAllowed', 'ordinaryIncome', 'onlyCashProceeds', 'customerProvidedAcquisitionInformation',
    'noncoveredSecurity', 'optionalReportingMethod', 'assetOrigin', 'capitalAssetConfirmed', 'nftOrCollectible',
    'paCostBasis', 'paBasisSourceReference', 'paBasisFactsConfirmed', 'paTransactionForProfitConfirmed'] as const;
  return year >= 2026 || statementFields.some(key => form[key] !== undefined)
    || form.transactions.some(row => transactionFields.some(key => row[key] !== undefined));
}

/** Bind original ordinary recipient statements before any capital conversion or withholding credit. */
export function calculateForm1099DASources(input: DigitalSourceInput, options: { resolvedLegacyBasis?: ResolvedBasis } = {}) {
  const audit = new AuditTrail();
  const capitalForms: Form1099B[] = [];
  const identifiers = new Set<string>();
  const existing = new Set(input.form1099B.flatMap(form => form.sourceId?.trim() ? [form.sourceId.trim()] : []));
  let federalWithheld = d(0);
  let sourceFactsComplete = true;
  for (const [formIndex, form] of (input.form1099DA ?? []).entries()) {
    const actual = isActualSource(form, input.taxpayer.taxYear);
    const id = form.sourceId?.trim();
    if (actual) {
      if (!id || !form.brokerName.trim() || !form.sourceReference?.trim() || form.sourceFactsComplete !== true
        || form.sourceFactsConfirmed !== true || form.allTransactionsIncluded !== true) {
        throw new Error('Actual Form1099DA requires complete original statement facts, identity and confirmation.');
      }
      if (form.taxYear !== input.taxpayer.taxYear) throw new Error('Form1099DA source year must match the actual return year.');
      if (form.accountHolder !== 'primary' && form.accountHolder !== 'spouse') throw new Error('Form1099DA requires the actual taxpayer owner.');
      if (form.accountHolder === 'spouse' && (input.taxpayer.filingStatus !== 'married_filing_jointly' || !input.taxpayer.spouse)) {
        throw new Error('Form1099DA spouse source requires the actual joint spouse.');
      }
      if (identifiers.has(id) || existing.has(id) || existing.has(`1099-da:${id}`)) throw new Error('Duplicate Form1099DA statement or collision with an already converted original source.');
      identifiers.add(id);
      if (form.transactions.length === 0) throw new Error('Actual ordinary Form1099DA requires its original individual dispositions.');
      const state = amount(form.stateWithheld, 'state withholding');
      if (form.stateTaxReporting !== 'none' && form.stateTaxReporting !== 'single') throw new Error('Form1099DA requires actual state reporting; multiple-state allocation is a separate source method.');
      if (form.stateTaxReporting === 'none' && (!state.isZero() || form.state?.trim())) throw new Error('Form1099DA no-state reporting conflicts with the actual state amounts or code.');
      if (form.stateTaxReporting === 'single' && !/^[A-Z]{2}$/.test(form.state ?? '')) throw new Error('Form1099DA state withholding requires the actual state code.');
      federalWithheld = federalWithheld.plus(amount(form.federalWithheld, 'Box4'));
    } else sourceFactsComplete = false;

    const transactionIds = new Set<string>();
    const transactions = form.transactions.map((row, transactionIndex) => {
      const description = `${row.digitalAssetName}${row.ticker ? ` (${row.ticker})` : ''}`;
      let costBasis = row.costBasis;
      let rowAdjustment = row.adjustments, adjustmentCodes: string | undefined;
      let dateAcquired = row.dateAcquired;
      if (actual) {
        const transactionId = row.sourceId?.trim();
        if (row.sourceFactsComplete !== true || !transactionId || !row.digitalAssetName.trim() || !row.digitalAssetCode?.trim()
          || !row.basisSourceReference?.trim() || row.basisFactsConfirmed !== true) throw new Error('Actual Form1099DA disposition requires complete source boxes and confirmed taxpayer basis records.');
        if (transactionIds.has(transactionId)) throw new Error('Duplicate original Form1099DA disposition; report it once.');
        transactionIds.add(transactionId);
        const quantity = amount(row.quantity, 'units');
        if (quantity.lte(0)) throw new Error('Form1099DA ordinary disposition requires positive actual units.');
        const basis = amount(row.costBasis, 'completed basis');
        const proceeds = amount(row.proceeds, 'proceeds');
        const acquired = actualDate(row.dateAcquired, 'completed acquisition'), sold = actualDate(row.dateSold, 'sale');
        if (!sold.startsWith(`${input.taxpayer.taxYear}-`) || acquired > sold) throw new Error('Form1099DA actual dates do not match the return year or holding period.');
        const anniversary = `${Number(acquired.slice(0, 4)) + 1}${acquired.slice(4)}`;
        if (row.holdingPeriod !== (sold > anniversary ? 'long' : 'short')) throw new Error('Form1099DA holding period conflicts with the actual purchase and sale dates.');
        if (row.reportedDateAcquired !== null && row.reportedDateAcquired !== acquired) throw new Error('Original Form1099DA acquisition date conflicts with the completed ordinary basis source.');
        const reportedBasis = row.reportedCostBasis === null ? undefined : amount(row.reportedCostBasis, 'reported Box1g basis');
        const basisCorrected = reportedBasis !== undefined && !reportedBasis.eq(basis);
        if (basisCorrected && (row.basisSource !== 'taxpayer_records' || row.basisCorrectionConfirmed !== true)) {
          throw new Error('Original Form1099DA basis correction requires confirmed taxpayer basis records.');
        }
        if (row.basisSource !== 'taxpayer_records' && row.basisSource !== 'broker_statement') throw new Error('Form1099DA basis source is unknown.');
        if (row.basisSource === 'broker_statement' && (row.reportedCostBasis === null || row.reportedDateAcquired === null)) throw new Error('Blank broker basis or acquisition date requires actual taxpayer records.');
        if (row.basisReportedToIRS && row.reportedCostBasis === null) throw new Error('Form1099DA reported-basis checkbox conflicts with blank original basis.');
        if (input.taxpayer.taxYear >= 2026 && row.noncoveredSecurity === false && (!row.basisReportedToIRS || row.reportedCostBasis === null)) throw new Error('Covered Form1099DA source requires its actual reported basis.');
        if (row.capitalAssetConfirmed !== true || row.assetOrigin !== 'purchase' || row.nftOrCollectible !== false
          || row.qof !== false || row.lossNotAllowed !== false || row.ordinaryIncome !== false || row.optionalReportingMethod !== 'none'
          || !['sale', 'exchange'].includes(row.transactionType)) throw new Error('Form1099DA special disposition or original acquisition requires a separate supported source method.');
        const sellingExpenses = amount(row.sellingExpenses, 'selling expenses');
        if (!['gross', 'net'].includes(row.proceedsType ?? '') || (sellingExpenses.gt(0) && row.proceedsType !== 'gross')
          || !amount(row.marketDiscount, 'market discount').isZero() || !amount(row.adjustments, 'other adjustments').isZero()) throw new Error('Form1099DA net-proceeds selling expenses, market discount or other adjustments require a separate source method.');
        if (!row.washSale && !amount(row.washSaleDisallowed, 'Box1i wash-sale loss').isZero()) throw new Error('Form1099DA wash-sale amount conflicts with its actual applicability.');
        const wash = amount(row.washSaleDisallowed, 'Box1i wash-sale loss');
        if (wash.gt(Decimal.max(0, basis.minus(proceeds)))) throw new Error('Form1099DA disallowed wash loss exceeds its actual original loss.');
        // Spec: form-1099-da-sources.yaml basis-correction. Form8949 keeps reported
        // basis in column e only when the box reports it to the IRS; column g corrects it.
        const reportedColumn = basisCorrected && row.basisReportedToIRS ? reportedBasis : undefined;
        if (reportedColumn) costBasis = reportedColumn.toFixed();
        rowAdjustment = (reportedColumn?.minus(basis) ?? new Decimal(0)).minus(sellingExpenses).toFixed();
        adjustmentCodes = `${basisCorrected ? 'B' : ''}${sellingExpenses.gt(0) ? 'E' : ''}` || undefined;
        if (row.gainOrLoss !== undefined && !d(row.gainOrLoss).eq(proceeds.minus(reportedBasis ?? basis).plus(wash))) throw new Error('Form1099DA statement gain conflicts with its actual proceeds, basis and wash adjustment.');
      } else {
        const matched = options.resolvedLegacyBasis?.get(`${description} via ${form.brokerName}|${row.dateSold}`);
        if (matched) { costBasis = matched.costBasis.toFixed(); dateAcquired = matched.dateAcquired; }
      }
      audit.record('Form1099DA', `capital:${formIndex}:${transactionIndex}`, 'Digital disposition capital source amount', d(row.proceeds).minus(d(costBasis)).plus(d(rowAdjustment)).plus(row.washSale ? d(row.washSaleDisallowed) : d(0)),
        'Original proceeds minus completed taxpayer basis plus actual supported adjustments; source cents retained', { sourceVerified: String(actual), sourceTaxYear: String(form.taxYear ?? 'unknown'), owner: form.accountHolder ?? 'unknown' });
      return { description, dateAcquired, dateSold: row.dateSold, proceeds: row.proceeds, costBasis,
        adjustments: rowAdjustment, ...(adjustmentCodes ? { adjustmentCodes } : {}), basisReportedToIRS: row.basisReportedToIRS, holdingPeriod: row.holdingPeriod,
        washSale: row.washSale, washSaleDisallowed: row.washSaleDisallowed, digitalAsset: true, sourceDocumentType: '1099-da' as const };
    });
    capitalForms.push({ broker: form.brokerName, sourceId: id ? `1099-da:${id}` : undefined, taxYear: form.taxYear,
      payerTin: form.brokerTin, accountReference: form.accountReference, accountHolder: form.accountHolder,
      federalWithheld: form.federalWithheld, stateWithheld: form.stateWithheld, state: form.state, transactions });
    if (actual) audit.record('Form1099DA', `Box4:${formIndex}`, 'Original digital-asset federal withholding', amount(form.federalWithheld, 'Box4'),
      'Original statement Box4, once per statement', { sourceVerified: 'true', sourceTaxYear: String(form.taxYear), owner: form.accountHolder ?? 'unknown' });
  }
  if (input.form1099DA?.length) audit.record('Form1099DA', 'Box4-total', 'Digital-asset withholding to Form1040 line25b', federalWithheld,
    'Sum actual original statement Box4 once; original cents retained', { allSourcesVerified: String(sourceFactsComplete) });
  return { capitalForms, federalWithheld, sourceFactsComplete, lines: audit.getLines() };
}
