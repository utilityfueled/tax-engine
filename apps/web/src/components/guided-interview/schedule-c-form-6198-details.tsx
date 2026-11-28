"use client";

import type { GuidedScheduleCForm6198Draft } from '@/lib/guided-schedule-c-form-6198';
import { CurrencyField } from './currency-field';
import { BooleanFact, TextFact } from './fact-fields';

const originalFields = [
  ['taxYear', 'Tax year on Form 6198'],
  ['primaryOwnerName', 'Primary owner name on Form 6198'],
  ['primaryOwnerTaxpayerIdLast4', 'Last four taxpayer ID digits on Form 6198'],
  ['activityDescription', 'Business activity on Form 6198'],
  ['originalScheduleCReference', 'Schedule C reference on Form 6198'],
  ['currentOrdinaryLoss', 'Current ordinary Schedule C loss on Form 6198'],
] as const;

const lineFields = [
  ['openingAdjustedAssetBasisBeforeLiabilities', 'Line 6 opening adjusted asset basis', 'openingBasisReference', 'Line 6 opening basis source reference'],
  ['increases', 'Line 7 increases', 'increasesReference', 'Line 7 increases source reference'],
  ['decreases', 'Line 9 decreases', 'decreasesReference', 'Line 9 decreases source reference'],
] as const;

export function ScheduleCForm6198Details({ data, taxYear, atRiskAnswer, onChange }: {
  data?: GuidedScheduleCForm6198Draft;
  taxYear?: number | null;
  atRiskAnswer?: boolean | null;
  onChange: (draft: GuidedScheduleCForm6198Draft | undefined) => void;
}) {
  if (!data) return taxYear === 2026 && atRiskAnswer === false
    ? <button type="button" onClick={() => onChange({})}>Add actual Form 6198 Part II records</button>
    : null;

  const edit = (patch: Partial<GuidedScheduleCForm6198Draft>) => onChange({ ...data, ...patch, sourceFactsConfirmed: null });
  return <fieldset className="guided-fieldset">
    <legend>Actual Form 6198 Part II records</legend>
    <p className="guided-hint">Enter the loss with a minus sign. Leave unknown amounts blank and enter zero only when the original shows zero.</p>
    {originalFields.map(([key, label]) => <TextFact key={key} label={label} value={data[key] ?? ''} onChange={value => edit({ [key]: value })} />)}
    {lineFields.map(([key, label, refKey, refLabel]) => <div key={key}>
      <CurrencyField label={label} value={data[key] ?? ''} onChange={value => edit({ [key]: value })} />
      <TextFact label={refLabel} value={data[refKey] ?? ''} onChange={value => edit({ [refKey]: value })} />
    </div>)}
    <BooleanFact label="Do the records cover a continuing domestic sole proprietorship?"
      value={data.continuingDomesticSoleProprietorshipConfirmed} onChange={value => edit({ continuingDomesticSoleProprietorshipConfirmed: value })} />
    <BooleanFact label="Do the records cover one ordinary Schedule C loss for this activity?"
      value={data.oneOrdinaryScheduleCLossOnlyConfirmed} onChange={value => edit({ oneOrdinaryScheduleCLossOnlyConfirmed: value })} />
    <BooleanFact label="Do the records show no prior at-risk loss or recapture?"
      value={data.noPriorAtRiskLossOrRecaptureConfirmed} onChange={value => edit({ noPriorAtRiskLossOrRecaptureConfirmed: value })} />
    <BooleanFact label="Have you checked the complete actual Form 6198 Part II originals?"
      value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...data, sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>Remove actual Form 6198 Part II records</button>
  </fieldset>;
}
