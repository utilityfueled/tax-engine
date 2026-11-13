'use client';

import { newProfessionalWageringDraft, professionalWageringDraftSchema, wageringConfirmations, type ProfessionalWageringDraft } from '@/lib/guided-professional-wagering';
import { CurrencyField } from './currency-field';
import { BooleanFact, TextFact } from './fact-fields';

const confirmationFields = Object.keys(wageringConfirmations) as (keyof typeof wageringConfirmations)[];

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
  return <section aria-label="Professional wagering ledger" className="guided-expand-body">
    <h4>2026 professional wagering</h4>
    <p className="guided-hint">Enter the totals from your complete business ledger. Use a neutral reference such as wagering-ledger-1 and keep the ledger itself in your records.</p>
    <div className="guided-form-grid">
      <TextFact label="Private wagering ledger reference" value={ledger.ledgerReference} onChange={ledgerReference => edit({ ledgerReference })} />
      <CurrencyField label="Gross taxable wagering gains" value={ledger.grossTaxableWageringGains} onChange={grossTaxableWageringGains => edit({ grossTaxableWageringGains })} />
      <CurrencyField label="Wagering losses" value={ledger.wageringLosses} onChange={wageringLosses => edit({ wageringLosses })} />
      <CurrencyField label="Otherwise deductible wagering expenses" value={ledger.otherwiseDeductibleWageringExpenses} onChange={otherwiseDeductibleWageringExpenses => edit({ otherwiseDeductibleWageringExpenses })} />
      {confirmationFields.map(field => <BooleanFact key={field} label={wageringConfirmations[field]} value={ledger[field]} onChange={value => edit({ [field]: value })} />)}
    </div>
    {error && <p className="guided-hint">{error}</p>}
    {remove}
  </section>;
}
