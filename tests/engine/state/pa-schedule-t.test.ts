import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePAScheduleT,
  type PAScheduleTInput,
} from "@/engine/state/pa-schedule-t.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(overrides: Partial<PAScheduleTInput> = {}): PAScheduleTInput {
  return {
    taxYear: 2025,
    w2gForms: [],
    additionalEntries: [],
    ...overrides,
  };
}

describe("Pennsylvania Schedule T", () => {
  it("PA Schedule T Line 1 - includes taxable W-2G winnings and excludes noncash PA Lottery prizes", () => {
    const result = calculatePAScheduleT(makeInput({
      w2gForms: [
        {
          payer: "PA Lottery cash prize",
          reportableWinnings: d(1000),
          typeOfWager: "lottery",
          state: "PA",
          prizeType: "cash",
        },
        {
          payer: "PA Lottery noncash prize",
          reportableWinnings: d(600),
          typeOfWager: "lottery",
          state: "PA",
          prizeType: "noncash",
        },
        {
          payer: "NJ Lottery cash prize",
          reportableWinnings: d(400),
          typeOfWager: "lottery",
          state: "NJ",
          prizeType: "cash",
        },
        {
          payer: "Casino winnings",
          reportableWinnings: d(500),
          prizeType: "cash",
        },
      ],
    }));

    expect(result.totalWinnings.toNumber()).toBe(1900);
    expect(result.exemptPALotteryNoncashWinnings.toNumber()).toBe(600);
    expect(result.totalTaxableWinnings.toNumber()).toBe(1900);
  });

  it("PA Schedule T Line 2 - includes supplemental taxable winnings", () => {
    const result = calculatePAScheduleT(makeInput({
      additionalEntries: [
        {
          description: "Poker tournament cash",
          winnings: d(300),
          prizeType: "cash",
        },
        {
          description: "PA Lottery vehicle prize",
          winnings: d(12000),
          isLottery: true,
          lotteryState: "PA",
          prizeType: "noncash",
        },
      ],
    }));

    expect(result.primary.supplementalWinnings.toNumber()).toBe(300);
    expect(result.totalWinnings.toNumber()).toBe(300);
    expect(result.exemptPALotteryNoncashWinnings.toNumber()).toBe(12000);
  });

  it("PA Schedule T Line 3 - totals each spouse's taxable winnings before costs", () => {
    const result = calculatePAScheduleT(makeInput({
      w2gForms: [
        {
          payer: "Primary casino jackpot",
          reportableWinnings: d(500),
          typeOfWager: "slots",
          state: "PA",
        },
      ],
      additionalEntries: [
        {
          accountHolder: "primary",
          description: "Primary poker cash",
          winnings: d(250),
        },
        {
          accountHolder: "spouse",
          description: "Spouse sportsbook cash",
          winnings: d(700),
        },
      ],
    }));

    expect(result.primary.totalWinnings.toNumber()).toBe(750);
    expect(result.spouse.totalWinnings.toNumber()).toBe(700);
    expect(result.totalWinnings.toNumber()).toBe(1450);
  });

  it("PA Schedule T Line 4 - uses only each spouse's own wagering costs", () => {
    const result = calculatePAScheduleT(makeInput({
      additionalEntries: [
        {
          accountHolder: "primary",
          description: "Primary sports betting",
          winnings: d(500),
          wageringCosts: d(900),
          prizeType: "cash",
        },
        {
          accountHolder: "spouse",
          description: "Spouse casino trip",
          winnings: d(800),
          wageringCosts: d(100),
          prizeType: "cash",
        },
      ],
    }));

    expect(result.primary.wageringCostsUsed.toNumber()).toBe(500);
    expect(result.spouse.wageringCostsUsed.toNumber()).toBe(100);
    expect(result.totalWageringCostsUsed.toNumber()).toBe(600);
  });

  it("PA Schedule T Line 5 - floors each spouse net winnings at zero", () => {
    const result = calculatePAScheduleT(makeInput({
      additionalEntries: [
        {
          accountHolder: "primary",
          description: "Primary poker session",
          winnings: d(400),
          wageringCosts: d(1000),
          prizeType: "cash",
        },
        {
          accountHolder: "spouse",
          description: "Spouse slot winnings",
          winnings: d(700),
          prizeType: "cash",
        },
      ],
    }));

    expect(result.primary.netTaxableWinnings.toNumber()).toBe(0);
    expect(result.spouse.netTaxableWinnings.toNumber()).toBe(700);
    expect(result.totalTaxableWinnings.toNumber()).toBe(700);
  });

  it("PA Schedule T Line 6 - sums taxpayer and spouse net winnings", () => {
    const result = calculatePAScheduleT(makeInput({
      additionalEntries: [
        {
          accountHolder: "primary",
          description: "Primary card room cash",
          winnings: d(900),
          wageringCosts: d(200),
        },
        {
          accountHolder: "spouse",
          description: "Spouse casino cash",
          winnings: d(600),
          wageringCosts: d(50),
        },
      ],
    }));

    expect(result.primary.netTaxableWinnings.toNumber()).toBe(700);
    expect(result.spouse.netTaxableWinnings.toNumber()).toBe(550);
    expect(result.totalTaxableWinnings.toNumber()).toBe(1250);
  });

  it("PA Schedule T exempts only noncash PA Lottery prizes", () => {
    const result = calculatePAScheduleT(makeInput({
      additionalEntries: [
        {
          description: "PA Lottery annuity cash payout",
          winnings: d(2500),
          isLottery: true,
          lotteryState: "PA",
          prizeType: "cash",
        },
        {
          description: "PA Lottery car giveaway",
          winnings: d(18000),
          isLottery: true,
          lotteryState: "PA",
          prizeType: "noncash",
        },
      ],
    }));

    expect(result.totalWinnings.toNumber()).toBe(2500);
    expect(result.exemptPALotteryNoncashWinnings.toNumber()).toBe(18000);
    expect(result.totalTaxableWinnings.toNumber()).toBe(2500);
  });

  it("PA Schedule T Line 7 - totals Pennsylvania withholding from W-2Gs", () => {
    const result = calculatePAScheduleT(makeInput({
      w2gForms: [
        {
          payer: "PA Lottery",
          reportableWinnings: d(1000),
          typeOfWager: "lottery",
          prizeType: "cash",
          state: "PA",
          stateWithheld: d(31),
        },
        {
          payer: "Parx Casino",
          reportableWinnings: d(2000),
          typeOfWager: "slots",
          state: "PA",
          stateWithheld: d(61),
        },
        {
          payer: "NJ Lottery",
          reportableWinnings: d(1500),
          typeOfWager: "lottery",
          state: "NJ",
          stateWithheld: d(40),
        },
      ],
    }));

    expect(result.paTaxWithheld.toNumber()).toBe(92);
  });
});
