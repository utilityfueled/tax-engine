import { describe, expect, it } from "vitest";
import { NYIT201FullReturnInputSchema } from "@/models/inputs.js";

function baseInput() {
  return {
    federalAgi: "75000",
    filingStatus: "single" as const,
    taxYear: 2025 as const,
  };
}

describe("NY IT-201 full return input schema", () => {
  it("accepts a minimal supported resident-return payload", () => {
    const parsed = NYIT201FullReturnInputSchema.parse(baseInput());

    expect(parsed.federalAgi).toBe("75000");
    expect(parsed.filingStatus).toBe("single");
    expect(parsed.taxYear).toBe(2025);
  });

  it("rejects the unsupported full-year NYC and Yonkers local-tax combination", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      isNYCResident: true,
      yonkersResidencyStatus: "full_year",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-201 full return does not support combining full-year NYC resident tax with Yonkers local tax inputs; use IT-360.1 for city residency changes",
          path: ["yonkersResidencyStatus"],
        }),
      ])
    );
  });

  it("accepts a part-year NYC resident payload with the IT-360.1 tax and school-credit inputs", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      isPartYearNYCResident: true,
      partYearNYCTax: "612",
      partYearNYCTaxableIncome: "28000",
      partYearNYCSchoolCreditMonths: 8,
    });

    expect(parsed.isPartYearNYCResident).toBe(true);
    expect(parsed.partYearNYCTax).toBe("612");
    expect(parsed.partYearNYCTaxableIncome).toBe("28000");
    expect(parsed.partYearNYCSchoolCreditMonths).toBe(8);
  });

  it("rejects a part-year NYC resident payload without the Form IT-360.1 tax amount", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      isPartYearNYCResident: true,
      partYearNYCTaxableIncome: "28000",
      partYearNYCSchoolCreditMonths: 8,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "NY IT-201 part-year NYC resident input requires partYearNYCTax from Form IT-360.1",
          path: ["partYearNYCTax"],
        }),
      ])
    );
  });

  it("rejects a part-year NYC resident payload without the IT-360.1 line 47 taxable income used for line 69a", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      isPartYearNYCResident: true,
      partYearNYCTax: "612",
      partYearNYCSchoolCreditMonths: 8,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-201 part-year NYC resident input requires partYearNYCTaxableIncome from Form IT-360.1 line 47 for line 69a",
          path: ["partYearNYCTaxableIncome"],
        }),
      ])
    );
  });

  it("rejects a part-year NYC resident payload without the resident-period months used for line 69", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      isPartYearNYCResident: true,
      partYearNYCTax: "612",
      partYearNYCTaxableIncome: "28000",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-201 part-year NYC resident input requires partYearNYCSchoolCreditMonths for the line 69 school-credit proration table",
          path: ["partYearNYCSchoolCreditMonths"],
        }),
      ])
    );
  });

  it("rejects simultaneous full-year and part-year NYC residency flags", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      isNYCResident: true,
      isPartYearNYCResident: true,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "NY IT-201 full return cannot mark both full-year and part-year NYC residency",
          path: ["isPartYearNYCResident"],
        }),
      ])
    );
  });

  it("rejects spouse pension exclusion input outside married filing jointly returns", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      spousePensionExclusion: {
        nonGovernmentPensionIncome: "12000",
        isAge59AndHalf: true,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Spouse pension exclusion input is only supported for married_filing_jointly returns",
          path: ["spousePensionExclusion"],
        }),
      ])
    );
  });

  it("rejects a married filing separately itemized deduction above the standard amount without spouse confirmation", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      filingStatus: "married_filing_separately",
      nyItemizedDeduction: "12000",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-201 married filing separately returns may use an itemized deduction only if both spouses elect to itemize on their New York returns",
          path: ["spouseUsesItemizedDeduction"],
        }),
      ])
    );
  });

  it("accepts a married filing separately itemized deduction above the standard amount when the spouse also itemizes", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      filingStatus: "married_filing_separately",
      nyItemizedDeduction: "12000",
      spouseUsesItemizedDeduction: true,
    });

    expect(parsed.spouseUsesItemizedDeduction).toBe(true);
  });

  it("accepts structured IT-217 inputs that rely on the return's computed NY AGI", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      it217: {
        meetsQualifiedPropertyRequirement: true,
        meetsEligibleFarmerIncomeTest: true,
        directQualifiedAgriculturalAcreage: "500",
        directEligibleSchoolTaxes: "10000",
      },
    });

    expect(parsed.it217?.directQualifiedAgriculturalAcreage).toBe("500");
    expect(parsed.it217?.directEligibleSchoolTaxes).toBe("10000");
  });

  it("rejects IT-217 related-person ownership without allocation details", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      it217: {
        meetsQualifiedPropertyRequirement: true,
        meetsEligibleFarmerIncomeTest: true,
        hasRelatedPersonsOwnership: true,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-217 related-person ownership requires either relatedPersonsGroupCount or allocatedBaseAcreage",
          path: ["it217", "relatedPersonsGroupCount"],
        }),
      ])
    );
  });

  it("rejects spouse NY 529 contribution input outside married filing jointly returns", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      it225: {
        spouseNy529Contributions: "3000",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Spouse NY 529 contribution input is only supported for married_filing_jointly returns",
          path: ["it225", "spouseNy529Contributions"],
        }),
      ])
    );
  });

  it("rejects spouse MCTMT earnings input outside married filing jointly returns", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      mctmt: {
        spouseZone1Earnings: "52000",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Spouse MCTMT earnings input is only supported for married_filing_jointly returns",
          path: ["mctmt", "spouseZone1Earnings"],
        }),
      ])
    );
  });

  it("rejects IT-215 joint federal NY-MFS input without a line 17 allocation", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      filingStatus: "married_filing_separately",
      it215: {
        jointFederalReturnForMfsAllocation: true,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "IT-215 joint federal NY-MFS input requires the claimed IT-215 line 17 allocation",
          path: ["it215", "line17AllocatedNYSEic"],
        }),
      ])
    );
  });

  it("rejects NYC IT-215 joint federal NY-MFS input without a Worksheet C line 4 allocation", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      filingStatus: "married_filing_separately",
      isNYCResident: true,
      it215: {
        jointFederalReturnForMfsAllocation: true,
        line17AllocatedNYSEic: "275",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "IT-215 joint federal NY-MFS NYC input requires the claimed Worksheet C line 4 allocation",
          path: ["it215", "worksheetCLine4AllocatedNYCEic"],
        }),
      ])
    );
  });

  it("accepts structured IT-201-ATT nonrefundable credit detail", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      it201attNonrefundableCredits: {
        otherNoncarryoverCreditEntries: [
          { code: "133", amount: "12" },
          { code: "170", amount: "8" },
        ],
        otherCarryoverCreditEntries: [
          { code: "052", amount: "30" },
        ],
        nycResidentUbtCredit: "45",
      },
    });

    expect(parsed.it201attNonrefundableCredits?.otherNoncarryoverCreditEntries).toHaveLength(2);
    expect(parsed.it201attNonrefundableCredits?.otherCarryoverCreditEntries?.[0]?.code).toBe("052");
    expect(parsed.it201attNonrefundableCredits?.nycResidentUbtCredit).toBe("45");
  });

  it("accepts structured IT-249 long-term care credit detail", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      it249: {
        premiumsPaid: "6000",
        partnershipCreditShare: "150",
        sCorporationCreditShare: "25",
        fiduciaryCreditShare: "10",
        priorYearCarryover: "200",
      },
    });

    expect(parsed.it249?.premiumsPaid).toBe("6000");
    expect(parsed.it249?.partnershipCreditShare).toBe("150");
    expect(parsed.it249?.priorYearCarryover).toBe("200");
  });

  it("accepts structured IT-209 noncustodial credit detail", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      federalEic: "3000",
      it209: {
        ageAtYearEnd: 30,
        hasQualifyingNoncustodialChild: true,
        supportOrderInEffectHalfYear: true,
        paidRequiredChildSupport: true,
        hasValidSocialSecurityNumber: true,
        investmentIncome: "0",
        wagesSalariesTips: "25000",
        claimedFederalEic: true,
      },
    });

    expect(parsed.it209?.claimedFederalEic).toBe(true);
    expect(parsed.it209?.wagesSalariesTips).toBe("25000");
  });

  it("accepts structured IT-119 STAR reconciliation detail", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      it119: {
        receivedUnderpaymentNotice: true,
        properties: [
          { underpaymentAmount: "125" },
        ],
      },
    });

    expect(parsed.it119?.receivedUnderpaymentNotice).toBe(true);
    expect(parsed.it119?.properties).toHaveLength(1);
    expect(parsed.it119?.properties[0]?.underpaymentAmount).toBe("125");
  });

  it("rejects duplicate manual code 119 entries when structured IT-119 input is also provided", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      it119: {
        receivedUnderpaymentNotice: true,
        properties: [
          { underpaymentAmount: "125" },
        ],
      },
      it201attRefundableCredits: {
        otherRefundableCreditEntries: [
          { code: "119", amount: "125" },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "Do not include IT-201-ATT line 12 code 119 manually when structured IT-119 input is provided",
          path: ["it201attRefundableCredits", "otherRefundableCreditEntries"],
        }),
      ])
    );
  });

  it("rejects IT-209 federal-EIC comparison without a federal EIC amount", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      it209: {
        ageAtYearEnd: 30,
        hasQualifyingNoncustodialChild: true,
        supportOrderInEffectHalfYear: true,
        paidRequiredChildSupport: true,
        hasValidSocialSecurityNumber: true,
        investmentIncome: "0",
        wagesSalariesTips: "25000",
        claimedFederalEic: true,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "IT-209 claimedFederalEic requires top-level federalEic",
          path: ["federalEic"],
        }),
      ])
    );
  });

  it("accepts a part-year Yonkers payload with the IT-360.1 line 73 income percentage", () => {
    const parsed = NYIT201FullReturnInputSchema.parse({
      ...baseInput(),
      yonkersResidencyStatus: "part_year",
      yonkersResidentIncomePercentage: "0.3750",
    });

    expect(parsed.yonkersResidencyStatus).toBe("part_year");
    expect(parsed.yonkersResidentIncomePercentage).toBe("0.3750");
  });

  it("rejects a part-year Yonkers payload without the IT-360.1 line 73 income percentage", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      yonkersResidencyStatus: "part_year",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "NY IT-201 part-year Yonkers input requires yonkersResidentIncomePercentage from Form IT-360.1 line 73",
          path: ["yonkersResidentIncomePercentage"],
        }),
      ])
    );
  });

  it("rejects a negative part-year Yonkers income percentage", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      yonkersResidencyStatus: "part_year",
      yonkersResidentIncomePercentage: "-0.0001",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "NY IT-201 part-year Yonkers input requires a non-negative income percentage",
          path: ["yonkersResidentIncomePercentage"],
        }),
      ])
    );
  });

  it("rejects legacy Yonkers day-count proration inputs", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      yonkersResidencyStatus: "part_year",
      yonkersResidentIncomePercentage: "0.3750",
      daysOfYonkersResidency: 120,
      daysInTaxYear: 365,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-201 resident Yonkers part-year inputs use Form IT-360.1 line 73 income percentage; do not provide legacy day-count proration fields",
          path: ["daysOfYonkersResidency"],
        }),
        expect.objectContaining({
          message:
            "NY IT-201 resident Yonkers part-year inputs use Form IT-360.1 line 73 income percentage; do not provide legacy day-count proration fields",
          path: ["daysInTaxYear"],
        }),
      ])
    );
  });

  it("rejects legacy 2025-incompatible STAR and local refundable passthrough fields", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      starCredit: "0",
      nycYonkersRefundableCredits: "100",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "NY IT-201 2025 resident returns do not accept legacy standalone STAR credit passthroughs; use IT-119 for STAR reconciliation",
          path: ["starCredit"],
        }),
        expect.objectContaining({
          message:
            "NY IT-201 2025 resident returns do not accept legacy standalone NYC/Yonkers refundable-credit passthroughs; use the supported 2025 line 64 and line 71 inputs instead",
          path: ["nycYonkersRefundableCredits"],
        }),
      ])
    );
  });

  it("rejects IT-214 homeowner input without a market-value eligibility amount", () => {
    const parsed = NYIT201FullReturnInputSchema.safeParse({
      ...baseInput(),
      it214: {
        hasPersonAge65OrOlder: false,
        homeowner: {
          realPropertyTaxesPaid: "1500",
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "IT-214 homeowner input requires realPropertyMarketValue",
          path: ["it214", "realPropertyMarketValue"],
        }),
      ])
    );
  });
});
