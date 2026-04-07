import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { complexMFJFixture, simpleW2Fixture } from "../../fixtures/simple-w2.js";

describe("Illinois state return input schema", () => {
  it("rejects a non-joint Illinois return with more than one age-65 exemption count", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 2,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois age65OrOlderCount cannot exceed 1 unless filing jointly",
          path: ["stateReturns", "illinois", "age65OrOlderCount"],
        }),
      ]),
    );
  });

  it("rejects a non-joint Illinois return with more than one blind exemption count", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 2,
          dependentCount: 0,
          hasChildUnder12: false,
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois blindCount cannot exceed 1 unless filing jointly",
          path: ["stateReturns", "illinois", "blindCount"],
        }),
      ]),
    );
  });

  it("rejects a non-joint Illinois Schedule ICR volunteer worker count above one", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleICR: {
            taxYear: 2025,
            propertyTaxPaid: "0",
            propertyTaxBusinessDeduction: "0",
            k12EducationExpenses: "0",
            volunteerEmergencyWorkerCount: 2,
            volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001", "VEW-1002"],
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois volunteerEmergencyWorkerCount cannot exceed 1 unless filing jointly",
          path: ["stateReturns", "illinois", "scheduleICR", "volunteerEmergencyWorkerCount"],
        }),
      ]),
    );
  });

  it("rejects Illinois Schedule ICR property tax claims that omit county and property number support", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleICR: {
            taxYear: 2025,
            propertyTaxPaid: "4000",
            propertyTaxBusinessDeduction: "0",
            k12EducationExpenses: "0",
            volunteerEmergencyWorkerCount: 0,
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois Schedule ICR property tax claims require at least one county and property number",
          path: ["stateReturns", "illinois", "scheduleICR", "propertyTaxProperties"],
        }),
      ]),
    );
  });

  it("rejects Illinois direct deposit details unless refundMethod is direct_deposit", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          refundMethod: "paper_check",
          directDeposit: {
            routingNumber: "071000013",
            accountType: "checking",
            accountNumber: "123456789",
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois directDeposit details require refundMethod direct_deposit",
          path: ["stateReturns", "illinois", "directDeposit"],
        }),
      ]),
    );
  });

  it("rejects first-year Illinois returns that elect direct deposit", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          firstYearIllinoisReturn: true,
          refundMethod: "direct_deposit",
          directDeposit: {
            routingNumber: "071000013",
            accountType: "checking",
            accountNumber: "123456789",
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois first-year filers cannot elect direct deposit",
          path: ["stateReturns", "illinois", "refundMethod"],
        }),
      ]),
    );
  });

  it("rejects Illinois direct deposit details when the explicit refund amount is zero", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          refundAmountRequested: "0",
          refundMethod: "direct_deposit",
          directDeposit: {
            routingNumber: "071000013",
            accountType: "checking",
            accountNumber: "123456789",
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois refundMethod requires a positive refundAmountRequested when Line 38 is provided",
          path: ["stateReturns", "illinois", "refundMethod"],
        }),
        expect.objectContaining({
          message: "Illinois directDeposit details require a positive refundAmountRequested when Line 38 is provided",
          path: ["stateReturns", "illinois", "directDeposit"],
        }),
      ]),
    );
  });

  it("rejects the Illinois health insurance spouse checkbox unless filing jointly", () => {
    const parsed = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          healthInsuranceCheckbox: {
            selfUninsured: false,
            spouseUninsured: true,
            dependentsUninsured: false,
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Illinois healthInsuranceCheckbox spouse selection requires married filing jointly",
          path: ["stateReturns", "illinois", "healthInsuranceCheckbox", "spouseUninsured"],
        }),
      ]),
    );
  });

  it("accepts joint Illinois counts that legitimately reach the married-filing-jointly limits", () => {
    const parsed = TaxYearInputSchema.parse({
      ...complexMFJFixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          spouseClaimedAsDependent: false,
          age65OrOlderCount: 2,
          blindCount: 2,
          dependentCount: 0,
          hasChildUnder12: false,
          refundMethod: "direct_deposit",
          directDeposit: {
            routingNumber: "071000013",
            accountType: "checking",
            accountNumber: "123456789",
          },
          scheduleICR: {
            taxYear: 2025,
            propertyTaxPaid: "0",
            propertyTaxBusinessDeduction: "0",
            k12EducationExpenses: "0",
            volunteerEmergencyWorkerCount: 2,
            volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001", "VEW-1002"],
          },
        },
      },
    });

    expect(parsed.stateReturns?.illinois?.age65OrOlderCount).toBe(2);
    expect(parsed.stateReturns?.illinois?.blindCount).toBe(2);
    expect(parsed.stateReturns?.illinois?.scheduleICR?.volunteerEmergencyWorkerCount).toBe(2);
  });
});
