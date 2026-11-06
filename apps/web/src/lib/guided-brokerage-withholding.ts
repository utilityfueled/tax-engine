// Spec: spec/federal/form-1099-b-withholding.yaml.
import type { BrokerageEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { hasEnteredAmount } from './guided-required-facts';

/** Original payment facts are separate from each sale's proceeds and basis. */
export function buildBrokerageWithholdingSource(entry: BrokerageEntryData) {
  const year = entry.sourceTaxYear?.trim();
  const open = entry.withholdingOnlyOpenShortSale;
  return {
    sourceId: entry.sourceId?.trim() || undefined,
    taxYear: year && /^\d{4}$/.test(year) ? Number(year) : undefined,
    federalWithheld: hasEnteredAmount(entry.federalWithheld) ? parseGuidedCurrency(entry.federalWithheld).toFixed() : undefined,
    ...(open === undefined ? {} : { withholdingOnlyOpenShortSale: { description: open.description.trim(), openedDate: open.openedDate,
      stillOpenAtYearEndConfirmed: open.stillOpenAtYearEndConfirmed ?? undefined, otherNumberedBoxesBlankConfirmed: open.otherNumberedBoxesBlankConfirmed ?? undefined } }),
  };
}
