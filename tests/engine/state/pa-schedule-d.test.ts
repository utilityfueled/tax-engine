import { describe, expect, it } from "vitest";
import {
  calculatePAScheduleD,
  type PAScheduleDInput,
} from "@/engine/state/pa-schedule-d.js";

function makeInput(overrides: Partial<PAScheduleDInput> = {}): PAScheduleDInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    form1099B: [],
    scheduleK1: [],
    homeSales: [],
    form6252: [],
    paPassThroughStatements: [],
    ...overrides,
  };
}

describe("Pennsylvania Schedule D", () => {
  it("PA Schedule D Line 1 and Line 3 combine 1099-B and Section 1256 gains and losses", () => {
    const result = calculatePAScheduleD(makeInput({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "AAPL",
            dateAcquired: "2020-01-15",
            dateSold: "2025-06-01",
            proceeds: "18000",
            costBasis: "10000",
            holdingPeriod: "long",
          },
          {
            description: "MSFT",
            dateAcquired: "2025-01-15",
            dateSold: "2025-03-01",
            proceeds: "5000",
            costBasis: "6000",
            holdingPeriod: "short",
          },
        ],
      }],
      form6781: {
        section1256Gains: "4000",
        section1256Losses: "1500",
        adjustments: "500",
      },
    }));

    expect(result.line1.toNumber()).toBe(10000);
    expect(result.line3.toNumber()).toBe(10000);
    expect(result.line12.toNumber()).toBe(10000);
    expect(result.reportableNetGainOrLoss.toNumber()).toBe(10000);
  });

  it("PA Schedule D Line 4 carries installment sale gain into the Class 5 total", () => {
    const result = calculatePAScheduleD(makeInput({
      form6252: [{
        description: "Land sale",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: false,
        sellingPrice: "300000",
        costBasis: "150000",
        paymentsReceived: "60000",
      }],
    }));

    expect(result.line4.toNumber()).toBe(30000);
    expect(result.line12.toNumber()).toBe(30000);
  });

  it("PA Schedule D Line 7 prefers Pennsylvania pass-through statements over duplicated federal K-1 gains", () => {
    const result = calculatePAScheduleD(makeInput({
      scheduleK1: [
        {
          partnershipName: "Alpha Partners LP",
          partnershipEIN: "12-3456789",
          ordinaryIncome: "0",
          netShortTermCapitalGain: "3000",
          netLongTermCapitalGain: "7000",
          section1231Gain: "2000",
        },
        {
          partnershipName: "Beta Partners LP",
          partnershipEIN: "98-7654321",
          ordinaryIncome: "0",
          netShortTermCapitalGain: "500",
          netLongTermCapitalGain: "250",
          section1231Gain: "250",
        },
      ],
      paPassThroughStatements: [
        {
          entityName: "Alpha Partners LP",
          entityEIN: "12-3456789",
          sourceDocument: "pa_rk_1",
          businessIncome: "0",
          netGainOrLoss: "2200",
        },
      ],
    }));

    expect(result.line7.toNumber()).toBe(3200);
    expect(result.line12.toNumber()).toBe(3200);
  });

  it("PA Schedule D Line 8 reports taxable principal residence gain but not a principal residence loss", () => {
    const result = calculatePAScheduleD(makeInput({
      homeSales: [
        {
          salePrice: "500000",
          purchasePrice: "200000",
          sellingExpenses: "10000",
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        },
        {
          salePrice: "250000",
          purchasePrice: "300000",
          sellingExpenses: "10000",
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        },
      ],
    }));

    expect(result.line8.toNumber()).toBe(40000);
    expect(result.line12.toNumber()).toBe(40000);
  });

  it("PA Schedule D Line 2 reports recognized like-kind exchange gain and defaults omitted gain to zero", () => {
    const result = calculatePAScheduleD(makeInput({
      likeKindExchanges: [
        {
          propertyOwned: "Duplex in Pittsburgh",
          propertyReceived: "Office condo in Erie",
          recognizedGainOrLoss: "1250",
        },
        {
          propertyOwned: "Warehouse lot in Scranton",
          propertyReceived: "Warehouse lot in Allentown",
        },
      ],
    }));

    expect(result.line2.toNumber()).toBe(1250);
    expect(result.line3.toNumber()).toBe(1250);
    expect(result.line12.toNumber()).toBe(1250);
    expect(result.likeKindExchanges).toHaveLength(2);
    expect(result.likeKindExchanges[0]?.recognizedGainOrLoss.toNumber()).toBe(1250);
    expect(result.likeKindExchanges[1]?.recognizedGainOrLoss.toNumber()).toBe(0);
    expect(result.lines.find((line) => line.line === "2")?.value.toNumber()).toBe(1250);
  });

  it("PA Schedule D Line 12 does not allow one spouse's loss to offset the other spouse's gain on a joint return", () => {
    const result = calculatePAScheduleD(makeInput({
      filingStatus: "married_filing_jointly",
      form1099B: [{
        broker: "Schwab",
        accountHolder: "primary",
        transactions: [{
          description: "NVDA",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-15",
          proceeds: "20000",
          costBasis: "10000",
          adjustments: "0",
          holdingPeriod: "long",
        }],
      }],
      form6781: {
        accountHolder: "spouse",
        section1256Gains: "0",
        section1256Losses: "7000",
      },
      paPassThroughStatements: [{
        entityName: "Joint Ventures LP",
        entityEIN: "55-5555555",
        sourceDocument: "pa_rk_1",
        businessIncome: "0",
        netGainOrLoss: "2000",
      }],
    }));

    expect(result.taxpayerLine12.toNumber()).toBe(11000);
    expect(result.spouseLine12.toNumber()).toBe(-6000);
    expect(result.line12.toNumber()).toBe(5000);
    expect(result.reportableNetGainOrLoss.toNumber()).toBe(11000);
  });

  it("PA Schedule D digital asset question turns yes for digital-asset compensation and exchanges", () => {
    const compensationResult = calculatePAScheduleD(makeInput({
      receivedDigitalAssetAsCompensationOrServices: true,
    }));

    expect(compensationResult.digitalAssetQuestionYes).toBe(true);
    expect(compensationResult.lines.find((line) => line.line === "digital-assets")?.value.toNumber()).toBe(1);

    const exchangeResult = calculatePAScheduleD(makeInput({
      likeKindExchanges: [
        {
          propertyOwned: "BTC",
          propertyReceived: "ETH",
          recognizedGainOrLoss: "300",
          digitalAsset: true,
        },
      ],
    }));

    expect(exchangeResult.digitalAssetQuestionYes).toBe(true);
    expect(exchangeResult.line2.toNumber()).toBe(300);
    expect(exchangeResult.likeKindExchanges[0]?.digitalAsset).toBe(true);
  });
});
