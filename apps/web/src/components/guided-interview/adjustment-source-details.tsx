"use client";

import type { AdjustmentData, FilingStatus } from "@/lib/guided-interview-flow";
import { alimonyRequirementFields, isDeductibleAlimony, adjustmentFactErrors } from "@/lib/guided-adjustment-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

const alimonyLabels = {
  paidInCash: "The payments were cash, checks or money orders",
  notDesignatedNondeductible: "The instrument does not designate these payments as non-alimony or nondeductible",
  notChildSupport: "These payments are not child support or a property settlement",
  noJointReturnWithRecipient: "You are not filing a joint return with this recipient",
  householdRequirementMet: "If legally separated under a decree, you and the recipient met the separate-household requirement when paid",
  noPaymentsAfterRecipientDeath: "No liability to pay cash or property continues after the recipient's death",
};

export function AdjustmentSourceDetails({ data, filingStatus, onChange }: { data: AdjustmentData; filingStatus?: FilingStatus | null; onChange: (data: AdjustmentData) => void }) {
  const ira = data.iraContributions;
  const alimony = data.alimonyQualification ?? { instrumentDate: "", post2018ModificationAppliesNewRules: null, paidInCash: null, notDesignatedNondeductible: null, notChildSupport: null, noJointReturnWithRecipient: null, householdRequirementMet: null, noPaymentsAfterRecipientDeath: null, recipientSsn: "" };
  const updateAlimony = (change: Partial<typeof alimony>) => onChange({ ...data, alimonyQualification: { ...alimony, ...change } });
  const married = filingStatus === "mfj" || filingStatus === "mfs";
  return <>
    <h4>Traditional IRA contributions</h4>
    {data.iraDeduction.trim() && <p className="guided-hint">Saved IRA deduction estimate: {data.iraDeduction}. Enter actual contributions and coverage below; the engine calculates the deduction.</p>}
    {!ira ? <button type="button" className="utility-button" onClick={() => onChange({ ...data, iraContributions: { primaryContributions: "", primaryIsActiveParticipant: null, spouseContributions: "", spouseIsActiveParticipant: null } })}>Add IRA contribution facts</button> : <div className="guided-form-grid">
      <CurrencyField label="Taxpayer traditional IRA contributions for this tax year" value={ira.primaryContributions} onChange={(primaryContributions) => onChange({ ...data, iraContributions: { ...ira, primaryContributions } })} required />
      <BooleanFact label="Taxpayer covered by an employer retirement plan at any time during this tax year" value={ira.primaryIsActiveParticipant} onChange={(primaryIsActiveParticipant) => onChange({ ...data, iraContributions: { ...ira, primaryIsActiveParticipant } })} />
      {married && <BooleanFact label="Spouse covered by an employer retirement plan at any time during this tax year" value={ira.spouseIsActiveParticipant} onChange={(spouseIsActiveParticipant) => onChange({ ...data, iraContributions: { ...ira, spouseIsActiveParticipant } })} />}
      {filingStatus === "mfj" && <CurrencyField label="Spouse traditional IRA contributions for this tax year" value={ira.spouseContributions} onChange={(spouseContributions) => onChange({ ...data, iraContributions: { ...ira, spouseContributions } })} required />}
      <button type="button" className="utility-button" onClick={() => onChange({ ...data, iraContributions: undefined, iraDeduction: "" })}>Remove IRA contribution facts</button>
    </div>}
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
