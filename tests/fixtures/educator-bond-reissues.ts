/** Fictional original histories and classroom receipts; no derived amount input. */
import { AdjustmentsSchema } from "@/models/inputs.js";
import { savingsBondReissueReturnInput } from "./savings-bond-reissue-return.js";
import { educatorBondSource } from "./educator-bond-rational-magi.js";

export function educatorBondReissueInput(current = true) {
  const input = savingsBondReissueReturnInput(current);
  input.adjustments = AdjustmentsSchema.parse({ educatorExpenseSources: [
    { ...educatorBondSource("primary", "400"), savingsBondReductionMethod: "return_sources" },
    { ...educatorBondSource("spouse", "400"), savingsBondReductionMethod: "return_sources" },
  ] });
  return input;
}

export function educatorSoleSuccessorInput(partial = false) {
  const input = educatorBondReissueInput(), facts = input.form8815, packet = facts?.reissueSources;
  const group = packet?.groups?.[0], statement = packet?.statements?.[0], original = input.form1099Int[0];
  const successor = group?.successors?.[1], redemption = input.savingsBondRedemptions?.[1], expense = facts?.educationExpenses?.[0];
  if (!group || !statement || !original || !successor || !redemption || !expense) throw new Error("Missing fictional original sources");
  Object.assign(group, { originalFaceValue: "6000", taxpayerPurchaseFunds: "1000", spousePurchaseFunds: "2000", valueAtReissue: "4000" });
  successor.faceValue = "6000"; group.successors = [successor];
  Object.assign(redemption, { faceValue: "6000", proceeds: "5000" });
  input.savingsBondRedemptions = [redemption];
  statement.redemptionSourceIds = ["bond-spouse"]; statement.box3 = "2000"; original.usSavingsBondInterest = "2000";
  expense.amountPaid = partial ? "2500" : "5000";
  input.adjustments = AdjustmentsSchema.parse({ educatorExpenseSources: partial ? [
    educatorBondSource("primary", "100", "0"), educatorBondSource("spouse", "1000", "834"),
  ] : [
    { ...educatorBondSource("primary", "100"), savingsBondReductionMethod: "return_sources" },
    { ...educatorBondSource("spouse", "1800"), savingsBondReductionMethod: "return_sources" },
  ] });
  return input;
}

export function educatorHeldSuccessorInput() {
  const input = educatorBondReissueInput(), packet = input.form8815?.reissueSources;
  const successor = packet?.groups?.[0]?.successors?.[0], statement = packet?.statements?.[0], original = input.form1099Int[0];
  if (!successor || !statement || !original) throw new Error("Missing fictional original sources");
  successor.status = "held"; delete successor.redemptionSourceId;
  input.savingsBondRedemptions = input.savingsBondRedemptions?.filter(row => row.sourceId === "bond-spouse");
  statement.redemptionSourceIds = ["bond-spouse"]; statement.box3 = "250"; original.usSavingsBondInterest = "250";
  return input;
}
