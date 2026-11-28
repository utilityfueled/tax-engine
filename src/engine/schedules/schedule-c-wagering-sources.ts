import type { ScheduleCProfessionalWagering, TaxYearInput } from '@/models/inputs.js';
import { isActualDate } from '@/utils/civil-date.js';
import { d } from '@/utils/decimal.js';

type WageringStatementInput = Partial<Pick<TaxYearInput, 'formW2G' | 'stateReturns' | 'ohioResidency' | 'paResidencySources'>> & {
  taxpayer: { taxYear: number; primary: { ssn: string } };
};

export function assertObservedProfessionalWageringDates(
  statements: readonly { winningDate: string }[],
  asOfDate: string,
): void {
  if (statements.some(({ winningDate }) => !isActualDate(winningDate) || winningDate > asOfDate)) {
    throw new Error('Form W-2G Box 2 requires the actual date won on or before the as-of date.');
  }
}

/** Bind the reported subset to its original ledger and retain federal withholding. */
export function reconcileProfessionalWageringStatements(
  input: WageringStatementInput,
  sources: ScheduleCProfessionalWagering['w2gSources'],
  annualGains: string,
) {
  const forms = input.formW2G ?? [];
  if (!forms.length && sources === undefined) return undefined;
  if (input.stateReturns?.illinois || input.ohioResidency || input.paResidencySources) {
    throw new Error('Schedule C professional wagering W-2G requires a separate state composition method');
  }
  if (!sources || forms.length !== sources.statements.length) {
    throw new Error('Schedule C professional wagering requires one ledger link per original W-2G statement');
  }
  const originals = new Map(sources.statements.map(row => [row.sourceId, row]));
  if (originals.size !== sources.statements.length
    || new Set(sources.statements.map(row => row.ledgerEntry.toLowerCase())).size !== originals.size) {
    throw new Error('Schedule C professional wagering has a duplicate W-2G or ledger reference');
  }
  const recipientTin = input.taxpayer.primary.ssn.replace(/\D/g, '');
  if (recipientTin.length !== 9) throw new Error('Schedule C professional wagering requires the original recipient TIN');
  const recipientLast4 = recipientTin.slice(-4);
  const payments = new Set<string>();
  let recognizedGains = d(0);
  let withholding = d(0);
  for (const form of forms) {
    const row = form.sourceId === undefined ? undefined : originals.get(form.sourceId);
    if (!row || form.sourceId === undefined || !('taxYear' in form) || form.taxYear !== input.taxpayer.taxYear
      || form.accountHolder !== 'primary' || form.typeOfWager !== 'slots' || form.prizeType !== 'cash'
      || form.payer.trim() !== row.payer || form.payerTin?.replace('-', '') !== row.payerTin.replace('-', '')
      || row.recipientTinLast4 !== recipientLast4 || form.winningDate !== row.winningDate
      || !/^\d{1,12}(?:\.\d{1,2})?$/.test(form.federalWithheld ?? '')
      || !d(form.reportableWinnings).gt(0) || !d(form.reportableWinnings).eq(row.reportableWinnings)
      || !d(form.federalWithheld).eq(row.federalWithheld) || d(row.federalWithheld).gt(row.reportableWinnings)
      || !d(form.stateWithheld).isZero() || !d(form.stateWinnings).isZero() || form.state?.trim()
      || (form.winningsCategory !== undefined && form.winningsCategory !== 'other_gambling')) {
      throw new Error('Schedule C professional wagering W-2G facts differ from the supported original slot payment');
    }
    if (!d(row.recognizedLedgerGain).eq(row.reportableWinnings)) {
      throw new Error('Schedule C professional wagering requires a separate method when the recognized ledger gain differs from Box 1');
    }
    const payment = JSON.stringify([row.payerTin.replace('-', ''), row.winningDate, d(row.reportableWinnings).toFixed(), d(row.federalWithheld).toFixed()]);
    if (payments.has(payment)) throw new Error('Schedule C professional wagering W-2G payments cannot be uniquely distinguished');
    payments.add(payment);
    originals.delete(form.sourceId);
    recognizedGains = recognizedGains.plus(row.recognizedLedgerGain);
    withholding = withholding.plus(row.federalWithheld);
  }
  if (!recognizedGains.plus(sources.otherGrossTaxableWageringGains).eq(annualGains)) {
    throw new Error('Schedule C professional wagering W-2G and other gains do not reconcile to the annual ledger');
  }
  return withholding;
}
