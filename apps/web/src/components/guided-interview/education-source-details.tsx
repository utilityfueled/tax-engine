"use client";
import type { EducationCreditData, EducationStudentData, EducationStudentSourceData, EducationLlcStudentData, FilingStatus } from "@/lib/guided-interview-flow";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

function StudentSourceDetails({ student, onChange, taxYear, filingStatus }: { student: EducationStudentSourceData; onChange: (next: Partial<EducationStudentSourceData>) => void; taxYear?: number | null; filingStatus?: FilingStatus | null }) {
  return <>
    <TextFact label="Student name" value={student.name} onChange={name => onChange({ name })} />
    <TextFact label="Student's actual SSN, ITIN or ATIN" value={student.studentTaxId ?? ""} onChange={studentTaxId => onChange({ studentTaxId })} />
    <label className="guided-field"><span className="guided-field-label">Student's household role</span><select className="guided-input" value={student.studentRole ?? ""} onChange={event => onChange({ studentRole: event.target.value as EducationStudentSourceData["studentRole"] })}><option value="">Choose actual role</option><option value="primary">You</option>{filingStatus === "mfj" && <option value="spouse">Your spouse</option>}<option value="dependent">A dependent claimed on this return</option></select></label>
    <CurrencyField label="Qualified tuition & expenses" hint="Actual net qualified expenses paid for eligible academic periods, after scholarships, refunds and amounts used for another tax benefit. Form 1098-T alone may not show this total." value={student.qualifiedExpenses} onChange={qualifiedExpenses => onChange({ qualifiedExpenses })} />
    <BooleanFact label="Is the institution eligible for the education credit?" value={student.institutionEligible} onChange={institutionEligible => onChange({ institutionEligible })} />
    <BooleanFact label="Are actual payment timing, eligible costs and coordination with other education benefits confirmed?" value={student.expensesEligibilityConfirmed} onChange={expensesEligibilityConfirmed => onChange({ expensesEligibilityConfirmed })} />
    <BooleanFact label="Is the Form 1098-T requirement or a documented IRS exception satisfied?" value={student.form1098TRequirementMet} onChange={form1098TRequirementMet => onChange({ form1098TRequirementMet })} />
    {taxYear === 2026 && <BooleanFact label="Was the student's employment-valid SSN issued by the return due date?" value={student.studentSsnEligible} onChange={studentSsnEligible => onChange({ studentSsnEligible })} />}
    <BooleanFact label="Was the student's SSN, ITIN or ATIN issued by the return due date?" value={student.studentTinEligible} onChange={studentTinEligible => onChange({ studentTinEligible })} />
    {(student.institutions ?? []).map((institution, index) => {
      const update = (next: Partial<typeof institution>) => onChange({ institutions: student.institutions?.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
      return <fieldset className="guided-fieldset" key={index}><legend>Institution {index + 1}</legend>
        <TextFact label="Institution name" value={institution.name} onChange={name => update({ name })} />
        <TextFact label="Institution mailing address" value={institution.address} onChange={address => update({ address })} />
        <TextFact label="Institution EIN (required for AOTC or a received Form 1098-T)" value={institution.ein ?? ""} onChange={ein => update({ ein })} />
        <BooleanFact label="Did this student receive a current-year Form 1098-T from this institution?" value={institution.receivedCurrentYear1098T} onChange={receivedCurrentYear1098T => update({ receivedCurrentYear1098T })} />
        <BooleanFact label="Did this student receive a prior-year Form 1098-T with box 7 checked?" value={institution.receivedPriorYear1098TWithBox7} onChange={receivedPriorYear1098TWithBox7 => update({ receivedPriorYear1098TWithBox7 })} />
        <button type="button" className="utility-button" onClick={() => onChange({ institutions: student.institutions?.filter((_, itemIndex) => itemIndex !== index) })}>Remove institution {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange({ institutions: [...(student.institutions ?? []), { name: "", address: "" }] })}>Add institution</button>
  </>;
}

export function EducationSourceDetails({ data, onChange, taxYear, filingStatus }: { data: EducationCreditData; onChange: (data: EducationCreditData) => void; taxYear?: number | null; filingStatus?: FilingStatus | null }) {
  const update = (next: Partial<EducationCreditData>) => onChange({ ...data, ...next });
  const hasStudents = data.aocStudents.length > 0 || !!data.llcStudents?.length;
  return <div className="guided-w2-card" style={{ padding: "12px" }}>
    <h3 className="guided-w2-card-title">Education Credits (Form 8863)</h3>
    <p className="guided-hint">Use actual student and institution records. Choose one credit per student. Review qualified expenses, receipt exceptions and prior disallowance in the <a href="https://www.irs.gov/instructions/i8863" target="_blank" rel="noreferrer">IRS instructions</a>.</p>
    <h4 className="guided-w2-card-title">American Opportunity Credit students</h4>
    {data.aocStudents.map((student, index) => {
      const change = (next: Partial<EducationStudentData>) => update({ aocStudents: data.aocStudents.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
      return <fieldset className="guided-fieldset" key={index}><legend>AOTC student {index + 1}</legend>
        <StudentSourceDetails student={student} onChange={change} taxYear={taxYear} filingStatus={filingStatus} />
        <label className="guided-field"><span className="guided-field-label">Prior years AOTC was claimed</span><select className="guided-input" value={student.requiresPriorYearsConfirmation ? "" : student.priorYearsClaimed} onChange={event => change({ priorYearsClaimed: event.target.value, requiresPriorYearsConfirmation: false })}><option value="">Confirm actual claim history</option>{[0, 1, 2, 3, 4].map(year => <option key={year} value={String(year)}>{year === 4 ? "4 or more" : year}</option>)}</select>{student.requiresPriorYearsConfirmation && <span className="guided-field-hint">Saved prior claim count {student.priorYearsClaimed} needs confirmation because older versions prefilled zero.</span>}</label>
        {([ ["completedFirstFourYearsBeforeYear", "Completed the first four years of postsecondary education before this tax year"], ["enrolledAtLeastHalfTime", "Enrolled at least half-time for at least one academic period"], ["pursuingDegreeOrCredential", "Pursuing a degree or recognized education credential"], ["felonyDrugConviction", "Had a felony drug conviction by the end of the tax year"] ] as const).map(([field, label]) => <BooleanFact key={field} label={label} value={student[field]} onChange={value => change({ [field]: value })} />)}
        <TextFact label="AOTC institution EIN from the actual institution record" value={student.institutionEin ?? ""} onChange={institutionEin => change({ institutionEin })} />
        <button type="button" className="utility-button" onClick={() => update({ aocStudents: data.aocStudents.filter((_, itemIndex) => itemIndex !== index) })}>Remove AOTC student {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => update({ aocStudents: [...data.aocStudents, { name: "", qualifiedExpenses: "", priorYearsClaimed: "" }] })}>Add AOTC student</button>
    <h4 className="guided-w2-card-title">Lifetime Learning Credit students</h4>
    {(data.llcStudents ?? []).map((student, index) => {
      const change = (next: Partial<EducationLlcStudentData>) => update({ llcStudents: data.llcStudents?.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
      return <fieldset className="guided-fieldset" key={index}><legend>LLC student {index + 1}</legend>
        <StudentSourceDetails student={student} onChange={change} taxYear={taxYear} filingStatus={filingStatus} />
        <BooleanFact label="Are these postsecondary courses or courses to acquire or improve job skills?" value={student.courseEligibilityConfirmed} onChange={courseEligibilityConfirmed => change({ courseEligibilityConfirmed })} />
        <button type="button" className="utility-button" onClick={() => update({ llcStudents: data.llcStudents?.filter((_, itemIndex) => itemIndex !== index) })}>Remove LLC student {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => update({ llcStudents: [...(data.llcStudents ?? []), { name: "", qualifiedExpenses: "" }] })}>Add LLC student</button>
    {data.llcExpenses.trim() && <CurrencyField label="Saved Lifetime Learning total to reconcile" hint="The saved total must equal the actual individual student expenses. Correct or clear it after reviewing the records." value={data.llcExpenses} onChange={llcExpenses => update({ llcExpenses })} />}
    {hasStudents && <fieldset className="guided-fieldset"><legend>Taxpayer education eligibility</legend>
      <BooleanFact label="Can another taxpayer claim you as a dependent?" value={data.canBeClaimedAsDependent} onChange={canBeClaimedAsDependent => update({ canBeClaimedAsDependent })} />
      <BooleanFact label="Does another taxpayer actually claim you as a dependent on their return?" value={data.claimedAsDependent} onChange={claimedAsDependent => update({ claimedAsDependent })} />
      <BooleanFact label="Were you a nonresident alien during the tax year?" value={data.nonresidentAlien} onChange={nonresidentAlien => update({ nonresidentAlien })} />
      {data.nonresidentAlien && filingStatus === "mfj" && <BooleanFact label="Did you make the qualifying resident joint-return election?" value={data.residentJointElection} onChange={residentJointElection => update({ residentJointElection })} />}
      {taxYear === 2026 ? <>
        <BooleanFact label="Was your employment-valid SSN issued by the return due date for education credits?" value={data.primarySsnEligible} onChange={primarySsnEligible => update({ primarySsnEligible })} />
        {filingStatus === "mfj" && <BooleanFact label="Was your spouse's employment-valid SSN issued by the return due date for education credits?" value={data.spouseSsnEligible} onChange={spouseSsnEligible => update({ spouseSsnEligible })} />}
        <p className="guided-hint">For a joint return, the 2026 taxpayer employment-SSN requirement can be met by either spouse. Dependent students have their own requirement.</p>
      </> : <BooleanFact label="Was your SSN or ITIN issued by the return due date for the 2025 AOTC?" value={data.primaryTinEligible} onChange={primaryTinEligible => update({ primaryTinEligible })} />}
      <CurrencyField label="Education MAGI Puerto Rico / American Samoa exclusion" value={data.possessionIncomeExclusion ?? ""} onChange={possessionIncomeExclusion => update({ possessionIncomeExclusion })} />
      {data.aocStudents.length > 0 && <>
        <BooleanFact label="Is an AOTC ban from a prior claim in effect?" value={data.aocBanInEffect} onChange={aocBanInEffect => update({ aocBanInEffect })} />
        <BooleanFact label="Is Form 8862 required because of a prior AOTC disallowance?" value={data.form8862Required} onChange={form8862Required => update({ form8862Required })} />
        {data.form8862Required && <BooleanFact label="Has the required Form 8862 been completed?" value={data.form8862Completed} onChange={form8862Completed => update({ form8862Completed })} />}
        <p className="guided-hint">For a claimant under 24 who does not file jointly, refundability requires actual full-time student, earned income, support and parent-alive facts. Age comes from your confirmed birth date. Enter your facts, not the dependent student's.</p>
        <BooleanFact label="Were you a full-time student for the refundable AOTC test?" value={data.refundableAocFacts?.fullTimeStudent} onChange={fullTimeStudent => update({ refundableAocFacts: { ...data.refundableAocFacts, fullTimeStudent } })} />
        <BooleanFact label="Was at least one of your parents alive at year end?" value={data.refundableAocFacts?.parentAlive} onChange={parentAlive => update({ refundableAocFacts: { ...data.refundableAocFacts, parentAlive } })} />
        <CurrencyField label="Your earned income for the refundable AOTC support test" value={data.refundableAocFacts?.earnedIncome ?? ""} onChange={earnedIncome => update({ refundableAocFacts: { ...data.refundableAocFacts, earnedIncome } })} />
        <CurrencyField label="Your total support for the refundable AOTC test" value={data.refundableAocFacts?.totalSupport ?? ""} onChange={totalSupport => update({ refundableAocFacts: { ...data.refundableAocFacts, totalSupport } })} />
        {data.refundableAocEligible != null && <BooleanFact label="Saved refundable AOTC answer (clear to use actual age and support facts)" value={data.refundableAocEligible} onChange={refundableAocEligible => update({ refundableAocEligible })} />}
      </>}
    </fieldset>}
  </div>;
}
