// Spec: spec/federal/form-1099-b-withholding.yaml.
import type { FilingStatus, Form1099B } from '@/models/inputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

type BrokerageWithholdingRecord = Pick<Form1099B, 'broker' | 'sourceId' | 'taxYear' | 'accountHolder' | 'federalWithheld' | 'withholdingOnlyOpenShortSale'> & { stateWithheld?: string; transactions: readonly unknown[] };

/** Original recipient statements, not transaction copies, establish the credit. */
export function calculateBrokerageWithholding(
  forms: BrokerageWithholdingRecord[],
  context: { taxYear: number; filingStatus: FilingStatus; spousePresent: boolean },
) {
  const audit = new AuditTrail();
  let federalWithheld = d(0);
  let sourceFactsComplete = true;
  const identifiers = new Set<string>();
  for (const [index, form] of forms.entries()) {
    const hasSource = form.sourceId !== undefined || form.taxYear !== undefined || form.withholdingOnlyOpenShortSale !== undefined;
    if (form.federalWithheld === undefined) {
      if (hasSource) throw new Error('Actual brokerage source requires the original Box4 amount, including known zero.');
      sourceFactsComplete = false;
      continue; // Historical unverified source; do not replace its omitted amount.
    }
    if (!form.federalWithheld.trim()) throw new Error('Broker federal withholding must be an actual finite nonnegative amount.');
    const amount = d(form.federalWithheld);
    if (!amount.isFinite() || amount.lt(0)) throw new Error('Broker federal withholding must be finite and nonnegative.');
    const actualSource = hasSource || amount.gt(0);
    if (actualSource) {
      const id = form.sourceId?.trim();
      if (!id || !form.broker.trim()) throw new Error('Positive or actual brokerage withholding requires the original source ID and broker.');
      if (form.taxYear !== context.taxYear) throw new Error('Broker withholding source year must match the actual return year.');
      if (!['primary', 'spouse'].includes(form.accountHolder ?? '')) throw new Error('Broker withholding requires the actual taxpayer owner.');
      if (form.accountHolder === 'spouse' && (context.filingStatus !== 'married_filing_jointly' || !context.spousePresent)) throw new Error('Broker withholding spouse owner requires the actual joint spouse.');
      if (identifiers.has(id)) throw new Error('Duplicate brokerage statement source: report its Box4 withholding once, not once per transaction.');
      identifiers.add(id);
      const shortSale = form.withholdingOnlyOpenShortSale;
      if (shortSale !== undefined) {
        const stateAmount = d(form.stateWithheld);
        if (!amount.gt(0) || form.transactions.length || !stateAmount.isFinite() || !stateAmount.isZero()) throw new Error('A withholding-only open short sale requires positive Box4 and no sale transaction or other numbered amounts.');
        const date = shortSale.openedDate;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${context.taxYear}-`) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('The open short sale requires its actual current-year opened date.');
        if (!shortSale.description?.trim() || shortSale.stillOpenAtYearEndConfirmed !== true || shortSale.otherNumberedBoxesBlankConfirmed !== true) throw new Error('The open short sale requires its actual description, year-end status and original blank numbered-box confirmation.');
      } else if (amount.gt(0) && form.transactions.length === 0) {
        throw new Error('Withholding with no capital transaction requires the actual open-short-sale source method.');
      }
    } else sourceFactsComplete = false;
    federalWithheld = federalWithheld.plus(amount);
    audit.record('Form1099B', `Box4:${index}`, 'Original brokerage federal withholding', amount,
      'Original recipient statement Box4, once per statement', { sourceTaxYear: String(form.taxYear ?? 'unknown'), owner: form.accountHolder ?? 'unknown', sourceVerified: actualSource ? 'true' : 'false' });
  }
  audit.record('Form1099B', 'Box4-total', 'Brokerage federal withholding to Form1040 line25b', federalWithheld,
    'Sum original statement Box4 amounts once; original cents retained', { allSourcesVerified: String(sourceFactsComplete) });
  return { federalWithheld, sourceFactsComplete, lines: audit.getLines() };
}
