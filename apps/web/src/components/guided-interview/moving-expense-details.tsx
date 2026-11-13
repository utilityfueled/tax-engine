'use client';

import {
  emptyMovingExpense, hasMovingSpouse, movingExpensesDraftSchema,
  type MovingExpenseDraft, type MovingExpensesDraft,
} from '@/lib/guided-moving-expenses';
import type { FilingStatus } from '@/lib/guided-interview-flow';
import { hasEnteredAmount } from '@/lib/guided-required-facts';
import { parseGuidedDisplayAmount } from '@/lib/guided-currency';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string; value: T | ''; options: ReadonlyArray<readonly [T, string]>; onChange: (value: T | '') => void;
}) {
  return <label className="guided-field">
    <span className="guided-field-label">{label}</span>
    <select className="guided-input" value={value} onChange={event => onChange(options.find(([key]) => key === event.target.value)?.[0] ?? '')}>
      <option value="">Confirm from actual records</option>
      {options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}
    </select>
  </label>;
}

const ownerOptions = [['primary', 'Primary taxpayer'], ['spouse', 'Spouse']] as const;

export function MovingExpenseDetails({ data, removed, taxYear, filingStatus, hasSpouse, onChange }: {
  data?: MovingExpensesDraft; taxYear?: number | null; filingStatus?: FilingStatus | null;
  removed: boolean; hasSpouse: boolean; onChange: (next: MovingExpensesDraft | undefined) => void;
}) {
  const parsed = movingExpensesDraftSchema.safeParse(data);
  if (removed && data === undefined && taxYear !== 2026) return null;
  if (taxYear !== 2026 || (data !== undefined && !parsed.success)) {
    return <section aria-label="Moving expense records">
      <p role="alert">The saved moving records need a matching 2026 return and a supported source format.</p>
      <button type="button" onClick={() => onChange(undefined)}>Remove moving expenses from this return</button>
    </section>;
  }
  const moves = parsed.success ? parsed.data.moves : [];
  const replace = (next: MovingExpenseDraft[]) => onChange(next.length ? { sourceTaxYear: 2026, moves: next } : undefined);
  const owners = hasMovingSpouse(filingStatus, hasSpouse) ? ownerOptions : ownerOptions.slice(0, 1);

  return <section aria-label="Moving expense records">
    <h4>2026 moving expense records</h4>
    <p className="guided-hint">Use each domestic move’s orders, paid expenses and reimbursement records. Enter zero only when the records show zero. Choose a neutral label like move-1. Leave out names, SSNs, order numbers and assignment details.</p>
    {moves.map((move, index) => {
      const label = `Move ${index + 1}`;
      const update = (patch: Partial<MovingExpenseDraft>) => replace(moves.map((row, position) => position === index ? { ...row, ...patch } : row));
      return <fieldset className="guided-expand-body" key={index}>
        <legend>{label}</legend>
        <div className="guided-form-grid">
          <TextFact label={`${label} private reference label`} value={move.moveReference} onChange={moveReference => update({ moveReference })} />
          <Choice label={`${label} owner`} value={move.accountHolder} options={owners} onChange={accountHolder => update({ accountHolder })} />
          <TextFact label={`${label} relocation date`} type="date" value={move.date} onChange={date => update({ date })} />
          <BooleanFact label={`${label} was domestic and all expenses and reimbursements belong to 2026`} value={move.domesticSameYearConfirmed} onChange={domesticSameYearConfirmed => update({ domesticSameYearConfirmed })} />
          <Choice label={`${label} eligibility`} value={move.eligibilityKind} options={[
            ['military', 'Military permanent change of station'], ['intelligence-community', 'Intelligence-community assignment change'],
          ]} onChange={eligibilityKind => update({ eligibilityKind, activeDuty: null, permanentChangeOfStationOrdered: null, employmentStatus: '', qualifyingElement: null, nonMilitary: null, assignmentRequiresRelocation: null })} />
          {move.eligibilityKind === 'military' && <>
            <BooleanFact label={`${label} member was on active duty`} value={move.activeDuty} onChange={activeDuty => update({ activeDuty })} />
            <BooleanFact label={`${label} permanent change of station was ordered`} value={move.permanentChangeOfStationOrdered} onChange={permanentChangeOfStationOrdered => update({ permanentChangeOfStationOrdered })} />
          </>}
          {move.eligibilityKind === 'intelligence-community' && <>
            <Choice label={`${label} employment status`} value={move.employmentStatus} options={[
              ['employee', 'Employee'], ['new-appointee', 'New appointee'],
            ]} onChange={employmentStatus => update({ employmentStatus })} />
            <BooleanFact label={`${label} employer is a qualifying intelligence-community element`} value={move.qualifyingElement} onChange={qualifyingElement => update({ qualifyingElement })} />
            <BooleanFact label={`${label} owner was a civilian employee or appointee`} value={move.nonMilitary} onChange={nonMilitary => update({ nonMilitary })} />
            <BooleanFact label={`${label} change in assignment required relocation`} value={move.assignmentRequiresRelocation} onChange={assignmentRequiresRelocation => update({ assignmentRequiresRelocation })} />
          </>}
          <CurrencyField label={`${label} eligible household goods transportation and storage`} value={move.transportationAndStorage} onChange={transportationAndStorage => update({ transportationAndStorage })} />
          <CurrencyField label={`${label} eligible nonvehicle transportation and lodging`} value={move.transportationAndLodging} onChange={transportationAndLodging => update({ transportationAndLodging })} />
          <Choice label={`${label} vehicle expense method`} value={move.vehicleMethod} options={[
            ['none', 'No personal-vehicle expenses'], ['actual', 'Actual gas and oil'], ['mileage', 'Standard mileage'],
          ]} onChange={vehicleMethod => update({
            vehicleMethod, gasAndOil: '', mileage: [],
            parkingAndTolls: vehicleMethod === 'actual' || vehicleMethod === 'mileage' ? move.parkingAndTolls : '',
          })} />
          {move.vehicleMethod === 'actual' && <CurrencyField label={`${label} eligible actual gas and oil`} value={move.gasAndOil} onChange={gasAndOil => update({ gasAndOil })} />}
          {(move.vehicleMethod === 'actual' || move.vehicleMethod === 'mileage') && <CurrencyField label={`${label} eligible parking and tolls`} value={move.parkingAndTolls} onChange={parkingAndTolls => update({ parkingAndTolls })} />}
        </div>
        {move.vehicleMethod === 'mileage' && <>
          <p className="guided-hint">Enter the total eligible miles for each date. The 2026 rate changes on July 1.</p>
          {move.mileage.map((entry, entryIndex) => {
            const entryLabel = `${label} mileage ${entryIndex + 1}`;
            const updateEntry = (patch: Partial<typeof entry>) => update({ mileage: move.mileage.map((current, position) => position === entryIndex ? { ...current, ...patch } : current) });
            return <div className="guided-form-grid" key={entryIndex}>
              <TextFact label={`${entryLabel} date`} type="date" value={entry.date} onChange={date => updateEntry({ date })} />
              <TextFact label={`${entryLabel} eligible miles`} value={entry.miles} onChange={miles => updateEntry({ miles })} />
              <button type="button" onClick={() => update({ mileage: move.mileage.filter((_, position) => position !== entryIndex) })}>Remove {entryLabel}</button>
            </div>;
          })}
          <button type="button" onClick={() => update({ mileage: [...move.mileage, { date: '', miles: '' }] })}>Add {label} mileage date</button>
        </>}
        <p className="guided-hint">For Form 3903 line 4, use government reimbursement records and Form W-2 Box 12 code P. Leave out W-2 Box 1 wages, government-provided services, and dislocation, temporary lodging and move-in housing allowances. Leave costs covered by separately exempt allowances out of the expenses above.</p>
        <CurrencyField label={`${label} eligible government reimbursements`} value={move.reimbursementsExcludedFromIncome} onChange={reimbursementsExcludedFromIncome => update({ reimbursementsExcludedFromIncome })} />
        {(parseGuidedDisplayAmount(move.reimbursementsExcludedFromIncome).gt(0) || hasEnteredAmount(move.omittedTaxableExcess)) && (
          <CurrencyField label={`${label} taxable reimbursement omitted from W-2 Box 1`}
            hint="Use the actual payroll and reimbursement records. Enter 0 when they confirm no taxable excess was omitted."
            value={move.omittedTaxableExcess ?? ""} onChange={omittedTaxableExcess => update({ omittedTaxableExcess })} />
        )}
        <BooleanFact label={`${label} expenses and reimbursements reconciled to the original records`} value={move.lineAmountsConfirmed} onChange={lineAmountsConfirmed => update({ lineAmountsConfirmed })} />
        <button type="button" onClick={() => replace(moves.filter((_, position) => position !== index))}>Remove {label}</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => replace([...moves, emptyMovingExpense()])}>Add moving expense record</button>
    {moves.length === 0 && !removed && <button type="button" onClick={() => onChange(undefined)}>Remove moving expenses from this return</button>}
  </section>;
}
