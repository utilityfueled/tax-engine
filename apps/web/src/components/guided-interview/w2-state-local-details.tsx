"use client";
import { useState } from "react";
import type { TaxYearInput } from "@/models/inputs";
import type { W2StateLocalSources } from "@/models/w2-state-local";
import { confirmGuidedW2StateLocalSources, emptyGuidedW2StateLocalSources, updateGuidedW2StateLocalSources } from "@/lib/guided-w2-state-local-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function NumberFact({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type="number" step="1" value={value === null ? "" : value} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}
function SelectFact({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

/** Collect actual printed rows without inferring jurisdiction, allocation, or another federal W-2. */
export function W2StateLocalDetails({ originalInput, originalIndex, data, onChange }: {
  originalInput: TaxYearInput | null; originalIndex: number; data?: W2StateLocalSources;
  onChange: (next: W2StateLocalSources | undefined) => void;
}) {
  const [message, setMessage] = useState("");
  if (!data) return <button type="button" onClick={() => onChange(emptyGuidedW2StateLocalSources())}>Add actual W-2 state and local sources</button>;
  const current = data;
  const update = (patch: Partial<W2StateLocalSources>) => { setMessage(""); onChange(updateGuidedW2StateLocalSources(current, patch)); };
  const updateState = (index: number, patch: Partial<W2StateLocalSources["stateRows"][number]>) => update({ stateRows: current.stateRows.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const updateLocal = (index: number, patch: Partial<W2StateLocalSources["localRows"][number]>) => update({ localRows: current.localRows.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const modes: Array<[string, string]> = [["none", "Actual original has no rows"], ["single", "One actual printed row"], ["multiple", "Two actual printed rows"]];
  const statuses: Array<[string, string]> = [["reported", "Reported on the original"], ["blank_original", "Verified blank on the original"]];
  return <section aria-label="Actual W-2 state and local sources">
    <h3>Actual W-2 state and local rows</h3>
    <p className="guided-hint">State wages may overlap and do not have to add to federal wages. Enter each printed row once from this original. This collector does not create another federal W-2, decide local tax jurisdiction, or establish a credit or deduction. More rows, continuation forms, or corrected originals need their source method.</p>
    <NumberFact label="W-2 state and local source tax year" value={current.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
    <TextFact label="W-2 state and local original reference" value={current.sourceReference} onChange={sourceReference => update({ sourceReference })} />
    <SelectFact label="Actual W-2 owner" value={current.owner.accountHolder} options={[["primary", "Primary taxpayer"], ["spouse", "Spouse"]]} onChange={accountHolder => update({ owner: { ...current.owner, accountHolder: accountHolder as W2StateLocalSources["owner"]["accountHolder"] } })} />
    {([
      ["currentUncorrectedNonvoidOriginalConfirmed", "This is the actual current, uncorrected and nonvoid original"],
      ["allOriginalBoxesKnownConfirmed", "Every original box has been checked, including verified zero and blank boxes"],
      ["singleOriginalWithoutContinuationConfirmed", "This original has no continuation or additional W-2 copy containing other rows"],
      ["allOriginalPagesAndCopiesCheckedConfirmed", "All actual pages and copies have been checked"],
    ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={current[key]} onChange={value => update({ [key]: value })} />)}
    <SelectFact label="Actual state row reporting" value={current.stateReporting} options={modes} onChange={stateReporting => update({ stateReporting: stateReporting as W2StateLocalSources["stateReporting"] })} />
    <SelectFact label="Actual local row reporting" value={current.localReporting} options={modes} onChange={localReporting => update({ localReporting: localReporting as W2StateLocalSources["localReporting"] })} />
    <p className="guided-hint">Changing reporting mode preserves entered rows. Reconcile or explicitly remove a row; a mode change does not erase original source facts.</p>
    <SelectFact label="Existing single-row field reconciliation" value={current.legacyScalarProjection} options={[["first_entered_rows", "Existing single-row fields exactly match the first entered rows"], ["unused", "Existing single-row fields are unused and contain no state/local facts"]]} onChange={legacyScalarProjection => update({ legacyScalarProjection: legacyScalarProjection as W2StateLocalSources["legacyScalarProjection"] })} />
    <p className="guided-hint">Check the existing W-2 single-row fields against the original. They must match the first entered rows exactly, or be explicitly cleared as unused. This selection does not change those fields or add another withholding credit.</p>
    {current.stateRows.map((row, index) => <fieldset className="guided-card" key={index}><legend>State original row {index + 1}</legend>
      <NumberFact label={`State ${index + 1} actual printed row position`} value={row.printedRow} onChange={printedRow => updateState(index, { printedRow })} />
      <TextFact label={`State ${index + 1} original row reference`} value={row.sourceReference} onChange={sourceReference => updateState(index, { sourceReference })} />
      <SelectFact label={`State ${index + 1} actual Box 15 state`} value={row.state} options={[["PA", "Pennsylvania"], ["OH", "Ohio"]]} onChange={state => updateState(index, { state: state as typeof row.state })} />
      <SelectFact label={`State ${index + 1} employer state ID original status`} value={row.employerStateIDStatus} options={statuses} onChange={employerStateIDStatus => updateState(index, { employerStateIDStatus: employerStateIDStatus as typeof row.employerStateIDStatus })} />
      <TextFact label={`State ${index + 1} actual employer state ID`} value={row.employerStateID} onChange={employerStateID => updateState(index, { employerStateID })} />
      <CurrencyField label={`State ${index + 1} actual Box 16 wages`} value={row.wages} onChange={wages => updateState(index, { wages })} />
      <CurrencyField label={`State ${index + 1} actual Box 17 withholding`} value={row.withheld} onChange={withheld => updateState(index, { withheld })} />
      <button type="button" onClick={() => update({ stateRows: current.stateRows.filter((_, i) => i !== index) })}>Remove state original row {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ stateRows: [...current.stateRows, { printedRow: null, sourceReference: "", state: "", employerStateIDStatus: "", employerStateID: "", wages: "", withheld: "" }] })}>Add actual state row</button>
    {current.localRows.map((row, index) => <fieldset className="guided-card" key={index}><legend>Local original row {index + 1}</legend>
      <NumberFact label={`Local ${index + 1} actual printed row position`} value={row.printedRow} onChange={printedRow => updateLocal(index, { printedRow })} />
      <TextFact label={`Local ${index + 1} original row reference`} value={row.sourceReference} onChange={sourceReference => updateLocal(index, { sourceReference })} />
      <SelectFact label={`Local ${index + 1} Box 20 original locality status`} value={row.localityNameStatus} options={statuses} onChange={localityNameStatus => updateLocal(index, { localityNameStatus: localityNameStatus as typeof row.localityNameStatus })} />
      <TextFact label={`Local ${index + 1} actual Box 20 locality name`} value={row.localityName} onChange={localityName => updateLocal(index, { localityName })} />
      <CurrencyField label={`Local ${index + 1} actual Box 18 wages`} value={row.wages} onChange={wages => updateLocal(index, { wages })} />
      <CurrencyField label={`Local ${index + 1} actual Box 19 withholding`} value={row.withheld} onChange={withheld => updateLocal(index, { withheld })} />
      <button type="button" onClick={() => update({ localRows: current.localRows.filter((_, i) => i !== index) })}>Remove local original row {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={() => update({ localRows: [...current.localRows, { printedRow: null, sourceReference: "", localityNameStatus: "", localityName: "", wages: "", withheld: "" }] })}>Add actual local row</button>
    <button type="button" onClick={() => {
      try {
        if (!originalInput) throw new Error("Complete the actual original W-2 and taxpayer before confirmation");
        onChange(confirmGuidedW2StateLocalSources(originalInput, originalIndex, current)); setMessage("Actual original rows confirmed after the last edit.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Complete the actual original rows before confirmation."); }
    }}>Confirm actual W-2 rows after the last edit</button>
    <p role="status">{message || (current.sourceFactsConfirmed === true ? "Original source facts retained; edits require reconfirmation." : "Actual original source confirmation is required.")}</p>
    <button type="button" onClick={() => onChange(undefined)}>Remove W-2 state and local sources</button>
  </section>;
}
