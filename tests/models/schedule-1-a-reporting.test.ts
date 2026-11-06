// Spec: spec/federal/schedule-1-a-reporting.yaml
import { expect, it } from "vitest";
import { W2Schema, Form1099NecSchema, Form1099MiscSchema, Form1099KSchema } from "@/models/inputs.js";

it("preserves actual W2 year and reporting amounts without defaulting unknown", () => {
  const base={employer:{name:"Synthetic employer",ein:"12-3456789"},wages:"50000",federalWithheld:"0"};
  expect(W2Schema.parse({...base,taxYear:2026,box12CodeTP:"0",box12CodeTT:"600.15",treasuryTippedOccupationCodes:["102","000"]})).toMatchObject({taxYear:2026,box12CodeTP:"0",box12CodeTT:"600.15",treasuryTippedOccupationCodes:["102","000"]});
  expect(W2Schema.parse(base)).not.toHaveProperty("box12CodeTP");
  expect(W2Schema.parse(base)).not.toHaveProperty("box12CodeTT");
  expect(W2Schema.parse(base)).not.toHaveProperty("taxYear");
});
it("preserves the actual2026 information-return reporting boxes", () => {
  const source={taxYear:2026,cashTips:"500.15",qualifiedOvertimeCompensation:"0",treasuryTippedOccupationCodes:["102"]};
  expect(Form1099NecSchema.parse({payer:"Synthetic payor",nonemployeeCompensation:"10000",...source})).toMatchObject(source);
  expect(Form1099MiscSchema.parse({payer:"Synthetic payor",otherIncome:"10000",...source})).toMatchObject(source);
  const k={taxYear:2026,cashTips:"0",treasuryTippedOccupationCodes:["000"]};
  expect(Form1099KSchema.parse({pse:"Synthetic platform",grossAmount:"10000",...k})).toMatchObject(k);
  expect(Form1099NecSchema.parse({payer:"Synthetic payor",nonemployeeCompensation:"10000"})).not.toHaveProperty("cashTips");
  expect(W2Schema.safeParse({employer:{name:"Synthetic",ein:"12-3456789"},wages:"0",federalWithheld:"0",box12CodeTP:"-1"}).success).toBe(false);
});
