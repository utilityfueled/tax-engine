/**
 * Spec: spec/federal/form-461.yaml
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import {
  buildForm461ReferenceSummary,
  FORM_461_REFERENCE_FILENAME,
} from "@/pdf/fill-form-461.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-461-"));
}

describe("Form 461 packet reference summary", () => {
  it("buildForm461ReferenceSummary keeps the packet artifact reference-only and limited to supported excess-business-loss outputs", () => {
    const excessBusinessLossFixture = {
      ...simpleW2Fixture,
      scheduleC: {
        businessName: "Test LLC",
        grossReceipts: "10000",
        expenses: { otherExpenses: "560000" },
      },
    };

    const result = calculateFederalTax(excessBusinessLossFixture);
    const summary = buildForm461ReferenceSummary(result.form461!);

    expect(summary.title).toBe("Form 461 Excess Business Loss Reference Summary");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
    expect(summary.lines.map((line) => line.line)).toEqual(["2","3","4","5","6","8","9","10","11","12","13","14","15","16","NOL"]);
    expect(summary.lines.map((line) => line.value)).toEqual(["-550000","0","0","0","0","0","-550000","0","0","0","0","-550000","313000","-237000","237000"]);
    expect(summary.totals).toEqual([
      {
        label: "Schedule 1 Line 8p add-back",
        value: "237000",
      },
      {
        label: "Excess business loss NOL carryforward",
        value: "237000",
      },
    ]);
  });

  it("rejects missing or tampered canonical Form461 audit values",()=>{
    const result=calculateFederalTax({...simpleW2Fixture,scheduleC:{businessName:"Loss source",grossReceipts:"0",expenses:{otherExpenses:"200000"}}}).form461;
    if (!result) throw new Error("Missing expected Form461 result");
    expect(()=>buildForm461ReferenceSummary({...result,lines:result.lines.filter(line=>line.line!=="6")})).toThrow(/audit/i);
    const first=result.lines[0];
    if (!first) throw new Error("Missing expected audit source");
    expect(()=>buildForm461ReferenceSummary({...result,lines:[...result.lines,first]})).toThrow(/audit/i);
    expect(()=>buildForm461ReferenceSummary({...result,line16NetAfterThreshold:result.line16NetAfterThreshold.plus(1)})).toThrow(/audit|reconcile/i);
  });

  it("includes a required zero-addback Form461 attachment",async()=>{
    const outputDir=await makeOutputDir();
    try {
      const input={...simpleW2Fixture,scheduleC:{businessName:"Large line loss",grossReceipts:"0",expenses:{otherExpenses:"200000"}}};
      const result=calculateFederalTax(input);
      expect(result.form461?.applies).toBe(false);
      expect(result.form461?.requiresForm461).toBe(true);
      const {filledForms}=await fillReturn(input,result,{blankFormsDir:"forms/blank",outputDir});
      expect(filledForms.some(path=>path.endsWith(FORM_461_REFERENCE_FILENAME))).toBe(true);
    }finally{await rm(outputDir,{recursive:true,force:true});}
  });

  it("fillReturn includes a Form 461 reference summary when the excess business loss limitation applies", async () => {
    const outputDir = await makeOutputDir();

    try {
      const excessBusinessLossFixture = {
        ...simpleW2Fixture,
        scheduleC: {
          businessName: "Test LLC",
          grossReceipts: "10000",
          expenses: { otherExpenses: "560000" },
        },
      };

      const result = calculateFederalTax(excessBusinessLossFixture);
      const { filledForms } = await fillReturn(excessBusinessLossFixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const referencePath = filledForms.find((path) => path.endsWith(FORM_461_REFERENCE_FILENAME));

      expect(referencePath).toBeDefined();
      await access(referencePath!);
      const pdfBytes = await readFile(referencePath!);
      expect(pdfBytes.length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits the Form 461 reference summary when the excess business loss limitation does not apply", async () => {
    const outputDir = await makeOutputDir();

    try {
      const result = calculateFederalTax(simpleW2Fixture);
      const { filledForms } = await fillReturn(simpleW2Fixture, result, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(filledForms.some((path) => path.endsWith(FORM_461_REFERENCE_FILENAME))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
