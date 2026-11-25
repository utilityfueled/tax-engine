/** Spec: spec/state/oh-2026-refundable-jobs-credit-draft.yaml. */
import { describe, expect, it } from "vitest";
import { calculateOhio2026RefundableJobsCreditDraft as calculate } from "@/engine/state/oh-engine.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const person = simpleW2Fixture.taxpayer.primary;
const input = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 } };
const holder = { firstName: person.firstName, lastName: person.lastName, taxIdLast4: person.ssn.slice(-4) };
const certificate = {
  authority: "122.17(B)", issuer: "ohio_department_of_development", returnType: "IT1040",
  taxYear: 2026, reference: "private certificate", holder, issueDate: "2027-02-15", amount: "7250.49",
  originalVerified: true, currentAndUnrevokedConfirmed: true, directIndividualHolderConfirmed: true,
  ordinaryNonMegaprojectConfirmed: true,
};
const facts = {
  calendarYearReturnConfirmed: true, asOfDate: "2027-02-15", noDisqualifyingRelocationConfirmed: true,
  certificate,
};
const entity = { legalName: "Private Pipeline Partnership", taxIdLast4: "0672" };
const fullEntityPeriod = { startDate: "2026-01-01", endDate: "2026-12-31" };
const entityCertificate = {
  authority: "122.17(B)", issuer: certificate.issuer, taxYear: 2026, reference: "private entity certificate",
  entityPeriod: fullEntityPeriod,
  awardReference: "private creation award", holder: entity, issueDate: "2027-02-15", amount: "5801.96",
  originalVerified: true, currentAndUnrevokedConfirmed: true, ordinaryNonMegaprojectConfirmed: true,
};
const annualElection = {
  taxYear: 2026, entityPeriod: fullEntityPeriod, entity: { ...entity, legalName: ` ${entity.legalName.toUpperCase()} ` },
  awardReference: entityCertificate.awardReference, reportReference: "private certified annual report",
  submittedOn: "2027-01-31", originalVerified: true, qualifyingPassThroughEntityConfirmed: true,
  electionOnSubmittedReportConfirmed: true,
};
const ownerShare = {
  taxYear: 2026, entityPeriod: fullEntityPeriod, entity, certificateReference: entityCertificate.reference, claimant: holder,
  reference: "private owner allocation records", verified: true, directOwnerConfirmed: true, noDuplicateClaimConfirmed: true,
  distributionBasis: "actual_income_or_profit_distributions", claimantDistribution: "1987.65",
  totalDistribution: "7950.60", documentedCredit: "1450.49",
};
const allocatedFacts = {
  ...facts, certificate: entityCertificate, allocation: { annualElection, ownerShare },
};

describe("Ohio 2026 certified refundable jobs credit draft", () => {
  it("reports only the certified exact creation amount and its deemed payment date", () => {
    const result = calculate(input, {
      ...facts, certificate: { ...certificate, holder: { ...holder, firstName: ` ${holder.firstName.toUpperCase()} ` } },
    });
    expect(result.refundableCredit.toFixed(2)).toBe("7250.49");
    expect(result).toMatchObject({
      status: "incomplete_draft", filingQualified: false, deemedPaymentDate: "2026-01-01",
      lines: [{ line: "certified-credit", value: result.refundableCredit,
        inputs: { "Award authority": "122.17(B)", "Deemed payment date": "2026-01-01" } }],
    });
    expect(Object.keys(result).sort()).toEqual(["deemedPaymentDate", "filingQualified", "lines", "refundableCredit", "status"]);
    const output = JSON.stringify(result);
    for (const confidential of [holder.firstName, holder.lastName, holder.taxIdLast4, certificate.reference]) {
      expect(output).not.toContain(confidential);
    }
  });

  it("preserves an explicit certified zero", () => {
    const issueDate = "2027-01-01";
    const result = calculate(input, { ...facts, asOfDate: issueDate, certificate: { ...certificate, issueDate, amount: "0.00" } });
    expect(result.refundableCredit.isZero()).toBe(true);
    expect(result.deemedPaymentDate).toBe("2026-01-01");
  });

  it("reports a direct owner's exact documented share from the elected annual award", () => {
    const result = calculate(input, allocatedFacts);
    expect(result.refundableCredit.toFixed(2)).toBe("1450.49");
    expect(result).toMatchObject({
      status: "incomplete_draft", filingQualified: false, deemedPaymentDate: "2026-01-01",
      lines: [{ line: "elected-owner-share", value: result.refundableCredit,
        inputs: { "Award authority": "122.17(J)", "Deemed payment date": "2026-01-01" } }],
    });
    expect(Object.keys(result).sort()).toEqual(["deemedPaymentDate", "filingQualified", "lines", "refundableCredit", "status"]);
    const output = JSON.stringify(result);
    for (const confidential of [holder.firstName, holder.lastName, holder.taxIdLast4, entity.legalName, entity.taxIdLast4,
      entityCertificate.reference, entityCertificate.awardReference, annualElection.reportReference, ownerShare.reference,
      entityCertificate.amount, ownerShare.claimantDistribution, ownerShare.totalDistribution, fullEntityPeriod.endDate]) {
      expect(output).not.toContain(confidential);
    }
    expect(calculate(input, {
      ...allocatedFacts, certificate: { ...entityCertificate, amount: "5802.00" },
      allocation: { annualElection, ownerShare: { ...ownerShare, documentedCredit: "1450.50" } },
    }).refundableCredit.toFixed(2)).toBe("1450.50");
  });

  it("requires the full independently documented entity period on all three records", () => {
    for (const entityPeriod of [
      undefined,
      { startDate: "2026-07-01", endDate: "2026-12-31" },
      { startDate: "2025-07-01", endDate: "2026-06-30" },
    ]) {
      const period = JSON.stringify(entityPeriod);
      expect(() => calculate(input, { ...allocatedFacts, certificate: { ...entityCertificate, entityPeriod } }),
        `certificate period ${period}`).toThrow();
      expect(() => calculate(input, { ...allocatedFacts, allocation: { annualElection: { ...annualElection, entityPeriod }, ownerShare } }),
        `election report period ${period}`).toThrow();
      expect(() => calculate(input, { ...allocatedFacts, allocation: { annualElection, ownerShare: { ...ownerShare, entityPeriod } } }),
        `owner distribution period ${period}`).toThrow();
    }

    expect(() => calculate(input, { ...allocatedFacts, allocation: { annualElection, ownerShare: {
      ...ownerShare, entityPeriod: { ...fullEntityPeriod, endDate: "2026-12-30" },
    } } })).toThrow();
  });

  it("holds ambiguous or mismatched election and owner allocation evidence", () => {
    for (const change of [
      { taxYear: 2025 }, { awardReference: "different award" }, { reportReference: "" },
      { entity: { ...entity, taxIdLast4: "0042" } }, { originalVerified: false },
      { qualifyingPassThroughEntityConfirmed: undefined }, { electionOnSubmittedReportConfirmed: false },
      { submittedOn: "2026-12-31" }, { submittedOn: "2027-02-16" },
      { submittedOn: "2027-03-02" }, { submittedOn: "2027-01-32" },
    ]) expect(() => calculate(input, {
      ...allocatedFacts, asOfDate: "2027-03-04",
      certificate: { ...entityCertificate, issueDate: change.submittedOn === "2027-03-02" ? "2027-03-03" : entityCertificate.issueDate },
      allocation: { annualElection: { ...annualElection, ...change }, ownerShare },
    }), JSON.stringify(change)).toThrow();

    for (const change of [
      { taxYear: 2027 }, { entity: { ...entity, legalName: "Different entity" } }, { certificateReference: "different certificate" },
      { claimant: { ...holder, lastName: "Different" } }, { claimant: { ...holder, taxIdLast4: "0001" } },
      { directOwnerConfirmed: false }, { noDuplicateClaimConfirmed: undefined }, { noDuplicateClaimConfirmed: false },
      { verified: false }, { reference: "" }, { distributionBasis: "equity_ownership" }, { ownershipPercentage: "40" },
      { claimantDistribution: "0.00" }, { totalDistribution: "0.00" }, { claimantDistribution: "7950.61" },
      { documentedCredit: "0.00" }, { documentedCredit: "1450.48" }, { documentedCredit: "2320.78" },
    ]) expect(() => calculate(input, { ...allocatedFacts,
      allocation: { annualElection, ownerShare: { ...ownerShare, ...change } } }), JSON.stringify(change)).toThrow();

    for (const packet of [
      { ...allocatedFacts, certificate }, { ...allocatedFacts, certificate: { ...entityCertificate, amount: "0.00" } },
      { ...allocatedFacts, certificate: { ...entityCertificate, authority: "former 122.171(B)(2)" } },
      { ...allocatedFacts, certificate: { ...entityCertificate, taxYear: 2025 } },
      { ...allocatedFacts, certificate: { ...entityCertificate, currentAndUnrevokedConfirmed: false } },
      { ...allocatedFacts, noDisqualifyingRelocationConfirmed: false },
      { ...allocatedFacts, allocation: [{ annualElection, ownerShare }, { annualElection, ownerShare }] },
    ]) expect(() => calculate(input, packet)).toThrow();
  });

  it("holds both fractional-cent and near-limit mismatched allocations", () => {
    for (const [amount, claimantDistribution, totalDistribution, documentedCredit] of [
      ["5801.97", "1987.65", "7950.60", "1450.49"],
      ["999999999999.97", "999999999999.97", "999999999999.98", "999999999999.96"],
    ]) expect(() => calculate(input, { ...allocatedFacts, certificate: { ...entityCertificate, amount },
      allocation: { annualElection, ownerShare: { ...ownerShare, claimantDistribution, totalDistribution, documentedCredit } },
    })).toThrow(/exact distribution share/);

    const exact = "999999999999.99";
    expect(calculate(input, {
      ...allocatedFacts, certificate: { ...entityCertificate, amount: exact },
      allocation: { annualElection, ownerShare: { ...ownerShare, claimantDistribution: exact,
        totalDistribution: exact, documentedCredit: exact } },
    }).refundableCredit.toFixed(2)).toBe(exact);
  });

  it("holds incomplete contradictory and unsupported direct certificate facts", () => {
    for (const change of [
      { amount: undefined }, { amount: "" }, { amount: "-1.00" }, { amount: "1.001" }, { amount: 0 },
      { holder: { ...holder, taxIdLast4: "0001" } }, { holder: { ...holder, lastName: "Different" } },
      { issueDate: "2027-02-16" }, { issueDate: "2027-02-30" }, { issueDate: "2025-12-31" }, { issueDate: "2026-12-31" },
      { taxYear: 2025 }, { reference: "" }, { issuer: "unknown" }, { returnType: "IT4738" },
      { authority: "122.171(B)" }, { directIndividualHolderConfirmed: false }, { ordinaryNonMegaprojectConfirmed: false },
      { originalVerified: false }, { currentAndUnrevokedConfirmed: undefined },
      { passThroughOwnershipShare: "50" }, { agreement: {} },
    ]) expect(() => calculate(input, { ...facts, certificate: { ...certificate, ...change } }), JSON.stringify(change)).toThrow();
    expect(() => calculate(input, { ...facts, noDisqualifyingRelocationConfirmed: undefined })).toThrow();
    expect(() => calculate(input, { ...facts, noDisqualifyingRelocationConfirmed: false })).toThrow();
    expect(() => calculate(input, { ...facts, calendarYearReturnConfirmed: false })).toThrow();
    expect(() => calculate(simpleW2Fixture, facts)).toThrow();
    expect(() => calculate({ ...input, taxpayer: { ...input.taxpayer, primary: { ...person, ssn: "000-00-0000" } } }, {
      ...facts, certificate: { ...certificate, holder: { ...holder, taxIdLast4: "0000" } },
    })).toThrow(/actual taxpayer holder/);
    expect(() => calculate({ ...input, standardDeductionFacts: { ...input.standardDeductionFacts, shortTaxYear: true } }, facts)).toThrow();
  });

  it("uses operative former retention agreements and holds conflicting legacy dates", () => {
    const agreement = {
      reference: "private agreement", holder, originalVerified: true, grantDate: "2013-12-31",
      firstTaxYear: 2013, lastTaxYear: 2027,
    };
    const legacy = (authority: string, agreementChange: Record<string, unknown> = {}) => ({
      ...facts, certificate: {
        ...certificate, authority, agreementReference: agreement.reference,
        agreement: { ...agreement, ...agreementChange },
      },
    });
    const b2 = "former 122.171(B)(2)", b3 = "former 122.171(B)(3)";
    expect(calculate(input, legacy(b3)).refundableCredit.toFixed(2)).toBe("7250.49");
    expect(calculate(input, legacy(b2, { recommendationDate: "2011-06-30" })).deemedPaymentDate).toBe("2026-01-01");
    for (const packet of [
      legacy(b2), legacy(b2, { recommendationDate: "2011-07-01" }),
      legacy(b2, { recommendationDate: "2011-06-30", grantDate: "2011-06-29" }),
      legacy(b2, { recommendationDate: "2011-06-30", grantDate: "2015-09-29" }),
      legacy(b3, { grantDate: "2014-01-01", firstTaxYear: 2014 }),
      legacy(b3, { grantDate: "2011-06-30" }), legacy(b3, { firstTaxYear: 2012 }),
      legacy(b3, { lastTaxYear: 2025 }), legacy(b3, { lastTaxYear: 2028 }),
      legacy(b3, { originalVerified: false }), legacy(b3, { reference: "other agreement" }),
      legacy(b3, { holder: { ...holder, taxIdLast4: "0001" } }),
    ]) expect(() => calculate(input, packet)).toThrow();
  });
});
