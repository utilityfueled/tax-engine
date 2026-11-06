"use client";

import type { MortgageWorksheetData } from '@/lib/guided-mortgage-worksheet';
import { recoveryMiscAmounts, type MortgageRecoveryData, type RecoveryOnlyStatementData, type RecoveryMiscData } from '@/lib/guided-mortgage-recoveries';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
const owners = [['primary', 'Primary taxpayer'], ['spouse', 'Spouse'], ['joint', 'Both taxpayers on this return']] as const;

export function MortgageRecoveryDetails({ data, onChange }: { data: MortgageWorksheetData; onChange: (data: MortgageWorksheetData) => void }) {
  const rows = data.recoveries ?? [], closed = data.recoveryOnlyStatements ?? [], statements = data.recoveryMiscStatements ?? [];
  const update = (change: Partial<MortgageWorksheetData>) => onChange({ ...data, sourceFactsConfirmed: null, ...change });
  function editRecovery(index: number, change: Partial<MortgageRecoveryData>) { update({ recoveries: rows.map((row, i) => i === index ? { ...row, taxBenefitWorksheetConfirmed: null, ...change } : row) }); }
  function editClosed(index: number, change: Partial<RecoveryOnlyStatementData>) { update({ recoveryOnlyStatements: closed.map((row, i) => i === index ? { ...row, sourceFactsConfirmed: null, ...change } : row) }); }
  function editMisc(index: number, change: Partial<RecoveryMiscData>) { update({ recoveryMiscStatements: statements.map((row, i) => i === index ? { ...row, sourceFactsConfirmed: null, ...change } : row) }); }
  return <section aria-label="Earlier-year mortgage recoveries">
    <p className="guided-hint">Use the completed Pub. 525 tax-benefit worksheet for each earlier tax year. This year's standard deduction does not determine the earlier tax benefit. Keep a refund of this year's interest in the current mortgage payment allocation.</p>
    {rows.map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>Recovery #{index + 1}</legend><div className="guided-form-grid">
      {([['sourceId', 'Recovery record ID'], ['sourceTaxYear', 'Actual recovery receipt tax year'], ['sourceReference', 'Recovery record reference'], ['payer', 'Refund payer'], ['accountReference', 'Refund loan account'], ['originTaxYear', 'Earlier year in which the interest was deducted']] as const).map(([field, label]) => <TextFact key={field} label={label} value={row[field] ?? ''} onChange={value => editRecovery(index, { [field]: value })} />)}
      <Choice label="Actual recovery owner" value={row.accountHolder} options={owners} onChange={value => editRecovery(index, { accountHolder: value as MortgageRecoveryData['accountHolder'] })} />
      <Choice label="Original refund source" value={row.refundSource} options={[["form1098", "Original Form 1098 Box 4"], ["lender_statement", "Actual lender refund record"]]} onChange={value => editRecovery(index, { refundSource: value as MortgageRecoveryData['refundSource'] })} />
      <TextFact label="Linked Form 1098 lender:account reference" value={row.form1098SourceId ?? ''} onChange={value => editRecovery(index, { form1098SourceId: value })} />
      {([['refundReceived', 'Actual refund received'], ['taxableRecovery', 'Taxable recovery from the completed tax-benefit worksheet'], ['alreadyIncludedInOtherIncome', 'Taxable recovery already included in linked MISC Box 3']] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={row[field] ?? ''} onChange={value => editRecovery(index, { [field]: value })} required />)}
      <TextFact label="Linked recovery-only MISC record ID" value={row.miscSourceId ?? ''} onChange={value => editRecovery(index, { miscSourceId: value })} />
      <TextFact label="Completed tax-benefit worksheet reference" value={row.taxBenefitWorksheetReference ?? ''} onChange={value => editRecovery(index, { taxBenefitWorksheetReference: value })} />
      <BooleanFact label="Entire original refund belongs to taxpayers on this return" value={row.entireRefundBelongsToReturn} onChange={value => editRecovery(index, { entireRefundBelongsToReturn: value })} />
      <BooleanFact label="Prior return, other recoveries, credits, AMT and special tax conditions were reviewed" value={row.priorReturnAndOtherRecoveriesReviewed} onChange={value => editRecovery(index, { priorReturnAndOtherRecoveriesReviewed: value })} />
      <BooleanFact label="Completed tax-benefit worksheet has been checked after the last edit" value={row.taxBenefitWorksheetConfirmed} onChange={value => editRecovery(index, { taxBenefitWorksheetConfirmed: value })} />
    </div><button type="button" className="utility-button" onClick={() => update({ recoveries: rows.filter((_, i) => i !== index), allRecoveriesIncluded: null })}>Remove recovery #{index + 1}</button></fieldset>)}
    <button type="button" className="utility-button" onClick={() => update({ recoveries: [...rows, {}], allRecoveriesIncluded: null })}>Add earlier-year mortgage recovery</button>
    <BooleanFact label="All earlier-year mortgage recovery records are included" value={data.allRecoveriesIncluded} onChange={allRecoveriesIncluded => update({ allRecoveriesIncluded })} />
    <details className="guided-expand" open={closed.length > 0}><summary className="guided-expand-trigger">Closed-loan Form 1098 refund records</summary><div className="guided-expand-body">
      <p className="guided-hint">Use this only when the original statement has no current debt, interest, points, insurance or real-estate-tax payment. Otherwise enter the actual current mortgage above. Do not enter the same original statement twice.</p>
      {closed.map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>Closed-loan statement #{index + 1}</legend><div className="guided-form-grid">
        {([['lender', 'Closed-loan lender'], ['accountReference', 'Closed-loan account reference'], ['sourceTaxYear', 'Closed-loan statement tax year']] as const).map(([field, label]) => <TextFact key={field} label={label} value={row[field] ?? ''} onChange={value => editClosed(index, { [field]: value })} />)}
        <Choice label="Closed-loan statement owner" value={row.accountHolder} options={owners} onChange={value => editClosed(index, { accountHolder: value as RecoveryOnlyStatementData['accountHolder'] })} />
        <TextFact label="Closed-loan original Box 3 origination date" type="date" value={row.originationDate ?? ''} onChange={value => editClosed(index, { originationDate: value })} />
        {([['mortgageInterest', 'Closed-loan original Box 1 interest'], ['outstandingPrincipal', 'Closed-loan original Box 2 principal'], ['refundOfOverpaidInterest', 'Closed-loan original Box 4 refund'], ['mortgageInsurancePremiums', 'Closed-loan original Box 5 insurance'], ['pointsPaid', 'Closed-loan original Box 6 points'], ['propertyTaxPaid', 'Closed-loan actual real estate taxes paid']] as const).map(([field, label]) => <CurrencyField key={field} label={label} value={row[field] ?? ''} onChange={value => editClosed(index, { [field]: value })} required />)}
        <BooleanFact label="Actual closed-loan record has no current home debt or deductible payments" value={row.noCurrentHomeDebtConfirmed} onChange={value => editClosed(index, { noCurrentHomeDebtConfirmed: value })} />
        <BooleanFact label="Closed-loan original statement checked after the last edit" value={row.sourceFactsConfirmed} onChange={value => editClosed(index, { sourceFactsConfirmed: value })} />
      </div><button type="button" className="utility-button" onClick={() => update({ recoveryOnlyStatements: closed.filter((_, i) => i !== index), allRecoveriesIncluded: null })}>Remove closed-loan statement #{index + 1}</button></fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ recoveryOnlyStatements: [...closed, {}], allRecoveriesIncluded: null })}>Add closed-loan Form 1098</button>
    </div></details>
    <details className="guided-expand" open={statements.length > 0}><summary className="guided-expand-trigger">Recovery already reported on Form 1099-MISC</summary><div className="guided-expand-body">
      <p className="guided-hint">Copy every actual box, including known zeros. This route supports only taxable mortgage recoveries in Box 3, with their original withholding. Other income categories need their own source method. Link each record above so the same taxable income is counted once.</p>
      {statements.map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>Recovery-only MISC #{index + 1}</legend><div className="guided-form-grid">
        {([['sourceId', 'MISC record ID'], ['sourceTaxYear', 'MISC statement tax year'], ['payer', 'MISC payer'], ['payerTin', 'MISC payer TIN'], ['accountReference', 'MISC account reference']] as const).map(([field, label]) => <TextFact key={field} label={label} value={row[field] ?? ''} onChange={value => editMisc(index, { [field]: value })} />)}
        <Choice label="Original MISC form revision" value={row.sourceFormRevision} options={[["2025-04", "April 2025 revision"], ["2026-12", "December 2026 revision"]]} onChange={value => editMisc(index, { sourceFormRevision: value as RecoveryMiscData['sourceFormRevision'] })} />
        <Choice label="Actual MISC recipient owner" value={row.accountHolder} options={owners.slice(0, 2)} onChange={value => editMisc(index, { accountHolder: value as RecoveryMiscData['accountHolder'] })} />
        {Object.entries(recoveryMiscAmounts).map(([field, label]) => <CurrencyField key={field} label={label} value={row[field as keyof typeof recoveryMiscAmounts] ?? ''} onChange={value => editMisc(index, { [field]: value })} required />)}
        <BooleanFact label="Original MISC direct-sales checkbox" value={row.directSales} onChange={value => editMisc(index, { directSales: value })} />
        <BooleanFact label="Original MISC FATCA filing requirement" value={row.fatcaFilingRequirement} onChange={value => editMisc(index, { fatcaFilingRequirement: value })} />
        {(row.sourceTaxYear === '2026' || row.sourceFormRevision === '2026-12' || row.cashTips !== undefined || row.qualifiedOvertimeCompensation !== undefined || row.tippedOccupationCodePresent !== undefined) && <>
          <CurrencyField label="Original MISC Box 13a cash tips" value={row.cashTips ?? ''} onChange={value => editMisc(index, { cashTips: value })} required />
          <CurrencyField label="Original MISC Box 14 qualified overtime" value={row.qualifiedOvertimeCompensation ?? ''} onChange={value => editMisc(index, { qualifiedOvertimeCompensation: value })} required />
          <BooleanFact label="Original MISC Box 13b occupation code is present" value={row.tippedOccupationCodePresent} onChange={value => editMisc(index, { tippedOccupationCodePresent: value })} />
        </>}
        <Choice label="Original MISC state reporting" value={row.stateTaxReporting} options={[["none", "No state reporting"], ["single", "One state"], ["multiple", "Multiple states — allocation needed"]]} onChange={value => editMisc(index, { stateTaxReporting: value as RecoveryMiscData['stateTaxReporting'] })} />
        <TextFact label="Original MISC state abbreviation" value={row.state ?? ''} onChange={value => editMisc(index, { state: value })} />
        <TextFact label="Original MISC payer state identification" value={row.payerStateId ?? ''} onChange={value => editMisc(index, { payerStateId: value })} />
        <BooleanFact label="Original MISC income consists entirely of linked taxable mortgage recoveries" value={row.recoveryOnlyIncomeConfirmed} onChange={value => editMisc(index, { recoveryOnlyIncomeConfirmed: value })} />
        <BooleanFact label="Original MISC boxes and ownership checked after the last edit" value={row.sourceFactsConfirmed} onChange={value => editMisc(index, { sourceFactsConfirmed: value })} />
      </div><button type="button" className="utility-button" onClick={() => update({ recoveryMiscStatements: statements.filter((_, i) => i !== index), allRecoveriesIncluded: null })}>Remove recovery-only MISC #{index + 1}</button></fieldset>)}
      <button type="button" className="utility-button" onClick={() => update({ recoveryMiscStatements: [...statements, {}], allRecoveriesIncluded: null })}>Add recovery-only Form 1099-MISC</button>
    </div></details>
  </section>;
}
