"use client";

import { guidedFarmMoneyFields, type GuidedCashFarmData } from "@/lib/guided-cash-farm-box7";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function CashFarmBox7Details({ data, onChange }: {
  data: GuidedCashFarmData;
  onChange: (data: GuidedCashFarmData) => void;
}) {
  const receipts = data.receipts ?? [];
  const update = (change: Partial<GuidedCashFarmData>) => onChange({ ...data, sourceFactsConfirmed: null, ...change });

  return <fieldset className="guided-fieldset">
    <legend>Cash-farm records for USDA Box 7</legend>
    <p className="guided-hint">Use the farm books and original payment records. This federal-only worksheet covers one domestic, materially participating, sole-proprietor cash farm with a profit. Enter zero only when the books show zero.</p>
    <div className="guided-form-grid">
      <label className="guided-field"><span className="guided-field-label">Actual farm owner</span>
        <select className="guided-input" value={data.owner ?? ""} onChange={event => update({ owner: event.target.value as GuidedCashFarmData["owner"] })}>
          <option value="">Choose actual owner</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on this joint return</option>
        </select>
      </label>
      <TextFact label="Year of these farm books" value={data.sourceYear ?? ""} onChange={sourceYear => update({ sourceYear })} />
      <TextFact label="Local reference for the complete year-end farm books" value={data.farmReference ?? ""} onChange={farmReference => update({ farmReference })} />
      <TextFact label="Principal crop or farm activity" value={data.principalActivity ?? ""} onChange={principalActivity => update({ principalActivity })} />
      {guidedFarmMoneyFields.map(([key, label]) => <CurrencyField key={key} label={label} value={data[key] ?? ""} onChange={value => update({ [key]: value })} required />)}
    </div>
    {receipts.map((receipt, index) => {
      const change = (fields: Partial<typeof receipt>) => update({ receipts: receipts.map((row, i) => i === index ? { ...row, ...fields } : row) });
      return <fieldset key={index} className="guided-fieldset"><legend>Original USDA receipt {index + 1}</legend>
        <div className="guided-form-grid">
          <TextFact label="Payer TIN on the matching Form 1099-G" value={receipt.payerTin ?? ""} onChange={payerTin => change({ payerTin })} />
          <TextFact label="Matching Form 1099-G statement reference" value={receipt.statementReference ?? ""} onChange={statementReference => change({ statementReference })} />
          <TextFact label="Local reference for this payment record" value={receipt.reference ?? ""} onChange={reference => change({ reference })} />
          <TextFact label="Actual payment receipt date" type="date" value={receipt.receivedDate ?? ""} onChange={receivedDate => change({ receivedDate })} />
          <CurrencyField label="Actual taxable amount received" value={receipt.amount ?? ""} onChange={amount => change({ amount })} required />
          <label className="guided-field"><span className="guided-field-label">Program on the original receipt</span>
            <select className="guided-input" value={receipt.program ?? ""} onChange={event => change({ program: event.target.value as typeof receipt.program })}>
              <option value="">Choose from the original</option><option value="ordinary-taxable-usda">Ordinary, fully taxable USDA subsidy</option>
              <option value="other">CRP, cost-share, loan, insurance or another program</option>
            </select>
          </label>
        </div>
        <button type="button" className="utility-button utility-button-small" onClick={() => update({ receipts: receipts.filter((_, i) => i !== index) })}>Remove USDA receipt {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => update({ receipts: [...receipts, {}] })}>Add USDA receipt</button>
    <p className="guided-hint">Other receipts or expenses, employees, depreciation, carryovers, farm elections and payments reported for another person require separate records.</p>
    <BooleanFact label="The books confirm this is the complete income and expense record for one qualifying cash farm, with no other items or elections" value={data.scopeConfirmed} onChange={scopeConfirmed => update({ scopeConfirmed })} />
    <BooleanFact label="I checked the farm books and every USDA receipt against the original records after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
  </fieldset>;
}
