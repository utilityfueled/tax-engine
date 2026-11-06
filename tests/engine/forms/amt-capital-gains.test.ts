// Spec: spec/federal/amt-capital-gains.yaml
import { describe, it, expect } from "vitest";
import { d } from "@/utils/decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateAMTCapitalGains } from "@/engine/forms/amt-capital-gains.js";
const constants = getConstants(2025);
const source = {
  amtBase: d("200000"), preferentialIncome: d("40000"), section1250Gain: d("20000"),
  totalCapitalGainRatesIncome: d("60000"), regularZeroRateOrdinaryIncome: d("150000"),
  regularFifteenRateOrdinaryIncome: d("140000"), filingStatus: "single" as const,
};
describe("Actual AMT capital-gain worksheets", () => {
  it("computes every official AMT capital-gain line from actual sources", () => {
    const result = calculateAMTCapitalGains(source, constants);
    expect(result.tax.toString()).toBe("47400");
    expect(Object.fromEntries(result.lines.map(l => [l.line, l.value.toString()]))).toEqual({
      12:"200000",13:"40000",14:"20000",15:"60000",16:"60000",17:"140000",18:"36400",
      19:"48350",20:"150000",21:"0",22:"40000",23:"0",24:"40000",25:"533400",26:"0",
      27:"140000",28:"140000",29:"393400",30:"40000",31:"6000",32:"40000",33:"0",34:"0",
      35:"180000",36:"20000",37:"5000",38:"47400",39:"52000",40:"47400",
    });
  });
  it("validates actual source boundaries and applies the ordinary tax cap", () => {
    const result = calculateAMTCapitalGains({...source, amtBase:d("1000"), preferentialIncome:d("0"), section1250Gain:d("0"),totalCapitalGainRatesIncome:d("0")}, constants);
    expect(result.tax.toString()).toBe("260");
    const zero = calculateAMTCapitalGains({...source,amtBase:d("0")},constants);
    expect(zero.tax.toString()).toBe("0");
    expect(zero.lines.find(l=>l.line==="37")?.value.toString()).toBe("0");
    for (const value of [d("-1"),d("NaN"),d("Infinity")]) {
      expect(()=>calculateAMTCapitalGains({...source,regularZeroRateOrdinaryIncome:value},constants)).toThrow(/source|finite|nonnegative/i);
    }
    expect(()=>calculateAMTCapitalGains({...source,totalCapitalGainRatesIncome:d("70000")},constants)).toThrow(/source|reconcile/i);
  });
});
