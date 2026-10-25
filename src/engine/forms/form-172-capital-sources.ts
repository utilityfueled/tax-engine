/** Actual ordinary capital classification. Spec: form-172-capital-origin.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { ScheduleDResult } from "@/engine/schedules/schedule-d.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { calculateSection1202Sources } from "./section-1202-sources.js";
import { calculateScheduleDSpecialGains } from "@/engine/schedules/schedule-d-special-gains.js";

export interface Form172CapitalSourcesResult {
  sourceFactsVerified: boolean;
  nonbusinessCapitalGains: Decimal;
  nonbusinessCapitalLosses: Decimal;
  netShortTerm: Decimal;
  netLongTerm: Decimal;
  netCapitalGainLoss: Decimal;
  capitalGainLoss: Decimal;
  section1202Exclusion: Decimal;
  section1202AmtPreference: Decimal;
  lines: CalculatedLine[];
}

function actual(value: string | undefined, label: string, signed = false): Decimal {
  if (value === undefined) throw new Error(`Form172 capital requires actual ${label}, including known zero`);
  const amount = d(value);
  if (!amount.isFinite() || (!signed && amount.lt(0))) throw new Error(`Form172 capital ${label} must be finite with its actual permitted sign`);
  return amount;
}
function matches(value: string | undefined, original: string | undefined, label: string): Decimal {
  const amount = actual(value, label, true);
  if (!amount.eq(actual(original, `original ${label}`, true))) throw new Error(`Form172 capital ${label} does not reconcile with its original source`);
  return amount;
}

export function calculateForm172CapitalSources(input: TaxYearInput, scheduleD?: ScheduleDResult): Form172CapitalSourcesResult {
  const facts = input.form172?.capitalSources, year = input.taxpayer.taxYear;
  const sourceTransactions = input.form1099B.flatMap((statement, index) => statement.transactions.map((transaction, row) => ({
    id: `form1099B:${index}:transaction:${row}`, statement, transaction,
  })));
  const priorValues = [input.priorYear?.shortTermCapitalLoss, input.priorYear?.longTermCapitalLoss, input.priorYear?.capitalLossCarryforward];
  const hasCapital = sourceTransactions.length > 0 || priorValues.some(value => !d(value).isZero())
    || input.form1099Div.some(form => [form.totalCapitalGainDistributions, form.section1202Gain, form.section1250Gain, form.collectiblesGain].some(value => !d(value).isZero()));
  if (input.form1099DA.length
    || sourceTransactions.some(row => row.transaction.digitalAsset || ("sourceDocumentType" in row.transaction
      && row.transaction.sourceDocumentType !== undefined && row.transaction.sourceDocumentType !== "1099-b"))
    || input.scheduleDSpecialGainSources?.longTermAssets.some(row => !["ordinary", "qsbs"].includes(row.character))
    || input.form1099Div.some(form => [form.section1250Gain, form.collectiblesGain].some(value => !d(value).isZero()))) {
    throw new Error("Form172 capital special-character and digital-asset sources require their separate origin method");
  }
  if (!input.section1202Sources && input.form1099Div.some(form => d(form.section1202Gain).gt(0))) {
    throw new Error("Form172 capital special-character section1202 requires actual issuer, acquisition and ownership sources");
  }
  const qsbs = calculateSection1202Sources(input);
  const qsbsIds = new Set(qsbs?.bindings.map(row => row.originalSourceId));
  const section1202Exclusion = qsbs?.exclusion ?? d("0"), section1202AmtPreference = qsbs?.amtPreference ?? d("0");
  for (const asset of input.scheduleDSpecialGainSources?.longTermAssets ?? []) {
    if ((asset.character === "qsbs") !== qsbsIds.has(asset.sourceId)) throw new Error("Form172 capital QSBS character conflicts with its actual issuer source");
  }
  const audit = new AuditTrail();
  let gains = d("0"), losses = d("0"), shortTerm = d("0"), longTerm = d("0");
  let longTermCarry = d("0");
  if (facts || hasCapital) {
    if (!facts || facts.sourceTaxYear !== year || !facts.sourceReference?.trim() || facts.sourceFactsConfirmed !== true
      || facts.allCapitalSourcesIncluded !== true || !Array.isArray(facts.transactions) || !Array.isArray(facts.distributions)) {
      throw new Error("Form172 capital requires complete actual year, original source references and classifications");
    }
    const alternative = facts.alternativeTax;
    if (!alternative?.sourceReference?.trim() || alternative.sourceFactsConfirmed !== true
      || alternative.currentBasisAndAdjustmentsSameConfirmed !== true || alternative.priorCapitalLossesSameConfirmed !== true) {
      throw new Error("Form172 capital requires the independent actual alternative basis, adjustment and carry comparison");
    }
    const owner = (source: "primary" | "spouse" | undefined, original: "primary" | "spouse" | undefined): void => {
      if (!source || source !== original || (source === "spouse" && (!input.taxpayer.spouse || input.taxpayer.filingStatus !== "married_filing_jointly"))) {
        throw new Error("Form172 capital source owner must match the actual original statement and return");
      }
    };
    const statementIds = input.form1099B.filter(form => form.transactions.length).map(form => form.sourceId?.trim());
    if (statementIds.some(id => !id) || new Set(statementIds).size !== statementIds.length) throw new Error("Form172 capital requires unique actual original statement identities");
    const rows = new Map(facts.transactions.map(row => [row.sourceId, row]));
    if (rows.size !== facts.transactions.length || rows.size !== sourceTransactions.length) throw new Error("Form172 capital transaction list is incomplete or duplicated");
    for (const { id, statement, transaction } of sourceTransactions) {
      const row = rows.get(id), snapshot = row?.transaction;
      if (!row || !snapshot || row.sourceTaxYear !== year || statement.taxYear !== year || !row.sourceReference?.trim()
        || row.statementSourceId?.trim() !== statement.sourceId?.trim() || !row.payerName?.trim()
        || row.payerName.trim() !== statement.broker.trim() || (row.accountReference ?? "").trim() !== (statement.accountReference ?? "").trim()) {
        throw new Error("Form172 capital transaction must bind its actual original identity, year and source record");
      }
      owner(row.accountHolder, statement.accountHolder);
      const character = qsbsIds.has(id) ? "section1202" : "ordinary_investment";
      if (row.nonbusinessInvestmentConfirmed !== true || row.capitalCharacter !== character) throw new Error("Form172 capital requires the actual nonbusiness investment and QSBS source classification");
      for (const key of ["description", "dateAcquired", "dateSold", "holdingPeriod"] as const) {
        if (!snapshot[key]?.trim() || snapshot[key] !== transaction[key]) throw new Error(`Form172 capital original ${key} does not reconcile`);
      }
      const sold = snapshot.dateSold;
      if (!sold || !/^\d{4}-\d{2}-\d{2}$/.test(sold) || sold.slice(0, 4) !== String(year)
        || !Number.isFinite(Date.parse(`${sold}T00:00:00Z`)) || new Date(`${sold}T00:00:00Z`).toISOString().slice(0, 10) !== sold) {
        throw new Error("Form172 capital disposition requires its actual current-year sale date");
      }
      for (const key of ["basisReportedToIRS", "washSale", "digitalAsset"] as const) {
        if (typeof snapshot[key] !== "boolean" || snapshot[key] !== transaction[key]) throw new Error(`Form172 capital original ${key} is unknown or contradictory`);
      }
      const proceeds = matches(snapshot.proceeds, transaction.proceeds, "proceeds"), basis = matches(snapshot.costBasis, transaction.costBasis, "basis");
      const adjustment = matches(snapshot.adjustments, transaction.adjustments, "adjustments");
      const wash = matches(snapshot.washSaleDisallowed, transaction.washSaleDisallowed, "wash-sale amount");
      if (proceeds.lt(0) || basis.lt(0) || wash.lt(0) || !adjustment.isZero() || snapshot.digitalAsset
        || (!snapshot.washSale && !wash.isZero()) || wash.gt(zeroFloor(basis.minus(proceeds)))) {
        throw new Error("Form172 capital requires ordinary investment amounts and a reconciled wash loss; other adjustments need their separate method");
      }
      const net = proceeds.minus(basis).plus(wash);
      gains = gains.plus(zeroFloor(net)); losses = losses.plus(zeroFloor(net.negated()));
      if (snapshot.holdingPeriod === "short") shortTerm = shortTerm.plus(net); else longTerm = longTerm.plus(net);
      audit.record("Current Form172 capital sources", id, "Classified investment disposition before exclusion", net,
        "Original proceeds minus original basis plus actual disallowed wash loss once", { Proceeds: proceeds, Basis: basis, "Wash loss disallowed": wash });
    }
    const distributions = new Map(facts.distributions.map(row => [row.sourceId, row]));
    if (distributions.size !== facts.distributions.length || distributions.size !== input.form1099Div.length) throw new Error("Form172 capital distribution list is incomplete or duplicated");
    for (const [index, statement] of input.form1099Div.entries()) {
      const id = `form1099Div:${index}`, row = distributions.get(id);
      if (!row || row.sourceTaxYear !== year || !row.sourceReference?.trim() || !row.payerName?.trim()
        || row.payerName.trim() !== statement.payer.trim() || (row.accountReference ?? "").trim() !== (statement.accountReference ?? "").trim()
        || row.nonbusinessInvestmentConfirmed !== true) throw new Error("Form172 capital distribution requires actual source identity, year and investment classification");
      owner(row.accountHolder, statement.accountHolder);
      const net = matches(row.totalCapitalGainDistributions, statement.totalCapitalGainDistributions, "capital distribution");
      if (net.lt(0)) throw new Error("Form172 capital distribution must be nonnegative");
      matches(row.section1202Gain, statement.section1202Gain, "section1202Gain");
      for (const key of ["section1250Gain", "collectiblesGain"] as const) {
        if (!matches(row[key], statement[key], key).isZero()) throw new Error("Form172 capital distribution requires its separate special-character origin method");
      }
      gains = gains.plus(net); longTerm = longTerm.plus(net);
      audit.record("Current Form172 capital sources", id, "Investment capital distribution before exclusion", net, "Actual original Box2a; any Box2c exclusion is bound separately to its issuer and lot history");
    }
    const prior = facts.priorCapitalLosses;
    if (!prior || prior.sourceTaxYear !== year - 1 || !prior.sourceReference?.trim() || prior.sourceFactsConfirmed !== true
      || prior.allCarryoversIncluded !== true || prior.sameReturnMembershipConfirmed !== true || prior.nonbusinessInvestmentConfirmed !== true) {
      throw new Error("Form172 capital requires actual filed prior investment carry and continuing-return classification, including known zero");
    }
    const st = matches(prior.shortTermCapitalLoss, input.priorYear?.shortTermCapitalLoss ?? "0", "prior short-term carry");
    const lt = matches(prior.longTermCapitalLoss, input.priorYear?.longTermCapitalLoss ?? "0", "prior long-term carry");
    if (st.gt(0) || lt.gt(0) || !st.isInteger() || !lt.isInteger() || !d(input.priorYear?.capitalLossCarryforward).isZero()) {
      throw new Error("Form172 capital prior carry requires actual signed filed short/long losses; the unclassified aggregate is not a source");
    }
    losses = losses.minus(st).minus(lt); shortTerm = shortTerm.plus(st); longTerm = longTerm.plus(lt);
    longTermCarry = lt;
    audit.record("Current Form172 capital sources", "prior-short", "Actual nonbusiness prior short-term loss", st, "Actual filed same-return regular/AMT investment carry");
    audit.record("Current Form172 capital sources", "prior-long", "Actual nonbusiness prior long-term loss", lt, "Actual filed same-return regular/AMT investment carry");
    audit.record("Current Form172 capital sources", "gains", "Nonbusiness capital gains", gains, "Sum actual positive disposition amounts and ordinary distributions before netting");
    audit.record("Current Form172 capital sources", "losses", "Nonbusiness capital losses", losses, "Sum actual negative disposition magnitudes and filed classified prior loss carry");
  }
  longTerm = longTerm.minus(section1202Exclusion);
  const net = shortTerm.plus(longTerm);
  if (!gains.minus(losses).minus(section1202Exclusion).eq(net)) throw new Error("Form172 capital gross classification does not conserve its net");
  if (section1202Exclusion.gt(0) && net.lt(0)) {
    throw new Error("Form172 positive section1202 with a negative capital net requires its unresolved lines16-21 source convention");
  }
  const zero = d("0");
  const special = calculateScheduleDSpecialGains({ form8949CollectiblesGainLoss: zero,
    section1202WorksheetComponent: qsbs?.section1202WorksheetComponent ?? zero,
    otherCollectiblesGainLoss: zero, reportedCollectiblesGainLoss: zero, shortTermNetGainLoss: shortTerm,
    longTermLossCarryover: longTermCarry, form4797Gain: zero, form4797Lookback: zero, businessProperties: [],
    businessInstallment1250Gain: zero, passThrough1250Gain: zero, partnershipSale1250Gain: zero, reported1250Gain: zero, other1250Gain: zero });
  if (qsbs) {
    audit.record("Current Form172 capital sources", "section1202-exclusion", "Actual source section1202 exclusion", section1202Exclusion,
      "Original issuer and lot calculation, restored once in each independent origin");
    audit.record("Current Form172 capital sources", "section1202-preference", "Actual source section1202 AMT preference", section1202AmtPreference,
      "Original pre2010 exclusion preference before Form6251 reporting rounding");
  }
  if (input.scheduleDSpecialGainSources && input.scheduleDSpecialGainSources.amtBasisAndCarryoversSameAsRegularConfirmed !== true) {
    throw new Error("Form172 capital same-treatment method conflicts with the separate alternative Schedule D sources");
  }
  // A separately supplied PartIII rate worksheet cannot contradict the capital
  // packet's actual same-treatment comparison. These are its reported amounts,
  // not replacement transaction basis or an independently inferred AMT ledger.
  if (input.amtCapitalGains) {
    const alternative = input.amtCapitalGains;
    if (alternative.sourceTaxYear !== year || !alternative.sourceReference?.trim() || alternative.sourceFactsConfirmed !== true) {
      throw new Error("Form172 capital requires confirmed original alternative capital worksheet sources");
    }
    const expected = { qualifiedDividends: sum(...input.form1099Div.map(row => d(row.qualifiedDividends))),
      netCapitalGain: Decimal.min(zeroFloor(longTerm), zeroFloor(net)), section1250Gain: zero, collectiblesGain: special.collectiblesGain };
    for (const key of ["qualifiedDividends", "netCapitalGain", "section1250Gain", "collectiblesGain"] as const) {
      if (!roundDollar(actual(alternative[key], `alternative ${key}`)).eq(roundDollar(expected[key]))) {
        throw new Error("Form172 capital actual alternative worksheet conflicts with the same-treatment source comparison");
      }
    }
  }
  const transfer = Decimal.max(net, d(input.taxpayer.filingStatus === "married_filing_separately" ? "-1500" : "-3000"));
  if (scheduleD && (!scheduleD.netShortTerm.eq(shortTerm) || !scheduleD.netLongTerm.eq(longTerm)
    || !scheduleD.netCapitalGainLoss.eq(net) || !scheduleD.capitalLossDeduction.eq(transfer)
    || !scheduleD.section1202Exclusion.eq(section1202Exclusion) || !scheduleD.section1202AmtPreference.eq(section1202AmtPreference))) {
    throw new Error("Form172 capital sources do not reconcile with the actual completed Schedule D net and transfer");
  }
  return { sourceFactsVerified: Boolean(facts), nonbusinessCapitalGains: gains, nonbusinessCapitalLosses: losses,
    netShortTerm: shortTerm, netLongTerm: longTerm, netCapitalGainLoss: net, capitalGainLoss: transfer,
    section1202Exclusion, section1202AmtPreference, lines: audit.getLines() };
}
