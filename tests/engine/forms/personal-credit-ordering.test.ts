// Spec: spec/federal/form-1040.yaml, personal-credit-ordering.
import {describe,it,expect} from "vitest";
import {calculatePersonalCreditOrdering} from "@/engine/forms/personal-credit-ordering.js";
import {d} from "@/utils/decimal.js";
const base={taxBeforeCredits:d("1000"),earlierCredits:d(0),ctcBeforeLimitation:d("2200"),potentialActc:d("1700"),qualifyingChildren:1,filesForm2555:false,adoptionAvailable:d("10000"),cleanEnergyAvailable:d("3000")};
describe("Personal credit limit worksheets",()=>{
  it("reserves500 CTC, allows500 adoption, and preserves the1700 refundable potential",()=>{
    const r=calculatePersonalCreditOrdering(base);
    expect(r.ctcReservation.toString()).toBe("500");
    expect(r.adoptionCredit.toString()).toBe("500");
    expect(r.cleanEnergyCredit.toString()).toBe("0");
    expect(r.ctcTaxLiability.toString()).toBe("500");
  });
  it("gives adoption priority over residential clean energy",()=>{
    const r=calculatePersonalCreditOrdering({...base,taxBeforeCredits:d("5000"),adoptionAvailable:d("1000")});
    expect(r.adoptionCredit.toString()).toBe("1000");
    expect(r.cleanEnergyCredit.toString()).toBe("3000");
    expect(r.ctcTaxLiability.toString()).toBe("1000");
  });
  it("uses ordinary CTC priority when Form2555 disallows WorksheetB",()=>{
    const r=calculatePersonalCreditOrdering({...base,filesForm2555:true});
    expect(r.ctcReservation.toString()).toBe("1000");
    expect(r.adoptionCredit.toString()).toBe("0");
  });
  it("preserves ordinary ODC priority when no qualifying child is claimed",()=>{
    const r=calculatePersonalCreditOrdering({...base,qualifyingChildren:0,ctcBeforeLimitation:d("500"),potentialActc:d(0)});
    expect(r.ctcTaxLiability.toString()).toBe("500");
    expect(r.adoptionCredit.toString()).toBe("500");
  });
  it("subtracts actual prior-ranking credits before allocating remaining tax",()=>{
    const r=calculatePersonalCreditOrdering({...base,earlierCredits:d("900")});
    expect(r.ctcTaxLiability.toString()).toBe("100");
    expect(r.adoptionCredit.toString()).toBe("0");
  });
  it("rejects a negative available credit",()=>{
    expect(()=>calculatePersonalCreditOrdering({...base,adoptionAvailable:d("-1")})).toThrow(/nonnegative/);
  });
});
