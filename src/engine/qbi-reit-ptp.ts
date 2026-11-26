import Decimal from "decimal.js";
import { roundDollar, zeroFloor } from "@/utils/decimal.js";

/** The separate REIT/PTP component on Forms 8995 and 8995-A. */
export function calculateReitPtpComponent(current: Decimal, priorLoss = new Decimal(0)) {
  if (!current.isFinite()) throw new Error("Current qualified REIT and PTP amount must be finite");
  if (!priorLoss.isFinite() || priorLoss.lt(0)) throw new Error("Prior REIT and PTP loss must be finite and nonnegative");
  const reitPtpAmount = roundDollar(current);
  const priorYearReitPtpLoss = roundDollar(priorLoss);
  const netReitPtpAmount = reitPtpAmount.minus(priorYearReitPtpLoss);
  return {
    reitPtpAmount,
    priorYearReitPtpLoss,
    netReitPtpAmount,
    reitPTPComponent: roundDollar(zeroFloor(netReitPtpAmount).times("0.20")),
    reitPtpLossCarryforward: zeroFloor(netReitPtpAmount.negated()),
  };
}
