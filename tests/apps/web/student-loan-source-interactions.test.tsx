// @vitest-environment jsdom
// Spec: spec/federal/guided-student-loan.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StudentLoanSourceDetails } from "@/components/guided-interview/student-loan-source-details";
import { SectionReview } from "@/components/guided-interview/section-review";
import { buildStudentLoanInputs, emptyStudentLoanFacts, emptyStudentLoanSource, type StudentLoanData } from "@/lib/guided-student-loan-facts";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

it("collects actual loan facts and revokes confirmation after source changes", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: StudentLoanData | undefined;
  function Harness() { const [data, setData] = useState<StudentLoanData>(); return <StudentLoanSourceDetails data={data} filingStatus="single" educationDistributions={{ loanBorrowers: [{ id: "borrower-education", name: "Actual borrower" }], expenses: [{ id: "expense-interest", category: "student_loan" }] }} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add student-loan worksheet");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.primaryClaimedAsDependent).toBeNull(); expect(latest?.puertoRicoIncomeExclusion).toBe("");
    for (const [label, value] of [["Student-loan source tax year", "2025"], ["Someone actually claims you as a dependent for this tax year", "false"], ["Puerto Rico income excluded for the student-loan MAGI worksheet", "0"], ["American Samoa income excluded for the student-loan MAGI worksheet", "0"]]) await change(label!, value!);
    await click("Add student loan"); expect(latest?.loans?.[0]?.accountHolder).toBe(""); expect(latest?.loans?.[0]?.interestPaid).toBe("");
    for (const [label, value] of [["Loan or source label", "loan-1"], ["Borrower label", "borrower-1"], ["Borrower on this return", "primary"], ["Lender or servicer name", "Actual lender"], ["Actual interest source", "lender_statement"], ["Original loan date", "2010-08-01"], ["Actual paid interest allocated to this loan", "9007199254740993.01"], ["Additional qualified interest outside the amount above", "0"], ["Student relationship to borrower when the loan was made", "self"],
      ["This interest was actually paid in the selected tax year", "true"], ["This borrower is legally obligated to pay this loan", "true"], ["The loan was solely for qualified education expenses", "true"], ["The institution was eligible when the loan was made", "true"], ["The student was enrolled at least half time", "true"], ["The student was pursuing a degree, certificate or recognized credential", "true"], ["Expenses were paid within a reasonable period of borrowing", "true"], ["The loan was from a related person under the student-loan rules", "false"], ["The loan was from a qualified employer plan", "false"],
      ["Interest paid by employer assistance excluded from income", "0"], ["Interest paid by other tax-free loan assistance", "0"], ["Interest deductible elsewhere on this return", "0"], ["Tax-free 529 earnings used for this loan's interest", "0"], ["These benefit reductions are separate and do not overlap", "true"]]) await change(`Loan 1: ${label}`, value!);
    await change("Student-loan sources checked after the last edit", "true");
    expect(buildStudentLoanInputs(latest, "single", 2025).studentLoanInterestFacts?.loans?.[0]?.interestPaid).toBe("9007199254740993.01");
    await change("Loan 1: Interest paid by employer assistance excluded from income", ""); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Student-loan sources checked after the last edit", "true"); expect(() => buildStudentLoanInputs(latest, "single", 2025)).toThrow();
    await change("Loan 1: Interest paid by employer assistance excluded from income", "0"); await change("Loan 1: The loan was solely for qualified education expenses", "false"); await change("Student-loan sources checked after the last edit", "true");
    expect(buildStudentLoanInputs(latest, "single", 2025).studentLoanInterestFacts?.loans?.[0]?.solelyQualifiedEducationExpenses).toBe(false);
    await change("Loan 1: Actual interest source", "form1098e"); expect(latest?.loans?.[0]?.form1098ETaxYear).toBe(""); expect(latest?.loans?.[0]?.form1098EBox1).toBe(""); expect(latest?.loans?.[0]?.box2ExcludesOriginationFeesOrCapitalizedInterest).toBeNull();
    for (const [label, value] of [["Original Form 1098-E statement label", "statement-1"], ["Original Form 1098-E tax year", "2025"], ["Original Form 1098-E Box 1 total", "9007199254740993.01"], ["Box 2 is checked because Box 1 excludes origination fees or capitalized interest", "false"]]) await change(`Loan 1: ${label}`, value!);
    await change("Student-loan sources checked after the last edit", "true"); expect(buildStudentLoanInputs(latest, "single", 2025).form1098E).toHaveLength(1);
    await change("Loan 1: Link an existing education borrower", "borrower-education"); expect(latest?.loans?.[0]?.borrowerId).toBe("borrower-education");
    const checkbox = [...container.querySelectorAll("label")].find(label => label.textContent === "Loan 1: Link education loan-payment expense 1")?.querySelector<HTMLInputElement>("input");
    if (!checkbox) throw new Error("Missing expense link"); await act(async () => checkbox.click()); expect(latest?.loans?.[0]?.educationExpenseIds).toEqual(["expense-interest"]); await act(async () => checkbox.click()); expect(latest?.loans?.[0]?.educationExpenseIds).toEqual([]);
    await change("Loan 1: Actual interest source", "payment_records"); await change("Student-loan sources checked after the last edit", "true"); expect(() => buildStudentLoanInputs(latest, "single", 2025)).toThrow(/saved|statement/i);
    await click("Loan 1: Clear saved Form 1098-E details"); expect(latest?.loans?.[0]?.form1098EBox1).toBe(""); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Loan 1: The loan was solely for qualified education expenses", ""); expect(latest?.loans?.[0]?.solelyQualifiedEducationExpenses).toBeNull();
    await click("Loan 1: Remove loan"); expect(latest?.loans).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("shows actual loan costs and unknown source values before deduction limits", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["student-loans"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanFacts: { ...emptyStudentLoanFacts, loans: [{ ...emptyStudentLoanSource, interestPaid: "0" }, { ...emptyStudentLoanSource, interestPaid: "" }] } };
  const html = renderToStaticMarkup(<SectionReview state={state} preview={null} onJumpToSection={() => {}} />);
  expect(html).toContain("Student-loan sources need confirmation"); expect(html).toContain("Loan 1 unknown owner: paid interest before qualification"); expect(html).toContain("$0"); expect(html).toContain("Unknown");
});
