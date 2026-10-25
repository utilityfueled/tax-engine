// Spec: spec/state/digital-asset-sources.yaml. Source-only state views; keep originals for federal replay.
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { normalizeDigitalAssetCapitalInput, type DigitalAssetCapitalInput } from '@/engine/forms/digital-asset-capital-input.js';
import { d } from '@/utils/decimal.js';

export function calculateDigitalAssetStateSources<T extends DigitalAssetCapitalInput>(input: T, state: 'PA' | 'OH'): T {
  if (input.form1099B?.some(form => form.transactions.some(row => row.sourceDocumentType === '1099-da'))) {
    throw new Error('State digital-asset calculation requires the original DA sources, not an already converted copy.');
  }
  if (!input.form1099DA?.length) return input;
  const actual = calculateForm1099DASources(input);
  if (!actual.sourceFactsComplete) throw new Error('State digital-asset calculation requires complete actual original DA sources.');
  const normalized = normalizeDigitalAssetCapitalInput(input);
  if (state === 'OH') return normalized;
  const capitalForms = actual.capitalForms.map((form, formIndex) => ({ ...form, transactions: form.transactions.map((row, rowIndex) => {
    const original = input.form1099DA[formIndex].transactions[rowIndex];
    if (original.paCostBasis === undefined || !original.paCostBasis.trim() || !d(original.paCostBasis).isFinite() || d(original.paCostBasis).lt(0)
      || !original.paBasisSourceReference?.trim() || original.paBasisFactsConfirmed !== true || original.paTransactionForProfitConfirmed !== true) {
      throw new Error('Pennsylvania digital-asset sources require actual PA adjusted basis, its reference and confirmation, and actual for-profit transaction facts.');
    }
    if (original.washSale || !d(original.washSaleDisallowed).isZero() || !d(original.adjustments).isZero()) {
      throw new Error('Pennsylvania digital wash-sale or special adjustments require their separate actual source method.');
    }
    return { ...row, costBasis: original.paCostBasis };
  }) }));
  return { ...normalized, form1099B: [...input.form1099B, ...capitalForms] };
}
