/** Complete fictional return originals, with no manufactured current allowance. */
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";
import { savingsBondReissueInput } from "./savings-bond-reissue.js";

export function savingsBondReissueReturnInput(currentReissue = false) {
  const original = savingsBondReissueInput(), first = original.sources.groups[0];
  if (!first) throw new Error("Missing fictional history");
  Object.assign(first, { taxpayerPurchaseFunds: "500", spousePurchaseFunds: "0", reissueDate: currentReissue ? "2025-06-01" : "2024-06-01" });
  const base = structuredClone(simpleW2Fixture), w2 = base.w2s[0];
  if (!w2) throw new Error("Missing fictional W2");
  return TaxYearInputSchema.parse({
    ...base, taxpayer: { ...base.taxpayer, ...original.taxpayer },
    w2s: [{ ...w2, wages: "80000", federalWithheld: "10000" }],
    form1099Int: [{ payer: "Fictional Treasury original", accountReference: "FICTIONAL-BOND-ACCOUNT", accountHolder: "primary",
      interestIncome: "0", usSavingsBondInterest: "500" }],
    savingsBondRedemptions: original.redemptions,
    form8815: {
      sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true,
      priorYearInterestIncludedInCurrentStatements: currentReissue ? "0" : "100",
      americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
      reissueSources: { ...original.sources, statements: [{
        sourceId: "statement-a", sourceReference: "Fictional original Box3 and transaction detail", originalIndex: 0,
        payer: "Fictional Treasury original", accountReference: "FICTIONAL-BOND-ACCOUNT", accountHolder: "primary", box3: "500",
        priorRecognizedInterestIncluded: currentReissue ? "0" : "100", otherBox3Interest: "0",
        redemptionSourceIds: ["bond-primary", "bond-spouse"],
        currentTransfers: currentReissue ? [{ groupSourceId: "original-joint", owner: "primary" }] : [],
      }] },
      educationExpenses: [{ sourceId: "tuition", beneficiaryName: "Morgan Fixture", beneficiaryTaxId: "900-70-3101",
        relationship: "taxpayer", institutionName: "Fictional College", institutionAddress: "1 Example Lane",
        expenseType: "tuition_and_required_fees", paidTaxYear: 2025, amountPaid: "5000",
        qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0",
        taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }],
    },
  });
}

/** Two complete original groups; cents remain actual source amounts. */
export function savingsBondReissueCentsInput(transfers = false) {
  const input = savingsBondReissueReturnInput(true), packet = input.form8815?.reissueSources;
  const group = packet?.groups?.[0], statement = packet?.statements?.[0], original = input.form1099Int[0];
  if (!packet || !group || !statement || !original || !input.savingsBondRedemptions) throw new Error("Missing fictional originals");
  Object.assign(group, { taxpayerPurchaseFunds: transfers ? "500" : "250", spousePurchaseFunds: transfers ? "0" : "250", valueAtReissue: transfers ? "501" : "500" });
  for (const row of input.savingsBondRedemptions) row.proceeds = transfers ? "250.5" : "250.245";
  original.usSavingsBondInterest = transfers ? "1" : "0.49";
  statement.box3 = original.usSavingsBondInterest;
  if (!transfers) statement.currentTransfers = [];
  const second = structuredClone(group), secondStatement = structuredClone(statement);
  second.sourceId = "original-joint-2"; second.originalBondIdentifier = "EE-FICTIONAL-ORIGINAL-2";
  second.successors = second.successors?.map(row => ({ ...row, sourceId: `${row.sourceId}-2`, bondIdentifier: `${row.bondIdentifier}-2`, redemptionSourceId: `${row.redemptionSourceId}-2` }));
  const secondRedemptions = input.savingsBondRedemptions.map(row => ({ ...row, sourceId: `${row.sourceId}-2`, reissueSourceId: `${row.reissueSourceId}-2`, bondIdentifier: `${row.bondIdentifier}-2` }));
  secondStatement.sourceId = "statement-b"; secondStatement.originalIndex = 1; secondStatement.accountReference = "FICTIONAL-BOND-ACCOUNT-2";
  secondStatement.redemptionSourceIds = secondRedemptions.map(row => row.sourceId);
  secondStatement.currentTransfers = transfers ? [{ groupSourceId: second.sourceId, owner: "primary" }] : [];
  packet.groups = [group, second]; packet.statements = [statement, secondStatement];
  input.savingsBondRedemptions.push(...secondRedemptions);
  input.form1099Int.push({ ...original, accountReference: "FICTIONAL-BOND-ACCOUNT-2" });
  return input;
}

/** Actual fictional originals at the current transfer/redemption rounding boundary. */
export function savingsBondReissueHalfDollarInput(amount: "0.49" | "0.50" | "0.51" = "0.50") {
  const input = savingsBondReissueReturnInput(true), group = input.form8815?.reissueSources?.groups?.[0];
  const statement = input.form8815?.reissueSources?.statements?.[0], original = input.form1099Int[0];
  if (!group || !statement || !original) throw new Error("Missing fictional original bond records");
  const actual = amount === "0.49" ? ["500.98", "250.49", "0.98"] as const : amount === "0.51" ? ["501.02", "250.51", "1.02"] as const : ["501", "250.50", "1"] as const;
  group.valueAtReissue = actual[0];
  for (const redemption of input.savingsBondRedemptions ?? []) redemption.proceeds = actual[1];
  statement.box3 = actual[2]; original.usSavingsBondInterest = actual[2];
  return input;
}
