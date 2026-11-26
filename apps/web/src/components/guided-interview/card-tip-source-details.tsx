"use client";

import { clearCardTipStatementConfirmation, emptyGuidedCardTipSource, type GuidedCardTipSource } from "@/lib/guided-card-tip-source";
import type { FilingStatus } from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function CardTipSourceDetails({ data, filingStatus, onChange }: {
  data?: GuidedCardTipSource;
  filingStatus?: FilingStatus | null;
  onChange: (data: GuidedCardTipSource | undefined) => void;
}) {
  if (!data) return <button type="button" onClick={() => onChange({ ...emptyGuidedCardTipSource })}>Add 2026 Form 1099-K business tip statement</button>;
  const update = (patch: Partial<GuidedCardTipSource>) => onChange(clearCardTipStatementConfirmation({ ...data, ...patch }));
  return <fieldset className="guided-w2-card">
    <legend>Form 1099-K business tip statement</legend>
    <p className="guided-hint">Copy the actual statement for one business owner. Record the matching gross receipts once in the income field above using your business ledger. Box 1c is part of Box 1a. Link this statement to your business tip deduction under Additional deductions.</p>
    <div className="guided-form-grid">
      <TextFact label="Form 1099-K statement year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <label className="guided-field">
        <span className="guided-field-label">Form 1099-K recipient</span>
        <select className="guided-input" value={data.owner} onChange={event => update({ owner: event.target.value as GuidedCardTipSource["owner"] })}>
          <option value="">Choose the actual recipient</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option>
        </select>
      </label>
      <TextFact label="Payment settlement entity name" value={data.pse} onChange={pse => update({ pse })} />
      <TextFact label="Original 1099-K statement reference" value={data.statementReference} onChange={statementReference => update({ statementReference })} />
      <CurrencyField label="1099-K Box 1a gross amount" value={data.grossAmount} onChange={grossAmount => update({ grossAmount })} />
      <CurrencyField label="1099-K Box 1b card-not-present transactions" hint="Enter 0 only if the actual statement shows no amount." value={data.cardNotPresent} onChange={cardNotPresent => update({ cardNotPresent })} />
      <CurrencyField label="1099-K Box 1c cash tips" value={data.cashTips} onChange={cashTips => update({ cashTips })} />
      <TextFact label="1099-K Box 1d occupation code" value={data.occupationCode} onChange={occupationCode => update({ occupationCode })} />
      <CurrencyField label="1099-K Box 4 federal withholding" value={data.federalWithheld} onChange={federalWithheld => update({ federalWithheld })} />
      <BooleanFact label="The statement reports no state amounts" value={data.noStateReportingConfirmed} onChange={noStateReportingConfirmed => update({ noStateReportingConfirmed })} />
      <BooleanFact label="I verified the original statement and its recipient for this return" value={data.sourceFactsConfirmed}
        onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed, confirmedFilingStatus: sourceFactsConfirmed === true ? filingStatus ?? null : null })} />
    </div>
    <button type="button" onClick={() => onChange(undefined)}>Remove Form 1099-K business tip statement</button>
  </fieldset>;
}
