"use client";

import type { AdjustmentData, FilingStatus } from "@/lib/guided-interview-flow";
import { alimonyRequirementFields, isDeductibleAlimony, adjustmentFactErrors } from "@/lib/guided-adjustment-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";
import { IraSourceDetails } from "./ira-source-details";

const alimonyLabels = {
  paidInCash: "The payments were cash, checks or money orders",
  notDesignatedNondeductible: "The instrument does not designate these payments as non-alimony or nondeductible",
  notChildSupport: "These payments are not child support or a property settlement",
  noJointReturnWithRecipient: "You are not filing a joint return with this recipient",
  householdRequirementMet: "If legally separated under a decree, you and the recipient met the separate-household requirement when paid",
  noPaymentsAfterRecipientDeath: "No liability to pay cash or property continues after the recipient's death",
};

export function AdjustmentSourceDetails({ data, filingStatus, onChange }: { data: AdjustmentData; filingStatus?: FilingStatus | null; onChange: (data: AdjustmentData) => void }) {
  const alimony = data.alimonyQualification ?? { instrumentDate: "", post2018ModificationAppliesNewRules: null, paidInCash: null, notDesignatedNondeductible: null, notChildSupport: null, noJointReturnWithRecipient: null, householdRequirementMet: null, noPaymentsAfterRecipientDeath: null, recipientSsn: "" };
  const updateAlimony = (change: Partial<typeof alimony>) => onChange({ ...data, alimonyQualification: { ...alimony, ...change } });
  return <>
    <IraSourceDetails data={data} filingStatus={filingStatus} onChange={onChange} />
    <h4>Alimony payments</h4>
    <CurrencyField label="Alimony paid" hint="Enter actual payments. Eligibility depends on the instrument and payment facts below." value={data.alimonyPaid} onChange={(alimonyPaid) => onChange({ ...data, alimonyPaid })} />
    {data.alimonyPaid.trim() && <div className="guided-form-grid">
      <TextFact label="Original divorce or separation instrument date" type="date" value={alimony.instrumentDate} onChange={(instrumentDate) => updateAlimony({ instrumentDate })} />
      <BooleanFact label="A modification after 2018 expressly applied the new nondeductible alimony rules" value={alimony.post2018ModificationAppliesNewRules} onChange={(post2018ModificationAppliesNewRules) => updateAlimony({ post2018ModificationAppliesNewRules })} />
      {alimonyRequirementFields.map((field) => <BooleanFact key={field} label={alimonyLabels[field]} value={alimony[field]} onChange={(value) => updateAlimony({ [field]: value })} />)}
      <TextFact label="Alimony recipient SSN or ITIN" value={alimony.recipientSsn} onChange={(recipientSsn) => updateAlimony({ recipientSsn })} />
      {Object.keys(adjustmentFactErrors({ ...data, iraDeduction: "", iraContributions: undefined })).length === 0 && !isDeductibleAlimony(data) && <p className="guided-hint">These facts do not qualify for an alimony deduction. The payment stays in your saved facts and the deductible amount is zero.</p>}
    </div>}
  </>;
}
