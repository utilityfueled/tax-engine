/**
 * Tests for Schedule R — Credit for the Elderly or the Disabled PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleR, SCHEDULE_R_FIELDS } from "@/pdf/fill-schedule-r.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
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

const BLANK_SCHED_R = "forms/blank/2025/f1040sr.pdf";
const F = SCHEDULE_R_FIELDS;

// ─── Fixture 1: Single filer, age 65+, Box 1, low AGI → credit ────────────

const singleElderlyFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Margaret",
      lastName: "Elder",
      ssn: "222-33-4444",
      dateOfBirth: "1958-06-15",
      occupation: "Retired",
    },
    address: {
      street: "300 Quiet Ln",
      city: "Sarasota",
      state: "FL",
      zip: "34236",
    },
    dependents: [],
  },
  w2s: [],
  form1099Int: [
    { payer: "Community Bank", interestIncome: "1000", taxExemptInterest: "0", privateActivityBondInterest: "0" },
  ],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form1099R: [
    {
      payer: "State Pension Fund",
      grossDistribution: "5000",
      taxableAmount: "4000",
      federalWithheld: "400",
      distributionCode: "7",
    },
  ],
  formSSA1099: [
    { netBenefits: "3000" },
  ],
  scheduleR: {
    primaryQualifies: true,
    primaryAge65OrOlder: true,
    nontaxablePensionsAnnuities: "1000", // $5000 gross - $4000 taxable
  },
};

describe("Schedule R PDF filling — Single filer, age 65+, Box 1", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleElderlyFixture);
    doc = await fillScheduleR(singleElderlyFixture, result, BLANK_SCHED_R);
  });

  it("Schedule R header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Margaret Elder");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Schedule R Part I - Box 1 checked for single age 65+", () => {
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.box).toBe(1);
    expect(isChecked(doc, F.box1)).toBe(true);
    // Other boxes should NOT be checked
    expect(isChecked(doc, F.box2)).toBe(false);
    expect(isChecked(doc, F.box3)).toBe(false);
  });

  it("Schedule R Line 10 - initial amount $5,000 for Box 1", () => {
    expect(result.scheduleR!.initialAmount.toNumber()).toBe(5000);
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(result.scheduleR!.initialAmount));
  });

  it("Schedule R Line 12 - adjusted initial amount equals initial (no disability cap)", () => {
    const schedR = result.scheduleR!;
    expect(schedR.adjustedInitialAmount.toNumber()).toBe(5000);
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(schedR.adjustedInitialAmount));
  });

  it("Schedule R Lines 13a-13c - nontaxable benefits", () => {
    const schedR = result.scheduleR!;
    // Nontaxable SS = gross SS - taxable SS ($8000 SS with low income → all nontaxable)
    const nontaxableSS = result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable);
    expect(nontaxableSS.greaterThan(0)).toBe(true);
    expect(getFieldText(doc, F.line13a)).toBe(formatCurrency(nontaxableSS));
    // Total nontaxable: SS + pensions ($1000)
    expect(schedR.nontaxableBenefits.greaterThan(0)).toBe(true);
    expect(getFieldText(doc, F.line13c)).toBe(formatCurrency(schedR.nontaxableBenefits));
  });

  it("Schedule R Lines 14-17 - AGI reduction calculation", () => {
    expect(getFieldText(doc, F.line14)).toBe(formatCurrency(result.agi));
    // Box 1: AGI threshold = $7,500
    expect(getFieldText(doc, F.line15)).toBe("7500");
  });

  it("Schedule R Lines 19-20 - credit base and tentative credit", () => {
    const schedR = result.scheduleR!;
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(schedR.creditBase));
    expect(getFieldText(doc, F.line20)).toBe(formatCurrency(schedR.credit));
  });

  it("Schedule R eligible and produces positive credit", () => {
    const schedR = result.scheduleR!;
    expect(schedR.eligible).toBe(true);
    expect(schedR.credit.greaterThan(0)).toBe(true);
  });
});

// ─── Fixture 2: MFJ, both 65+, Box 3, with Social Security ────────────────

const mfjBothElderlyFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Harold",
      lastName: "Senior",
      ssn: "555-66-7777",
      dateOfBirth: "1955-02-20",
      occupation: "Retired",
    },
    spouse: {
      firstName: "Edna",
      lastName: "Senior",
      ssn: "888-99-0000",
      dateOfBirth: "1957-11-08",
    },
    address: {
      street: "100 Sunset Blvd",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
    },
    dependents: [],
  },
  w2s: [],
  form1099Int: [
    { payer: "Credit Union", interestIncome: "1500", taxExemptInterest: "0", privateActivityBondInterest: "0" },
  ],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  formSSA1099: [
    { netBenefits: "4000" },
  ],
  scheduleR: {
    primaryQualifies: true,
    primaryAge65OrOlder: true,
    spouseQualifies: true,
    spouseAge65OrOlder: true,
    nontaxablePensionsAnnuities: "0",
  },
};

describe("Schedule R PDF filling — MFJ, both 65+, Box 3", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjBothElderlyFixture);
    doc = await fillScheduleR(mfjBothElderlyFixture, result, BLANK_SCHED_R);
  });

  it("Schedule R header - joint names", () => {
    expect(getFieldText(doc, F.name)).toBe("Harold Senior & Edna Senior");
    expect(getFieldText(doc, F.ssn)).toBe("555667777");
  });

  it("Schedule R Part I - Box 3 checked for MFJ both 65+", () => {
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.box).toBe(3);
    expect(isChecked(doc, F.box3)).toBe(true);
    expect(isChecked(doc, F.box1)).toBe(false);
  });

  it("Schedule R Line 10 - initial amount $7,500 for Box 3", () => {
    expect(result.scheduleR!.initialAmount.toNumber()).toBe(7500);
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(result.scheduleR!.initialAmount));
  });

  it("Schedule R Lines 13a-13c - nontaxable Social Security", () => {
    const schedR = result.scheduleR!;
    // With $20k SS and low other income, most should be nontaxable
    const nontaxableSS = result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable);
    expect(nontaxableSS.greaterThan(0)).toBe(true);
    expect(getFieldText(doc, F.line13c)).toBe(formatCurrency(schedR.nontaxableBenefits));
  });

  it("Schedule R Line 15 - AGI threshold $10,000 for MFJ boxes", () => {
    expect(getFieldText(doc, F.line15)).toBe("10000");
  });

  it("Schedule R Line 22 - final credit", () => {
    const schedR = result.scheduleR!;
    expect(getFieldText(doc, F.line22)).toBe(schedR.allowedCredit?.toFixed(0));
  });
});

// ─── Fixture 3: Not eligible → no fields filled beyond header ──────────────

describe("Schedule R PDF filling — not eligible, no fields filled", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  const notEligibleFixture: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Young",
        lastName: "Worker",
        ssn: "123-45-6789",
        dateOfBirth: "1990-01-01",
        occupation: "Engineer",
      },
      address: {
        street: "1 Tech Way",
        city: "San Jose",
        state: "CA",
        zip: "95113",
      },
      dependents: [],
    },
    w2s: [
      {
        employer: { name: "Tech Corp", ein: "99-8877666" },
        wages: "100000",
        federalWithheld: "20000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "CA",
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
    // Under 65, not disabled → not eligible
    scheduleR: {
      primaryQualifies: false,
      primaryAge65OrOlder: false,
      nontaxablePensionsAnnuities: "0",
    },
  };

  beforeAll(async () => {
    result = calculateFederalTax(notEligibleFixture);
    doc = await fillScheduleR(notEligibleFixture, result, BLANK_SCHED_R);
  });

  it("Schedule R - not eligible, no credit", () => {
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.eligible).toBe(false);
    expect(result.scheduleR!.credit.toNumber()).toBe(0);
  });

  it("Schedule R - no boxes checked when not eligible", () => {
    expect(isChecked(doc, F.box1)).toBe(false);
    expect(isChecked(doc, F.box2)).toBe(false);
    expect(isChecked(doc, F.box3)).toBe(false);
  });

  it("Schedule R - credit lines empty when not eligible", () => {
    expect(getFieldText(doc, F.line10)).toBeUndefined();
    expect(getFieldText(doc, F.line20)).toBeUndefined();
    expect(getFieldText(doc, F.line22)).toBeUndefined();
  });
});


/** Synthetic AGI/benefits supplement to the literal published mixed-age initial example. */
function mixedAgePublishedFixture(): TaxYearInput {
  return {...singleElderlyFixture, taxpayer:{...singleElderlyFixture.taxpayer,filingStatus:'married_filing_jointly',
    primary:{...singleElderlyFixture.taxpayer.primary,dateOfBirth:'1962-06-15'},
    spouse:{firstName:'Sam',lastName:'Elder',ssn:'333-44-5555',dateOfBirth:'1958-06-15',occupation:'Retired'}},
    formSSA1099:[], form1099Int:[{payer:'Actual bank',interestIncome:'16000',taxExemptInterest:'0',privateActivityBondInterest:'0'}],
    form1099R:[{payer:'Actual disability pension',grossDistribution:'4000',taxableAmount:'4000',federalWithheld:'0',distributionCode:'3'}],
    scheduleR:{primaryQualifies:true,primaryAge65OrOlder:false,primaryDisabilityIncome:'4000',spouseQualifies:true,spouseAge65OrOlder:true,nontaxablePensionsAnnuities:'0'}};
}
describe('Schedule R published physical correction',()=>{
  it('prints actual uncapped disability line11 and actual zero tax limit',async()=>{
    const input=mixedAgePublishedFixture();const result=calculateFederalTax(input);
    const doc=await fillScheduleR(input,result,BLANK_SCHED_R); const reopened=await PDFDocument.load(await doc.save());
    expect(isChecked(reopened,F.box6)).toBe(true);expect(isChecked(reopened,F.box7)).toBe(false);
    for(const [field,expected] of [[F.line10,'7500'],[F.line11,'9000'],[F.line12,'7500'],[F.line14,'20000'],[F.line15,'10000'],[F.line16,'10000'],[F.line17,'5000'],[F.line18,'5000'],[F.line19,'2500'],[F.line20,'375'],[F.line21,'0'],[F.line22,'0']]) expect(getFieldText(reopened,field)).toBe(expected);
  });
  it('rejects unknown actual credit limit before template I/O',async()=>{
    const input=mixedAgePublishedFixture();const result=calculateFederalTax(input);
    if(!result.scheduleR)throw new Error('expected actual Schedule R');
    const missing={...result,scheduleR:{...result.scheduleR,creditLimit:undefined,allowedCredit:undefined}};
    await expect(fillScheduleR(input,missing,'does-not-exist.pdf')).rejects.toThrow(/Schedule R.*worksheet/i);
  });
  it('rejects stale actual disability facts and inconsistent worksheet before template I/O',async()=>{
    const input=mixedAgePublishedFixture();const result=calculateFederalTax(input);
    if(!input.scheduleR)throw new Error('expected original Schedule R facts');
    await expect(fillScheduleR({...input,scheduleR:{...input.scheduleR,primaryDisabilityIncome:'1000'}},result,'does-not-exist.pdf')).rejects.toThrow(/Schedule R.*source/i);
    if(!result.scheduleR)throw new Error('expected actual Schedule R');
    await expect(fillScheduleR(input,{...result,scheduleR:{...result.scheduleR,creditLimit:new Decimal(1)}},'does-not-exist.pdf')).rejects.toThrow(/Schedule R.*worksheet/i);
  });
  it('prints the actual canonical published2025 Jesse credit limit and allowed credit', async()=>{
    const input:TaxYearInput={...singleElderlyFixture,
      taxpayer:{...singleElderlyFixture.taxpayer,primary:{...singleElderlyFixture.taxpayer.primary,dateOfBirth:'1967-06-15'}},
      form1099Int:[{payer:'Actual bank',interestIncome:'100',taxExemptInterest:'0',privateActivityBondInterest:'0'}],
      form1099R:[{payer:'Actual disability pension',grossDistribution:'15900',taxableAmount:'15900',federalWithheld:'0',distributionCode:'3'}],
      formSSA1099:[{netBenefits:'700'}],
      scheduleR:{primaryQualifies:true,primaryAge65OrOlder:false,primaryDisabilityIncome:'15900',nontaxablePensionsAnnuities:'0'}};
    const result=calculateFederalTax(input);expect(result.agi.toFixed()).toBe('16000');
    const doc=await fillScheduleR(input,result,BLANK_SCHED_R);const saved=await PDFDocument.load(await doc.save());
    for(const [field,value] of [[F.line10,'5000'],[F.line11,'15900'],[F.line12,'5000'],[F.line13a,'700'],[F.line13c,'700'],[F.line14,'16000'],[F.line15,'7500'],[F.line16,'8500'],[F.line17,'4250'],[F.line18,'4950'],[F.line19,'50'],[F.line20,'8'],[F.line21,'26'],[F.line22,'8']])expect(getFieldText(saved,field)).toBe(value);
    expect(result.schedule3?.elderlyOrDisabledCredit.toFixed()).toBe('8');
  });

});

describe('Schedule R export source validation', () => {
  // Spec: schedule-r.yaml export-source-consistency. Missing paths prove pre-I/O rejection.
  it('rejects changed eligibility and rendered amounts before any export I/O', async () => {
    for (const route of ['standalone', 'packet'] as const) {
      for (const change of ['absent', 'false', 'benefits', 'reduction', 'net', 'original'] as const) {
        const input = mixedAgePublishedFixture();
        const result = calculateFederalTax(input);
        if (!result.scheduleR) throw new Error('Expected original R result');
        if (change === 'absent') result.scheduleR = undefined;
        else if (change === 'false') result.scheduleR.eligible = false;
        else if (change === 'benefits') result.scheduleR.nontaxableBenefits = new Decimal(1000);
        else if (change === 'reduction') result.scheduleR.agiReduction = new Decimal(1);
        else if (change === 'net') result.scheduleR.netInitialAmount = new Decimal(1);
        else {
          if (!input.scheduleR) throw new Error('Expected original R facts');
          input.scheduleR = {...input.scheduleR, primaryQualifies: false, primaryAge65OrOlder: false, spouseQualifies: false, spouseAge65OrOlder: false};
        }
        const pending = route === 'standalone' ? fillScheduleR(input, result, '/missing-r-source.pdf')
          : fillReturn(input, result, {blankFormsDir: '/missing-r-templates', outputDir: '/missing-r-output'});
        await expect(pending, `${route}:${change}`).rejects.toThrow(/Schedule R.*(source|worksheet|inconsistent)/i);
      }
    }
  });
});

describe('Schedule R no-claim credit signal', () => {
  // Spec: schedule-r.yaml no-claim-credit-signal.
  it('rejects a nonzero saved credit without an eligible original claim', async () => {
    for (const absent of [false, true]) {
      for (const packet of [false, true]) {
        const input = structuredClone(singleElderlyFixture);
        input.taxpayer.primary.dateOfBirth = '1990-06-15';
        input.scheduleR = absent ? undefined : {primaryQualifies: false, primaryAge65OrOlder: false, nontaxablePensionsAnnuities: '1000'};
        const result = calculateFederalTax(input);
        if (!result.schedule3) throw new Error('Expected actual Schedule3');
        expect(result.schedule3.elderlyOrDisabledCredit.isZero()).toBe(true);
        result.schedule3.elderlyOrDisabledCredit = new Decimal(100);
        const pending = packet ? fillReturn(input, result, {blankFormsDir: '/missing-r-templates', outputDir: '/missing-r-output'})
          : fillScheduleR(input, result, '/missing-r-source.pdf');
        await expect(pending).rejects.toThrow(/Schedule R.*(source|credit|inconsistent)/i);
      }
    }
  });
});

describe('Schedule R required printed zeros', () => {
  // Spec: schedule-r.yaml required-printed-zero.
  it('prints required zero totals on lines13c and16 after reopening', async () => {
    const input = mixedAgePublishedFixture();
    input.form1099Int = [];
    const result = calculateFederalTax(input);
    const reopened = await PDFDocument.load(await (await fillScheduleR(input, result, BLANK_SCHED_R)).save());
    expect(getFieldText(reopened, F.line13c)).toBe('0');
    expect(getFieldText(reopened, F.line16)).toBe('0');
    expect(getFieldText(reopened, F.line13a)).toBeUndefined();
    expect(getFieldText(reopened, F.line13b)).toBeUndefined();
  });
});
