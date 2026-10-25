/** Spec: spec/federal/form-1099-q-expense-cap.yaml. Derived source controls. */
import { expect, it } from "vitest";
import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";

const form = (overrides: Record<string, unknown> = {}) => Form1099QSchema.parse({
  sourceId: "q1", accountId: "account1", beneficiaryId: "student1", recipientOwner: "primary",
  taxYear: 2026, payerName: "Synthetic education plan", accountType: "529", grossDistribution: "10000",
  earnings: "2000", basis: "8000", isTrusteeToTrustee: false, isQtpToRoth: false,
  recipientNotBeneficiary: true, sourceFactsConfirmed: true, transfer: { kind: "none" },
  ...overrides,
});
const expense = (overrides: Record<string, unknown> = {}) => ({
  id: "e1", beneficiaryId: "student1", category: "postsecondary_tuition", paidDate: "2026-08-15",
  amount: "10000", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0",
  otherTaxBenefitAmount: "0", qualificationConfirmed: true, ...overrides,
});
const facts = (overrides: Record<string, unknown> = {}) => ({
  taxYear: 2026, sourceFactsConfirmed: true, allDistributionsReconciled: true,
  beneficiaries: [{ id: "student1", name: "Synthetic Student", studentTaxId: "111223333", outsideK12QualifiedDistributions: "0" }],
  expenses: [expense()], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "10000", creditAmount: "0" }],
  loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [], ...overrides,
});
const summary = (overrides: Record<string, unknown> = {}) => QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: facts(overrides) });

it("uses actual room and board capacity without diluting it by unallocated spending", () => {
  const source=form({grossDistribution:"4000",earnings:"800",basis:"3200",distributionMedium:"cash"});
  const data=summary({expenses:[expense({category:"postsecondary_room_board",halfTimeStudent:true,roomBoardAllowance:"3000",schoolOwnedHousingCharge:"0"})],
    allocations:[{expenseId:"e1",sourceId:"q1",amount:"4000",creditAmount:"0"}]});
  const before=JSON.stringify({source,data}), result=calculateForm1099Q([source],data,{taxYear:2026});
  // 3000 qualified costs / 4000 gross * 800 earnings = 600 excluded,200 taxable.
  expect(result.perDistribution[0]?.adjustedQEE.toFixed()).toBe("3000");
  expect(result.taxFreeEarnings.toFixed()).toBe("600"); expect(result.taxableEarnings.toFixed()).toBe("200");
  expect(result.netPenalty.toFixed()).toBe("20"); expect(JSON.stringify({source,data})).toBe(before);
  const under=summary({...data.sourceFacts,allocations:[{expenseId:"e1",sourceId:"q1",amount:"2000",creditAmount:"0"}]});
  expect(calculateForm1099Q([source],under,{taxYear:2026}).perDistribution[0]?.adjustedQEE.toFixed()).toBe("2000");
});
it("conserves the single category cap across actual distributions and source states", () => {
  const forms=[form({grossDistribution:"2000",earnings:"400",basis:"1600"}),
    form({sourceId:"q2",accountId:"account2",grossDistribution:"2000",earnings:"800",basis:"1200"})];
  const data=summary({expenses:[expense({category:"postsecondary_room_board",halfTimeStudent:true,roomBoardAllowance:"3000",schoolOwnedHousingCharge:"0"})],
    allocations:forms.map(row=>({expenseId:"e1",sourceId:row.sourceId,amount:"2000",creditAmount:"0"}))});
  for(const sources of [forms,[...forms].reverse()]) {
    const result=calculateForm1099Q(sources,data,{taxYear:2026});
    expect(result.taxFreeEarnings.toFixed()).toBe("900"); expect(result.taxableEarnings.toFixed()).toBe("300");
    for(const row of result.perDistribution) expect(row.adjustedQEE.toFixed()).toBe("1500");
  }
  const blocked=summary({...data.sourceFacts,expenses:[expense({category:"postsecondary_room_board",halfTimeStudent:false,roomBoardAllowance:"3000",schoolOwnedHousingCharge:"0"})]});
  expect(calculateForm1099Q(forms,blocked,{taxYear:2026}).taxableEarnings.toFixed()).toBe("1200");
  const missing=summary({...data.sourceFacts,expenses:[expense({category:"postsecondary_room_board",halfTimeStudent:true,schoolOwnedHousingCharge:"0"})]});
  expect(()=>calculateForm1099Q(forms,missing,{taxYear:2026})).toThrow(/allowance/);
});
