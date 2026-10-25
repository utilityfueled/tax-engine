import { describe, expect, it } from "vitest";
import {
  parseUploadedDocumentText,
  parseUploadedW2Text,
} from "../../../apps/web/src/lib/uploaded-document-detection";

const sampleW2Text = `
2025 W-2 and EARNINGS SUMMARY
W-2
Employer's name, address, and ZIP code
NORTHWIND FABRICATION LLC
890 HARBOR INDUSTRIAL WAY
CLEVELAND OH 44114
Employee's name, address, and ZIP code
TAYLOR EXAMPLE
123 SAMPLE STREET
DAYTON OH 45402
Employer's FED ID number
04-3097449
1 Wages, tips, other comp.
107175.28
2 Federal income tax withheld
15251.46
3 Social security wages
107175.28
4 Social security tax withheld
6644.87
5 Medicare wages and tips
107175.28
6 Medicare tax withheld
1554.04
10 Dependent care benefits
0.00
15 State Employer's state ID no.
OH 52-5111787
16 State wages, tips, etc.
107175.28
17 State income tax
2962.12
18 Local wages, tips, etc.
107175.28
`;

describe("uploaded document detection", () => {
  it("parses deterministic W-2 values from extracted PDF text", () => {
    const parsed = parseUploadedW2Text(sampleW2Text, "2025 Northwind W2.pdf");

    expect(parsed).toEqual({
      kind: "w2",
      taxYear: 2025,
      coverage: "supported",
      label: "NORTHWIND FABRICATION LLC W-2",
      notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
      seededFactIds: ["wages", "withholding"],
      detectedFacts: [
        {
          idSuffix: "parsed-w2-summary",
          factId: "wages",
          label: "Wages",
          value: "Parsed uploaded W-2: NORTHWIND FABRICATION LLC box 1 wages $107,175.28 and box 2 federal withholding $15,251.46.",
          confidence: "high",
          machineValue: {
            entryKind: "w2-summary",
            employerName: "NORTHWIND FABRICATION LLC",
            employerEin: "04-3097449",
            wages: "107175.28",
            federalWithheld: "15251.46",
            socialSecurityWages: "107175.28",
            socialSecurityWithheld: "6644.87",
            medicareWages: "107175.28",
            medicareWithheld: "1554.04",
            stateWages: "107175.28",
            stateWithheld: "2962.12",
          }
        },
        {
          idSuffix: "parsed-w2-withholding",
          factId: "withholding",
          label: "Federal withholding",
          value: "Parsed uploaded W-2 withholding: box 2 federal income tax withheld $15,251.46.",
          confidence: "high",
        }
      ]
    });
  });

  it("ignores non-W-2 text", () => {
    expect(parseUploadedW2Text("Random statement with no wage boxes", "statement.pdf")).toBeNull();
  });

  it("keeps social security wages unknown when only box 4 is reported", () => {
    const parsed = parseUploadedW2Text(`
2025 W-2 and EARNINGS SUMMARY
W-2
Employer's name, address, and ZIP code
NORTHWIND FABRICATION LLC
Employer's FED ID number
04-3097449
1 Wages, tips, other comp.
107175.28
2 Federal income tax withheld
15251.46
4 Social security tax withheld
6644.87
5 Medicare wages and tips
107175.28
6 Medicare tax withheld
1554.04
16 State wages, tips, etc.
107175.28
17 State income tax
2962.12
`, "2025 Northwind W2.pdf");

    expect(parsed?.detectedFacts[0]?.machineValue).toMatchObject({
      entryKind: "w2-summary",
      socialSecurityWithheld: "6644.87",
    });
    expect(parsed?.detectedFacts[0]?.machineValue).not.toHaveProperty("socialSecurityWages");
  });

  it("keeps state wage and withholding boxes stable for PDF.js-style W-2 text layouts", () => {
    const parsed = parseUploadedW2Text(`
2025 W-2 and EARNINGS SUMMARY
Employee Reference Copy
W-2
Statement
Employer's name, address, and ZIP code
NORTHWIND FABRICATION LLC
55 HARBOR INDUSTRIAL WAY
CLEVELAND OH 44114
e/f Employee's name, address, and ZIP code
TAYLOR EXAMPLE
123 SAMPLE STREET
DAYTON OH 45402
Reported W-2 Wages 107,175.28 107,175.28 107,175.28 107,175.28 107,175.28
Employer's FED ID number
04-3097449
1 Wages, tips, other comp. 2 Federal income tax withheld
107175.28 15251.46
3 4 Social security tax withheld
Social security wages
107175.28 6644.87
5 Medicare wages and tips 6 Medicare tax withheld
107175.28 1554.04
12a See instructions for box 12
W 4218.26
15 State Employer's state ID no. 16 State wages, tips, etc.
OH 52-5111787 107175.28
State income tax 18 Local wages, tips, etc.
17
2962.12 107175.28
19 Local income tax
20 Locality name
1339.88 DAYTON
`, "2025 Northwind W2.pdf");

    expect(parsed?.detectedFacts[0]?.machineValue).toMatchObject({
      entryKind: "w2-summary",
      stateWages: "107175.28",
    });
  });

  it("parses supported fields from a Schwab composite brokerage statement", () => {
    const parsed = parseUploadedDocumentText(`
FORM 1099 COMPOSITE
Account Number: 8677-0529
Dividends and Distributions __ 2025 Form 1099-DIV
1a Total Ordinary Dividends $ 1,283.34
1b Qualified Dividends $ 614.26
2a Total Capital Gain Distributions $ 0.00
4 Federal Income Tax Withheld $ 0.00
5 Section 199A Dividends $ 33.47
7 Foreign Tax Paid $ 58.90
Interest Income __ 2025 Form 1099-INT
1 Interest Income $ 105.86
4 Federal Income Tax Withheld $ 0.00
Proceeds from Broker Transactions __ 2025 Form 1099-B
Total Short-Term (Cost basis is reported to the IRS) $ 917.48 $ 1,006.94 -- $ (89.46)
`, "1099 schwab 529.PDF");

    expect(parsed?.kind).toBe("1099-b");
    expect(parsed?.coverage).toBe("partially-supported");
    expect(parsed?.seededFactIds).toEqual([
      "taxable-interest",
      "ordinary-dividends",
      "qualified-dividends",
      "capital-gain-distributions",
      "broker-proceeds",
      "cost-basis-review",
    ]);
    expect(parsed?.detectedFacts.find((fact) => fact.factId === "ordinary-dividends")?.machineValue).toMatchObject({
      entryKind: "1099-div-summary",
      ordinaryDividends: "1283.34",
      qualifiedDividends: "614.26",
      section199ADividends: "33.47",
      foreignTaxPaid: "58.90",
    });
    expect(parsed?.detectedFacts.find((fact) => fact.factId === "taxable-interest")?.machineValue).toMatchObject({
      entryKind: "1099-int-summary",
      interestIncome: "105.86",
    });
    expect(parsed?.detectedFacts.find((fact) => fact.factId === "broker-proceeds")?.machineValue).toMatchObject({
      entryKind: "1099-b-transaction",
      proceeds: "917.48",
      costBasis: "1006.94",
      basisReportedToIRS: true,
      holdingPeriod: "short",
    });
  });

  it("preserves actual digital asset rows and leaves unreported classification details unknown", () => {
    const parsed = parseUploadedDocumentText(`
Form 1099-DA
Long Term Transactions With Cost Basis Captured By Coinbase
ETH / X9J9K872S
01/15/25 0.00000033 0.00 05/05/21 0.00 0.00
04/02/25 0.000105 0.20 05/05/21 0.35 -0.15
04/02/25 0.000105 0.20 05/05/21 0.35 -0.15
Total: 0.40 0.70 -0.30
`, "coinbase 1099-da.pdf");

    expect(parsed?.kind).toBe("1099-da");
    expect(parsed?.coverage).toBe("partially-supported");
    const machineValues = parsed?.detectedFacts
      .map((fact) => fact.machineValue)
      .filter((value): value is NonNullable<typeof value> => value !== undefined && value !== null) ?? [];
    expect(machineValues[0]).toMatchObject({
      entryKind: "1099-b-transaction",
      description: "ETH",
      digitalAsset: true,
      holdingPeriod: "long",
    });
    expect(machineValues[0]).not.toHaveProperty("basisReportedToIRS");
    expect(machineValues[0]).not.toHaveProperty("adjustments");
  });

  it("marks employer 1095-C statements as reviewed instead of blocking deterministic recompute", () => {
    const parsed = parseUploadedDocumentText("Form 1095-C Employer-Provided Health Insurance Offer and Coverage", "2025 employer 1095-C.pdf");

    expect(parsed).toEqual({
      kind: "unknown",
      taxYear: null,
      coverage: "reviewed",
      label: "Form 1095-C reviewed",
      notes: "Employer health-coverage statements were reviewed. Form 1095-C does not create a deterministic federal tax input for this return and no additional engine mapping is required.",
      seededFactIds: [],
      detectedFacts: [],
    });
  });
});
