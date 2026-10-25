"use client";

import type { MortgageEntryData } from '@/lib/guided-interview-flow';
import type { MortgagePointsHistoryData } from '@/lib/guided-mortgage-points';
import { CurrencyField } from './currency-field';

function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value === '' ? null : event.target.value === 'true')}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
export function MortgagePointsHistoryFields({ entry, onChange }: { entry: MortgageEntryData; onChange: (change: Partial<MortgageEntryData>) => void }) {
  const source = entry.pointsHistory;
  const update = (change: Partial<MortgagePointsHistoryData>) => onChange({ pointsHistory: { ...source, ...change,
    ...(!('historyConfirmed' in change) && !('completedMethodConfirmed' in change) ? { historyConfirmed: null, completedMethodConfirmed: null } : {}) } });
  const text = (key: keyof MortgagePointsHistoryData, label: string, type = 'text') => <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><input className="guided-input" type={type} value={typeof source?.[key] === 'string' ? source[key] as string : ''} onChange={event => update({ [key]: event.target.value })} /></label>;
  const amount = (key: keyof MortgagePointsHistoryData, label: string) => <CurrencyField key={key} label={label} value={typeof source?.[key] === 'string' ? source[key] as string : ''} onChange={value => update({ [key]: value })} required hint="Use original records. Enter 0 only when established; past deductions are not inferred from elapsed years." />;
  const fact = (key: keyof MortgagePointsHistoryData, label: string) => <Fact key={key} label={label} value={typeof source?.[key] === 'boolean' ? source[key] as boolean : null} onChange={value => update({ [key]: value })} />;
  return <fieldset className="guided-fieldset" style={{ gridColumn: '1 / -1' }}><legend>Points deduction sources</legend>
    <p className="guided-hint">Current Box 6 and past points history are separate. Prior amortization can apply when the current statement reports zero. Keep each original amount and its actual deduction history.</p>
    <label className="guided-field"><span className="guided-field-label">Actual points deduction method</span><select className="guided-input" value={entry.pointsMethod ?? ''} onChange={event => onChange({ pointsMethod: event.target.value as MortgageEntryData['pointsMethod'] })}><option value="">Choose actual method</option><option value="none">No points claim or history</option><option value="current_year">Qualifying current-year purchase points</option><option value="ratable">Actual ratable points history</option><option value="completed_amortization">Completed points worksheet</option></select></label>
    {(entry.pointsMethod === 'ratable' || entry.pointsMethod === 'completed_amortization') && <>
      {text('sourceTaxYear', 'Points worksheet tax year')}{text('sourceReference', 'Points worksheet source reference')}
      {text('originalLender', 'Original points lender')}{text('originalAccountReference', 'Original points loan reference')}{text('paidDate', 'Original points payment date', 'date')}
      {amount('originalPoints', 'Original eligible points excluding service fees')}{amount('originalPrincipal', 'Original principal of the points loan')}
      {amount('priorPointsDeducted', 'Points deducted before this tax year')}{amount('unamortizedPointsAtStartOfYear', 'Unamortized points at the start of this year')}
      {fact('cashMethod', 'Do the actual points records use cash-method accounting?')}{fact('pointsAreInterest', 'Are the original eligible points prepaid interest rather than service fees?')}
      {entry.pointsMethod === 'ratable' ? <>
        {text('loanTermMonths', 'Original points loan term in months')}{text('paymentsInYear', 'Actual number of payments this tax year')}{text('paymentIntervalMonths', 'Actual months between payments')}
        {fact('comparableLoanTerms', 'Actual comparable-loan terms are established')}
        <p className="guided-hint">The ordinary ratable method requires a term no longer than 30 years. Comparable terms are required for a term longer than 10 years. The original principal and points must meet the Publication 936 limits.</p>
      </> : <>
        <label className="guided-field"><span className="guided-field-label">Actual completed points method</span><select className="guided-input" value={source?.completedMethod ?? ''} onChange={event => update({ completedMethod: event.target.value as MortgagePointsHistoryData['completedMethod'] })}><option value="">Choose source worksheet method</option><option value="ongoing_amortization">Completed ongoing amortization</option><option value="early_termination">Mortgage ended without same-lender refinancing</option><option value="same_lender_refinancing">Remaining points spread over same-lender refinancing</option><option value="qualified_improvement_allocation">Completed current-year improvement and ratable allocation</option></select></label>
        {amount('deductibleAmountBeforeLimit', 'Completed points deduction before the home-debt limit')}{amount('unamortizedPointsAvailable', 'Actual points available in the completed worksheet')}
        {fact('serviceFeesExcludedConfirmed', 'Does the completed worksheet exclude service fees and noninterest charges?')}
        {fact('reportedOnCurrentForm1098', 'Is this completed points amount reported on the current Form 1098?')}
        {(source?.completedMethod === 'early_termination' || source?.completedMethod === 'same_lender_refinancing') && <>
          {text('endingDate', 'Actual mortgage ending or refinancing date', 'date')}{fact('sameLenderRefinance', 'Was the old mortgage refinanced with the same lender?')}
        </>}
        {source?.completedMethod === 'same_lender_refinancing' && <>
          {text('newLoanReference', 'Actual new loan source reference')}{text('newLoanTermMonths', 'Actual new loan term in months')}
          {fact('sameLenderBalanceSpreadConfirmed', 'Are the remaining points spread over the new term without early acceleration?')}
        </>}
        <p className="guided-hint">Use an actual completed amortization or improvement worksheet. A same-lender refinance cannot accelerate the old balance. Mixed prior unreported and current reported points require their separate allocation method; do not combine them here.</p>
        {fact('completedMethodConfirmed', 'Have the actual completed points method and its pre-limit deduction been checked?')}
      </>}
      {fact('historyConfirmed', 'Original loan, current statement, payment share and past points deductions reconcile')}
    </>}
    {source && <button type="button" className="guided-btn-secondary" onClick={() => onChange({ pointsHistory: undefined })}>Remove saved points history</button>}
  </fieldset>;
}
