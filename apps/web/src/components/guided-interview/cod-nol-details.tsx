"use client";

import { updateGuidedCodNol, type CodDebtData, type CodInsolvencyData, type CodInsolvencyItemData, type CodNolData, type CodPersonalDebtData } from '@/lib/guided-cod-nol';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
import { CodAttributeDetails } from './cod-attribute-details';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
    <option value="">Choose from actual records</option>{value && !options.some(([key]) => key === value) && <option value={value}>Unmatched original record: {value}</option>}
    {options.map(([key, text], index) => <option key={`${key}:${index}`} value={key}>{text}</option>)}
  </select></label>;
}

export function CodNolDetails({ data, onChange }: { data?: CodNolData; onChange: (next: CodNolData | undefined) => void }) {
  const change = (patch: Partial<CodNolData>) => onChange(updateGuidedCodNol(data ?? {}, patch));
  const debt = (index: number, patch: Partial<CodDebtData>) => change({ debts: data?.debts?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const personalDebt = (index: number, patch: Partial<CodPersonalDebtData>) => debt(index, { personalDebt: { ...data?.debts?.[index]?.personalDebt, ...patch } });
  const insolvency = (patch: Partial<CodInsolvencyData>) => change({ insolvency: { ...data?.insolvency, ...patch } });
  const item = (kind: 'assets' | 'liabilities', index: number, patch: Partial<CodInsolvencyItemData>) => insolvency({
    [kind]: data?.insolvency?.[kind]?.map((row, i) => i === index ? { ...row, ...patch } : row),
  });
  const statements: [string, string][] = (data?.debts ?? []).flatMap(row => row.statementId?.trim() ? [[row.statementId.trim(), row.statementId.trim()]] : []);
  return <details className="guided-expand"><summary className="guided-expand-trigger">Canceled debt and insolvency</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the original Form 1099-C and complete records of everything you owned and owed immediately before the debt was canceled. Include retirement accounts and other assets protected from creditors.</p>
    <p className="guided-hint">This method covers unsecured personal borrowing and insolvency. If some debt remains taxable or the canceled amount includes interest, also provide the original personal borrowing records below. Complete the separate regular and AMT loss histories above, including explicit empty histories. If canceled debt reaches later attributes, enter those original records below. The return calculates reductions after current tax; do not enter a revised balance.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add canceled-debt sources</button> : <>
      <div className="guided-form-grid">
        <TextFact label="Canceled-debt source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
        <TextFact label="Canceled-debt packet reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        {([
          ['allDischargesIncluded', 'All canceled debts for the year are included'], ['title11Case', 'Debt was discharged in a title 11 bankruptcy case'],
          ['communityPropertyApplies', 'Community property rules apply'], ['electBasisReductionFirst', 'Elected to reduce depreciable property basis first'],
          ['otherExclusionsOrExceptionsApply', 'Other debt exclusions or exceptions apply'],
          ['regularAndAlternativeExclusionSameConfirmed', 'Independent regular and AMT worksheets use the same debt exclusion'],
        ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => change({ [key]: value })} />)}
      </div>
      <fieldset><legend>Original debt statements</legend>
        {data.debts === undefined && <p role="status">The original statement list is unknown.</p>}
        {(data.debts ?? []).map((row, index) => {
          const prefix = `Debt ${index + 1}`;
          return <div className="guided-w2-card" key={index}><h4>{prefix}</h4><div className="guided-form-grid">
            {([
              ['statementId', 'original statement ID'], ['sourceTaxYear', 'original tax year'], ['sourceReference', 'original record reference'],
              ['debtorName', 'debtor name'], ['debtorSsnLast4', 'debtor SSN last four'], ['creditor', 'creditor name'],
              ['creditorTin', 'creditor TIN'], ['accountReference', 'original account reference'], ['debtDescription', 'Box 4 debt description'],
            ] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => debt(index, { [key]: value })} />)}
            <Choice label={`${prefix} owner`} value={row.accountHolder} options={[
              ['primary', 'Primary taxpayer'], ['spouse', 'Spouse'],
            ]} onChange={accountHolder => debt(index, { accountHolder: accountHolder === 'primary' || accountHolder === 'spouse' ? accountHolder : undefined })} />
            <TextFact label={`${prefix} Box 1 discharge date`} type="date" value={row.dischargeDate ?? ''} onChange={dischargeDate => debt(index, { dischargeDate })} />
            {([
              ['amountDischarged', 'Box 2 canceled debt'], ['interestIncluded', 'Box 3 interest included'], ['fmvOfProperty', 'Box 7 property value'],
            ] as const).map(([key, label]) => <CurrencyField key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => debt(index, { [key]: value })} />)}
            <Choice label={`${prefix} Box 6 event code`} value={row.identifiableEventCode} options={[
              ['A', 'A — Bankruptcy'], ['B', 'B — Other judicial debt relief'], ['C', 'C — Statute of limitations or deficiency expiration'],
              ['D', 'D — Foreclosure election'], ['E', 'E — Probate or similar proceeding'], ['F', 'F — Agreement'],
              ['G', 'G — Decision to discontinue collection'], ['H', 'H — Other actual discharge before an identifiable event'],
            ]} onChange={identifiableEventCode => debt(index, { identifiableEventCode: identifiableEventCode || undefined })} />
            {([
              ['personallyLiable', 'Box 5 personally liable'], ['unsecuredPersonalDebtConfirmed', 'was unsecured personal debt'],
              ['noPropertyTransferConfirmed', 'involved no property transfer'],
            ] as const).map(([key, label]) => <BooleanFact key={key} label={`${prefix} ${label}`} value={row[key]} onChange={value => debt(index, { [key]: value })} />)}
          </div>
            {!row.personalDebt ? <button type="button" className="utility-button" onClick={() => personalDebt(index, {})}>Add debt {index + 1} personal borrowing records</button>
              : <fieldset style={{ minWidth: 0 }}><legend>{prefix} personal borrowing records</legend>
                <p className="guided-hint">Use the original borrowing, purchase, interest and settlement records. The complete canceled amount already includes any interest shown in Box 3. A blank box alone does not establish zero interest or a complete discharge amount.</p>
                <div className="guided-form-grid">
                  {([
                    ['sourceReference', 'complete discharge record reference'], ['useSourceReference', 'personal use record reference'],
                    ['interestSourceReference', 'interest record reference'],
                  ] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} ${label}`} value={row.personalDebt?.[key] ?? ''} onChange={value => personalDebt(index, { [key]: value })} />)}
                  <Choice label={`${prefix} use of borrowed funds`} value={row.personalDebt.proceedsUse} options={[
                    ['personal_living_expenses', 'Personal living expenses'], ['business', 'Business'], ['investment', 'Investment'], ['mixed_or_other', 'Mixed or another use'],
                  ]} onChange={value => personalDebt(index, { proceedsUse: value === 'personal_living_expenses' || value === 'business' || value === 'investment' || value === 'mixed_or_other' ? value : undefined })} />
                  <Choice label={`${prefix} interest treatment from original records`} value={row.personalDebt.interestTreatment} options={[
                    ['nondeductible_personal', 'Nondeductible personal interest'], ['potentially_deductible', 'Deductible or potentially deductible interest'],
                  ]} onChange={value => personalDebt(index, { interestTreatment: value === 'nondeductible_personal' || value === 'potentially_deductible' ? value : undefined })} />
                  <CurrencyField label={`${prefix} actual total discharged`} value={row.personalDebt.actualDischargedAmount ?? ''} onChange={actualDischargedAmount => personalDebt(index, { actualDischargedAmount })} />
                  <CurrencyField label={`${prefix} actual interest discharged`} value={row.personalDebt.actualDischargedInterest ?? ''} onChange={actualDischargedInterest => personalDebt(index, { actualDischargedInterest })} />
                  {([
                    ['allDischargedAmountsIncluded', 'all actual canceled amounts are included in the statement amounts'],
                    ['borrowingNotDeductibleUnpaidExpenseConfirmed', 'was borrowing, not an unpaid expense deductible if paid'],
                    ['noPaymentOrNewBorrowingAtDischargeConfirmed', 'involved no simultaneous payment or new borrowing'],
                  ] as const).map(([key, label]) => <BooleanFact key={key} label={`${prefix} ${label}`} value={row.personalDebt?.[key]} onChange={value => personalDebt(index, { [key]: value })} />)}
                </div>
                <BooleanFact label={`${prefix} personal borrowing records checked after the last edit`} value={row.personalDebt.sourceFactsConfirmed} onChange={sourceFactsConfirmed => personalDebt(index, { sourceFactsConfirmed })} />
                <button type="button" className="utility-button" onClick={() => debt(index, { personalDebt: undefined })}>Remove debt {index + 1} personal borrowing records</button>
              </fieldset>}
            <BooleanFact label={`${prefix} sources checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed => debt(index, { sourceFactsConfirmed })} />
            <button type="button" className="utility-button" onClick={() => change({ debts: data.debts?.filter((_, i) => i !== index) })}>Remove original debt statement {index + 1}</button>
          </div>;
        })}
        <button type="button" className="utility-button" onClick={() => change({ debts: [...(data.debts ?? []), {}] })}>Add original debt statement</button>
      </fieldset>
      {!data.insolvency ? <button type="button" className="utility-button" onClick={() => insolvency({})}>Add insolvency worksheet</button> : <fieldset><legend>Immediately before cancellation</legend>
        <div className="guided-form-grid">
          <TextFact label="Insolvency worksheet event date" type="date" value={data.insolvency.asOfDate ?? ''} onChange={asOfDate => insolvency({ asOfDate })} />
          <TextFact label="Insolvency worksheet reference" value={data.insolvency.sourceReference ?? ''} onChange={sourceReference => insolvency({ sourceReference })} />
          {([
            ['immediatelyBeforeDischargeConfirmed', 'Values are from immediately before cancellation'], ['allAssetsIncluded', 'All assets and their fair market values are included'],
            ['exemptAndRetirementAssetsIncluded', 'Protected assets and retirement accounts are included'], ['allLiabilitiesIncluded', 'All liabilities are included'],
          ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data.insolvency?.[key]} onChange={value => insolvency({ [key]: value })} />)}
        </div>
        {(['assets', 'liabilities'] as const).map(kind => {
          const single = kind === 'assets' ? 'Asset' : 'Liability', rows = data.insolvency?.[kind];
          return <fieldset key={kind}><legend>{kind === 'assets' ? 'Asset fair market values' : 'Liability balances'}</legend>
            {rows === undefined && <p role="status">The {kind} list is unknown.</p>}
            {rows?.length === 0 && <p>Explicitly recorded: no {kind}.</p>}
            {(rows ?? []).map((row, index) => {
              const prefix = `${single} ${index + 1}`;
              return <div className="guided-w2-card" key={index}><div className="guided-form-grid">
                {([['sourceId', 'source ID'], ['description', 'description'], ['sourceReference', 'record reference']] as const).map(([key, label]) =>
                  <TextFact key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => item(kind, index, { [key]: value })} />)}
                <CurrencyField label={`${prefix} amount`} value={row.amount ?? ''} onChange={amount => item(kind, index, { amount })} />
                {kind === 'liabilities' && <Choice label={`${prefix} canceled statement`} value={row.dischargedDebtStatementId} options={statements}
                  onChange={value => item(kind, index, { dischargedDebtStatementId: value || undefined })} />}
              </div><button type="button" className="utility-button" onClick={() => insolvency({ [kind]: rows?.filter((_, i) => i !== index) })}>Remove {single.toLowerCase()} {index + 1}</button></div>;
            })}
            <button type="button" className="utility-button" onClick={() => insolvency({ [kind]: [...(rows ?? []), {}] })}>Add {single.toLowerCase()}</button>
            <button type="button" className="utility-button" onClick={() => insolvency({ [kind]: [] })}>Record no {kind}</button>
          </fieldset>;
        })}
        <BooleanFact label="Insolvency worksheet checked after the last edit" value={data.insolvency.sourceFactsConfirmed} onChange={sourceFactsConfirmed => insolvency({ sourceFactsConfirmed })} />
        <button type="button" className="utility-button" onClick={() => change({ insolvency: undefined })}>Remove insolvency worksheet</button>
      </fieldset>}
      <CodAttributeDetails data={data.attributeSources} onChange={attributeSources => change({ attributeSources })} />
      <BooleanFact label="Canceled-debt packet checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove canceled-debt sources</button>
    </>}
  </div></details>;
}
