"use client";

import type { RenterHomeOfficeDraft } from "@/lib/guided-form-8829-renter";
import { CurrencyField } from "./currency-field";
import { TextFact } from "./fact-fields";

export function RenterHomeOfficeDetails({ data, taxYear, onChange }: {
  data?: RenterHomeOfficeDraft;
  taxYear: number | null | undefined;
  onChange: (data: RenterHomeOfficeDraft | undefined) => void;
}) {
  if (taxYear !== 2026 && !data) return null;

  if (taxYear !== 2026) {
    return <section aria-label="Renter home office">
      <p role="alert">These saved renter home-office records require a 2026 return. Select 2026 to review them or remove them from this return.</p>
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove renter home office</button>
    </section>;
  }

  if (!data) {
    return <section aria-label="Renter home office">
      <h4>Renter home office</h4>
      <p className="guided-hint">For a federal-only calculation, use original measurements and rent and utility records for one home rented throughout 2026.</p>
      <button type="button" className="utility-button" onClick={() => onChange({
        sourceTaxYear: "",
        floorAreaReference: "",
        businessSquareFeet: "",
        totalSquareFeet: "",
        expenseReference: "",
        rent: "",
        utilities: "",
        eligibilityBasis: "",
        confirmed: false,
      })}>Add renter home office</button>
    </section>;
  }

  const update = (next: Partial<Omit<RenterHomeOfficeDraft, "confirmed">>) => onChange({ ...data, ...next, confirmed: false });
  const canConfirm = data.sourceTaxYear?.trim() === "2026" && data.eligibilityBasis === "principal-place"
    && [data.floorAreaReference, data.businessSquareFeet, data.totalSquareFeet, data.expenseReference, data.rent, data.utilities]
      .every(value => typeof value === "string" && value.trim().length > 0);

  return <fieldset className="guided-fieldset">
    <legend>Renter home office (Form 8829)</legend>
    <div className="guided-form-grid">
      <TextFact label="Tax year of home-office records" value={data.sourceTaxYear ?? ""} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <label className="guided-field">
        <span className="guided-field-label">Qualifying use of this home office</span>
        <select className="guided-input" value={data.eligibilityBasis ?? ""} onChange={event => update({ eligibilityBasis: event.target.value as RenterHomeOfficeDraft["eligibilityBasis"] })}>
          <option value="">Choose from your records</option>
          <option value="principal-place">Principal place of business</option>
          <option value="client-meetings" disabled>Client meetings require a separate worksheet</option>
        </select>
      </label>
      <TextFact label="Floor area record reference" value={data.floorAreaReference ?? ""} onChange={floorAreaReference => update({ floorAreaReference })} />
      <TextFact label="Square feet used for business" value={data.businessSquareFeet ?? ""} onChange={businessSquareFeet => update({ businessSquareFeet })} />
      <TextFact label="Total square feet of the home" value={data.totalSquareFeet ?? ""} onChange={totalSquareFeet => update({ totalSquareFeet })} />
      <TextFact label="Rent and utility record reference" value={data.expenseReference ?? ""} onChange={expenseReference => update({ expenseReference })} />
      <CurrencyField label="Rent for the whole home" value={data.rent ?? ""} onChange={rent => update({ rent })} required />
      <CurrencyField label="Utilities for the whole home" value={data.utilities ?? ""} onChange={utilities => update({ utilities })} required />
    </div>
    <label className="guided-checkbox-field">
      <input
        type="checkbox"
        className="guided-option-checkbox"
        checked={data.confirmed === true}
        disabled={!canConfirm}
        onChange={event => onChange({ ...data, confirmed: event.target.checked })}
      />
      <span>Throughout the year, I rented the same home and used the same space regularly and exclusively for business under the qualifying use above. All gross income for this business came from use of this home. I entered the actual indirect rent and utilities, including any zero amounts. There are no other home-office expenses, adjustments, or carryovers, and I excluded these costs from the other Schedule C lines.</span>
    </label>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove renter home office</button>
  </fieldset>;
}
