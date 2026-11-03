"use client";
import {isSeparateStatePreview} from '@/lib/guided-interview-bridge';
import {PASeparateReturnPreview} from '@/components/pa-separate-return-preview';
import {PAMarriedOrdinaryDetails} from './pa-married-ordinary-details';
import {ZeroIncomeMiscDetails} from './zero-income-misc-details';

import type { TaxYearInput } from "@/models/inputs";
import { OhioResidencyDetails } from "./ohio-residency-details";
import { OhioPaymentDetails } from "./ohio-payment-details";
import {OhioReciprocalWagesDetails} from "./ohio-reciprocal-wages-details";
import {OhioSchoolDistrictDetails} from "./ohio-school-district-details";
import { PAResidencyDetails } from "./pa-residency-details";
import {PAOrdinaryDigitalDetails} from "./pa-ordinary-digital-details";
import {PAPersonalDebtForeignDetails} from "./pa-personal-debt-foreign-details";
import { PAReciprocityDetails } from "./pa-reciprocity-details";
import { PAOrdinaryReturnDetails } from "./pa-ordinary-return-details";
import { PAOrdinaryReturnCompletionDetails } from "./pa-ordinary-return-completion-details";
import { RetroShell } from "@/components/retro-shell";
import type { GuidedPreviewMetrics } from "@/lib/guided-interview-bridge";
import {
  type StateReturnData,
  type StateEstimatedPaymentEntry,
  emptyStateEstimatedPayment,
  emptyStateReturnData,
  emptyStateWithholdingEntry,
  type StateWithholdingEntry,
  supportedStates,
  type SupportedStateCode,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { formatGuidedCurrency, parseGuidedDisplayAmount } from "@/lib/guided-currency";
import { stateWithholdingDocumentTypes } from "@/lib/guided-state-facts";
import { TextFact } from "./fact-fields";
import { OhioInterestDetails } from "./ohio-interest-details";

const formatCurrency = formatGuidedCurrency;

function PaymentState({ value, onChange }: { value: string | undefined; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">State shown in the payment or withholding record</span><select className="guided-input" value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">Confirm actual state</option>{supportedStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>;
}

function StateEstimatedPaymentCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: StateEstimatedPaymentEntry;
  onUpdate: (field: keyof StateEstimatedPaymentEntry, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-card">
      <div className="guided-card-header">
        <h3 className="guided-card-title">State Payment {index + 1}</h3>
        {removable && (
          <button
            type="button"
            className="guided-card-remove"
            onClick={onRemove}
            aria-label={`Remove state estimated payment ${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>
      <div className="guided-form-grid">
        <PaymentState value={entry.state} onChange={(value) => onUpdate("state", value)} />
        <label className="guided-field">
          <span className="guided-field-label">Date paid</span>
          <input
            type="date"
            className="guided-input"
            value={entry.date}
            onChange={(e) => onUpdate("date", e.target.value)}
            aria-describedby={`state-payment-${index}-date-hint`}
          />
          <span className="guided-field-hint" id={`state-payment-${index}-date-hint`}>
            Enter the date you sent this payment to the state.
          </span>
        </label>
        <CurrencyField
          label="Amount"
          value={entry.amount}
          onChange={(v) => onUpdate("amount", v)}
          required
        />
      </div>
    </div>
  );
}

function StateSummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  const className = [
    "guided-ticker-breakdown-row",
    highlight === "positive" ? "guided-ticker-breakdown-refund" : "",
    highlight === "negative" ? "guided-ticker-breakdown-owed" : "",
    highlight ? "guided-ticker-breakdown-result" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <span className="guided-ticker-breakdown-label">{label}</span>
      <span className="guided-ticker-breakdown-value">{value}</span>
    </div>
  );
}

export function SectionStateReturn({
  stateCode,
  currentWorkspaceId,
  data,
  guidedPreview,
  onDataChange,
  originalInput,
  ordinaryOriginalInput,
  taxYear,
  filingStatus,
}: {
  stateCode: SupportedStateCode;
  currentWorkspaceId?: string;
  originalInput?: TaxYearInput | null;
  ordinaryOriginalInput?: TaxYearInput | null;
  taxYear?: number | null;
  filingStatus?: string | null;
  data: StateReturnData | undefined;
  guidedPreview: GuidedPreviewMetrics | null;
  onDataChange: (data: StateReturnData) => void;
}) {
  const current = data ?? emptyStateReturnData;
  const stateName = supportedStates.find((s) => s.code === stateCode)?.name ?? stateCode;
  const separateMetrics=isSeparateStatePreview(guidedPreview?.state)?guidedPreview?.state:null;
  const stateMetrics = isSeparateStatePreview(guidedPreview?.state)?null:(guidedPreview?.state??null);

  const stateRefund = parseGuidedDisplayAmount(stateMetrics?.stateRefund);
  const stateOwed = parseGuidedDisplayAmount(stateMetrics?.stateAmountOwed);
  const withholdingEntries = current.additionalStateWithholdingEntries ?? [];
  const actualSourceState = stateCode === "PA" || stateCode === "OH";

  function updateWithholding(index: number, field: keyof StateWithholdingEntry, value: string) {
    onDataChange({ ...current, additionalStateWithholdingEntries: withholdingEntries.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry) });
  }

  function handleAddPayment() {
    onDataChange({
      ...current,
      stateEstimatedPayments: [...current.stateEstimatedPayments, { ...emptyStateEstimatedPayment }],
    });
  }

  function handleRemovePayment(index: number) {
    const next = current.stateEstimatedPayments.filter((_, i) => i !== index);
    onDataChange({ ...current, stateEstimatedPayments: next });
  }

  function handleUpdatePayment(index: number, field: keyof StateEstimatedPaymentEntry, value: string) {
    const next = current.stateEstimatedPayments.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    );
    onDataChange({ ...current, stateEstimatedPayments: next });
  }

  return (
    <RetroShell title={`${stateName} State Return`} eyebrow="STATE">
      <div className="guided-question">
        <p className="guided-prompt">
          Let&apos;s wrap up your {stateName} state return.
        </p>
        <p className="guided-hint">
          The state preview is available when the required source facts are complete.
          Review the summary and enter your actual state estimated payments.
        </p>

        {separateMetrics?<PASeparateReturnPreview metrics={separateMetrics}/>:stateMetrics ? (
          <div className="guided-ticker-breakdown" style={{ marginTop: "16px", marginBottom: "16px" }} role="status" aria-live="polite">
            <StateSummaryRow
              label={`${stateMetrics.stateName} (${stateMetrics.stateCode})`}
              value=""
            />
            <StateSummaryRow
              label={stateMetrics.schoolDistrict?"Ohio IT1040 Tax":"State Tax"}
              value={formatCurrency(stateMetrics.stateTax)}
            />
            <StateSummaryRow
              label={stateMetrics.schoolDistrict?"Ohio IT1040 Payments":"State Payments"}
              value={formatCurrency(stateMetrics.stateWithholding)}
            />
            <StateSummaryRow
              label={stateMetrics.schoolDistrict ? (stateRefund.gt(0) ? "Ohio IT1040 Refund" : stateOwed.gt(0) ? "Ohio IT1040 Balance Due" : "Ohio IT1040 Result") : (stateRefund.gt(0) ? "State Refund" : stateOwed.gt(0) ? "State Balance Due" : "State Result")}
              value={
                stateRefund.gt(0)
                  ? formatCurrency(stateMetrics.stateRefund)
                  : stateOwed.gt(0)
                    ? formatCurrency(stateMetrics.stateAmountOwed)
                    : "—"
              }
              highlight={stateRefund.gt(0) ? "positive" : stateOwed.gt(0) ? "negative" : undefined}
            />
          </div>
        ) : (
          <div className="guided-badge-row" style={{ marginTop: "16px", marginBottom: "16px" }}>
            <span className="guided-badge guided-badge-neutral">
              Complete the income and state source facts to see your state estimate
            </span>
          </div>
        )}

        {stateMetrics?.schoolDistrict&&<section className="guided-ticker-breakdown" aria-label="School district return review"><h3>SD100 — {stateMetrics.schoolDistrict.districtName} ({stateMetrics.schoolDistrict.districtCode})</h3><p>2025 earned-income district calculation. Payments are separate from Ohio IT1040. A calculated refund is not received cash.</p>
          <StateSummaryRow label="School district earned income" value={formatCurrency(stateMetrics.schoolDistrict.earnedIncome)}/>
          <StateSummaryRow label="School district tax" value={formatCurrency(stateMetrics.schoolDistrict.tax)}/>
          <StateSummaryRow label="School district withholding" value={formatCurrency(stateMetrics.schoolDistrict.withholding)}/>
          <StateSummaryRow label="School district estimated payments" value={formatCurrency(stateMetrics.schoolDistrict.estimatedPayments)}/>
          <StateSummaryRow label="School district prior credit" value={formatCurrency(stateMetrics.schoolDistrict.priorCredit)}/>
          <StateSummaryRow label="School district total payments" value={formatCurrency(stateMetrics.schoolDistrict.totalPayments)}/>
          <StateSummaryRow label="School district overpayment" value={formatCurrency(stateMetrics.schoolDistrict.overpayment)}/>
          <StateSummaryRow label="Actual school credit election" value={formatCurrency(stateMetrics.schoolDistrict.outgoingCarryforward)}/>
          <StateSummaryRow label="Calculated school district refund" value={formatCurrency(stateMetrics.schoolDistrict.refund)}/>
          <StateSummaryRow label="School district balance due" value={formatCurrency(stateMetrics.schoolDistrict.amountOwed)}/>
          <p>Physical school-district forms and filing remain unavailable pending their separate qualification.</p>
        </section>}

        <ZeroIncomeMiscDetails data={current.zeroIncomeMiscSources} taxYear={taxYear} filingStatus={filingStatus}
          onChange={zeroIncomeMiscSources=>onDataChange({...current,zeroIncomeMiscSources})}/>
        {stateCode === "OH" && <>
          <OhioResidencyDetails originalInput={originalInput ?? null} data={current.ohioResidency} taxYear={taxYear} filingStatus={filingStatus}
            onChange={ohioResidency => onDataChange({...current, ohioResidency})} />
          <OhioPaymentDetails originalInput={originalInput ?? null} taxYear={taxYear} data={current.ohioPayments}
            onChange={ohioPayments => onDataChange({...current, ohioPayments})} />
          <OhioReciprocalWagesDetails originalInput={originalInput??null} taxYear={taxYear} data={current.ohioReciprocalWages} ohioResidency={current.ohioResidency} ohioPayments={current.ohioPayments} onChange={ohioReciprocalWages=>onDataChange({...current,ohioReciprocalWages})}/>
          {(current.ohioResidency?.schoolDistrictStatus==='actual_district_sources_required'||current.ohioSchoolDistrict)&&<OhioSchoolDistrictDetails originalInput={originalInput??null} taxYear={taxYear} data={current.ohioSchoolDistrict} ohioResidency={current.ohioResidency} ohioPayments={current.ohioPayments} onChange={ohioSchoolDistrict=>onDataChange({...current,ohioSchoolDistrict})}/>}

        </>}
        {stateCode==='PA'&&(filingStatus==='married_filing_jointly'||filingStatus==='mfj'||current.paMarriedOrdinarySources!==undefined)?<>
          <PAMarriedOrdinaryDetails originalInput={ordinaryOriginalInput??originalInput??null} data={current.paMarriedOrdinarySources} onChange={paMarriedOrdinarySources=>onDataChange({...current,paMarriedOrdinarySources})}/>
          {(['paResidencySources','paReciprocitySources','paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources']as const).filter(key=>current[key]!==undefined).map(key=><div key={key}><p>Retained {key} must be reviewed against the married household choice. It has not been discarded.</p><button type="button" onClick={()=>{const next={...current};delete next[key];onDataChange(next);}}>Remove reviewed conflicting {key}</button></div>)}
        </>:stateCode === "PA" && <>
          <PAResidencyDetails originalInput={originalInput ?? null} data={current.paResidencySources}
            onChange={paResidencySources => onDataChange({...current, paResidencySources,
              ...(current.paReciprocitySources ? {paReciprocitySources:{...current.paReciprocitySources,sourceFactsConfirmed:null}} : {})})} />
          {current.paResidencySources && <PAPersonalDebtForeignDetails originalInput={originalInput ?? null} residencySources={current.paResidencySources}
            onChange={paResidencySources => onDataChange({...current, paResidencySources,
              ...(current.paReciprocitySources ? {paReciprocitySources: {...current.paReciprocitySources, sourceFactsConfirmed: null}} : {})})} />}
          {current.paResidencySources && <PAOrdinaryDigitalDetails originalInput={originalInput ?? null} residencySources={current.paResidencySources}
            onChange={paResidencySources=>onDataChange({...current,paResidencySources,
              ...(current.paReciprocitySources?{paReciprocitySources:{...current.paReciprocitySources,sourceFactsConfirmed:null}}:{})})} />}
          {current.paResidencySources && <PAReciprocityDetails originalInput={originalInput ?? null}
            residencySources={current.paResidencySources} data={current.paReciprocitySources}
            onChange={bound => onDataChange({...current,paResidencySources:bound.residencySources,paReciprocitySources:bound.reciprocitySources})} />}
          <PAOrdinaryReturnDetails originalInput={ordinaryOriginalInput ?? null} data={current.paOrdinaryReturnFacts}
            onChange={paOrdinaryReturnFacts => onDataChange({ ...current, paOrdinaryReturnFacts })} />
          <PAOrdinaryReturnCompletionDetails currentWorkspaceId={currentWorkspaceId} originalInput={ordinaryOriginalInput ?? null} ordinaryFacts={current.paOrdinaryReturnFacts} data={current.paOrdinaryReturnCompletionSources}
            onChange={paOrdinaryReturnCompletionSources => onDataChange({ ...current, paOrdinaryReturnCompletionSources })} />
        </>}

        {stateCode === "OH" && <OhioInterestDetails data={current.ohioInterestAllocation} onChange={ohioInterestAllocation => onDataChange({ ...current, ohioInterestAllocation })} />}

        {actualSourceState ? <section aria-label="Saved state payment records">
          <h3 className="guided-section-subheading">Saved entries to reconcile</h3>
          <p className="guided-hint">Enter current withholding and payments in the actual source records above. Saved entries remain here for review against those originals. Remove a saved entry only after checking its source.</p>
          {withholdingEntries.map((entry, index) => <div className="guided-card" key={index}>
            <h4>Saved additional withholding source {index + 1}</h4>
            <p>Payer: {entry.payer || "Unknown"}</p><p>Source form: {entry.documentType || "Unknown"}</p>
            <p>Actual state: {entry.state || "Unknown"}; source year: {entry.taxYear || "Unknown"}</p>
            <p>Saved amount: {entry.amount || "Unknown"}</p>
            <button type="button" className="utility-button" aria-label={`Remove saved additional withholding source ${index + 1}`}
              onClick={() => onDataChange({ ...current, additionalStateWithholdingEntries: withholdingEntries.filter((_, i) => i !== index) })}>Remove</button>
          </div>)}
          {current.additionalStateWithholding.trim() && <div className="guided-card">
            <h4>Saved additional withholding total</h4><p>Saved amount: {current.additionalStateWithholding}</p>
            <button type="button" className="utility-button" aria-label="Remove saved additional withholding total"
              onClick={() => onDataChange({ ...current, additionalStateWithholding: "" })}>Remove</button>
          </div>}
          {current.stateEstimatedPayments.map((entry, index) => <div className="guided-card" key={index}>
            <h4>Saved state estimated payment {index + 1}</h4>
            <p>Actual state: {entry.state || "Unknown"}; date paid: {entry.date || "Unknown"}</p><p>Saved amount: {entry.amount || "Unknown"}</p>
            <button type="button" className="utility-button" aria-label={`Remove saved state estimated payment ${index + 1}`}
              onClick={() => handleRemovePayment(index)}>Remove</button>
          </div>)}
        </section> : <>
        <h3 className="guided-section-subheading">Additional State Withholding</h3>
        <p className="guided-hint">
          If you had state tax withheld from sources other than your W-2
          (e.g., 1099 withholding, backup withholding), enter the total here.
          W-2 state withholding is already included automatically.
        </p>
        {withholdingEntries.map((entry, index) => <div className="guided-card" key={index}>
          <div className="guided-card-header"><h3 className="guided-card-title">Additional state withholding {index + 1}</h3><button type="button" className="utility-button" onClick={() => onDataChange({ ...current, additionalStateWithholdingEntries: withholdingEntries.filter((_, entryIndex) => entryIndex !== index) })}>Remove</button></div>
          <TextFact label="Payer from source form" value={entry.payer} onChange={(value) => updateWithholding(index, "payer", value)} />
          <label className="guided-field"><span className="guided-field-label">Source form</span><select className="guided-input" value={entry.documentType} onChange={(event) => updateWithholding(index, "documentType", event.target.value)}><option value="">Choose actual form</option>{stateWithholdingDocumentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <PaymentState value={entry.state} onChange={(value) => updateWithholding(index, "state", value)} />
          <TextFact label="Source form tax year" value={entry.taxYear} onChange={(value) => updateWithholding(index, "taxYear", value)} />
          <CurrencyField label="State withholding on this form" hint="Exclude any amount already entered in another source form or in additional income taxes." value={entry.amount} onChange={(value) => updateWithholding(index, "amount", value)} />
        </div>)}
        <button type="button" className="utility-button" onClick={() => onDataChange({ ...current, additionalStateWithholdingEntries: [...withholdingEntries, { ...emptyStateWithholdingEntry }] })}>+ Add withholding source</button>
        {current.additionalStateWithholding.trim() && <div className="guided-form-grid">
          <CurrencyField
            label="Saved additional withholding total to reconcile"
            hint="Identify the actual source forms above; this total alone cannot establish the payment source."
            value={current.additionalStateWithholding}
            onChange={(v) => onDataChange({ ...current, additionalStateWithholding: v })}
          />
        </div>}

        <h3 className="guided-section-subheading" style={{ marginTop: "24px" }}>
          State Estimated Tax Payments
        </h3>
        <p className="guided-hint">
          Did you make estimated tax payments to {stateName} during the year?
          These are quarterly payments you sent directly to the state.
        </p>

        {current.stateEstimatedPayments.map((entry, index) => (
          <StateEstimatedPaymentCard
            key={index}
            index={index}
            entry={entry}
            onUpdate={(field, value) => handleUpdatePayment(index, field, value)}
            onRemove={() => handleRemovePayment(index)}
            removable={current.stateEstimatedPayments.length > 1}
          />
        ))}

        <button
          type="button"
          className="utility-button"
          onClick={handleAddPayment}
          style={{ marginTop: "12px" }}
          aria-label="Add another state estimated tax payment"
        >
          + Add State Estimated Payment
        </button>

        </>}

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">About your {stateName} return</summary>
          <div className="guided-expand-body">
            <p>
              State calculations need the actual residency, income, eligibility and payment
              records for the selected state and year. Complete the required source facts
              and reconcile the originals before relying on an estimate. This feature is
              beta and experimental, is not comprehensive yet, and everything should
              be reviewed and verified by the tax preparer before filing.
            </p>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
