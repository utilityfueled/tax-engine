import { charitableNolInput } from "./charitable-nol.js";

export function alternativeCharitableNolInput(year = 2025, regularLoss = false) {
  const input = charitableNolInput("100000", "60000", year);
  const facts = input.netOperatingLoss;
  const vintage = facts?.vintages?.[0];
  if (!facts?.alternativeTax || !vintage || !input.priorYear) throw new Error("Missing synthetic independent loss sources");
  facts.alternativeTax.vintages = [{ ...vintage, sourceId: "independent-amt2021", section1411OriginalLoss: undefined }];
  Object.assign(facts.alternativeTax, { charitableCarryoverHistory: {
    sourceTaxYear: year - 1, sourceReference: "Actual separate regular and AMT charity histories",
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [],
  } });
  if (!regularLoss) { facts.vintages = []; input.priorYear.shortTermCapitalLoss = "-3000"; }
  input.deductionElection = "itemized";
  return input;
}
