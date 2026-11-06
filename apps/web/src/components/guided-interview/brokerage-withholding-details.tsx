'use client';
import type { BrokerageEntryData } from '@/lib/guided-interview-flow';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function BrokerageWithholdingDetails({ data, onChange }: { data: BrokerageEntryData; onChange: (data: BrokerageEntryData) => void }) {
  const open = data.withholdingOnlyOpenShortSale;
  return <fieldset className="guided-fieldset"><legend>Original brokerage withholding</legend>
    <p className="guided-hint">Enter Box4 once for the original statement, even if it lists several transactions. Positive withholding requires its actual statement ID and tax year. Do not repeat prior-year short-sale withholding on a later closing statement.</p>
    <TextFact label="Original brokerage statement ID" value={data.sourceId ?? ''} onChange={sourceId => onChange({ ...data, sourceId })} />
    <TextFact label="Original brokerage tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => onChange({ ...data, sourceTaxYear })} />
    <CurrencyField label="Box 4 broker federal income tax withheld" value={data.federalWithheld ?? ''} onChange={federalWithheld => onChange({ ...data, federalWithheld })} hint="Enter the actual amount, including known zero. Leave an unknown amount unanswered." />
    {open ? <div className="guided-w2-stack">
      <p className="guided-hint">Use only the actual statement for a short sale opened this year and still open at year end. Its Box1a describes the sale; other numbered boxes besides Box4 are blank. Remove any completed-sale rows separately; they are not silently discarded.</p>
      <TextFact label="Original open short-sale description" value={open.description} onChange={description => onChange({ ...data, withholdingOnlyOpenShortSale: { ...open, description } })} />
      <TextFact label="Actual short-sale opening date" value={open.openedDate} onChange={openedDate => onChange({ ...data, withholdingOnlyOpenShortSale: { ...open, openedDate } })} />
      <BooleanFact label="Short sale remained open at year end" value={open.stillOpenAtYearEndConfirmed} onChange={stillOpenAtYearEndConfirmed => onChange({ ...data, withholdingOnlyOpenShortSale: { ...open, stillOpenAtYearEndConfirmed } })} />
      <BooleanFact label="Other numbered boxes are blank on the original statement" value={open.otherNumberedBoxesBlankConfirmed} onChange={otherNumberedBoxesBlankConfirmed => onChange({ ...data, withholdingOnlyOpenShortSale: { ...open, otherNumberedBoxesBlankConfirmed } })} />
      <button type="button" className="utility-button utility-button-small" onClick={() => onChange({ ...data, withholdingOnlyOpenShortSale: undefined })}>Remove open short-sale record</button>
    </div> : <button type="button" className="utility-button utility-button-small" onClick={() => onChange({ ...data, withholdingOnlyOpenShortSale: { description: '', openedDate: '', stillOpenAtYearEndConfirmed: null, otherNumberedBoxesBlankConfirmed: null } })}>Add withholding-only open short sale</button>}
  </fieldset>;
}
