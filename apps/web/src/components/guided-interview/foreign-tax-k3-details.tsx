"use client";

import type { GuidedForeignTaxK3StatementData } from '@/lib/guided-foreign-tax-k3';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function ForeignTaxK3Details({ data, ordinary = false, onChange }: { data?: GuidedForeignTaxK3StatementData[]; ordinary?: boolean; onChange: (data: GuidedForeignTaxK3StatementData[]) => void }) {
  const change = (index: number, patch: Partial<GuidedForeignTaxK3StatementData>) => onChange((data ?? []).map((row, offset) => offset === index ? { ...row, ...patch, sourceFactsConfirmed: null } : row));
  return <fieldset className="guided-fieldset"><legend>Original partnership K-1 and qualified K-3</legend>
    <p className="guided-hint">Use both original statements for a continuing domestic partnership with only portfolio interest and dividends. Record the actual passive foreign income, country and tax from Schedule K-3. A bare partnership K-1 is insufficient. This worksheet does not cover business income, losses, distributions, suspended amounts or other K-1 source packets. <a href="https://www.irs.gov/instructions/i1116" target="_blank" rel="noreferrer">IRS election requirements</a>.</p>
    {(data ?? []).map((row, index) => <fieldset className="guided-fieldset" key={index}><legend>Qualified K-3 original {index + 1}</legend>
      <TextFact label={`K3 ${index + 1} original tax year`} value={row.sourceTaxYear ?? ''} onChange={sourceTaxYear => change(index, { sourceTaxYear })} />
      <label className="guided-field"><span className="guided-field-label">K3 {index + 1} entity type</span><select className="guided-input" value={row.entityType ?? ''} onChange={event => change(index, { entityType: (event.target.value || undefined) as typeof row.entityType })}><option value="">Not answered</option><option value="partnership">Partnership</option><option value="s_corporation">S corporation requiring another source method</option></select></label>
      <TextFact label={`K3 ${index + 1} partnership name`} value={row.partnershipName ?? ''} onChange={partnershipName => change(index, { partnershipName })} />
      <TextFact label={`K3 ${index + 1} partnership EIN`} value={row.partnershipEIN ?? ''} onChange={partnershipEIN => change(index, { partnershipEIN })} />
      <label className="guided-field"><span className="guided-field-label">K3 {index + 1} return owner</span><select className="guided-input" value={row.accountHolder ?? ''} onChange={event => change(index, { accountHolder: (event.target.value || undefined) as typeof row.accountHolder })}><option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option></select></label>
      <TextFact label={`K3 ${index + 1} original recipient name`} value={row.recipientName ?? ''} onChange={recipientName => change(index, { recipientName })} />
      <TextFact label={`K3 ${index + 1} recipient taxpayer identifier last four digits`} value={row.recipientTaxpayerIdLast4 ?? ''} onChange={recipientTaxpayerIdLast4 => change(index, { recipientTaxpayerIdLast4 })} />
      <TextFact label={`K3 ${index + 1} original K1 reference`} value={row.originalK1Reference ?? ''} onChange={originalK1Reference => change(index, { originalK1Reference })} />
      <label className="guided-field"><span className="guided-field-label">K3 {index + 1} actual qualified statement</span><select className="guided-input" value={row.qualifiedStatementKind ?? ''} onChange={event => change(index, { qualifiedStatementKind: (event.target.value || undefined) as typeof row.qualifiedStatementKind })}><option value="">Not answered</option><option value="schedule_k3_1065">Schedule K-3 (Form 1065) received</option><option value="bare_k1">Only a partnership K-1 received</option></select></label>
      <TextFact label={`K3 ${index + 1} qualified K3 and country detail reference`} value={row.qualifiedK3Reference ?? ''} onChange={qualifiedK3Reference => change(index, { qualifiedK3Reference })} />
      <TextFact label={`K3 ${index + 1} actual foreign country`} value={row.foreignCountry ?? ''} onChange={foreignCountry => change(index, { foreignCountry })} />
      <label className="guided-field"><span className="guided-field-label">K3 {index + 1} actual foreign income category</span><select className="guided-input" value={row.foreignTaxCategory ?? ''} onChange={event => change(index, { foreignTaxCategory: (event.target.value || undefined) as typeof row.foreignTaxCategory })}><option value="">Not answered</option><option value="passive">Passive category</option><option value="general">General category requiring another method</option></select></label>
      {([['interestIncome', 'original interest'], ['ordinaryDividends', 'original ordinary dividends'], ['qualifiedDividends', 'original qualified-dividend subset'], ['foreignSourceIncome', 'actual foreign gross income'], ['foreignTaxPaid', 'actual foreign tax'], ['beginningBasis', 'opening outside basis']] as const).map(([key, label]) => <CurrencyField key={key} label={`K3 ${index + 1} ${label}`} value={row[key] ?? ''} onChange={value => change(index, { [key]: value })} />)}
      {ordinary && <fieldset className="guided-fieldset"><legend>K3 {index + 1} ordinary Form1116 originals</legend>
        <p className="guided-hint">This finite2025 single primary-owner method requires one calendar-year domestic partnership with only wholly foreign passive interest. Enter the actual allocated deductions and adjustments, including known zero. Use PartII income/deductions and PartIII section4 line1 creditable paid taxes, not PartII line45 taxes. Accrued taxes, FX calculation, fiscal-year timing and other source methods remain unresolved. Entity-paid details are not personal payment dates.</p>
        {([['foreignDeductions','allocated foreign deductions'],['foreignInterestExpense','allocated foreign interest expense'],['otherExpenses','allocated other expenses'],['taxReduction','tax reductions'],['redeterminationAmount','redetermination amount']] as const).map(([key,label]) => <CurrencyField key={key} label={`K3 ${index + 1} ${label}`} value={row[key] ?? ''} onChange={value => change(index,{[key]:value})} />)}
        <BooleanFact label={`K3 ${index + 1} is an actual calendar-year partnership`} value={row.calendarYearPartnershipConfirmed} onChange={calendarYearPartnershipConfirmed => change(index,{calendarYearPartnershipConfirmed})} />
        <BooleanFact label={`K3 ${index + 1} original entity-paid taxes are reported in USD`} value={row.usdReportedPaidTaxesConfirmed} onChange={usdReportedPaidTaxesConfirmed => change(index,{usdReportedPaidTaxesConfirmed})} />
        <TextFact label={`K3 ${index + 1} USD paid-tax original reference`} value={row.usdPaidTaxSourceReference ?? ''} onChange={usdPaidTaxSourceReference => change(index,{usdPaidTaxSourceReference})} />
        {(row.entityPaidTaxPayments ?? []).map((payment,offset) => <div className="guided-field-row" key={offset}>
          <TextFact label={`K3 ${index + 1} entity-paid detail ${offset + 1} date`} value={payment.date ?? ''} onChange={date => change(index,{entityPaidTaxPayments:row.entityPaidTaxPayments?.map((item,i)=>i===offset?{...item,date}:item)})} />
          <CurrencyField label={`K3 ${index + 1} entity-paid detail ${offset + 1} USD amount`} value={payment.amountUsd ?? ''} onChange={amountUsd => change(index,{entityPaidTaxPayments:row.entityPaidTaxPayments?.map((item,i)=>i===offset?{...item,amountUsd}:item)})} />
          <button type="button" className="utility-button" onClick={()=>change(index,{entityPaidTaxPayments:row.entityPaidTaxPayments?.filter((_,i)=>i!==offset)})}>Remove K3 {index + 1} entity-paid detail {offset + 1}</button>
        </div>)}
        <button type="button" className="utility-button" onClick={()=>change(index,{entityPaidTaxPayments:[...(row.entityPaidTaxPayments ?? []),{}]})}>Add K3 {index + 1} entity-paid tax detail</button>
      </fieldset>}
      <p className="guided-hint">Qualified dividends are included in ordinary dividends. For this worksheet, all original interest and dividends must be the foreign portfolio income reported on the K-3. Enter zero only when the original record establishes zero.</p>
      <TextFact label={`K3 ${index + 1} opening outside basis reference`} value={row.beginningBasisSourceReference ?? ''} onChange={beginningBasisSourceReference => change(index, { beginningBasisSourceReference })} />
      {([
        ['domesticContinuingNonPtpConfirmed', 'is an actual continuing domestic non-PTP partnership'],
        ['portfolioIncomeOnlyConfirmed', 'has only portfolio interest and dividends outside the ordinary course of business, all foreign and passive category'],
        ['allOtherK1AmountsZeroConfirmed', 'has known zero other boxes, including business, rental, capital gains or losses, self-employment, QBI, deductions, distributions, withholding, credits and AMT items'],
        ['noOtherBasisChangesConfirmed', 'has no other basis changes, including contributions or liability changes'],
        ['priorBasisSuspensionsZeroConfirmed', 'has no prior basis-suspended amounts, including foreign tax'],
        ['priorAtRiskSuspensionsZeroConfirmed', 'has no prior at-risk-suspended amounts'],
        ['priorPassiveSuspensionsZeroConfirmed', 'has no prior passive-suspended amounts'],
      ] as const).map(([key, label]) => <BooleanFact key={key} label={`K3 ${index + 1} ${label}`} value={row[key]} onChange={value => change(index, { [key]: value })} />)}
      <BooleanFact label={`K3 ${index + 1} original facts checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange((data ?? []).map((item, offset) => offset === index ? { ...item, sourceFactsConfirmed } : item))} />
      <button type="button" className="utility-button" onClick={() => onChange((data ?? []).filter((_, offset) => offset !== index))}>Remove qualified K3 original {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => onChange([...(data ?? []), {}])}>Add original partnership K1 and K3</button>
  </fieldset>;
}
