"use client";

import type { MortgageEntryData } from '@/lib/guided-interview-flow';
import type { MortgageDebtCategoryData } from '@/lib/guided-mortgage-debt-categories';
import { parseGuidedDisplayAmount } from '@/lib/guided-currency';
import { CurrencyField } from './currency-field';

function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value === '' ? null : event.target.value === 'true')}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
export function MortgageDebtCategoryFields({ entry, onChange }: { entry: MortgageEntryData; onChange: (change: Partial<MortgageEntryData>) => void }) {
  const data = entry.balanceCategories;
  const update = (change: Partial<MortgageDebtCategoryData>) => onChange({ balanceCategories: { ...data, ...change } });
  return <fieldset className="guided-fieldset" style={{ gridColumn: '1 / -1' }}><legend>Completed debt-category worksheet</legend>
    <p className="guided-hint">Use the completed Publication 936 worksheet and original borrowing, refinancing and payment records. These are separate average debt categories for this loan. Box 2 and the latest refinancing date cannot establish them. Keep the interest for excluded uses in the actual ineligible-interest or other-schedule field below.</p>
    <label className="guided-field"><span className="guided-field-label">Completed debt-category worksheet tax year</span><input className="guided-input" value={data?.sourceTaxYear ?? ''} onChange={event => update({ sourceTaxYear: event.target.value })} /></label>
    <label className="guided-field"><span className="guided-field-label">Completed debt-category worksheet reference</span><input className="guided-input" value={data?.worksheetReference ?? ''} onChange={event => update({ worksheetReference: event.target.value })} /></label>
    {([
      ['grandfatheredDebt', 'Average grandfathered debt from the completed worksheet'],
      ['acquisitionDebtBefore2017', 'Average acquisition debt incurred before December 16, 2017'],
      ['acquisitionDebtAfter2017', 'Average acquisition debt incurred after December 15, 2017'],
      ['excludedDebt', 'Average nonqualifying debt from the completed worksheet'],
    ] as const).map(([key, label]) => <CurrencyField key={key} label={label} value={data?.[key] ?? ''} onChange={value => update({ [key]: value })} required hint="Copy the actual completed average for this category. Enter 0 only when established by the source worksheet." />)}
    <Fact label="Original proceeds, debt dates and all category averages have been checked" value={data?.classificationConfirmed} onChange={classificationConfirmed => update({ classificationConfirmed })} />
    <Fact label="Principal payments follow the required nonacquisition, grandfathered and acquisition order" value={data?.paymentsAppliedInRequiredOrderConfirmed} onChange={paymentsAppliedInRequiredOrderConfirmed => update({ paymentsAppliedInRequiredOrderConfirmed })} />
    <Fact label="Interest for excluded uses is included in the separate ineligible or other-schedule amounts" value={data?.interestAllocationConfirmed} onChange={interestAllocationConfirmed => update({ interestAllocationConfirmed })} />
    {(entry.loanType === 'refinance' || entry.loanType === 'heloc' || data?.refinancingHistoryConfirmed != null) && <>
      <p className="guided-hint">Acquisition status carried into a refinance is limited to the original principal immediately before refinancing. Additional borrowing needs its actual use classification. Grandfathered status also depends on the remaining original term or the applicable balloon exception.</p>
      <Fact label="Original balances, use and refinancing term limits have been checked" value={data?.refinancingHistoryConfirmed} onChange={refinancingHistoryConfirmed => update({ refinancingHistoryConfirmed })} />
    </>}
    {(parseGuidedDisplayAmount(data?.grandfatheredDebt).gt(0) || data?.grandfatheredStatusConfirmed != null) && <Fact label="Grandfathered continuous security and any remaining-term or balloon history are established" value={data?.grandfatheredStatusConfirmed} onChange={grandfatheredStatusConfirmed => update({ grandfatheredStatusConfirmed })} />}
  </fieldset>;
}
