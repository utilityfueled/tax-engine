"use client";

import { useId } from "react";
import {
  emptySchedule1AData, emptyEmployeeTipDeduction, emptyBusinessTipDeduction,
  emptyOvertimeDeduction, emptyVehicleInterest, emptyVehicleInterestStatement, emptyVehicleInterestRefund, invalidateVehicleRefundPaymentEvidence,
  invalidateEditedVehicleRefundProof, vehicleRefundLoanIdentityChanged,
  type Schedule1AData, type EmployeeTipDeductionData, type VehicleInterestStatementData, type VehicleInterestRefundData, type GuidedCardTipProof,
} from "@/lib/guided-schedule-1-a-facts";
import { cardTipStatementId, type GuidedCardTipSource } from "@/lib/guided-card-tip-source";
import { parseGuidedDisplayAmount } from "@/lib/guided-currency";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
import { VehicleRefinancingDetails } from "./vehicle-refinancing-details";

type Source = { sourceId: string; kind: "w2" | "nec" | "form8919Nec"; accountHolder?: string; name: string };
type ChoiceEntry = readonly [string, string];
function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly ChoiceEntry[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{value && !choices.some(([id]) => id === value) && <option value={value}>Saved source needs reconciliation</option>}{choices.map(([id, text]) => <option value={id} key={id}>{text}</option>)}</select></label>;
}
const owners: ChoiceEntry[] = [["primary", "You"], ["spouse", "Spouse on joint return"]];
const statementPayers: ChoiceEntry[] = [...owners, ["other", "Someone else"]];
const emptyCardTipProof: GuidedCardTipProof = {
  receiptLedgerReference: "", solePaymentCohortConfirmed: null, scheduleCBusinessReceiptsConfirmed: null, qualifiedTipsReconciledConfirmed: null,
};

function VehicleInterestRefundDetails({ prefix, data, onChange }: {
  prefix: string;
  data: VehicleInterestRefundData;
  onChange: (data: VehicleInterestRefundData, confirmationOnly: boolean) => void;
}) {
  const update = (patch: Partial<VehicleInterestRefundData>) => {
    const confirmationOnly = "sourceFactsConfirmed" in patch;
    const next = { ...data, sourceFactsConfirmed: null, ...patch };
    onChange(invalidateEditedVehicleRefundProof(data, next), confirmationOnly);
  };
  const credit = data.method === "loan_credit";
  return <fieldset>
    <legend>Box 5 refund details</legend>
    <Choice label={`${prefix} refund method`} value={data.method} choices={[["cash_refund", "Cash paid to the borrower"], ["loan_credit", "Credit applied to loan interest"], ["mixed", "Cash and loan credit"]]} onChange={method => update({ method: method as VehicleInterestRefundData["method"] })} />
    {(data.method === "cash_refund" || credit) ? <>
      <p className="guided-hint">Use your 2025 lender statement or account portal and the filed 2025 federal return with any amendments. Use source references that omit full account and taxpayer ID numbers. Report any separate interest on the recovery with your interest income.</p>
      {credit
        ? <p className="guided-hint">Use the lender's 2026 record showing that the borrower's own recovered funds paid accrued 2026 interest on this same loan. A credit entered only in the account ledger, held for future interest, or applied to principal requires separate review. Include the credit once in Interest paid and confirm zero direct payments and reimbursements by others.</p>
        : <p className="guided-hint">Use the 2026 cash receipt. Check that the borrower paid the recovered interest from their own funds without reimbursement and received the refund.</p>}
      <div className="guided-form-grid">
        {([
          ["originTaxYear", "original tax year of recovered interest"],
          ["priorPaymentSourceReference", "prior payment source reference"],
          ["filedReturnSourceReference", "filed return source reference"],
        ] as const).map(([field, name]) => <TextFact key={field} label={`${prefix} ${name}`} value={data[field]} onChange={value => update({ [field]: value })} />)}
        {credit ? <>
          <TextFact label={`${prefix} credit application tax year`} value={data.creditAppliedTaxYear ?? ""} onChange={creditAppliedTaxYear => update({ creditAppliedTaxYear })} />
          <TextFact label={`${prefix} loan credit source reference`} value={data.creditSourceReference ?? ""} onChange={creditSourceReference => update({ creditSourceReference })} />
          <CurrencyField label={`${prefix} cash received alongside the loan credit`} hint="Enter 0 after verifying there was no cash refund of the recovered interest." value={data.creditCashRefundReceived ?? ""} onChange={creditCashRefundReceived => update({ creditCashRefundReceived })} />
          <CurrencyField label={`${prefix} credit applied to 2026 interest on the same loan`} value={data.currentYearInterestCreditApplied ?? ""} onChange={currentYearInterestCreditApplied => update({ currentYearInterestCreditApplied })} />
          <CurrencyField label={`${prefix} borrower 2026 interest excluding the credit`} value={data.borrowerInterestExcludingCredit ?? ""} onChange={borrowerInterestExcludingCredit => update({ borrowerInterestExcludingCredit })} />
          <BooleanFact label={`${prefix} credit satisfied accrued 2026 interest and is included once in Box 1`} value={data.currentYearInterestCreditIncludedInBox1Confirmed} onChange={currentYearInterestCreditIncludedInBox1Confirmed => update({ currentYearInterestCreditIncludedInBox1Confirmed })} />
        </> : <>
          <TextFact label={`${prefix} cash receipt tax year`} value={data.receiptTaxYear} onChange={receiptTaxYear => update({ receiptTaxYear })} />
          <TextFact label={`${prefix} cash refund source reference`} value={data.refundSourceReference} onChange={refundSourceReference => update({ refundSourceReference })} />
          <CurrencyField label={`${prefix} cash refund received`} hint="Enter only the refund of prior interest." value={data.cashRefundReceived} onChange={cashRefundReceived => update({ cashRefundReceived })} />
        </>}
        <Choice label={`${prefix} amended 2025 returns`} value={data.amendedReturnStatus} choices={[["none", "No amendment filed"], ["reviewed", "All filed amendments reviewed"], ["unreviewed", "Amendment history incomplete"]]} onChange={amendedReturnStatus => update({ amendedReturnStatus: amendedReturnStatus as VehicleInterestRefundData["amendedReturnStatus"] })} />
        {([
          ["schedule1ADeductedInterest", "prior Schedule 1-A deduction"],
          ["businessDeductedInterest", "prior business deduction (Schedules C, E and F)"],
          ["otherDeductedInterest", "other prior deduction or carryforward"],
        ] as const).map(([field, name]) => <CurrencyField key={field} label={`${prefix} ${name}`} hint="Enter the amount of this recovered interest deducted or carried forward, or 0 after verifying none." value={data[field]} onChange={value => update({ [field]: value })} />)}
        <BooleanFact label={`${prefix} loan and payment records match`} value={data.loanSourcesMatchConfirmed} onChange={loanSourcesMatchConfirmed => update({ loanSourcesMatchConfirmed })} />
        <BooleanFact label={`${prefix} ${credit ? "borrower paid and bore the 2025 interest and received the same-loan credit" : "borrower paid the recovered interest and received the refund"}`} value={data.borrowerBoreRecoveredPaymentConfirmed} onChange={borrowerBoreRecoveredPaymentConfirmed => update({ borrowerBoreRecoveredPaymentConfirmed })} />
        <BooleanFact label={`${prefix} filed return history is complete`} value={data.filedReturnHistoryCompleteConfirmed} onChange={filedReturnHistoryCompleteConfirmed => update({ filedReturnHistoryCompleteConfirmed })} />
      </div>
      <BooleanFact label={`${prefix} checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    </> : data.method && <p className="guided-hint">Mixed cash and loan credit requires separate review.</p>}
  </fieldset>;
}

function VehicleInterestStatementDetails({ label, data, onChange, onRemove }: {
  label: string;
  data: VehicleInterestStatementData;
  onChange: (patch: Partial<VehicleInterestStatementData>, confirmationOnly?: boolean) => void;
  onRemove: () => void;
}) {
  const confirmationHint = useId();
  const prefix = `${label}: Form 1098-VLI`;
  const positiveBox5 = parseGuidedDisplayAmount(data.priorYearInterestRefund).gt(0);
  return <fieldset>
    <legend>Form 1098-VLI Copy B</legend>
    <p className="guided-hint">Use Copy B from the original lender when there is no lender acquisition date or refinancing. Use a masked account reference or a nickname you can verify against both records. Leave full account and taxpayer ID numbers out of this worksheet.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix} calendar year`} value={data.sourceTaxYear} onChange={sourceTaxYear => onChange({ sourceTaxYear })} />
      <TextFact label={`${prefix} source reference`} value={data.sourceReference} onChange={sourceReference => onChange({ sourceReference })} />
      <Choice label={`${prefix} payer of record`} value={data.payer} choices={statementPayers} onChange={payer => onChange({ payer: payer as VehicleInterestStatementData["payer"] })} />
      <BooleanFact label={`${prefix} is the current copy with CORRECTED unchecked`} value={data.currentUncorrected} onChange={currentUncorrected => onChange({ currentUncorrected })} />
      <BooleanFact label={`${prefix} Box 3b is blank`} value={data.lenderAcquisitionDateBlank} onChange={lenderAcquisitionDateBlank => onChange({ lenderAcquisitionDateBlank })} />
      {(data.lenderAcquisitionDateBlank === false || data.lenderAcquisitionDate) && <TextFact label={`${prefix} Box 3b lender acquisition date`} type="date" value={data.lenderAcquisitionDate} onChange={lenderAcquisitionDate => onChange({ lenderAcquisitionDate })} />}
      <CurrencyField label={`${prefix} Box 1 interest`} value={data.reportedInterest} onChange={reportedInterest => onChange({ reportedInterest })} />
      <CurrencyField label={`${prefix} direct interest payments by others`} hint="Enter the portion of Box 1 others paid directly to the lender, or 0 if none." value={data.directThirdPartyInterest} onChange={directThirdPartyInterest => onChange({ directThirdPartyInterest })} />
      <CurrencyField label={`${prefix} borrower-paid interest reimbursed by others`} hint="Enter the portion of Box 1 that the borrower paid and someone else reimbursed, or 0 if none. Exclude direct payments and refunds the lender already subtracted from Box 1." value={data.reimbursedBorrowerInterest} onChange={reimbursedBorrowerInterest => onChange({ reimbursedBorrowerInterest })} />
      <CurrencyField label={`${prefix} Box 5 refund or credit`} hint="Enter 0 only after checking that there was no refund or credit of prior-year interest." value={data.priorYearInterestRefund} onChange={priorYearInterestRefund => onChange({ priorYearInterestRefund })} />
      <BooleanFact label={`${prefix} Box 6 original use is checked`} value={data.originalUseChecked} onChange={originalUseChecked => onChange({ originalUseChecked })} />
      <BooleanFact label={`${prefix} Box 7 U.S. final assembly is checked`} value={data.usAssemblyChecked} onChange={usAssemblyChecked => onChange({ usAssemblyChecked })} />
    </div>
    {positiveBox5 && <VehicleInterestRefundDetails prefix={`${prefix} Box 5`} data={data.priorYearRefundProof ?? emptyVehicleInterestRefund} onChange={(priorYearRefundProof, confirmationOnly) => onChange({ priorYearRefundProof }, confirmationOnly)} />}
    {!positiveBox5 && data.priorYearRefundProof && <p className="guided-hint">Saved refund details are available when Box 5 is positive. <button type="button" onClick={() => onChange({ priorYearRefundProof: undefined })}>{label}: Remove saved Box 5 details</button></p>}
    <p className="guided-hint" id={confirmationHint}>Confirm that the payer, lender, masked account reference, Box 2d VIN and Box 3a origination date match your loan and payment records. Enter the interest the borrower actually paid this year after reimbursements in Interest paid. Only include the business share of that same Box 1 interest in Interest already deducted elsewhere. Box 1 excludes interest on nonqualifying debt.</p>
    <BooleanFact label={`${prefix} checked after the last edit`} value={data.sourceFactsConfirmed} describedBy={confirmationHint} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
    <button type="button" onClick={onRemove}>{label}: Remove Form 1098-VLI</button>
  </fieldset>;
}

type Qualification = Pick<EmployeeTipDeductionData, "owner" | "occupationCode" | "eligibleOccupation" | "voluntaryCashTips" | "lawfulActivity" | "meetsSstbRuleOrTransition">;
function TipQualification({ label, data, onChange }: { label: string; data: Qualification; onChange: (patch: Partial<Qualification>) => void }) {
  return <>
    <Choice label={`${label}: Owner`} value={data.owner} choices={owners} onChange={owner => onChange({ owner: owner as Qualification["owner"] })} />
    <TextFact label={`${label}: Occupation code`} value={data.occupationCode} onChange={occupationCode => onChange({ occupationCode })} />
    {([["eligibleOccupation", "Listed tipped occupation"], ["voluntaryCashTips", "Voluntary cash or charge tips"], ["lawfulActivity", "Lawful activity"], ["meetsSstbRuleOrTransition", "Service-business rule or current-year transition met"]] as const).map(([field, text]) => <BooleanFact key={field} label={`${label}: ${text}`} value={data[field]} onChange={value => onChange({ [field]: value })} />)}
  </>;
}
export function Schedule1ASourceDetails({ data, compensationSources = [], businessOwner, businessName, cardTipSource, onChange }: {
  data?: Schedule1AData; compensationSources?: Source[]; businessOwner?: string; businessName?: string;
  cardTipSource?: GuidedCardTipSource;
  onChange: (data: Schedule1AData | undefined) => void;
}) {
  if (!data) return <section><h4>Additional deduction sources</h4><p className="guided-hint">Collect actual qualified tip, FLSA overtime premium, vehicle loan interest or senior eligibility records. A source amount alone does not establish a deduction.</p><button type="button" onClick={() => onChange({ ...emptySchedule1AData, employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [] })}>Add additional deduction worksheet</button></section>;
  const set = (patch: Partial<Schedule1AData>) => onChange({ ...data, ...patch, sourceFactsConfirmed: patch.sourceFactsConfirmed ?? null });
  const sources = (owner: string, kind?: Source["kind"]) => compensationSources.filter(source => source.accountHolder === owner && (!kind || source.kind === kind)).map(source => [source.sourceId, `${source.name || "Unnamed source"} — ${source.kind === "form8919Nec" ? "Form 8919 wages from 1099-NEC" : source.sourceId}`] as const);
  return <section><h4>Additional deduction sources</h4><p className="guided-hint">Use original records for the selected tax year. Confirm identity and senior birth/death facts in About You. Keep source amounts separate from the deduction after eligibility, business income limits and phaseouts.</p>
    <div className="guided-form-grid">
      <TextFact label="Additional deductions: Source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => set({ sourceTaxYear })} />
      <TextFact label="Additional deductions: Source reference" value={data.sourceReference} onChange={sourceReference => set({ sourceReference })} />
      <CurrencyField label="Additional deductions: Excluded Puerto Rico income" value={data.excludedPuertoRicoIncome} onChange={excludedPuertoRicoIncome => set({ excludedPuertoRicoIncome })} />
      <CurrencyField label="Additional deductions: Form 4563 exclusion" value={data.form4563Exclusion} onChange={form4563Exclusion => set({ form4563Exclusion })} />
    </div>
    <p className="guided-hint">Qualified tips are voluntary customer-determined cash or charge tips in a listed occupation. Mandatory service charges are not qualified tips. Use the actual Treasury occupation code and check the applicable service-business rule or transition.</p>
    {data.employeeTips.map((entry, index) => {
      const label = `Employee tips ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ employeeTips: data.employeeTips.map((row, position) => position === index ? { ...row, ...patch } : row) });
      return <fieldset key={index}><legend>{label}</legend><div className="guided-form-grid">
        <TipQualification label={label} data={entry} onChange={update} />
        <TextFact label={`${label}: Employer`} value={entry.employer} onChange={employer => update({ employer })} />
        <Choice label={`${label}: Reporting method`} value={entry.reportingMethod} choices={[["w2", "Original W-2 report"], ["employer_statement", "2025 employer statement"], ["form4070", "2025 monthly Form 4070 reports"], ["form4137", "Direct Form 4137 report"]]} onChange={value => update({ reportingMethod: value as typeof entry.reportingMethod })} />
        <TextFact label={`${label}: Reporting reference`} value={entry.reportingSourceReference} onChange={reportingSourceReference => update({ reportingSourceReference })} />
        {["form4070", "employer_statement"].includes(entry.reportingMethod) && <CurrencyField label={`${label}: Employer-reported total on statement`} hint="Original annual total from actual records; wages after payroll exclusions are not a substitute." value={entry.reportedEmployerTips} onChange={reportedEmployerTips => update({ reportedEmployerTips })} />}
        <CurrencyField label={`${label}: Qualified employer-reported tips`} value={entry.qualifiedW2Tips} onChange={qualifiedW2Tips => update({ qualifiedW2Tips })} />
        <TextFact label={`${label}: Form 4137 employer source label`} value={entry.form4137EmployerSourceId} onChange={form4137EmployerSourceId => update({ form4137EmployerSourceId })} />
        <CurrencyField label={`${label}: Qualified total Form 4137 column 1(c)`} hint="Use this employer's qualified total tips, not just unreported tips on line4. If no Form4137 amount applies, confirm an actual zero." value={entry.qualifiedForm4137Tips} onChange={qualifiedForm4137Tips => update({ qualifiedForm4137Tips })} />
      </div>
      {entry.w2SourceIds.map((id, position) => <div key={position}><Choice label={`${label}: W-2 source ${position + 1}`} value={id} choices={sources(entry.owner, "w2")} onChange={value => update({ w2SourceIds: entry.w2SourceIds.map((source, offset) => offset === position ? value : source) })} /><button type="button" onClick={() => update({ w2SourceIds: entry.w2SourceIds.filter((_, offset) => offset !== position) })}>{label}: Remove W-2 source {position + 1}</button></div>)}
      <button type="button" onClick={() => update({ w2SourceIds: [...entry.w2SourceIds, ""] })}>{label}: Add W-2 source</button>
      <button type="button" onClick={() => set({ employeeTips: data.employeeTips.filter((_, position) => position !== index) })}>{label}: Remove employee tips</button></fieldset>;
    })}
    <button type="button" onClick={() => set({ employeeTips: [...data.employeeTips, { ...emptyEmployeeTipDeduction, w2SourceIds: [] }] })}>Add employee tip deduction</button>
    {data.businessTips.map((entry, index) => {
      const label = `Business tips ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ businessTips: data.businessTips.map((row, position) => position === index ? { ...row, ...patch } : row) });
      const choices: ChoiceEntry[] = sources(entry.owner, "nec");
      if (cardTipSource?.sourceTaxYear.trim() === "2026" && cardTipSource.owner && cardTipSource.owner === entry.owner) {
        choices.push([cardTipStatementId, `Form 1099-K — ${cardTipSource.pse || "payment settlement entity"}`]);
      }
      const hasCardTip = entry.reportedTipSources.some(row => row.sourceId === cardTipStatementId);
      const updateReports = (reportedTipSources: typeof entry.reportedTipSources) => update({
        reportedTipSources,
        form1099KProof: reportedTipSources.some(row => row.sourceId === cardTipStatementId) && entry.form1099KProof
          ? { ...entry.form1099KProof, qualifiedTipsReconciledConfirmed: null } : undefined,
      });
      const proof = entry.form1099KProof ?? emptyCardTipProof;
      const updateProof = (patch: Partial<GuidedCardTipProof>) => update({ form1099KProof: { ...proof, ...patch } });
      return <fieldset key={index}><legend>{label}</legend><p className="guided-hint">{cardTipSource || hasCardTip ? "Link tips already included in this business's actual 1099-NEC receipts or its one reconciled Form 1099-K." : "Link tips already included in this business's actual NEC receipts."} Business profit and attributable deductions come from the completed return. Other information-return receipt arrangements require their reconciliation worksheet.</p><div className="guided-form-grid"><TipQualification label={label} data={entry} onChange={update} /><Choice label={`${label}: Business`} value={entry.businessSourceId} choices={businessOwner === entry.owner ? [["scheduleC", businessName || "Your Schedule C business"]] : []} onChange={businessSourceId => update({ businessSourceId })} /></div>
        {entry.reportedTipSources.map((source, position) => <div key={position} className="guided-form-grid"><Choice label={`${label}: Reported source ${position + 1}`} value={source.sourceId} choices={choices} onChange={sourceId => updateReports(entry.reportedTipSources.map((row, offset) => offset === position ? { ...row, sourceId } : row))} /><CurrencyField label={`${label}: Qualified tips in source ${position + 1}`} value={source.qualifiedTips} onChange={qualifiedTips => updateReports(entry.reportedTipSources.map((row, offset) => offset === position ? { ...row, qualifiedTips } : row))} /><button type="button" onClick={() => updateReports(entry.reportedTipSources.filter((_, offset) => offset !== position))}>{label}: Remove reported source {position + 1}</button></div>)}
        {hasCardTip && <div className="guided-form-grid">
          <TextFact label={`${label}: Business receipt ledger reference`} value={proof.receiptLedgerReference} onChange={receiptLedgerReference => update({ form1099KProof: { ...emptyCardTipProof, receiptLedgerReference } })} />
          <BooleanFact label={`${label}: The Form 1099-K covers the only business payment group`} value={proof.solePaymentCohortConfirmed} onChange={solePaymentCohortConfirmed => updateProof({ solePaymentCohortConfirmed })} />
          <BooleanFact label={`${label}: The statement gross matches Schedule C receipts in the ledger`} value={proof.scheduleCBusinessReceiptsConfirmed} onChange={scheduleCBusinessReceiptsConfirmed => updateProof({ scheduleCBusinessReceiptsConfirmed })} />
          <BooleanFact label={`${label}: The claimed tips reconcile to the actual statement and ledger`} value={proof.qualifiedTipsReconciledConfirmed} onChange={qualifiedTipsReconciledConfirmed => updateProof({ qualifiedTipsReconciledConfirmed })} />
        </div>}
        <button type="button" onClick={() => update({ reportedTipSources: [...entry.reportedTipSources, { sourceId: "", qualifiedTips: "" }] })}>{label}: Add reported tip source</button>
        <button type="button" onClick={() => set({ businessTips: data.businessTips.filter((_, position) => position !== index) })}>{label}: Remove business tips</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => set({ businessTips: [...data.businessTips, { ...emptyBusinessTipDeduction, reportedTipSources: [] }] })}>Add business tip deduction</button>
    {data.overtime.map((entry, index) => {
      const label = `Overtime ${index + 1}`;
      const update = (patch: Partial<typeof entry>) => set({ overtime: data.overtime.map((row, position) => position === index ? { ...row, ...patch } : row) });
      return <fieldset key={index}><legend>{label}</legend><p className="guided-hint">Enter only the premium above the regular pay rate that the FLSA requires. State-law, contract or voluntary overtime alone does not establish federal eligibility. Use actual reported overtime amounts and the employer's calculation.</p><div className="guided-form-grid">
        <Choice label={`${label}: Owner`} value={entry.owner} choices={owners} onChange={owner => update({ owner: owner as typeof entry.owner })} />
        <Choice label={`${label}: Compensation source`} value={entry.compensationSourceId} choices={sources(entry.owner)} onChange={compensationSourceId => update({ compensationSourceId, ...(compensationSourceId.startsWith("form8919Nec:") ? { compensationExcludedFromWages: "" } : {}) })} />
        <CurrencyField label={`${label}: Qualified FLSA premium`} value={entry.qualifiedPremium} onChange={qualifiedPremium => update({ qualifiedPremium })} />
        {entry.compensationSourceId.startsWith("formW2:") && <CurrencyField label={`${label}: Payroll compensation excluded from Box 1`} hint="Actual compensation excluded from taxable wages, including a checked zero; never infer this from the proposed deduction." value={entry.compensationExcludedFromWages} onChange={compensationExcludedFromWages => update({ compensationExcludedFromWages })} />}
        <BooleanFact label={`${label}: Premium required by FLSA`} value={entry.requiredByFlsa} onChange={requiredByFlsa => update({ requiredByFlsa })} />
        <TextFact label={`${label}: Reporting reference`} value={entry.reportingSourceReference} onChange={reportingSourceReference => update({ reportingSourceReference })} />
      </div><button type="button" onClick={() => set({ overtime: data.overtime.filter((_, position) => position !== index) })}>{label}: Remove overtime</button></fieldset>;
    })}
    <button type="button" onClick={() => set({ overtime: [...data.overtime, { ...emptyOvertimeDeduction }] })}>Add overtime deduction</button>
    {data.vehicleLoans.map((entry, index) => {
      const label = `Vehicle loan ${index + 1}`;
      const statement = entry.form1098Vli;
      const update = (patch: Partial<typeof entry>, confirmationOnly = false) => {
        const next = { ...entry, ...patch };
        if (next.owner !== entry.owner) next.borrowerQualificationConfirmed = null;
        if (statement && !("form1098Vli" in patch)) {
          next.form1098Vli = { ...statement, sourceFactsConfirmed: null };
          if (statement.priorYearRefundProof) {
            next.form1098Vli.priorYearRefundProof = invalidateVehicleRefundPaymentEvidence(statement.priorYearRefundProof, vehicleRefundLoanIdentityChanged(entry, next));
          }
        }
        set({
          vehicleLoans: data.vehicleLoans.map((row, position) => position === index ? next : row),
          ...(confirmationOnly ? { sourceFactsConfirmed: data.sourceFactsConfirmed } : {}),
        });
      };
      const updateStatement = (patch: Partial<VehicleInterestStatementData>, refundConfirmationOnly = false) => {
        if (!statement) return;
        const confirmationOnly = refundConfirmationOnly || "sourceFactsConfirmed" in patch;
        const updated = { ...statement, ...(confirmationOnly ? {} : { sourceFactsConfirmed: null }), ...patch };
        if (!confirmationOnly && !("priorYearRefundProof" in patch) && statement.priorYearRefundProof) {
          updated.priorYearRefundProof = invalidateVehicleRefundPaymentEvidence(statement.priorYearRefundProof, statement.payer !== updated.payer);
        }
        update({ form1098Vli: updated }, confirmationOnly);
      };
      return <fieldset key={index}><legend>{label}</legend><p className="guided-hint">Confirm original borrower and loan records, qualifying new vehicle use and U.S. final assembly. A VIN alone does not establish eligibility. Keep business and other nonqualifying interest separate. Refinancing needs its original-loan worksheet.</p><div className="guided-form-grid">
        <Choice label={`${label}: Owner`} value={entry.owner} choices={owners} onChange={owner => update({ owner: owner as typeof entry.owner })} />
        {([["lenderName", "Lender"], ["loanAccountReference", "Loan account reference"], ["sourceTaxYear", "Source tax year"], ["sourceReference", "Source reference"], ["vin", "VIN"], ["grossVehicleWeightRating", "Gross vehicle weight rating in pounds"]] as const).map(([field, text]) => <TextFact key={field} label={`${label}: ${text}`} value={entry[field]} onChange={value => update({ [field]: value })} />)}
        {([["acquiredDate", "Acquired date"], ["loanOriginationDate", "Loan origination date"]] as const).map(([field, text]) => <TextFact key={field} label={`${label}: ${text}`} type="date" value={entry[field]} onChange={value => update({ [field]: value })} />)}
        {([["interestPaid", "Interest paid"], ["businessInterestDeducted", "Interest already deducted elsewhere"], ["nonqualifyingInterest", "Nonqualifying interest"]] as const).map(([field, text]) => <CurrencyField key={field} label={`${label}: ${text}`} value={entry[field]} onChange={value => update({ [field]: value })} />)}
        <Choice label={`${label}: Vehicle type`} value={entry.vehicleType} choices={[["car", "Car"], ["minivan", "Minivan"], ["van", "Van"], ["sport_utility_vehicle", "SUV"], ["pickup_truck", "Pickup truck"], ["motorcycle", "Motorcycle"]]} onChange={vehicleType => update({ vehicleType: vehicleType as typeof entry.vehicleType })} />
        {([["borrowerQualificationConfirmed", "Borrower qualification confirmed"], ["firstLien", "First lien"], ["originalUse", "Original use begins with borrower"], ["finalAssemblyUnitedStates", "Final assembly in the United States"], ["personalUse", "Purchased for personal use"], ["relatedParty", "Related-party loan"], ["lease", "Lease"], ["fleet", "Fleet purchase"], ["salvageOrScrap", "Salvage or scrap"], ["refinanced", "Refinanced loan"]] as const).map(([field, text]) => <BooleanFact key={field} label={`${label}: ${text}`} value={entry[field]} onChange={value => update({ [field]: value })} />)}
      </div>
        {(entry.refinanced === true || entry.refinancingSources !== undefined) && <VehicleRefinancingDetails label={`${label} refinancing`} data={entry.refinancingSources} onChange={refinancingSources => update({ refinancingSources })} />}
        {statement && <VehicleInterestStatementDetails label={label} data={statement} onChange={updateStatement} onRemove={() => update({ form1098Vli: undefined })} />}
        {!statement && data.sourceTaxYear === "2026" && <button type="button" onClick={() => update({ form1098Vli: { ...emptyVehicleInterestStatement } })}>{label}: Add 2026 Form 1098-VLI</button>}
        <button type="button" onClick={() => set({ vehicleLoans: data.vehicleLoans.filter((_, position) => position !== index) })}>{label}: Remove vehicle loan</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => set({ vehicleLoans: [...data.vehicleLoans, { ...emptyVehicleInterest }] })}>Add vehicle loan interest</button>
    <p className="guided-hint">Senior eligibility uses actual birth, death and SSN facts from About You, with the deduction computed after the income limit.</p>
    {data.seniorOwners.map((owner, index) => <div key={index}><Choice label={`Senior deduction ${index + 1}: Owner`} value={owner} choices={owners} onChange={value => set({ seniorOwners: data.seniorOwners.map((entry, position) => position === index ? value as typeof owner : entry) })} /><button type="button" onClick={() => set({ seniorOwners: data.seniorOwners.filter((_, position) => position !== index) })}>Senior deduction {index + 1}: Remove owner</button></div>)}
    <button type="button" onClick={() => set({ seniorOwners: [...data.seniorOwners, ""] })}>Add senior deduction owner</button>
    <BooleanFact label="Additional deductions: All claimed sources are included" value={data.allSourcesIncluded} onChange={allSourcesIncluded => set({ allSourcesIncluded })} />
    <BooleanFact label="Additional deductions: Sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => set({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>Remove additional deduction worksheet</button>
  </section>;
}
