"use client";

import type { FilingStatus } from "@/lib/guided-interview-flow";
import {
  emptyGuidedPersonalEvCharger,
  personalEvChargerLastEligibleServiceDate,
  personalEvChargerQuestions,
  type GuidedPersonalEvCharger,
  type GuidedPersonalEvChargerPort,
} from "@/lib/guided-personal-ev-charger";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function PersonalEvChargerDetails({ data, taxYear, filingStatus, onChange }: {
  data?: GuidedPersonalEvCharger;
  taxYear?: number | null;
  filingStatus?: FilingStatus | null;
  onChange: (data: GuidedPersonalEvCharger | undefined) => void;
}) {
  if (!data && taxYear !== 2026) return null;

  const remove = <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove personal EV charger</button>;
  const title = "Personal EV charger (Form 8911)";
  if (!data || taxYear !== 2026) {
    return <div className="guided-w2-card" style={{ padding: "12px" }}>
      <h3 className="guided-w2-card-title">{title}</h3>
      {data ? <>
        <p className="guided-hint">This worksheet covers 2026 records. Return to 2026 or remove the retained charging port.</p>
        {remove}
      </> : <>
        <p className="guided-hint">Use this worksheet for a new electric car or truck charging port at your main home in one of the 50 states or D.C.</p>
        <button type="button" className="utility-button" onClick={() => onChange({ ...emptyGuidedPersonalEvCharger })}>Add personal EV charger</button>
      </>}
    </div>;
  }

  const additional = data.additionalPortSources;
  const addAnother = () => onChange({ ...data, additionalPortSources: {
    firstPortReference: additional?.firstPortReference ?? "",
    independentCostsConfirmed: null,
    ports: [...(additional?.ports ?? []), { ...emptyGuidedPersonalEvCharger, portReference: "" }],
  } });

  return <fieldset className="guided-w2-card" style={{ padding: "12px" }}>
    <legend>{title}</legend>
    <p className="guided-hint">Use the original invoice, the record of when the port was ready and available for use, and the 2020 census tract record for the installation address. The calculation checks the tract against IRS records. <a href="https://www.irs.gov/instructions/i8911" target="_blank" rel="noreferrer">Read the Form 8911 location instructions.</a></p>
    {additional && <TextFact label="Original reference identifying charging port 1" value={additional.firstPortReference}
      onChange={firstPortReference => onChange({ ...data, additionalPortSources: { ...additional, firstPortReference } })} />}
    <PersonalEvChargerPortFields data={data} filingStatus={filingStatus} edit={patch => onChange({ ...data, ...patch })} />
    {additional?.ports.map((port, index) => {
      const editPort = (patch: Partial<typeof port>) => onChange({ ...data, additionalPortSources: {
        ...additional, ports: additional.ports.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      } });
      const removePort = () => {
        const ports = additional.ports.filter((_, itemIndex) => itemIndex !== index);
        onChange({ ...data, additionalPortSources: ports.length ? { ...additional, ports } : undefined });
      };
      return <fieldset key={index} className="guided-w2-card" style={{ padding: "12px" }}>
        <legend>Charging port {index + 2}</legend>
        <TextFact label={`Original reference identifying charging port ${index + 2}`} value={port.portReference}
          onChange={portReference => editPort({ portReference })} />
        <PersonalEvChargerPortFields data={port} filingStatus={filingStatus} edit={editPort} />
        <button type="button" className="utility-button" onClick={removePort}>Remove charging port {index + 2}</button>
      </fieldset>;
    })}
    {additional && <BooleanFact label="Each port has a separate invoice, and the records assign all costs and reductions without shared costs"
      value={additional.independentCostsConfirmed}
      onChange={independentCostsConfirmed => onChange({ ...data, additionalPortSources: { ...additional, independentCostsConfirmed } })} />}
    <button type="button" className="utility-button" onClick={addAnother}>Add another separately invoiced charging port</button>
    {remove}
  </fieldset>;
}

function PersonalEvChargerPortFields({ data, filingStatus, edit }: {
  data: GuidedPersonalEvChargerPort;
  filingStatus?: FilingStatus | null;
  edit: (patch: Partial<GuidedPersonalEvChargerPort>) => void;
}) {
  const scopeRequiresReview = personalEvChargerQuestions.some(([field]) => data[field] === false);
  return <>
    <div className="guided-form-grid">
      <label className="guided-field">
        <span className="guided-field-label">Charging port owner</span>
        <select className="guided-input" value={data.owner} onChange={event => edit({ owner: event.target.value as GuidedPersonalEvChargerPort["owner"] })}>
          <option value="">Choose the actual owner</option>
          <option value="primary">Primary taxpayer</option>
          {(filingStatus === "mfj" || data.owner === "spouse") && <option value="spouse" disabled={filingStatus !== "mfj"}>Spouse on a joint return</option>}
        </select>
      </label>
      <TextFact label="Original charger invoice reference" value={data.invoiceReference} onChange={invoiceReference => edit({ invoiceReference })} />
      <TextFact label="Placed-in-service record reference" value={data.placedInServiceReference} onChange={placedInServiceReference => edit({ placedInServiceReference })} />
      <TextFact label="Date the charging port was ready for use" type="date" value={data.placedInServiceDate} onChange={placedInServiceDate => edit({ placedInServiceDate })} />
      <TextFact label="Census tract location record reference" value={data.censusTractSourceReference} onChange={censusTractSourceReference => edit({ censusTractSourceReference })} />
      <TextFact label="2020 census tract GEOID" value={data.censusTractGeoid} onChange={censusTractGeoid => edit({ censusTractGeoid })} />
      <CurrencyField label="Gross charger invoice cost" value={data.invoiceGrossCost} onChange={invoiceGrossCost => edit({ invoiceGrossCost })} />
      <CurrencyField label="Nonqualifying invoice cost" hint="Enter 0 only if the written records establish none." value={data.nonqualifyingInvoiceCost} onChange={nonqualifyingInvoiceCost => edit({ nonqualifyingInvoiceCost })} />
      <CurrencyField label="Rebates and other basis reductions" hint="Enter 0 only if the written records establish none." value={data.rebatesAndOtherBasisReductions} onChange={rebatesAndOtherBasisReductions => edit({ rebatesAndOtherBasisReductions })} />
      {personalEvChargerQuestions.map(([field, label]) => <BooleanFact key={field} label={label} value={data[field]} onChange={value => edit({ [field]: value })} />)}
      <BooleanFact label="I verified that these original records belong to the selected owner for this return" value={data.sourceFactsConfirmed}
        onChange={sourceFactsConfirmed => edit({ sourceFactsConfirmed, confirmedFilingStatus: sourceFactsConfirmed === true ? filingStatus ?? null : null })} />
    </div>
    {data.placedInServiceDate > personalEvChargerLastEligibleServiceDate && data.placedInServiceDate.startsWith("2026-")
      && <p className="guided-hint" role="status">Property placed in service after June 30, 2026 is ineligible for this credit.</p>}
    {scopeRequiresReview && <p className="guided-hint" role="status">These records need separate review before a charging port credit can be calculated.</p>}
  </>;
}
