"use client";

import type { GuidedDirectReitDividendFacts } from "@/lib/guided-direct-reit-dividend";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function DirectReitDividendDetails({ data, onChange }: {
  data?: GuidedDirectReitDividendFacts;
  onChange: (data: GuidedDirectReitDividendFacts | undefined) => void;
}) {
  const facts = data ?? {};
  function update(patch: Partial<GuidedDirectReitDividendFacts>) {
    onChange({ ...facts, ...patch });
  }

  return <fieldset className="guided-w2-card">
    <legend>2026 Box 5 direct REIT distribution</legend>
    <p className="guided-hint">Use your dividend notice, lot history, and position records for one direct REIT cash distribution. Fund distributions and Box 5 amounts from multiple distributions need separate review.</p>
    <p className="guided-hint">Enter a stable account reference you can match to your actual records in the statement details above. A private label is enough. Masked numbers and short numeric suffixes are too ambiguous.</p>
    <div className="guided-form-grid">
      <TextFact label="REIT distribution source year" value={facts.sourceTaxYear ?? ""} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="REIT distribution and lot record reference" value={facts.sourceReference ?? ""} onChange={sourceReference => update({ sourceReference })} />
      <TextFact label="Date through which your records confirm the distribution and position" type="date" value={facts.sourceAsOfDate ?? ""} onChange={sourceAsOfDate => update({ sourceAsOfDate })} />
      <TextFact label="Direct REIT issuer name" value={facts.issuerName ?? ""} onChange={issuerName => update({ issuerName })} />
      <TextFact label="REIT security identifier" value={facts.securityIdentifier ?? ""} onChange={securityIdentifier => update({ securityIdentifier })} />
      <CurrencyField label="Original amount for this Box 5 distribution" value={facts.originalBox5Amount ?? ""} onChange={originalBox5Amount => update({ originalBox5Amount })} />
      <TextFact label="REIT shares acquired on" type="date" value={facts.acquiredOn ?? ""} onChange={acquiredOn => update({ acquiredOn })} />
      <TextFact label="REIT ex-dividend date" type="date" value={facts.exDividendOn ?? ""} onChange={exDividendOn => update({ exDividendOn })} />
      <TextFact label="REIT dividend paid on" type="date" value={facts.paidOn ?? ""} onChange={paidOn => update({ paidOn })} />
      <TextFact label="REIT shares sold or last confirmed held on" type="date" value={facts.heldThrough ?? ""} onChange={heldThrough => update({ heldThrough })} />
      <BooleanFact label="The position was sold on the recorded held-through date" value={facts.positionEnded} onChange={positionEnded => update({ positionEnded })} />
      <label className="guided-field">
        <span className="guided-field-label">Diminished-risk days in the holding window</span>
        <input className="guided-input" inputMode="numeric" value={facts.diminishedRiskDays ?? ""}
          onChange={event => update({ diminishedRiskDays: event.target.value })} />
        <span className="guided-field-hint">Use the number from your holding-period review. Enter 0 only when the records establish none.</span>
      </label>
      <CurrencyField label="Amount subject to a related-payment obligation" value={facts.relatedPaymentAmount ?? ""}
        hint="Enter the part of this dividend affected by a related-payment obligation. Enter 0 only when your records establish none. A partially affected dividend needs separate review."
        onChange={relatedPaymentAmount => update({ relatedPaymentAmount })} />
      <BooleanFact label="One direct REIT cash distribution makes up all of Box 5" value={facts.singleDirectReitDistributionConfirmed}
        onChange={singleDirectReitDistributionConfirmed => update({ singleDirectReitDistributionConfirmed })} />
      <BooleanFact label="I checked the REIT distribution facts against the original records" value={facts.sourceFactsConfirmed}
        onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    </div>
    {data && <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove REIT distribution records</button>}
  </fieldset>;
}
