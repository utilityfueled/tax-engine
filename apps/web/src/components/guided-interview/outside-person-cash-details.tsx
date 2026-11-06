"use client";

import { emptyOutsidePersonCash, type OutsidePersonCashData } from '@/lib/guided-coverage-family-health';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

/** Original cash records stay separate from either return's calculated tax. */
export function OutsidePersonCashDetails({ prefix, data, onChange }: {
  prefix: string; data?: OutsidePersonCashData; onChange: (value: OutsidePersonCashData | undefined) => void;
}) {
  if (!data) return <button type="button" onClick={() => onChange(emptyOutsidePersonCash())}>{prefix}: Add actual insurer cash sources</button>;
  const update = (patch: Partial<OutsidePersonCashData>) => onChange({ ...data, ...patch });
  const receipts = data.premiumPayments ?? [], taxPayments = data.otherReturnTaxPayments ?? [];
  return <fieldset style={{ minWidth: 0 }}><legend>{prefix}: Insurer cash and reimbursements</legend>
    <p className="guided-hint">Enter the actual cash you or your business paid to the insurer for this child, linked to the original premium receipts. Record reimbursements separately. The other return's credit, advances and tax payments do not become insurer cash. Use complete records, including an explicitly empty list when no transactions occurred.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix}: Source tax year`} value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label={`${prefix}: Source reference`} value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label={`${prefix}: All insurer cash payments and reimbursements are included`} value={data.allPremiumPaymentsIncludedConfirmed} onChange={allPremiumPaymentsIncludedConfirmed => update({ allPremiumPaymentsIncludedConfirmed })} />
    </div>
    {data.premiumPayments === undefined && <p className="guided-hint">The insurer cash payment history is unknown.</p>}
    {receipts.map((receipt, index) => {
      const row = `${prefix} receipt ${index + 1}`;
      const change = (patch: Partial<typeof receipt>) => update({ premiumPayments: receipts.map((current, position) => position === index ? { ...current, ...patch } : current) });
      const refunds = receipt.reimbursements ?? [];
      return <fieldset key={index} style={{ minWidth: 0 }}><legend>{row}: Actual original payment</legend>
        <div className="guided-form-grid">
          <TextFact label={`${row}: Original payment source ID`} value={receipt.paymentSourceId} onChange={paymentSourceId => change({ paymentSourceId })} />
          <label className="guided-field"><span className="guided-field-label">{row}: Actual payer</span><select className="guided-input" value={receipt.payer} onChange={event => change({ payer: event.target.value as typeof receipt.payer })}>
            <option value="">Choose the actual payer</option><option value="owner_after_tax">Owner, after tax</option><option value="business_paid_or_reimbursed">Business paid or reimbursed</option>
          </select></label>
          <TextFact label={`${row}: Date paid`} value={receipt.datePaid} type="date" onChange={datePaid => change({ datePaid })} />
          <TextFact label={`${row}: Source reference`} value={receipt.sourceReference} onChange={sourceReference => change({ sourceReference })} />
          <CurrencyField label={`${row}: Cash paid to insurer`} value={receipt.cashPaidToInsurer} onChange={cashPaidToInsurer => change({ cashPaidToInsurer })} />
        </div>
        <p className="guided-hint">{receipt.reimbursements === undefined ? 'The reimbursement history is unknown.' : refunds.length ? 'Each reimbursement remains linked to this original insurer payment.' : 'The actual records contain no reimbursements for this payment.'}</p>
        {refunds.map((refund, position) => {
          const refundLabel = `${row} reimbursement ${position + 1}`;
          const set = (patch: Partial<typeof refund>) => change({ reimbursements: refunds.map((current, i) => i === position ? { ...current, ...patch } : current) });
          return <fieldset key={position} style={{ minWidth: 0 }}><legend>{refundLabel}</legend><div className="guided-form-grid">
            <TextFact label={`${refundLabel}: Transaction ID`} value={refund.sourceId} onChange={sourceId => set({ sourceId })} />
            <TextFact label={`${refundLabel}: Date received`} value={refund.dateReceived} type="date" onChange={dateReceived => set({ dateReceived })} />
            <CurrencyField label={`${refundLabel}: Amount`} value={refund.amount} onChange={amount => set({ amount })} />
            <TextFact label={`${refundLabel}: Source reference`} value={refund.sourceReference} onChange={sourceReference => set({ sourceReference })} />
          </div><button type="button" onClick={() => change({ reimbursements: refunds.filter((_, i) => i !== position) })}>{refundLabel}: Remove</button></fieldset>;
        })}
        <button type="button" onClick={() => change({ reimbursements: [...refunds, { sourceId: '', dateReceived: '', amount: '', sourceReference: '' }] })}>{row}: Add actual reimbursement</button>
        <button type="button" onClick={() => change({ reimbursements: [] })}>{row}: No actual reimbursements</button>
        <button type="button" onClick={() => change({ reimbursements: undefined })}>{row}: Reimbursement history unknown</button>
        <button type="button" onClick={() => update({ premiumPayments: receipts.filter((_, position) => position !== index) })}>{row}: Remove receipt</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => update({ premiumPayments: [...receipts, { paymentSourceId: '', payer: '', datePaid: '', sourceReference: '', cashPaidToInsurer: '' }] })}>{prefix}: Add actual insurer payment</button>
    <button type="button" onClick={() => update({ premiumPayments: undefined })}>{prefix}: Insurer payment history unknown</button>
    <fieldset style={{ minWidth: 0 }}><legend>{prefix}: Other-return tax payments</legend>
      <p className="guided-hint">Retain actual payments for the other return, including an advance-credit repayment. These amounts are excluded from deductible insurer cash.</p>
      {data.otherReturnTaxPayments === undefined && <p className="guided-hint">The other-return tax-payment history is unknown.</p>}
      {data.otherReturnTaxPayments?.length === 0 && <p className="guided-hint">The actual records contain no other-return tax payments.</p>}
      {taxPayments.map((payment, index) => {
        const row = `${prefix} tax payment ${index + 1}`;
        const change = (patch: Partial<typeof payment>) => update({ otherReturnTaxPayments: taxPayments.map((current, position) => position === index ? { ...current, ...patch } : current) });
        return <fieldset key={index} style={{ minWidth: 0 }}><legend>{row}</legend><div className="guided-form-grid">
          <TextFact label={`${row}: Transaction ID`} value={payment.sourceId} onChange={sourceId => change({ sourceId })} />
          <TextFact label={`${row}: Date paid`} value={payment.datePaid} type="date" onChange={datePaid => change({ datePaid })} />
          <CurrencyField label={`${row}: Amount`} value={payment.amount} onChange={amount => change({ amount })} />
          <TextFact label={`${row}: Source reference`} value={payment.sourceReference} onChange={sourceReference => change({ sourceReference })} />
        </div><button type="button" onClick={() => update({ otherReturnTaxPayments: taxPayments.filter((_, position) => position !== index) })}>{row}: Remove</button></fieldset>;
      })}
      <button type="button" onClick={() => update({ otherReturnTaxPayments: [...taxPayments, { sourceId: '', datePaid: '', amount: '', sourceReference: '' }] })}>{prefix}: Add actual other-return tax payment</button>
      <button type="button" onClick={() => update({ otherReturnTaxPayments: [] })}>{prefix}: No actual other-return tax payments</button>
      <button type="button" onClick={() => update({ otherReturnTaxPayments: undefined })}>{prefix}: Other-return tax-payment history unknown</button>
      <BooleanFact label={`${prefix}: All other-return tax payments are included`} value={data.allOtherReturnTaxPaymentsIncludedConfirmed} onChange={allOtherReturnTaxPaymentsIncludedConfirmed => update({ allOtherReturnTaxPaymentsIncludedConfirmed })} />
    </fieldset>
    <BooleanFact label={`${prefix}: Sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>{prefix}: Remove insurer cash sources</button>
  </fieldset>;
}
