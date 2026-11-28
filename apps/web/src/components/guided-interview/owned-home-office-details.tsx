"use client";

import type { OwnedHomeOfficeDraft } from "@/lib/guided-form-8829-owned-home";
import { CurrencyField } from "./currency-field";
import { TextFact } from "./fact-fields";

type TextField = Exclude<keyof OwnedHomeOfficeDraft, "confirmed">;
const groups = [
  { label: "Property and business use", fields: [
    ["sourceTaxYear", "Tax year of these records"],
    ["propertyReference", "Property address or parcel reference"],
    ["purchaseReference", "Purchase record reference"],
    ["purchaseDate", "Purchase date", "date"],
    ["firstBusinessUseReference", "First business use record reference"],
    ["firstBusinessUseDate", "Date first used for this business", "date"],
    ["floorAreaReference", "Floor area record reference"],
    ["businessSquareFeet", "Square feet used for business"],
    ["totalSquareFeet", "Total square feet of the home"],
  ] },
  { label: "Value on the first day of business use", fields: [
    ["adjustedBasisReference", "Adjusted basis record reference"],
    ["adjustedBasisDate", "Date of adjusted basis shown in the record", "date"],
    ["adjustedBasisTotal", "Total adjusted basis, including land", "money"],
    ["adjustedBasisLand", "Land included in adjusted basis", "money"],
    ["fairMarketValueReference", "Fair market value record reference"],
    ["fairMarketValueDate", "Date of fair market value shown in the record", "date"],
    ["fairMarketValueTotal", "Total fair market value, including land", "money"],
    ["fairMarketValueLand", "Land included in fair market value", "money"],
  ] },
  { label: "Amounts paid in 2026 for the whole home", hint: "Include interest on loans used to buy, build, or substantially improve this home. Enter 0 when your records confirm that nothing was paid.", fields: [
    ["mortgageInterestReference", "Qualified mortgage interest payment or zero record reference"],
    ["mortgageInterest", "Qualified mortgage interest paid", "money"],
    ["realEstateTaxesReference", "Real estate tax payment or zero record reference"],
    ["realEstateTaxes", "Real estate taxes paid", "money"],
  ] },
] as const satisfies ReadonlyArray<{ label: string; hint?: string; fields: ReadonlyArray<readonly [TextField, string, ("date" | "money")?]> }>;

export function OwnedHomeOfficeDetails({ data, taxYear, onChange }: {
  data?: OwnedHomeOfficeDraft;
  taxYear: number | null | undefined;
  onChange: (data: OwnedHomeOfficeDraft | undefined) => void;
}) {
  if (taxYear !== 2026 && !data) return null;

  if (taxYear !== 2026) return <section aria-label="Owned home office">
    <p role="alert">These saved owned home-office records require a 2026 return. Select 2026 to review them or remove them from this return.</p>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove owned home office</button>
  </section>;

  if (!data) return <section aria-label="Owned home office">
    <h4>Owned home office</h4>
    <p className="guided-hint">For a federal-only return taking the standard deduction, enter records for one owned home first used for this business before 2026.</p>
    <button type="button" className="utility-button" onClick={() => {
      const fields = Object.fromEntries(groups.flatMap(group => group.fields.map(([field]) => [field, ""]))) as Record<TextField, string>;
      onChange({ ...fields, confirmed: false });
    }}>Add owned home office</button>
  </section>;

  const update = (field: TextField, value: string) => onChange({ ...data, [field]: value, confirmed: false });
  const canConfirm = data.sourceTaxYear?.trim() === "2026" && groups.every(group => group.fields.every(([field]) => data[field]?.trim()));

  return <fieldset className="guided-fieldset">
    <legend>Owned home office (Form 8829)</legend>
    <p className="guided-hint">Enter whole-dollar amounts from your records.</p>
    {groups.map(group => <fieldset key={group.label}>
      <legend>{group.label}</legend>
      {"hint" in group && <p className="guided-hint">{group.hint}</p>}
      <div className="guided-form-grid">
        {group.fields.map(([field, label, kind]) => kind === "money"
          ? <CurrencyField key={field} label={label} value={data[field] ?? ""} onChange={value => update(field, value)} required />
          : <TextFact key={field} label={label} type={kind} value={data[field] ?? ""} onChange={value => update(field, value)} />)}
      </div>
    </fieldset>)}
    <label className="guided-checkbox-field">
      <input type="checkbox" className="guided-option-checkbox" checked={data.confirmed === true} disabled={!canConfirm}
        onChange={event => onChange({ ...data, confirmed: event.target.checked })} />
      <span>These records all identify the same home. I owned it and regularly and exclusively used the same space as my principal place of business throughout 2026. The use has continued since the recorded first-use date, and all gross income from this one business came from use of this home. I will take the standard deduction and use the same business area percentage for both expenses. I excluded these costs from my other deductions. The existing 39-year GDS depreciation applies, and there are no other home expenses, improvements, special depreciation, gains, losses, or carryovers for this worksheet.</span>
    </label>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove owned home office</button>
  </fieldset>;
}
