/** Original statement reconciliation; spec/federal/savings-bond-reissue-return.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculateSavingsBondReissueSources, type BondSourceRatio, type SavingsBondReissueInput } from "./savings-bond-reissue-sources.js";
import { roundEducationSourceAmounts } from "@/utils/annual-cash-qtp.js";

export function calculateSavingsBondStatementSources(input: Pick<TaxYearInput, "form1099Int" | "savingsBondRedemptions" | "form8815"> & { taxpayer: SavingsBondReissueInput["taxpayer"] }) {
  const history = calculateSavingsBondReissueSources({ taxpayer: input.taxpayer,
    redemptions: input.savingsBondRedemptions ?? [], sources: input.form8815?.reissueSources });
  if (!history) return undefined;
  const packet = input.form8815?.reissueSources, statements = packet?.statements;
  if (input.form8815?.sourceFactsConfirmed !== true || input.form8815.currentStatementReconciliationConfirmed !== true
    || !Array.isArray(statements) || statements.length === 0)
    throw new Error("Actual bond reissue statements and current original reconciliation must be complete and confirmed.");
  const numbers: Decimal[] = [];
  const scan = (value: unknown): void => {
    if (Decimal.isDecimal(value)) numbers.push(value);
    else if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) numbers.push(new Decimal(value));
    else if (value && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan([input.form1099Int, input.form8815, input.savingsBondRedemptions, history]);
  const digits = Math.max(1, ...numbers.map(value => value.precision(true) + value.decimalPlaces()));
  const D = Decimal.clone({ precision: Math.max(80, digits * (4 * numbers.length + 4)) });
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Actual bond statement ${label} is missing or invalid.`);
    const parsed = new D(value);
    if (!parsed.isFinite()) throw new Error(`Actual bond statement ${label} is not finite.`);
    return parsed;
  };
  const text = (value: string | undefined): string => {
    if (!value?.trim()) throw new Error("Actual bond statement source identity is missing.");
    return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  };
  const asRatio = (value: Decimal.Value): BondSourceRatio => ({ numerator: new D(value), denominator: new D(1) });
  const add = (a: BondSourceRatio, b: BondSourceRatio): BondSourceRatio => ({
    numerator: new D(a.numerator).times(b.denominator).plus(new D(b.numerator).times(a.denominator)),
    denominator: new D(a.denominator).times(b.denominator),
  });
  const round = (ratios: BondSourceRatio[]) => roundEducationSourceAmounts(ratios.map(ratio => ({ amount: new Decimal(0), ...ratio })));
  const sourceIds = new Set<string>(), originalIndexes = new Set<number>(), originalAccounts = new Set<string>();
  const redemptionIds = new Set<string>(), transferIds = new Set<string>();
  const expectedTransfers = new Map<string, BondSourceRatio>();
  for (const group of history.groups) {
    const original = packet?.groups?.find(row => row.sourceId === group.sourceId);
    if (!original?.reissueDate?.startsWith(`${input.taxpayer.taxYear}-`)) continue;
    for (const owner of ["primary", "spouse"] as const) {
      const ratio = group.recognizedAtReissue[owner];
      if (ratio.numerator.gt(0)) expectedTransfers.set(`${text(group.sourceId)}:${owner}`, ratio);
    }
  }
  let includedPrior = new D(0);
  for (const statement of statements) {
    const sourceId = text(statement.sourceId);
    text(statement.sourceReference);
    if (sourceIds.has(sourceId)) throw new Error("Actual bond statement source ID is duplicated.");
    sourceIds.add(sourceId);
    const index = statement.originalIndex;
    if (index === undefined || !Number.isInteger(index) || index < 0 || originalIndexes.has(index)) throw new Error("Actual bond statement index is missing or duplicated.");
    const original = input.form1099Int[index];
    if (!original || statement.accountHolder === undefined || original.accountHolder !== statement.accountHolder
      || text(original.payer) !== text(statement.payer) || text(original.accountReference) !== text(statement.accountReference)
      || !amount(original.usSavingsBondInterest, "original Box 3").eq(amount(statement.box3, "copied Box 3")))
      throw new Error("Actual bond statement copied original account, owner, payer or Box 3 is stale.");
    const originalAccount = `${text(original.payer)}:${text(original.accountReference)}:${original.accountHolder}`;
    if (originalAccounts.has(originalAccount)) throw new Error("Actual bond statement original account is duplicated.");
    originalIndexes.add(index); originalAccounts.add(originalAccount);
    if (!Array.isArray(statement.redemptionSourceIds) || !Array.isArray(statement.currentTransfers))
      throw new Error("Actual bond statement requires known redemption and current-transfer source lists, including actual empty lists.");
    let availablePrior = asRatio(0);
    const components: BondSourceRatio[] = [];
    for (const id of statement.redemptionSourceIds) {
      const key = text(id), row = history.redemptions.find(value => text(value.sourceId) === key);
      if (!row || redemptionIds.has(key)) throw new Error("Actual bond statement redemption source is missing or duplicated.");
      redemptionIds.add(key); components.push(row.redemptionInterest);
      availablePrior = add(availablePrior, row.previouslyRecognizedInterest);
    }
    for (const transfer of statement.currentTransfers) {
      const key = `${text(transfer.groupSourceId)}:${transfer.owner}`, ratio = expectedTransfers.get(key);
      if (!ratio || transferIds.has(key)) throw new Error("Actual bond statement current transfer source is missing, historical or duplicated.");
      transferIds.add(key); components.push(ratio);
    }
    const prior = amount(statement.priorRecognizedInterestIncluded, "previously recognized interest included");
    if (prior.times(availablePrior.denominator).gt(availablePrior.numerator))
      throw new Error("Actual statement prior-interest inclusion exceeds its linked original history.");
    includedPrior = includedPrior.plus(prior);
    components.push(asRatio(prior), asRatio(amount(statement.otherBox3Interest, "other Box 3 interest")));
    // The information return retains original cents. Compare the exact source
    // equation at the whole-dollar reporting boundary, never allocate pennies.
    if (!round(components).eq(round([asRatio(amount(statement.box3, "Box 3"))])))
      throw new Error("Actual bond statement Box 3 does not reconcile to its complete original interest sources.");
  }
  if (redemptionIds.size !== history.redemptions.length || transferIds.size !== expectedTransfers.size)
    throw new Error("Actual current transfer and redemption sources must each appear exactly once in complete original statements.");
  const adjustment = amount(input.form8815.priorYearInterestIncludedInCurrentStatements, "return prior-interest inclusion");
  const otherPrior = (input.savingsBondRedemptions ?? []).filter(row => row.reissueSourceId === undefined)
    .reduce((total, row) => total.plus(amount(row.priorYearInterestReported, "other redemption prior interest")), new D(0));
  if (adjustment.lt(includedPrior) || adjustment.minus(includedPrior).gt(otherPrior))
    throw new Error("Actual statement prior-interest inclusion does not reconcile to the return adjustment.");
  return history;
}
