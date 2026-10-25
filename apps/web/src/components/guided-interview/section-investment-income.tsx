"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type BrokerageEntryData,
  type CapitalGainTransactionData,
  type DividendEntryData,
  type InterestEntryData,
  emptyBrokerageEntry,
  emptyCapitalGainTransaction,
  emptyDividendEntry,
  emptyInterestEntry,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { BooleanFact } from "./fact-fields";
import { DividendSourceDetails, InterestSourceDetails, InvestmentSourceIdentity } from "./investment-source-details";
import { OidSourceCards } from "./oid-source-details";
import type { OidEntryData } from "@/lib/guided-oid-facts";

// ── 1099-INT Card ─────────────────────────────────────────────────────────

function InterestCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: InterestEntryData;
  onUpdate: (field: keyof InterestEntryData, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <strong className="guided-w2-card-title">
          1099-INT #{index + 1}
          {entry.payer ? ` — ${entry.payer}` : ""}
        </strong>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove 1099-INT #${index + 1}${entry.payer ? ` — ${entry.payer}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Payer (bank or institution)</span>
        <input
          type="text"
          className="guided-input"
          value={entry.payer}
          onChange={(e) => onUpdate("payer", e.target.value)}
          placeholder="First National Bank"
        />
      </label>

      <div className="guided-form-grid">
        <CurrencyField
          label="Box 1 — Interest income"
          hint="Taxable interest earned this year."
          value={entry.interestIncome}
          onChange={(v) => onUpdate("interestIncome", v)}
        />
        <CurrencyField
          label="Box 4 — Federal tax withheld"
          hint="Enter the actual amount; a blank is unknown, not zero."
          value={entry.federalWithheld}
          onChange={(v) => onUpdate("federalWithheld", v)}
        />
      </div>
      <InterestSourceDetails data={entry} onChange={onUpdate} />
      <InvestmentSourceIdentity data={entry} onChange={patch => { for (const [field, value] of Object.entries(patch)) onUpdate(field as keyof InterestEntryData, value); }} />
    </div>
  );
}

// ── 1099-DIV Card ─────────────────────────────────────────────────────────

function DividendCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: DividendEntryData;
  onUpdate: (field: keyof DividendEntryData, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <strong className="guided-w2-card-title">
          1099-DIV #{index + 1}
          {entry.payer ? ` — ${entry.payer}` : ""}
        </strong>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove 1099-DIV #${index + 1}${entry.payer ? ` — ${entry.payer}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Payer (brokerage or fund)</span>
        <input
          type="text"
          className="guided-input"
          value={entry.payer}
          onChange={(e) => onUpdate("payer", e.target.value)}
          placeholder="Vanguard"
        />
      </label>

      <div className="guided-form-grid">
        <CurrencyField
          label="Box 1a — Ordinary dividends"
          hint="Total dividends received."
          value={entry.ordinaryDividends}
          onChange={(v) => onUpdate("ordinaryDividends", v)}
        />
        <CurrencyField
          label="Box 1b — Qualified dividends"
          hint="Taxed at lower capital gains rates."
          value={entry.qualifiedDividends}
          onChange={(v) => onUpdate("qualifiedDividends", v)}
        />
      </div>

      <div className="guided-form-grid">
        <CurrencyField
          label="Box 2a — Capital gain distributions"
          hint="Long-term gains from mutual funds."
          value={entry.capitalGainDistributions}
          onChange={(v) => onUpdate("capitalGainDistributions", v)}
        />
        <CurrencyField
          label="Box 4 — Federal tax withheld"
          value={entry.federalWithheld}
          onChange={(v) => onUpdate("federalWithheld", v)}
        />
      </div>

      <div className="guided-form-grid">
        <CurrencyField
          label="Box 5 — Section 199A dividends"
          hint="Qualified REIT dividends used for the QBI deduction."
          value={entry.section199ADividends}
          onChange={(v) => onUpdate("section199ADividends", v)}
        />
        <CurrencyField
          label="Box 7 — Foreign tax paid"
          hint="Used for the foreign tax credit or deduction."
          value={entry.foreignTaxPaid}
          onChange={(v) => onUpdate("foreignTaxPaid", v)}
        />
      </div>
      <DividendSourceDetails data={entry} onChange={onUpdate} />
      <InvestmentSourceIdentity data={entry} onChange={patch => { for (const [field, value] of Object.entries(patch)) onUpdate(field as keyof DividendEntryData, value); }} />
    </div>
  );
}

// ── 1099-B Transaction Row ────────────────────────────────────────────────

function TransactionRow({
  index,
  transaction,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  transaction: CapitalGainTransactionData;
  onUpdate: (field: keyof CapitalGainTransactionData, value: string | boolean | null) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-w2-card" style={{ padding: "12px" }}>
      <div className="guided-w2-card-header">
        <strong className="guided-w2-card-title">
          Transaction #{index + 1}
          {transaction.description ? ` — ${transaction.description}` : ""}
        </strong>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove transaction #${index + 1}${transaction.description ? ` — ${transaction.description}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Description of property</span>
        <input
          type="text"
          className="guided-input"
          value={transaction.description}
          onChange={(e) => onUpdate("description", e.target.value)}
          placeholder="100 shares AAPL"
        />
      </label>

      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">Date acquired</span>
          <input
            type="text"
            className="guided-input"
            value={transaction.dateAcquired}
            onChange={(e) => onUpdate("dateAcquired", e.target.value)}
            placeholder="2024-01-15 or VARIOUS"
          />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Date sold</span>
          <input
            type="text"
            className="guided-input"
            value={transaction.dateSold}
            onChange={(e) => onUpdate("dateSold", e.target.value)}
            placeholder="2025-03-20"
          />
        </label>
      </div>

      <div className="guided-form-grid">
        <CurrencyField
          label="Proceeds (sale price)"
          value={transaction.proceeds}
          onChange={(v) => onUpdate("proceeds", v)}
        />
        <CurrencyField
          label="Cost basis (purchase price)"
          value={transaction.costBasis}
          onChange={(v) => onUpdate("costBasis", v)}
        />
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Holding period</span>
        <select
          className="guided-input guided-input-narrow"
          value={transaction.holdingPeriod}
          onChange={(e) => onUpdate("holdingPeriod", e.target.value)}
        >
          <option value="">Confirm from source</option>
          <option value="short">Short-term (held 1 year or less)</option>
          <option value="long">Long-term (held more than 1 year)</option>
        </select>
        <span className="guided-field-hint">
          Long-term gains are taxed at lower rates.
        </span>
      </label>

      <div className="guided-form-grid">
        <BooleanFact label="Was the actual cost basis reported to the IRS?" value={transaction.basisReportedToIRS} onChange={value => onUpdate("basisReportedToIRS", value)} />
        <BooleanFact label="Was this a digital-asset or crypto sale?" value={transaction.digitalAsset} onChange={value => onUpdate("digitalAsset", value)} />
        <BooleanFact label="Was a wash-sale loss disallowed?" value={transaction.washSale} onChange={value => onUpdate("washSale", value)} />
        <CurrencyField label="Actual wash-sale loss disallowed" value={transaction.washSaleDisallowed ?? ""} onChange={value => onUpdate("washSaleDisallowed", value)} />
        <CurrencyField allowNegative label="Other Form 8949 adjustment amount" hint="Exclude the wash-sale amount above. Nonzero other adjustments need codes and a supporting worksheet that this guided path does not yet support." value={transaction.adjustments ?? ""} onChange={value => onUpdate("adjustments", value)} />
      </div>
      <BooleanFact label="Have you checked these sale classifications against the actual source records?" value={transaction.sourceClassificationConfirmed} onChange={value => onUpdate("sourceClassificationConfirmed", value)} />

    </div>
  );
}

// ── 1099-B Brokerage Card ─────────────────────────────────────────────────

function BrokerageCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: BrokerageEntryData;
  onUpdate: (next: BrokerageEntryData) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const transactions = entry.transactions.length > 0 ? entry.transactions : [emptyCapitalGainTransaction];

  function updateTransaction(
    tIndex: number,
    field: keyof CapitalGainTransactionData,
    value: string | boolean | null,
  ) {
    const next = transactions.map((t, i) =>
      i === tIndex ? { ...t, [field]: value, ...(field === "sourceClassificationConfirmed" ? {} : { sourceClassificationConfirmed: null }) } : t
    );
    onUpdate({ ...entry, transactions: next });
  }

  function addTransaction() {
    onUpdate({ ...entry, transactions: [...transactions, emptyCapitalGainTransaction] });
  }

  function removeTransaction(tIndex: number) {
    const next = transactions.filter((_, i) => i !== tIndex);
    onUpdate({ ...entry, transactions: next.length > 0 ? next : [emptyCapitalGainTransaction] });
  }

  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <strong className="guided-w2-card-title">
          1099-B #{index + 1}
          {entry.broker ? ` — ${entry.broker}` : ""}
        </strong>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove 1099-B #${index + 1}${entry.broker ? ` — ${entry.broker}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Broker name</span>
        <input
          type="text"
          className="guided-input"
          value={entry.broker}
          onChange={(e) => onUpdate({ ...entry, broker: e.target.value })}
          placeholder="Fidelity, Schwab, etc."
        />
      </label>

      <InvestmentSourceIdentity data={entry} onChange={patch => onUpdate({ ...entry, ...patch })} />
      <CurrencyField label="Box 4 broker federal income tax withheld" value={entry.federalWithheld ?? ""} onChange={federalWithheld => onUpdate({ ...entry, federalWithheld })} hint="Enter the actual amount, including zero. Positive broker withholding needs payment routing that this guided path does not yet support." />

      <div className="guided-w2-stack" style={{ marginTop: "8px" }}>
        {transactions.map((t, tIndex) => (
          <TransactionRow
            key={tIndex}
            index={tIndex}
            transaction={t}
            onUpdate={(field, value) => updateTransaction(tIndex, field, value)}
            onRemove={() => removeTransaction(tIndex)}
            removable={transactions.length > 1}
          />
        ))}
      </div>

      <button
        type="button"
        className="utility-button utility-button-small"
        onClick={addTransaction}
        style={{ marginTop: "8px" }}
      >
        + Add another transaction
      </button>
    </div>
  );
}

// ── Main Section Component ────────────────────────────────────────────────

export function SectionInvestmentIncome({
  interestEntries,
  dividendEntries,
  brokerageEntries,
  onInterestEntriesChange,
  onDividendEntriesChange,
  onBrokerageEntriesChange,
  oidEntries,
  stateCode,
  onOidEntriesChange,
}: {
  interestEntries: InterestEntryData[];
  dividendEntries: DividendEntryData[];
  brokerageEntries: BrokerageEntryData[];
  onInterestEntriesChange: (entries: InterestEntryData[]) => void;
  onDividendEntriesChange: (entries: DividendEntryData[]) => void;
  onBrokerageEntriesChange: (entries: BrokerageEntryData[]) => void;
  oidEntries?: OidEntryData[];
  stateCode?: string | null;
  onOidEntriesChange?: (entries: OidEntryData[]) => void;
}) {
  const currentInterest = interestEntries.length > 0 ? interestEntries : [emptyInterestEntry];
  const currentDividends = dividendEntries.length > 0 ? dividendEntries : [emptyDividendEntry];
  const currentBrokerage = brokerageEntries.length > 0 ? brokerageEntries : [emptyBrokerageEntry];

  // ── Interest helpers ──
  function updateInterest(index: number, field: keyof InterestEntryData, value: string) {
    const next = currentInterest.map((e, i) => (i === index ? { ...e, [field]: value } : e));
    onInterestEntriesChange(next);
  }
  function addInterest() {
    onInterestEntriesChange([...currentInterest, emptyInterestEntry]);
  }
  function removeInterest(index: number) {
    const next = currentInterest.filter((_, i) => i !== index);
    onInterestEntriesChange(next.length > 0 ? next : [emptyInterestEntry]);
  }

  // ── Dividend helpers ──
  function updateDividend(index: number, field: keyof DividendEntryData, value: string) {
    const next = currentDividends.map((e, i) => (i === index ? { ...e, [field]: value } : e));
    onDividendEntriesChange(next);
  }
  function addDividend() {
    onDividendEntriesChange([...currentDividends, emptyDividendEntry]);
  }
  function removeDividend(index: number) {
    const next = currentDividends.filter((_, i) => i !== index);
    onDividendEntriesChange(next.length > 0 ? next : [emptyDividendEntry]);
  }

  // ── Brokerage helpers ──
  function updateBrokerage(index: number, next: BrokerageEntryData) {
    const updated = currentBrokerage.map((e, i) => (i === index ? next : e));
    onBrokerageEntriesChange(updated);
  }
  function addBrokerage() {
    onBrokerageEntriesChange([...currentBrokerage, emptyBrokerageEntry]);
  }
  function removeBrokerage(index: number) {
    const next = currentBrokerage.filter((_, i) => i !== index);
    onBrokerageEntriesChange(next.length > 0 ? next : [emptyBrokerageEntry]);
  }

  return (
    <RetroShell title="Investment Income" eyebrow="INCOME">
      <div className="guided-question">
        <p className="guided-prompt">Let&apos;s capture your investment income.</p>
        <p className="guided-hint">
          Enter info from your 1099-INT (interest), 1099-DIV (dividends),
          1099-OID (original issue discount) and 1099-B (stock sales). If you don&apos;t have one of these, leave it blank
          and we&apos;ll skip it.
        </p>

        {/* ── 1099-INT: Interest ── */}
        <h3 className="guided-w2-card-title" style={{ marginTop: "20px", marginBottom: "8px" }}>
          Interest Income (1099-INT)
        </h3>
        <div className="guided-w2-stack">
          {currentInterest.map((entry, index) => (
            <InterestCard
              key={index}
              index={index}
              entry={entry}
              onUpdate={(field, value) => updateInterest(index, field, value)}
              onRemove={() => removeInterest(index)}
              removable={currentInterest.length > 1}
            />
          ))}
        </div>
        <button type="button" className="utility-button" onClick={addInterest}>
          + Add another 1099-INT
        </button>

        {onOidEntriesChange && <OidSourceCards entries={oidEntries} stateCode={stateCode} onChange={onOidEntriesChange} />}

        {/* ── 1099-DIV: Dividends ── */}
        <h3 className="guided-w2-card-title" style={{ marginTop: "24px", marginBottom: "8px" }}>
          Dividends (1099-DIV)
        </h3>
        <div className="guided-w2-stack">
          {currentDividends.map((entry, index) => (
            <DividendCard
              key={index}
              index={index}
              entry={entry}
              onUpdate={(field, value) => updateDividend(index, field, value)}
              onRemove={() => removeDividend(index)}
              removable={currentDividends.length > 1}
            />
          ))}
        </div>
        <button type="button" className="utility-button" onClick={addDividend}>
          + Add another 1099-DIV
        </button>

        {/* ── 1099-B: Stock Sales ── */}
        <details className="guided-expand" style={{ marginTop: "24px" }}>
          <summary className="guided-expand-trigger">Stock &amp; Asset Sales (1099-B)</summary>
          <div className="guided-expand-body">
            <p className="guided-hint">
              Enter each brokerage&apos;s 1099-B and the individual transactions.
              Use actual acquisition and sale dates. A source may identify multiple
              acquisition dates as VARIOUS; do not invent dates for summary totals.
            </p>
            <div className="guided-w2-stack">
              {currentBrokerage.map((entry, index) => (
                <BrokerageCard
                  key={index}
                  index={index}
                  entry={entry}
                  onUpdate={(next) => updateBrokerage(index, next)}
                  onRemove={() => removeBrokerage(index)}
                  removable={currentBrokerage.length > 1}
                />
              ))}
            </div>
            <button type="button" className="utility-button" onClick={addBrokerage}>
              + Add another 1099-B
            </button>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
