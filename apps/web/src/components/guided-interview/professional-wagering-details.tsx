'use client';

import {
  maxGuidedWageringStatements, newProfessionalWageringDraft, newWageringStatement, professionalWageringDraftSchema,
  wageringConfirmations, wageringOriginalsConfirmation, type ProfessionalWageringDraft, type WageringStatementDraft,
} from '@/lib/guided-professional-wagering';
import { CurrencyField } from './currency-field';
import { BooleanFact, TextFact } from './fact-fields';

const ledgerConfirmations = ['fullCalendarYearConfirmed', 'completeDomesticProfessionalActivityConfirmed', 'noOtherActivityOrDuplicatedAmountsConfirmed'] as const;
const originalTextFields = {
  sourceId: 'Private statement reference', ledgerEntry: 'Private linked ledger entry',
  payer: 'Payer name', payerTin: 'Payer TIN', recipientTinLast4: 'Recipient TIN last four digits', winningDate: 'Date won (box 2)',
} as const;
const originalAmountFields = {
  reportableWinnings: 'Reportable winnings (box 1)', recognizedLedgerGain: 'Recognized gain in your ledger', federalWithheld: 'Federal withholding (box 4)',
} as const;
const textFields = Object.keys(originalTextFields) as (keyof typeof originalTextFields)[];
const amountFields = Object.keys(originalAmountFields) as (keyof typeof originalAmountFields)[];

export function ProfessionalWageringDetails({ data, available, error, onChange }: {
  data?: ProfessionalWageringDraft;
  available: boolean;
  error?: string;
  onChange: (next: ProfessionalWageringDraft | undefined) => void;
}) {
  if (data === undefined) {
    return available ? <button type="button" onClick={() => onChange(newProfessionalWageringDraft())}>Add professional wagering ledger</button> : null;
  }
  const saved = professionalWageringDraftSchema.safeParse(data);
  const remove = <button type="button" onClick={() => onChange(undefined)}>Remove professional wagering ledger</button>;
  if (!available || !saved.success) {
    return <section aria-label="Professional wagering ledger">
      <p role="alert">{error ?? 'This saved ledger requires a supported 2026 federal-only return.'}</p>
      {remove}
    </section>;
  }
  const ledger = saved.data;
  const edit = (patch: Partial<ProfessionalWageringDraft>) => onChange({ ...ledger, ...patch });
  const originals = ledger.w2gSources;
  const editStatements = (statements: WageringStatementDraft[]) => edit({
    noW2GOriginalsConfirmed: null,
    w2gSources: statements.length ? {
      otherGrossTaxableWageringGains: originals?.otherGrossTaxableWageringGains ?? '',
      individualOriginalsAndLedgerInclusionConfirmed: null, statements,
    } : undefined,
  });
  return <section aria-label="Professional wagering ledger" className="guided-expand-body">
    <h4>2026 professional wagering</h4>
    <p className="guided-hint">Enter the totals from your complete business ledger. Use a neutral reference such as wagering-ledger-1 and keep the ledger itself in your records.</p>
    <div className="guided-form-grid">
      <TextFact label="Private wagering ledger reference" value={ledger.ledgerReference} onChange={ledgerReference => edit({ ledgerReference })} />
      <CurrencyField label="Gross taxable wagering gains" value={ledger.grossTaxableWageringGains} onChange={grossTaxableWageringGains => edit({ grossTaxableWageringGains })} />
      <CurrencyField label="Wagering losses" value={ledger.wageringLosses} onChange={wageringLosses => edit({ wageringLosses })} />
      <CurrencyField label="Otherwise deductible wagering expenses" value={ledger.otherwiseDeductibleWageringExpenses} onChange={otherwiseDeductibleWageringExpenses => edit({ otherwiseDeductibleWageringExpenses })} />
      {ledgerConfirmations.map(field => <BooleanFact key={field} label={wageringConfirmations[field]} value={ledger[field]} onChange={value => edit({ [field]: value })} />)}
      {!originals && <BooleanFact label={wageringConfirmations.noW2GOriginalsConfirmed} value={ledger.noW2GOriginalsConfirmed} onChange={noW2GOriginalsConfirmed => edit({ noW2GOriginalsConfirmed })} />}
    </div>
    {originals && <section aria-label="Original Forms W-2G">
      <p className="guided-hint">Use one entry per individual cash slot payment. Use neutral references and enter zero for a known zero amount. Group, aggregate, corrected, void, noncash and state or local statements need separate review.</p>
      {originals.statements.map((row, index) => {
        const label = `W-2G ${index + 1}`;
        const update = (field: keyof WageringStatementDraft, value: string) => editStatements(
          originals.statements.map((statement, position) => position === index ? { ...statement, [field]: value } : statement),
        );
        return <section key={index} aria-label={`Form ${label}`} className="guided-expand-body">
          <h5>Form {label}</h5>
          <div className="guided-form-grid">
            {textFields.map(field => <TextFact key={field} label={`${label}: ${originalTextFields[field]}`} value={row[field]} type={field === 'winningDate' ? 'date' : 'text'} onChange={value => update(field, value)} />)}
            {amountFields.map(field => <CurrencyField key={field} label={`${label}: ${originalAmountFields[field]}`} value={row[field]} onChange={value => update(field, value)} />)}
          </div>
          <button type="button" onClick={() => editStatements(originals.statements.filter((_, position) => position !== index))}>Remove Form {label}</button>
        </section>;
      })}
      <div className="guided-form-grid">
        <CurrencyField label="Other gross taxable wagering gains" value={originals.otherGrossTaxableWageringGains} onChange={otherGrossTaxableWageringGains => edit({ w2gSources: { ...originals, otherGrossTaxableWageringGains } })} />
        <BooleanFact label={wageringOriginalsConfirmation} value={originals.individualOriginalsAndLedgerInclusionConfirmed} onChange={individualOriginalsAndLedgerInclusionConfirmed => edit({ w2gSources: { ...originals, individualOriginalsAndLedgerInclusionConfirmed } })} />
      </div>
    </section>}
    <button type="button" disabled={originals?.statements.length === maxGuidedWageringStatements} onClick={() => editStatements([...(originals?.statements ?? []), newWageringStatement()])}>Add Form W-2G original</button>
    {error && <p className="guided-hint">{error}</p>}
    {remove}
  </section>;
}
