/**
 * Tests for Form 8839 — Qualified Adoption Expenses PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8839 } from "@/engine/forms/form-8839.js";
import { TAX_CONSTANTS } from "@/models/constants.js";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8839, FORM_8839_FIELDS } from "@/pdf/fill-form-8839.js";
import type { TaxYearInput } from "@/models/inputs.js";

/** Helper: get text value from a filled PDF field. */
function getFieldText(doc: PDFDocument, fieldName: string): string | undefined {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFTextField) {
      return field.getText() ?? undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Helper: check if a checkbox is checked. */
function isChecked(doc: PDFDocument, fieldName: string): boolean {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFCheckBox) {
      return field.isChecked();
    }
  } catch {
    return false;
  }
  return false;
}

const BLANK_8839 = "forms/blank/2025/f8839.pdf";
const F = FORM_8839_FIELDS;

// ─── Fixture 1: MFJ, one child, no phase-out, no employer benefits ────────

const singleChildFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "James",
      lastName: "Wilson",
      ssn: "111-22-3333",
      dateOfBirth: "1985-03-10",
      occupation: "Engineer",
    },
    spouse: {
      firstName: "Sarah",
      lastName: "Wilson",
      ssn: "444-55-6666",
      dateOfBirth: "1986-07-22",
      occupation: "Teacher",
    },
    address: {
      street: "100 Oak Ln",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [
      {
        firstName: "Emma",
        lastName: "Wilson",
        ssn: "777-88-9999",
        dateOfBirth: "2022-01-15",
        relationship: "daughter",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Tech Corp", ein: "11-2222222" },
      wages: "200000",
      federalWithheld: "35000",
      socialSecurityWages: "168600",
      socialSecurityWithheld: "10453.20",
      medicareWages: "200000",
      medicareWithheld: "2900",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "OR",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form8839: {
    children: [
      {
        childName: "Emma Wilson",
        isSpecialNeeds: false,
        isForeignAdoption: false,
        adoptionBecameFinal: true,
        qualifiedExpenses: "10000",
      },
    ],
  },
};

describe("Form 8839 PDF filling — MFJ, single child, no phase-out", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleChildFixture);
    doc = await fillForm8839(singleChildFixture, result, BLANK_8839);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("James Wilson & Sarah Wilson");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("fills Part I child information", () => {
    expect(getFieldText(doc, F.child1FirstName)).toBe("Emma");
    expect(getFieldText(doc, F.child1LastName)).toBe("Wilson");
    expect(isChecked(doc, F.child1AdoptionFinal)).toBe(true);
    expect(isChecked(doc, F.child1SpecialNeeds)).toBe(false);
    expect(isChecked(doc, F.child1Foreign)).toBe(false);
  });

  it("fills Part II Line 2 — maximum credit per child", () => {
    expect(getFieldText(doc, F.line2[0])).toBe("17280");
  });

  it("fills Part II Line 3 — prior year credits (none)", () => {
    expect(isChecked(doc, F.line3CheckboxNo)).toBe(true);
    expect(isChecked(doc, F.line3CheckboxYes)).toBe(false);
  });

  it("fills Part II Line 4 — remaining maximum credit", () => {
    expect(getFieldText(doc, F.line4[0])).toBe("17280");
  });

  it("fills Part II Line 5 — qualified adoption expenses", () => {
    expect(getFieldText(doc, F.line5[0])).toBe("10000");
  });

  it("fills Part II Line 6 — smaller of Line 4 or Line 5", () => {
    expect(getFieldText(doc, F.line6[0])).toBe("10000");
  });

  it("fills Part II Line 7 — MAGI", () => {
    // MAGI = AGI (no foreign exclusions) = $200,000
    expect(getFieldText(doc, F.line7)).toBe("200000");
  });

  it("fills Part II Line 8 — below threshold, checkbox No", () => {
    expect(isChecked(doc, F.line8CheckboxNo)).toBe(true);
    expect(isChecked(doc, F.line8CheckboxYes)).toBe(false);
  });

  it("fills Part II Line 10 — phase-out amount is zero (no phase-out)", () => {
    // When MAGI <= threshold, Line 10 should be empty or zero
    const val = getFieldText(doc, F.line10[0]);
    expect(val === undefined || val === "").toBe(true);
  });

  it("fills Part II Line 11a — credit after phase-out", () => {
    expect(getFieldText(doc, F.line11a[0])).toBe("10000");
  });

  it("fills Part II Line 11b — refundable portion ($5,000 cap)", () => {
    expect(getFieldText(doc, F.line11b[0])).toBe("5000");
  });

  it("fills Part II Line 11c — total refundable", () => {
    expect(getFieldText(doc, F.line11c)).toBe("5000");
  });

  it("fills Part II Line 12 — total of Line 11a", () => {
    expect(getFieldText(doc, F.line12)).toBe("10000");
  });

  it("fills Part II Line 13 — refundable credit", () => {
    expect(getFieldText(doc, F.line13)).toBe("5000");
  });

  it("fills Part II Line 14 — nonrefundable portion", () => {
    expect(getFieldText(doc, F.line14)).toBe("5000");
  });

  it("does not fill Part III when no employer benefits", () => {
    // Line 19 should not be filled for child 1
    const val = getFieldText(doc, F.line19[0]);
    expect(val === undefined || val === "").toBe(true);
  });

  it("leaves child 2 and child 3 columns empty", () => {
    const val2 = getFieldText(doc, F.line2[1]);
    expect(val2 === undefined || val2 === "").toBe(true);
    const val3 = getFieldText(doc, F.line2[2]);
    expect(val3 === undefined || val3 === "").toBe(true);
  });
});

// ─── Fixture 2: Single filer, MAGI phase-out, employer benefits ───────────

const phaseOutFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alex",
      lastName: "Chen",
      ssn: "222-33-4444",
      dateOfBirth: "1980-11-05",
      occupation: "Manager",
    },
    address: {
      street: "200 Elm St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
    },
    dependents: [
      {
        firstName: "Lily",
        lastName: "Chen",
        ssn: "555-66-7777",
        dateOfBirth: "2023-06-01",
        relationship: "daughter",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "BigCo Inc", ein: "33-4444444" },
      wages: "280000",
      federalWithheld: "60000",
      socialSecurityWages: "168600",
      socialSecurityWithheld: "10453.20",
      medicareWages: "280000",
      medicareWithheld: "4060",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "WA",
      box12: [{ code: "T", amount: "3000" }],
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form8839: {
    children: [
      {
        childName: "Lily Chen",
        isSpecialNeeds: false,
        isForeignAdoption: false,
        adoptionBecameFinal: true,
        qualifiedExpenses: "15000",
        employerBenefits: "3000",
      },
    ],
  },
};

describe("Form 8839 PDF filling — Single filer with MAGI phase-out and employer benefits", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(phaseOutFixture);
    doc = await fillForm8839(phaseOutFixture, result, BLANK_8839);
  });

  it("fills header for single filer", () => {
    expect(getFieldText(doc, F.name)).toBe("Alex Chen");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("fills Part II Line 2 — maximum credit", () => {
    expect(getFieldText(doc, F.line2[0])).toBe("17280");
  });

  it("fills Part II Line 5 — qualified expenses", () => {
    expect(getFieldText(doc, F.line5[0])).toBe("15000");
  });

  it("fills Part II Line 6 — smaller of Line 4 ($17,280) or Line 5 ($15,000)", () => {
    expect(getFieldText(doc, F.line6[0])).toBe("15000");
  });

  it("fills Part II Line 8 — MAGI exceeds threshold, checkbox Yes", () => {
    // AGI = ~$280,000 (wages), MAGI = AGI > $259,190
    expect(isChecked(doc, F.line8CheckboxYes)).toBe(true);
    expect(isChecked(doc, F.line8CheckboxNo)).toBe(false);
  });

  it("fills Part II Line 8 — excess MAGI value", () => {
    const val = getFieldText(doc, F.line8);
    expect(val).toBeDefined();
    // MAGI - $259,190 = some positive amount
    const excess = parseInt(val!, 10);
    expect(excess).toBeGreaterThan(0);
  });

  it("fills Part II Line 11a — credit after phase-out is reduced", () => {
    const val = getFieldText(doc, F.line11a[0]);
    expect(val).toBeDefined();
    const creditAfterPhaseOut = parseInt(val!, 10);
    // Should be less than Line 6 ($15,000) due to phase-out
    expect(creditAfterPhaseOut).toBeLessThan(15000);
    expect(creditAfterPhaseOut).toBeGreaterThan(0);
  });

  it("fills Part III when employer benefits exist", () => {
    // Line 19: max exclusion
    expect(getFieldText(doc, F.line19[0])).toBe("17280");
    // Line 22: employer benefits
    expect(getFieldText(doc, F.line22[0])).toBe("3000");
    // Line 23: total employer benefits
    expect(getFieldText(doc, F.line23)).toBe("3000");
  });

  it("fills Part III Line 26 — MAGI exceeds threshold for exclusion too", () => {
    expect(isChecked(doc, F.line26CheckboxYes)).toBe(true);
  });

  it("fills Part III Line 30 — total excluded benefits", () => {
    const val = getFieldText(doc, F.line30);
    expect(val).toBeDefined();
    const excluded = parseInt(val!, 10);
    // Should be less than $3,000 due to phase-out
    expect(excluded).toBeLessThan(3000);
    expect(excluded).toBeGreaterThan(0);
  });

  it("fills Part III Line 31 — taxable benefits", () => {
    const val = getFieldText(doc, F.line31);
    expect(val).toBeDefined();
  });
});

// ─── Fixture 3: Special needs child ───────────────────────────────────────

const specialNeedsFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Robert",
      lastName: "Park",
      ssn: "333-44-5555",
      dateOfBirth: "1978-02-14",
      occupation: "Accountant",
    },
    spouse: {
      firstName: "Linda",
      lastName: "Park",
      ssn: "666-77-8888",
      dateOfBirth: "1979-09-30",
      occupation: "Nurse",
    },
    address: {
      street: "300 Pine St",
      city: "Denver",
      state: "CO",
      zip: "80202",
    },
    dependents: [
      {
        firstName: "Max",
        lastName: "Park",
        ssn: "999-00-1111",
        dateOfBirth: "2020-04-20",
        relationship: "son",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Accounting Firm", ein: "55-6666666" },
      wages: "150000",
      federalWithheld: "25000",
      socialSecurityWages: "150000",
      socialSecurityWithheld: "9300",
      medicareWages: "150000",
      medicareWithheld: "2175",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "CO",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form8839: {
    children: [
      {
        childName: "Max Park",
        isSpecialNeeds: true,
        isForeignAdoption: false,
        adoptionBecameFinal: true,
        qualifiedExpenses: "5000", // actual expenses less than max, but special needs gets full
      },
    ],
  },
};

describe("Form 8839 PDF filling — Special needs child, adoption final", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(specialNeedsFixture);
    doc = await fillForm8839(specialNeedsFixture, result, BLANK_8839);
  });

  it("checks special needs checkbox in Part I", () => {
    expect(isChecked(doc, F.child1SpecialNeeds)).toBe(true);
    expect(isChecked(doc, F.child1AdoptionFinal)).toBe(true);
  });

  it("fills Line 5 with max credit for special needs child (not actual expenses)", () => {
    // Special needs + final adoption → Line 5 = max credit ($17,280)
    expect(getFieldText(doc, F.line5[0])).toBe("17280");
  });

  it("fills Line 6 — min of Line 4 ($17,280) or Line 5 ($17,280) = $17,280", () => {
    expect(getFieldText(doc, F.line6[0])).toBe("17280");
  });

  it("fills Line 11a — full credit (no phase-out at $150K MAGI)", () => {
    expect(getFieldText(doc, F.line11a[0])).toBe("17280");
  });

  it("fills Line 11b — refundable capped at $5,000", () => {
    expect(getFieldText(doc, F.line11b[0])).toBe("5000");
  });

  it("fills Line 12 — total credit", () => {
    expect(getFieldText(doc, F.line12)).toBe("17280");
  });

  it("fills Line 14 — nonrefundable = $17,280 - $5,000 = $12,280", () => {
    expect(getFieldText(doc, F.line14)).toBe("12280");
  });
});


it("maps audited refundable nonrefundable carryforward and signed benefits without recalculation", async () => {
  const result=calculateFederalTax(singleChildFixture);
  const child={childName:"Synthetic Child",isSpecialNeeds:true,isForeignAdoption:false,adoptionBecameFinal:true,
    qualifiedExpenses:"0",employerBenefits:"1000",priorYearCreditsClaimed:"0",priorYearExclusionsClaimed:"0",employerPlanQualified:true};
  const form8839=calculateForm8839({filingStatus:"married_filing_jointly",agi:new Decimal("100000"),children:[child],
    foreignEarnedIncomeExclusion:new Decimal(0),foreignHousingExclusion:new Decimal(0),constants:TAX_CONSTANTS[2025].adoptionCredit,
    taxLiabilityLimit:new Decimal("100"),carryforwards:[{originTaxYear:2024,amount:new Decimal("700")}],exclusionMagi:new Decimal("100000")});
  const doc=await fillForm8839({...singleChildFixture,form8839:{children:[child]}},{...result,form8839},BLANK_8839);
  expect(getFieldText(doc,F.line13)).toBe("5000");
  expect(getFieldText(doc,F.line15)).toBe("700");
  expect(getFieldText(doc,F.line16)).toBe("12980");
  expect(getFieldText(doc,F.line17)).toBe("100");
  expect(getFieldText(doc,F.line18)).toBe("100");
  expect(getFieldText(doc,F.line31)).toBe("(16280)");
  expect(isChecked(doc,F.line31CheckboxYes)).toBe(true);
  // Reopen serialized AcroForm rather than trusting only in-memory values.
  const reopened=await PDFDocument.load(await doc.save());
  expect(getFieldText(reopened,F.line18)).toBe("100");
  expect(getFieldText(reopened,F.line31)).toBe("(16280)");
});

it("rejects missing audited amounts and too many children for a single review form", async () => {
  const result=calculateFederalTax(singleChildFixture);
  const form8839=result.form8839;
  expect(form8839).toBeDefined();
  if(!form8839) throw new Error("Missing fixture");
  await expect(fillForm8839(singleChildFixture,{...result,form8839:{...form8839,lines:form8839.lines.filter(l=>l.line!=="13")}},BLANK_8839)).rejects.toThrow(/audit/i);
  const input={...singleChildFixture,form8839:{children:Array.from({length:4},()=>({...singleChildFixture.form8839?.children[0]}))}} as TaxYearInput;
  await expect(fillForm8839(input,result,BLANK_8839)).rejects.toThrow(/three|3|attachment/i);
});
