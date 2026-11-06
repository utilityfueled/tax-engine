/**
 * Tests for Pennsylvania Working Pennsylvanians Tax Credit
 * Spec: spec/state/pa-working-pennsylvanians-tax-credit.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePAWorkingPennsylvaniansTaxCredit,
  type PAWorkingPennsylvaniansTaxCreditInput,
} from "@/engine/state/pa-working-pennsylvanians-tax-credit.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(
  overrides: Partial<PAWorkingPennsylvaniansTaxCreditInput> = {},
): PAWorkingPennsylvaniansTaxCreditInput {
  return {
    taxYear: 2025,
    paEarnedIncome: d(12000),
    federalEarnedIncomeCredit: d(0),
    isClaimedAsDependentOnAnotherFederalReturn: false,
    ...overrides,
  };
}

describe("Pennsylvania Working Pennsylvanians Tax Credit", () => {
  it("PA WPTC eligibility follows the federal EITC amount", () => {
    const zeroCredit = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(0),
    }));
    expect(zeroCredit.isEligible).toBe(false);
    expect(zeroCredit.credit.toNumber()).toBe(0);

    const positiveCredit = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(649),
    }));
    expect(positiveCredit.isEligible).toBe(true);
    expect(positiveCredit.credit.toNumber()).toBe(65);

    const dependentClaimant = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(649),
      isClaimedAsDependentOnAnotherFederalReturn: true,
    }));
    expect(dependentClaimant.isEligible).toBe(true);
    expect(dependentClaimant.credit.toNumber()).toBe(65);

    const noPAEarnedIncome = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      paEarnedIncome: d(0),
      federalEarnedIncomeCredit: d(649),
    }));
    expect(noPAEarnedIncome.isEligible).toBe(false);
    expect(noPAEarnedIncome.credit.toNumber()).toBe(0);
  });

  it("PA WPTC credit equals 10 percent of federal EITC rounded to the nearest dollar", () => {
    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(649),
    })).credit.toNumber()).toBe(65);

    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(4328),
    })).credit.toNumber()).toBe(433);

    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(8046),
    })).credit.toNumber()).toBe(805);

    // Actual indexed federal source is invalid; it is not an allowed amount capped to805.
    expect(() => calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(9000),
    }))).toThrow(/federal.*maximum|actual.*EITC/i);
  });

  it("PA WPTC throws for unsupported tax years", () => {
    expect(() => calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      taxYear: 2024,
      federalEarnedIncomeCredit: d(100),
    }))).toThrow("PA Working Pennsylvanians Tax Credit constants not available for tax year 2024");
  });
});

// Spec: state/pa-working-pennsylvanians-tax-credit.yaml#2026-indexed-source-and-rounding
it("WPTC uses the actual year maximum and whole-dollar boundaries", () => {
  expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({ taxYear:2026, federalEarnedIncomeCredit:d("8231") })).credit.toFixed()).toBe("823");
  for(const [eitc,expected] of [["649","65"],["654","65"],["655","66"],["656","66"]]) {
    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({taxYear:2026,federalEarnedIncomeCredit:d(eitc!)})).credit.toFixed()).toBe(expected);
  }
  for(const amount of ["-1","8231.01","Infinity","NaN"]) {
    expect(()=>calculatePAWorkingPennsylvaniansTaxCredit(makeInput({taxYear:2026,federalEarnedIncomeCredit:d(amount)}))).toThrow(/actual|source|finite|maximum/i);
  }
  expect(()=>calculatePAWorkingPennsylvaniansTaxCredit(makeInput({paEarnedIncome:d("-1")}))).toThrow(/actual|source|nonnegative/i);
});

function separateSources() {
  const primary={firstName:"Avery",lastName:"Source",ssn:"900-70-0311"};
  const spouse={firstName:"Morgan",lastName:"Source",ssn:"900-70-0312"};
  return {sourceTaxYear:2025,federalSourceReference:"private-joint-original",federalFactsConfirmed:true,
    federalReturnJoint:true,paReturnsSeparate:true,federalEarnedIncomeCredit:d("4328"),primary,spouse,
    claimantAccountHolder:"spouse",
    paSeparateReturns:[
      {accountHolder:"primary",sourceTaxYear:2025,sourceReference:"private-primary-PA",factsConfirmed:true,taxpayer:primary,taxAfterOtherCreditsBeforePayments:d("100"),otherCreditsFullyAppliedConfirmed:true,paEarnedIncome:d("10000"),earnedIncomeSourceReference:"private-primary-earned",eligibilityFactsConfirmed:true},
      {accountHolder:"spouse",sourceTaxYear:2025,sourceReference:"private-spouse-PA",factsConfirmed:true,taxpayer:spouse,taxAfterOtherCreditsBeforePayments:d("200"),otherCreditsFullyAppliedConfirmed:true,paEarnedIncome:d("12000"),earnedIncomeSourceReference:"private-spouse-earned",eligibilityFactsConfirmed:true},
    ]};
}
function separateInput(source=separateSources()):PAWorkingPennsylvaniansTaxCreditInput {
  return makeInput({paEarnedIncome:source.paSeparateReturns.find(row=>row.accountHolder===source.claimantAccountHolder)?.paEarnedIncome ?? d("12000"),federalEarnedIncomeCredit:d("4328"),...{jointFederalSeparatePA:source}} as unknown as Partial<PAWorkingPennsylvaniansTaxCreditInput>);
}
// Spec: state/pa-working-pennsylvanians-tax-credit.yaml#joint-federal-separate-pa
it("WPTC separate PA claims require both actual owner tax sources",()=>{
  expect(calculatePAWorkingPennsylvaniansTaxCredit(separateInput()).credit.toFixed()).toBe("433");
  const lower=separateSources();lower.claimantAccountHolder="primary";
  expect(calculatePAWorkingPennsylvaniansTaxCredit(separateInput(lower)).credit.toFixed()).toBe("0");
  const tied=separateSources();tied.paSeparateReturns[0]!.taxAfterOtherCreditsBeforePayments=d("200");
  expect(()=>calculatePAWorkingPennsylvaniansTaxCredit(separateInput(tied))).toThrow(/tie|greater/i);
  const mutations=[
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[0]!.paEarnedIncome=d("0");},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[0]!.earnedIncomeSourceReference="";},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[0]!.eligibilityFactsConfirmed=false;},
    (v:ReturnType<typeof separateSources>)=>{v.sourceTaxYear=2026;},
    (v:ReturnType<typeof separateSources>)=>{v.federalFactsConfirmed=false;},
    (v:ReturnType<typeof separateSources>)=>{v.federalSourceReference="";},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns.pop();},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.accountHolder="primary";},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.sourceReference=v.paSeparateReturns[0]!.sourceReference;},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.sourceTaxYear=2026;},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.factsConfirmed=false;},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.otherCreditsFullyAppliedConfirmed=false;},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.taxpayer={...v.spouse,ssn:v.primary.ssn};},
    (v:ReturnType<typeof separateSources>)=>{v.federalEarnedIncomeCredit=d("4327");},
    (v:ReturnType<typeof separateSources>)=>{v.paSeparateReturns[1]!.taxAfterOtherCreditsBeforePayments=d("-1");},
  ];
  for(const mutate of mutations){const v=separateSources();mutate(v);expect(()=>calculatePAWorkingPennsylvaniansTaxCredit(separateInput(v))).toThrow(/actual|source|owner|year|confirm|credit/i);}
});

// Spec: state/pa-working-pennsylvanians-tax-credit.yaml#both-spouses-eligible-sources
it("WPTC does not infer the other spouse eligibility from tax sources",()=>{
  const zero=separateSources();zero.paSeparateReturns[0]!.paEarnedIncome=d("0");
  expect(()=>calculatePAWorkingPennsylvaniansTaxCredit(separateInput(zero))).toThrow(/both.*eligible|actual|source/i);
  const unknown=separateSources();unknown.paSeparateReturns[0]!.eligibilityFactsConfirmed=false;
  expect(()=>calculatePAWorkingPennsylvaniansTaxCredit(separateInput(unknown))).toThrow(/both.*eligible|actual|source/i);
});
