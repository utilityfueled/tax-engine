"use client";

import Decimal from "decimal.js";
import { formatGuidedCurrency, parseGuidedDisplayAmount, sumGuidedDisplayAmounts } from "@/lib/guided-currency";

import { RetroShell } from "@/components/retro-shell";
import type { GuidedPreviewMetrics } from "@/lib/guided-interview-bridge";
import {
  type AdjustmentData,
  type CreditsData,
  type DeductionData,
  type GuidedFlowState,
  type InterviewSectionId,
  type VisitedSectionStatus,
  type OtherTaxesData,
  type PaymentData,
  type PersonalInfoData,
  type RentalPropertyEntryData,
  type RetirementEntryData,
  type ScheduleCBankStatementAnalysis,
  type ScheduleCExpenseData,
  type SocialSecurityData,
  type StateReturnData,
  type UnemploymentData,
  type W2EntryData,
  type NecEntryData,
  type InterestEntryData,
  type DividendEntryData,
  type BrokerageEntryData,
  buildSectionRoute,
  emptyDeductionData,
  filingStatusOptions,
  getStandardDeductionAmount,
  getSectionData,
  getVisitedSectionStatus,
  supportedStates,
  type SupportedStateCode,
} from "@/lib/guided-interview-flow";

const formatCurrency = formatGuidedCurrency;
function hasValue(value: string): boolean {
  const amount = parseGuidedDisplayAmount(value);
  return amount.isFinite() && !amount.isZero();
}

// ── Section summary cards ──────────────────────────────────────────────────

function PersonalInfoSummary({
  data,
  filingStatus,
}: {
  data: PersonalInfoData | undefined;
  filingStatus: string | null;
}) {
  if (!data && !filingStatus) return null;

  const filingLabel = filingStatus
    ? filingStatusOptions.find((o) => o.value === filingStatus)?.label ?? filingStatus
    : "Not selected";
  const name = data
    ? [data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ") || "Not entered"
    : "Not entered";
  const address = data
    ? [data.addressLine1, data.city, data.state, data.zip].filter(Boolean).join(", ") || "Not entered"
    : "Not entered";
  const depCount = data?.dependentCount && Number(data.dependentCount) > 0
    ? Number(data.dependentCount)
    : 0;
  const detailedDeps = data?.dependents?.filter((d) => d.firstName.trim() || d.lastName.trim()) ?? [];

  return (
    <div className="guided-review-card">
      <div className="guided-review-row">
        <span className="guided-review-label">Filing status</span>
        <span className="guided-review-value">{filingLabel}</span>
      </div>
      <div className="guided-review-row">
        <span className="guided-review-label">Name</span>
        <span className="guided-review-value">{name}</span>
      </div>
      <div className="guided-review-row">
        <span className="guided-review-label">Address</span>
        <span className="guided-review-value">{address}</span>
      </div>
      <div className="guided-review-row">
        <span className="guided-review-label">Dependents</span>
        <span className="guided-review-value">{depCount === 0 ? "None" : `${depCount} dependent(s)`}</span>
      </div>
      {detailedDeps.map((dep, i) => (
        <div key={i} className="guided-review-row">
          <span className="guided-review-label">
            {[dep.firstName, dep.lastName].filter(Boolean).join(" ")}
          </span>
          <span className="guided-review-value">
            {dep.relationship}{dep.qualifiesForCTC ? " · CTC" : ""}{dep.qualifiesForODC ? " · ODC" : ""}{dep.qualifiesForEIC ? " · EIC" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function W2Summary({ entries }: { entries: W2EntryData[] | undefined }) {
  if (!entries || entries.length === 0) return <p className="guided-review-empty">No W-2s entered.</p>;

  const filledEntries = entries.filter((e) => hasValue(e.wages) || hasValue(e.federalWithheld));
  if (filledEntries.length === 0) return <p className="guided-review-empty">No W-2s with data entered.</p>;

  return (
    <div className="guided-review-card">
      {filledEntries.map((entry, i) => (
        <div key={i} className="guided-review-row">
          <span className="guided-review-label">
            {entry.employerName || `W-2 #${i + 1}`}
          </span>
          <span className="guided-review-value">
            {formatCurrency(entry.wages)} wages, {formatCurrency(entry.federalWithheld)} withheld
          </span>
        </div>
      ))}
    </div>
  );
}

function SelfEmploymentSummary({
  necEntries,
  manualGrossReceipts,
  expenses,
  bankStatementAnalyses,
  incomeDocumentAnalyses,
}: {
  necEntries: NecEntryData[] | undefined;
  manualGrossReceipts: string | undefined;
  expenses: ScheduleCExpenseData | undefined;
  bankStatementAnalyses: ScheduleCBankStatementAnalysis[] | undefined;
  incomeDocumentAnalyses: import("@/lib/guided-interview-flow").SelfEmploymentIncomeDocumentAnalysis[] | undefined;
}) {
  const filledEntries = (necEntries ?? []).filter((e) => hasValue(e.nonemployeeCompensation));
  const manualIncome = parseGuidedDisplayAmount(manualGrossReceipts);
  if (filledEntries.length === 0 && manualIncome.isZero()) return <p className="guided-review-empty">No self-employment income entered.</p>;
  const totalIncome = sumGuidedDisplayAmounts(filledEntries.map((entry) => entry.nonemployeeCompensation)).plus(manualIncome);
  const totalExpenses = sumGuidedDisplayAmounts(Object.values(expenses ?? {}));

  return (
    <div className="guided-review-card">
      {filledEntries.map((entry, i) => (
        <div key={i} className="guided-review-row">
          <span className="guided-review-label">
            {entry.payerName || `1099-NEC #${i + 1}`}
          </span>
          <span className="guided-review-value">
            {formatCurrency(entry.nonemployeeCompensation)}
          </span>
        </div>
      ))}
      {manualIncome.gt(0) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Income without 1099-NEC</span>
          <span className="guided-review-value">{formatCurrency(String(manualIncome))}</span>
        </div>
      )}
      {totalExpenses.gt(0) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Business expenses</span>
          <span className="guided-review-value">{formatCurrency(totalExpenses)}</span>
        </div>
      )}
      {(bankStatementAnalyses?.length ?? 0) > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">AI-reviewed statements</span>
          <span className="guided-review-value">{bankStatementAnalyses?.length}</span>
        </div>
      )}
      {(incomeDocumentAnalyses?.length ?? 0) > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">AI-reviewed income documents</span>
          <span className="guided-review-value">{incomeDocumentAnalyses?.length}</span>
        </div>
      )}
      <div className="guided-review-row guided-review-row-total">
        <span className="guided-review-label">Net self-employment</span>
        <span className="guided-review-value">{formatCurrency(totalIncome.minus(totalExpenses))}</span>
      </div>
    </div>
  );
}

function InvestmentSummary({
  interestEntries,
  dividendEntries,
  brokerageEntries,
}: {
  interestEntries: InterestEntryData[] | undefined;
  dividendEntries: DividendEntryData[] | undefined;
  brokerageEntries: BrokerageEntryData[] | undefined;
}) {
  const filledInterest = (interestEntries ?? []).filter((e) => hasValue(e.interestIncome));
  const filledDividends = (dividendEntries ?? []).filter(
    (e) => hasValue(e.ordinaryDividends) || hasValue(e.capitalGainDistributions)
  );
  const filledBrokerage = (brokerageEntries ?? []).filter((e) =>
    e.transactions.some((t) => hasValue(t.proceeds) || hasValue(t.costBasis))
  );

  if (filledInterest.length === 0 && filledDividends.length === 0 && filledBrokerage.length === 0) {
    return <p className="guided-review-empty">No investment income entered.</p>;
  }

  const totalInterest = sumGuidedDisplayAmounts(filledInterest.map((entry) => entry.interestIncome));
  const totalDividends = sumGuidedDisplayAmounts(filledDividends.map((entry) => entry.ordinaryDividends));
  const totalGains = filledBrokerage.flatMap((entry) => entry.transactions).reduce((sum, transaction) =>
    sum.plus(parseGuidedDisplayAmount(transaction.proceeds).minus(parseGuidedDisplayAmount(transaction.costBasis))), new Decimal(0));

  return (
    <div className="guided-review-card">
      {totalInterest.gt(0) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Interest income</span>
          <span className="guided-review-value">{formatCurrency(totalInterest)}</span>
        </div>
      )}
      {totalDividends.gt(0) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Dividend income</span>
          <span className="guided-review-value">{formatCurrency(totalDividends)}</span>
        </div>
      )}
      {filledBrokerage.length > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">Capital gains / losses</span>
          <span className="guided-review-value">{formatCurrency(totalGains)}</span>
        </div>
      )}
    </div>
  );
}

function DeductionsSummary({ data, filingStatus, taxYear }: { data: DeductionData | undefined; filingStatus: string | null; taxYear?: number | null }) {
  const current = data ?? emptyDeductionData;
  const stdAmount = getStandardDeductionAmount(filingStatus as Parameters<typeof getStandardDeductionAmount>[0], taxYear);

  if (current.method === "standard") {
    return (
      <div className="guided-review-card">
        <div className="guided-review-row">
          <span className="guided-review-label">Method</span>
          <span className="guided-review-value">Standard deduction{stdAmount > 0 ? ` (${formatCurrency(stdAmount)})` : ""}</span>
        </div>
        {current.gamblingWinnings?.trim() && <div className="guided-review-row"><span className="guided-review-label">Gambling winnings (income)</span><span className="guided-review-value">{formatCurrency(current.gamblingWinnings)}</span></div>}
      </div>
    );
  }

  const items = [
    { label: "Medical expenses", value: current.medicalExpenses },
    { label: "State/local taxes", value: current.stateLocalTaxes },
    { label: "Real estate taxes", value: current.realEstateTaxes },
    { label: "Personal property taxes", value: current.personalPropertyTaxes ?? "" },
    { label: "Investment interest", value: current.investmentInterestExpense ?? "" },
    { label: "Wagering losses", value: current.gamblingLosses ?? "" },
    { label: "Gambling winnings (income)", value: current.gamblingWinnings ?? "" },
    { label: "Mortgage interest", value: current.mortgageInterest },
    { label: "Charitable contributions", value: current.charitableContributions },
  ].filter((item) => hasValue(item.value));

  return (
    <div className="guided-review-card">
      <div className="guided-review-row">
        <span className="guided-review-label">Method</span>
        <span className="guided-review-value">Itemized (Schedule A)</span>
      </div>
      {items.map((item) => (
        <div key={item.label} className="guided-review-row">
          <span className="guided-review-label">{item.label}</span>
          <span className="guided-review-value">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function AdjustmentsSummary({ data }: { data: AdjustmentData | undefined }) {
  if (!data) return <p className="guided-review-empty">No adjustments entered.</p>;

  const items = [
    { label: "HSA deduction", value: data.hsaDeduction },
    { label: "Student loan interest", value: data.studentLoanInterest },
    { label: "SE health insurance", value: data.selfEmployedHealthInsurance },
    { label: "Educator expenses", value: data.educatorExpenses },
    { label: "IRA deduction", value: data.iraDeduction },
    { label: "Alimony paid", value: data.alimonyPaid },
  ].filter((item) => hasValue(item.value));

  if (items.length === 0) return <p className="guided-review-empty">No adjustments entered.</p>;

  return (
    <div className="guided-review-card">
      {items.map((item) => (
        <div key={item.label} className="guided-review-row">
          <span className="guided-review-label">{item.label}</span>
          <span className="guided-review-value">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CreditsSummary({ data }: { data: CreditsData | undefined }) {
  if (!data) return <p className="guided-review-empty">No credits entered.</p>;

  const items: { label: string; value: string }[] = [];

  if (hasValue(data.dependentCare.expenses)) {
    items.push({
      label: data.dependentCare.qualifyingIndividuals
        ? "Dependent care expenses"
        : "Dependent care expenses (needs qualifying count)",
      value: data.dependentCare.expenses,
    });
  }

  const filledStudents = data.education.aocStudents.filter((s) => hasValue(s.qualifiedExpenses));
  if (filledStudents.length > 0) {
    const totalEdu = sumGuidedDisplayAmounts(filledStudents.map((student) => student.qualifiedExpenses));
    items.push({ label: `Education (${filledStudents.length} student${filledStudents.length > 1 ? "s" : ""})`, value: String(totalEdu) });
  }

  if (hasValue(data.education.llcExpenses)) {
    items.push({ label: "Lifetime Learning expenses", value: data.education.llcExpenses });
  }

  const energyTotal = sumGuidedDisplayAmounts([
    data.energy.solarElectricCost,
    data.energy.solarWaterHeatingCost,
    data.energy.insulationCost,
    data.energy.exteriorDoorsWindowsCost,
    data.energy.roofCost,
    data.energy.energyEfficientHvacCost,
    data.energy.waterHeaterHeatPumpCost,
  ]);

  if (energyTotal.gt(0)) {
    items.push({ label: "Energy improvements", value: String(energyTotal) });
  }

  if (items.length === 0) return <p className="guided-review-empty">No credits entered.</p>;

  return (
    <div className="guided-review-card">
      {items.map((item) => (
        <div key={item.label} className="guided-review-row">
          <span className="guided-review-label">{item.label}</span>
          <span className="guided-review-value">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentsSummary({ data }: { data: PaymentData | undefined }) {
  if (!data) return <p className="guided-review-empty">No additional payments entered.</p>;

  const filledPayments = data.estimatedPayments.filter((p) => hasValue(p.amount));
  if (filledPayments.length === 0 && !hasValue(data.otherPayments)) {
    return <p className="guided-review-empty">No additional payments entered.</p>;
  }

  const totalEstimated = sumGuidedDisplayAmounts(filledPayments.map((payment) => payment.amount));

  return (
    <div className="guided-review-card">
      {filledPayments.length > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">
            Estimated payments ({filledPayments.length})
          </span>
          <span className="guided-review-value">{formatCurrency(totalEstimated)}</span>
        </div>
      )}
      {hasValue(data.otherPayments) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Other payments</span>
          <span className="guided-review-value">{formatCurrency(data.otherPayments)}</span>
        </div>
      )}
    </div>
  );
}

function RetirementSummary({ entries }: { entries: RetirementEntryData[] | undefined }) {
  if (!entries || entries.length === 0) return <p className="guided-review-empty">No 1099-R entered.</p>;

  const filledEntries = entries.filter((e) => hasValue(e.grossDistribution) || hasValue(e.taxableAmount));
  if (filledEntries.length === 0) return <p className="guided-review-empty">No 1099-R with data entered.</p>;

  return (
    <div className="guided-review-card">
      {filledEntries.map((entry, i) => (
        <div key={i} className="guided-review-row">
          <span className="guided-review-label">
            {entry.payer || `1099-R #${i + 1}`}
          </span>
          <span className="guided-review-value">
            {formatCurrency(entry.taxableAmount)} taxable, {formatCurrency(entry.federalWithheld)} withheld
          </span>
        </div>
      ))}
    </div>
  );
}

function SocialSecuritySummary({ data }: { data: SocialSecurityData | undefined }) {
  if (!data || !hasValue(data.netBenefits)) return <p className="guided-review-empty">No Social Security benefits entered.</p>;

  return (
    <div className="guided-review-card">
      <div className="guided-review-row">
        <span className="guided-review-label">Net benefits</span>
        <span className="guided-review-value">{formatCurrency(data.netBenefits)}</span>
      </div>
      {hasValue(data.federalWithheld) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Federal withheld</span>
          <span className="guided-review-value">{formatCurrency(data.federalWithheld)}</span>
        </div>
      )}
    </div>
  );
}

function UnemploymentSummary({ data }: { data: UnemploymentData | undefined }) {
  if (!data || !hasValue(data.compensation)) return <p className="guided-review-empty">No unemployment entered.</p>;

  return (
    <div className="guided-review-card">
      <div className="guided-review-row">
        <span className="guided-review-label">Unemployment compensation</span>
        <span className="guided-review-value">{formatCurrency(data.compensation)}</span>
      </div>
      {hasValue(data.federalWithheld) && (
        <div className="guided-review-row">
          <span className="guided-review-label">Federal withheld</span>
          <span className="guided-review-value">{formatCurrency(data.federalWithheld)}</span>
        </div>
      )}
    </div>
  );
}

function RentalIncomeSummary({ entries }: { entries: RentalPropertyEntryData[] | undefined }) {
  if (!entries || entries.length === 0) return <p className="guided-review-empty">No rental properties entered.</p>;

  const filledEntries = entries.filter((e) => hasValue(e.rents));
  if (filledEntries.length === 0) return <p className="guided-review-empty">No rental properties with data entered.</p>;

  return (
    <div className="guided-review-card">
      {filledEntries.map((entry, i) => {
        const totalExpenses = sumGuidedDisplayAmounts([
          entry.mortgageInterest, entry.taxes, entry.insurance,
          entry.repairs, entry.utilities, entry.depreciation, entry.otherExpenses,
        ]);

        return (
          <div key={i} className="guided-review-row">
            <span className="guided-review-label">
              {entry.description || `Property #${i + 1}`}
            </span>
            <span className="guided-review-value">
              {formatCurrency(entry.rents)} rents{totalExpenses.gt(0) ? `, ${formatCurrency(totalExpenses)} expenses` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OtherTaxesSummary({ data }: { data: OtherTaxesData | undefined }) {
  if (!data) return <p className="guided-review-empty">No other taxes entered.</p>;

  const items: string[] = [];
  if (hasValue(data.householdEmploymentWages)) items.push(`Household wages: ${formatCurrency(data.householdEmploymentWages)}`);
  if (data.acknowledgedSETax) items.push("Self-employment tax applies");
  if (data.acknowledgedAdditionalMedicare) items.push("Additional Medicare tax applies");
  if (data.acknowledgedNIIT) items.push("Net investment income tax applies");

  if (items.length === 0) return <p className="guided-review-empty">No other taxes apply.</p>;

  return (
    <div className="guided-review-card">
      {items.map((item) => (
        <div key={item} className="guided-review-row">
          <span className="guided-review-label">{item}</span>
        </div>
      ))}
    </div>
  );
}

function StateReturnSummary({
  stateCode,
  data,
  preview,
}: {
  stateCode: SupportedStateCode | null;
  data: StateReturnData | undefined;
  preview: GuidedPreviewMetrics | null;
}) {
  if (!stateCode) return <p className="guided-review-empty">No state return.</p>;

  const stateName = supportedStates.find((s) => s.code === stateCode)?.name ?? stateCode;
  const stateMetrics = preview?.state ?? null;
  const stateRefund = parseGuidedDisplayAmount(stateMetrics?.stateRefund);
  const stateOwed = parseGuidedDisplayAmount(stateMetrics?.stateAmountOwed);

  const filledPayments = (data?.stateEstimatedPayments ?? []).filter((p) => hasValue(p.amount));
  const totalEstimated = sumGuidedDisplayAmounts(filledPayments.map((payment) => payment.amount));

  return (
    <div className="guided-review-card">
      <div className="guided-review-row">
        <span className="guided-review-label">State</span>
        <span className="guided-review-value">{stateName} ({stateCode})</span>
      </div>
      {stateMetrics && (
        <>
          <div className="guided-review-row">
            <span className="guided-review-label">State tax</span>
            <span className="guided-review-value">{formatCurrency(stateMetrics.stateTax)}</span>
          </div>
          <div className="guided-review-row">
            <span className="guided-review-label">
              {stateRefund.gt(0) ? "State refund" : stateOwed.gt(0) ? "State balance due" : "State result"}
            </span>
            <span className="guided-review-value">
              {stateRefund.gt(0)
                  ? formatCurrency(stateMetrics.stateRefund)
                  : stateOwed.gt(0)
                    ? formatCurrency(stateMetrics.stateAmountOwed)
                  : "—"}
            </span>
          </div>
        </>
      )}
      {totalEstimated.gt(0) && (
        <div className="guided-review-row">
          <span className="guided-review-label">
            State estimated payments ({filledPayments.length})
          </span>
          <span className="guided-review-value">{formatCurrency(totalEstimated)}</span>
        </div>
      )}
      {(data?.additionalStateWithholdingEntries?.length ?? 0) > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">Additional state withholding</span>
          <span className="guided-review-value">{formatCurrency(sumGuidedDisplayAmounts((data?.additionalStateWithholdingEntries ?? []).map((entry) => entry.amount)))}</span>
        </div>
      )}
      {data?.additionalStateWithholding.trim() && !data.additionalStateWithholdingEntries?.length && <div className="guided-review-row"><span className="guided-review-label">Saved state withholding — source confirmation needed</span><span className="guided-review-value">{formatCurrency(data.additionalStateWithholding)}</span></div>}
    </div>
  );
}

function PlaceholderSummary({ sectionLabel }: { sectionLabel: string }) {
  return <p className="guided-review-empty">{sectionLabel} — no data entered yet.</p>;
}

// ── Section review block ──────────────────────────────────────────────────

function SectionReviewBlock({
  sectionId: _sectionId,
  label,
  eyebrow,
  sectionStatus,
  onEdit,
  children,
}: {
  sectionId: string;
  label: string;
  eyebrow: string;
  sectionStatus: VisitedSectionStatus;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const showDoneBadge = sectionStatus === "complete";
  const showSkippedBadge = sectionStatus === "skipped";
  const showNeedsReviewBadge = sectionStatus === "needs-review";

  return (
    <div className="guided-review-section">
      <div className="guided-review-section-header">
        <div>
          <span className="guided-review-section-eyebrow">{eyebrow}</span>
          <strong className="guided-review-section-label">{label}</strong>
        </div>
        <div className="guided-review-section-actions">
          {showDoneBadge ? <span className="guided-review-badge-done">Done</span> : null}
          {showSkippedBadge ? <span className="guided-review-badge-skipped">Skipped</span> : null}
          {showNeedsReviewBadge ? <span className="guided-review-badge-needs-review">Needs review</span> : null}
          <button
            type="button"
            className="utility-button utility-button-small"
            onClick={onEdit}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="guided-review-section-body">
        {children}
      </div>
    </div>
  );
}

// ── Main review section ───────────────────────────────────────────────────

export function SectionReview({
  state,
  preview,
  onJumpToSection,
}: {
  state: GuidedFlowState;
  preview: GuidedPreviewMetrics | null;
  onJumpToSection: (sectionId: InterviewSectionId) => void;
}) {
  const sections = buildSectionRoute(state.segmentation);
  // Exclude the review section itself from the summary
  const reviewableSections = sections.filter((s) => s.id !== "review");

  function renderSectionSummary(sectionId: InterviewSectionId) {
    switch (sectionId) {
      case "personal-info":
        return (
          <PersonalInfoSummary
            data={getSectionData(state, "personal-info")}
            filingStatus={state.segmentation.filingStatus}
          />
        );
      case "income-w2":
        return <W2Summary entries={getSectionData(state, "income-w2")?.entries} />;
      case "income-self-employment": {
        const seData = getSectionData(state, "income-self-employment");
        return (
            <SelfEmploymentSummary
              necEntries={seData?.necEntries}
              manualGrossReceipts={seData?.manualGrossReceipts}
              expenses={seData?.expenses}
              bankStatementAnalyses={seData?.bankStatementAnalyses}
              incomeDocumentAnalyses={seData?.incomeDocumentAnalyses}
            />
        );
      }
      case "income-investments": {
        const investData = getSectionData(state, "income-investments");
        return (
          <InvestmentSummary
            interestEntries={investData?.interestEntries}
            dividendEntries={investData?.dividendEntries}
            brokerageEntries={investData?.brokerageEntries}
          />
        );
      }
      case "income-retirement":
        return <RetirementSummary entries={getSectionData(state, "income-retirement")?.entries} />;
      case "income-social-security":
        return <SocialSecuritySummary data={getSectionData(state, "income-social-security")} />;
      case "income-unemployment":
        return <UnemploymentSummary data={getSectionData(state, "income-unemployment")} />;
      case "deductions":
        return <DeductionsSummary taxYear={state.taxYear} data={getSectionData(state, "deductions")} filingStatus={state.segmentation.filingStatus} />;
      case "adjustments":
        return <AdjustmentsSummary data={getSectionData(state, "adjustments")} />;
      case "credits":
        return <CreditsSummary data={getSectionData(state, "credits")} />;
      case "payments":
        return <PaymentsSummary data={getSectionData(state, "payments")} />;
      case "income-rental":
        return <RentalIncomeSummary entries={getSectionData(state, "income-rental")?.entries} />;
      case "other-taxes":
        return <OtherTaxesSummary data={getSectionData(state, "other-taxes")} />;
      case "state-return":
        return (
          <StateReturnSummary
            stateCode={state.segmentation.stateCode as SupportedStateCode | null}
            data={getSectionData(state, "state-return")}
            preview={preview}
          />
        );
      default:
        return <PlaceholderSummary sectionLabel={sections.find((s) => s.id === sectionId)?.label ?? sectionId} />;
    }
  }

  const refund = parseGuidedDisplayAmount(preview?.refund);
  const owed = parseGuidedDisplayAmount(preview?.amountOwed);

  return (
    <RetroShell title="Review & Summary" eyebrow="REVIEW">
      <div className="guided-question">
        <p className="guided-prompt">Here's everything at a glance.</p>
        <p className="guided-hint">
          Review each section below. Click "Edit" to go back and make changes.
          Skipped and partially filled sections stay marked so you can revisit them before you finish.
        </p>

        {preview && (
          <div className="guided-review-result-banner">
            <div className={`guided-ticker-item guided-ticker-item-hero ${refund.gt(0) ? "guided-ticker-positive" : owed.gt(0) ? "guided-ticker-negative" : ""}`}>
              <span className="guided-ticker-label">
                {refund.gt(0) ? "Estimated Refund" : owed.gt(0) ? "Estimated Balance Due" : "Estimated Result"}
              </span>
              <strong className="guided-ticker-value guided-ticker-value-hero">
                {refund.gt(0)
                  ? formatCurrency(preview.refund)
                  : owed.gt(0)
                    ? formatCurrency(preview.amountOwed)
                    : "—"}
              </strong>
            </div>
            <div className="guided-review-result-details">
              <div className="guided-review-row">
                <span className="guided-review-label">Total income</span>
                <span className="guided-review-value">{formatCurrency(preview.totalIncome)}</span>
              </div>
              <div className="guided-review-row">
                <span className="guided-review-label">AGI</span>
                <span className="guided-review-value">{formatCurrency(preview.agi)}</span>
              </div>
              <div className="guided-review-row">
                <span className="guided-review-label">Taxable income</span>
                <span className="guided-review-value">{formatCurrency(preview.taxableIncome)}</span>
              </div>
              <div className="guided-review-row">
                <span className="guided-review-label">Total tax</span>
                <span className="guided-review-value">{formatCurrency(preview.totalTax)}</span>
              </div>
              <div className="guided-review-row">
                <span className="guided-review-label">Total payments</span>
                <span className="guided-review-value">{formatCurrency(preview.totalPayments)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="guided-review-sections">
          {reviewableSections.map((section) => (
            <SectionReviewBlock
              key={section.id}
              sectionId={section.id}
              label={section.label}
              eyebrow={section.eyebrow}
              sectionStatus={getVisitedSectionStatus(state, section.id)}
              onEdit={() => onJumpToSection(section.id)}
            >
              {renderSectionSummary(section.id)}
            </SectionReviewBlock>
          ))}
        </div>
      </div>
    </RetroShell>
  );
}
