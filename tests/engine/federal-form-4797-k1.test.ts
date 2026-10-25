/**
 * Federal engine integration for Form 4797 section 1231 routing.
 */

import { describe, expect, it } from "vitest";
import { niitDispositionSources } from "../fixtures/niit-sources.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

describe("Federal engine - Form 4797 section 1231 routing", () => {
  it("K-1 section 1231 gains default through Form 4797 and Schedule D instead of Schedule E", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8960Sources: niitDispositionSources("6500", "2500", "-9000"),
      scheduleK1: [
        {
          partnershipName: "Timber LP",
          partnershipEIN: "44-4444444",
          ordinaryIncome: "0",
          section1231Gain: "9000",
          isPassiveActivity: false,
        },
      ],
      form4797: {
        nonrecapturedNetSection1231Losses: "2500",
      },
    });

    expect(result.scheduleE?.totalPartnershipIncome.toNumber()).toBe(0);
    expect(result.scheduleD?.netLongTerm.toNumber()).toBe(6500);
    expect(result.schedule1?.otherGainsOrLosses.toNumber()).toBe(2500);
    expect(result.capitalGainLoss.toNumber()).toBe(6500);
    expect(result.otherIncome.toNumber()).toBe(2500);
  });

  it("nonpassive K-1 section 1231 losses route to Schedule 1 while passive losses stay deferred", () => {
    const result = calculateFederalTax({
      ...simpleW2Fixture,
      form8960Sources: niitDispositionSources("0", "-4000", "4000"),
      scheduleK1: [
        {
          partnershipName: "Operating LLC",
          partnershipEIN: "55-5555555",
          ordinaryIncome: "0",
          section1231Gain: "-4000",
          isPassiveActivity: false,
        },
        {
          partnershipName: "Passive Loss LP",
          partnershipEIN: "66-6666666",
          ordinaryIncome: "0",
          section1231Gain: "-1500",
          isPassiveActivity: true,
        },
      ],
    });

    expect(result.form4797?.line7.toNumber()).toBe(-4000);
    expect(result.form4797?.line11.toNumber()).toBe(-4000);
    expect(result.form4797?.deferredPassiveK1Section1231Losses.toNumber()).toBe(-1500);
    expect(result.scheduleE?.totalPartnershipIncome.toNumber()).toBe(0);
    expect(result.schedule1?.otherGainsOrLosses.toNumber()).toBe(-4000);
    expect(result.scheduleD?.netLongTerm.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(-4000);
    expect(result.capitalGainLoss.toNumber()).toBe(0);
  });
});
