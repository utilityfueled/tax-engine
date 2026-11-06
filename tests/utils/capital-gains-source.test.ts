// Spec: spec/federal/qdcg-worksheet.yaml and schedule-d-tax-worksheet.yaml.
// Independent line calculations use final IRS1040/ScheduleD instructions.
import {describe,it,expect} from "vitest";
import {calculateCapitalGainsTax} from "@/utils/tax-math.js";
import {getConstants} from "@/models/constants.js";
import {d} from "@/utils/decimal.js";
const c=getConstants(2025);
const values=(r:ReturnType<typeof calculateCapitalGainsTax>)=>Object.fromEntries(r.lines.map(l=>[l.line,l.value.toString()]));
describe("Published capital-gain worksheets",()=>{
  it("uses published ordinary-tax rows in every QDCG step",()=>{
    const r=calculateCapitalGainsTax(d("40000"),d("10000"),d("0"),"single",c);
    expect(r.tax.toString()).toBe("3365"); // Published30000–30050 single row.
    expect(values(r)).toEqual({"1":"40000","2":"10000","3":"0","4":"10000","5":"30000","6":"48350","7":"40000","8":"30000","9":"10000","10":"10000","11":"10000","12":"0","13":"533400","14":"40000","15":"40000","16":"0","17":"0","18":"0","19":"10000","20":"0","21":"0","22":"3365","23":"3365","24":"4565","25":"3365"});
  });
  it("computes every official special-rate worksheet line",()=>{
    const r=calculateCapitalGainsTax(d("600000"),d("0"),d("100000"),"single",c,{section1250Gain:d("30000"),collectiblesGain:d("10000")});
    // Rate schedule ordinary500000:500000*35%-30452.75 ->144547.
    // Regular gains33400*15%+26600*20%;1250=30000*25%;collectibles=10000*28%.
    expect(r.tax.toString()).toBe("165177");
    expect(values(r)).toEqual({"1":"600000","2":"0","3":"0","4":"0","5":"0","6":"0","7":"100000","8":"0","9":"100000","10":"100000","11":"40000","12":"40000","13":"60000","14":"540000","15":"48350","16":"48350","17":"48350","18":"500000","19":"197300","20":"197300","21":"500000","22":"0","23":"60000","24":"0","25":"60000","26":"533400","27":"533400","28":"500000","29":"33400","30":"33400","31":"5010","32":"33400","33":"26600","34":"5320","35":"30000","36":"600000","37":"600000","38":"0","39":"30000","40":"7500","41":"590000","42":"10000","43":"2800","44":"144547","45":"165177","46":"179547","47":"165177"});
  });
  it("taxes low-income special gains at applicable ordinary rates",()=>{
    for(const options of [{section1250Gain:d("10000")},{collectiblesGain:d("10000")}]) {
      const r=calculateCapitalGainsTax(d("30000"),d("0"),d("10000"),"single",c,options);
      expect(r.tax.toString()).toBe("3365");
      expect(values(r)["21"]).toBe("30000");
      expect(values(r)["44"]).toBe("3365");
    }
    const r=calculateCapitalGainsTax(d("150000"),d("0"),d("20000"),"single",c,{section1250Gain:d("10000")});
    expect(values(r)).toMatchObject({"21":"140000","39":"0","40":"0","44":"26447","45":"27947","47":"27947"});
  });
  it("uses actual capital-gain election amounts before preferential rates",()=>{
    const r=calculateCapitalGainsTax(d("50000"),d("10000"),d("10000"),"single",c,{investmentIncomeElection:d("12000"),electionCapitalGainAmount:d("10000")});
    expect(values(r)).toMatchObject({"3":"12000","4":"10000","5":"2000","6":"8000","8":"10000","9":"0","10":"8000","21":"42000","22":"6350","30":"1650","31":"248","44":"4805","47":"5053"});
  });
});
