// Spec: spec/federal/marketplace-health-separate-business.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { separateBusinessHealthInput } from "../fixtures/marketplace-health-separate-business.js";

it("retains the separate actual business deduction before the historical cap", () => {
  const input=separateBusinessHealthInput(false), before=JSON.stringify(input);
  const result=calculateFederalTax(input);
  // 70000 profits: SE9891, half deduction4946. W17=3000+2400.
  // X14=59654; first qualifying tier1625; max specified4025,total7025.
  // Step2/final MAGI58029,385%*.0813=>4718; PTC1282; repaymentcap1625.
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7025");
  expect(result.agi.toFixed()).toBe("58029");
  expect(result.marketplaceHealthInsurance?.nonspecifiedDeduction.toFixed()).toBe("3000");
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("7025");
  expect(result.marketplaceHealthInsurance?.specifiedDeduction.toFixed()).toBe("4025");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("1282");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("1625");
  expect(result.form7206?.businesses.map(row=>[row.businessSourceId,row.deduction?.toFixed()])).toEqual([["scheduleC","0"],["scheduleF","3000"]]);
  expect(JSON.stringify(input)).toBe(before);
});
it("uses the binding published limit with exact original business sources", () => {
  const input=separateBusinessHealthInput(), before=JSON.stringify(input);
  const result=calculateFederalTax(input);
  const w=(line:string)=>result.allLines.find(row=>row.form==="Pub974 Worksheet W"&&row.line===line)?.value.toFixed();
  expect([w("13"),w("14"),w("15"),w("16")]).toEqual(["4646.6","3000","1646.6","1646.6"]);
  expect(result.marketplaceHealthInsurance?.specifiedDeduction.toFixed()).toBe("1646.6");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("4647");
  expect(result.agi.toFixed()).toBe("43586");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3577");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("23");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("3717");
  const reverse=structuredClone(input);
  reverse.form7206?.plans?.reverse();
  const repeated=calculateFederalTax(reverse);
  expect(repeated.schedule1?.seHealthInsurance.eq(result.schedule1!.seHealthInsurance)).toBe(true);
  expect(repeated.agi.eq(result.agi)).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
});
