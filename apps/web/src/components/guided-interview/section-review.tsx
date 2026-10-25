"use client";

import { isStartedNec, sumKnownBusinessAmounts, type BusinessSourceData } from "@/lib/guided-business-facts";
import { isStartedRental, knownRentalExpenses } from "@/lib/guided-rental-facts";
import { unemploymentEntries, isStartedUnemployment, governmentSourceTotal } from "@/lib/guided-unemployment-facts";
import { socialSecurityEntries, isStartedSocialSecurity, socialSecuritySourceTotal } from "@/lib/guided-social-security-facts";
import { isStartedInvestment } from "@/lib/guided-investment-facts";
import { isStartedOid, type OidEntryData } from "@/lib/guided-oid-facts";
import { hasEnteredAmount } from "@/lib/guided-required-facts";
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

function SelfEmploymentSummary({ necEntries, manualGrossReceipts, expenses, businessFacts }: {
  necEntries: NecEntryData[] | undefined;
  manualGrossReceipts: string | undefined;
  expenses: ScheduleCExpenseData | undefined;
  businessFacts: BusinessSourceData | undefined;
}) {
  const entries = (necEntries ?? []).filter(isStartedNec);
  if (!entries.length && !hasEnteredAmount(manualGrossReceipts) && !Object.values(expenses ?? {}).some(hasEnteredAmount)) return <p className="guided-review-empty">No self-employment source amounts entered.</p>;
  const rows: Array<[string, Array<string | undefined>]> = [
    ["1099-NEC receipts", entries.map(entry => entry.nonemployeeCompensation)],
    ["Receipts not already reported on 1099-NEC", [manualGrossReceipts]],
    ["Returns and allowances", [businessFacts?.returnsAndAllowances]],
    ["Cost of goods sold", [businessFacts?.costOfGoodsSold]],
    ["Schedule C other income", [businessFacts?.otherIncome]],
    ["Entered expenses before tax limits", [...Object.values(expenses ?? {}), businessFacts?.contractLabor, businessFacts?.depreciation, businessFacts?.legalAndProfessional]],
  ];
  return <div className="guided-review-card">{rows.map(([label, values]) => {
    const total = sumKnownBusinessAmounts(values);
    return <div key={label} className="guided-review-row"><span className="guided-review-label">{label}</span><span className="guided-review-value">{total === null ? "Unknown — review source amounts" : formatCurrency(total)}</span></div>;
  })}</div>;
}

function InvestmentSummary({
  interestEntries,
  dividendEntries,
  brokerageEntries,
  oidEntries,
}: {
  interestEntries: InterestEntryData[] | undefined;
  dividendEntries: DividendEntryData[] | undefined;
  brokerageEntries: BrokerageEntryData[] | undefined;
  oidEntries?: OidEntryData[];
}) {
  const interest = (interestEntries ?? []).filter(isStartedInvestment);
  const dividends = (dividendEntries ?? []).filter(isStartedInvestment);
  const transactions = (brokerageEntries ?? []).flatMap(entry => entry.transactions.filter(isStartedInvestment));
  const oid = (oidEntries ?? []).filter(isStartedOid);
  if (!interest.length && !dividends.length && !transactions.length && !oid.length) return <p className="guided-review-empty">No investment income entered.</p>;
  const sourceTotal = (values: Array<string | undefined>) => {
    const total = sumGuidedDisplayAmounts(values);
    return values.every(hasEnteredAmount) && total.isFinite() ? formatCurrency(total) : "Unknown — review source amounts";
  };
  const rows: Array<[string, Array<string | undefined>]> = [];
  if (interest.length) rows.push(["Taxable interest (Boxes 1 and 3)", interest.flatMap(entry => [entry.interestIncome, entry.usSavingsBondInterest])], ["Tax-exempt interest", interest.map(entry => entry.taxExemptInterest)]);
  if (dividends.length) rows.push(["Ordinary dividends", dividends.map(entry => entry.ordinaryDividends)], ["Qualified dividends included above", dividends.map(entry => entry.qualifiedDividends)], ["Capital-gain distributions", dividends.map(entry => entry.capitalGainDistributions)], ["Exempt-interest dividends", dividends.map(entry => entry.exemptInterestDividends)]);
  if (transactions.length) rows.push(["Sale proceeds", transactions.map(transaction => transaction.proceeds)], ["Source cost basis", transactions.map(transaction => transaction.costBasis)], ["Wash-sale loss disallowed", transactions.map(transaction => transaction.washSaleDisallowed)]);
  if (oid.length) rows.push(["OID Box 1 source amounts", oid.map(entry => entry.originalIssueDiscount)], ["OID Box 8 Treasury source amounts", oid.map(entry => entry.treasuryOID)], ["OID Box 11 exempt source amounts", oid.map(entry => entry.taxExemptOID)], ["OID Box 2 interest before recipient adjustments", oid.map(entry => entry.otherPeriodicInterest)]);
  return <div className="guided-review-card">{rows.map(([label, values]) => <div className="guided-review-row" key={label}><span className="guided-review-label">{label}</span><span className="guided-review-value">{sourceTotal(values)}</span></div>)}</div>;
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
    { label: "Reported mortgage interest before payment allocation and limits", value: current.mortgageInterest },
    ...(current.mortgageEntries ?? []).flatMap((entry, index) => [
      { label: `Mortgage ${index + 1} actual interest paid by this return`, value: entry.interestPaidByReturnAmount ?? "" },
      { label: `Mortgage ${index + 1} purchase points (before qualification)`, value: entry.pointsPaid ?? "" },
      { label: `Mortgage ${index + 1} actual real estate taxes`, value: entry.propertyTaxPaid ?? "" },
      { label: `Mortgage ${index + 1} annual insurance allocation (before limits)`, value: entry.hasMortgageInsuranceAllocation === true ? entry.insurancePremiumsAllocableToYear ?? "" : "" },
    ]),
    { label: "Non-W-2 withholding deducted elsewhere", value: current.nonW2IncomeTaxesDeductedElsewhere ?? "" },
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
    { label: "Saved HSA deduction estimate (not calculated)", value: data.hsaDeduction },
    ...(data.hsaAccounts ?? []).map((account, index) => ({ label: `HSA ${index + 1} ${account.accountOwner || "unknown owner"}: personal contributions before limits`, value: account.contributionsMade })),
    { label: "Saved student-loan gross interest needing source reconciliation", value: data.studentLoanInterest },
    { label: "Saved health premium amount to reconcile", value: data.selfEmployedHealthInsurance },
    { label: "Saved educator net expenses needing source reconciliation", value: data.educatorExpenses },
    { label: "IRA deduction", value: data.iraDeduction },
    { label: "Alimony paid", value: data.alimonyPaid },
  ].filter((item) => hasValue(item.value));

  if (items.length === 0 && !data.hsaAccounts?.length && !data.educatorExpenseSources?.length && !data.studentLoanFacts && !data.healthInsuranceFacts) return <p className="guided-review-empty">No adjustments entered.</p>;

  return (
    <div className="guided-review-card">
      {!!data.hsaAccounts?.length && <p className="guided-hint">{data.hsaAccounts.length} HSA owner worksheet(s). Contributions are source amounts; eligibility and limits determine the deduction.</p>}
      {data.healthInsuranceFacts && <div>
        <p className="guided-hint">{data.healthInsuranceFacts.sourceFactsConfirmed === true ? "Health insurance sources checked" : "Health insurance sources need confirmation"}. Paid premiums below are before monthly eligibility, funding exclusions, age caps and business income limits.</p>
        {data.healthInsuranceFacts.plans.flatMap((plan, planIndex) => plan.payments.map((payment, paymentIndex) => <div key={`health-${planIndex}-${paymentIndex}`} className="guided-review-row"><span className="guided-review-label">Plan {planIndex + 1} {plan.accountHolder || "unknown owner"}: payment {paymentIndex + 1} owner/business paid premium</span><span className="guided-review-value">{hasEnteredAmount(payment.ownerOrBusinessPaid) ? formatCurrency(payment.ownerOrBusinessPaid) : "Unknown"}</span></div>))}
      </div>}
      {data.studentLoanFacts && <div>
        <p className="guided-hint">{data.studentLoanFacts.sourceFactsConfirmed === true ? "Student-loan sources checked" : "Student-loan sources need confirmation"}. Interest below is before qualification, benefit reductions and income limits.</p>
        {(data.studentLoanFacts.loans ?? []).map((loan, index) => <div key={`loan-${index}`} className="guided-review-row"><span className="guided-review-label">Loan {index + 1} {loan.accountHolder || "unknown owner"}: paid interest before qualification</span><span className="guided-review-value">{hasEnteredAmount(loan.interestPaid) ? formatCurrency(loan.interestPaid) : "Unknown"}</span></div>)}
      </div>}
      {(data.educatorExpenseSources ?? []).map((source, index) => <div key={`educator-${index}`}>
        <p className="guided-hint">{source.sourceFactsConfirmed === true ? "Educator sources checked" : "Educator sources need confirmation"}. Paid costs below are before eligibility, reimbursements and deduction limits.</p>
        {(source.expenses ?? []).map((expense, expenseIndex) => <div key={expenseIndex} className="guided-review-row"><span className="guided-review-label">Educator {index + 1} {source.accountHolder || "unknown owner"}: expense {expenseIndex + 1} before qualification</span><span className="guided-review-value">{hasEnteredAmount(expense.amount) ? formatCurrency(expense.amount) : "Unknown"}</span></div>)}
      </div>)}
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

  const filledStudents = data.education.aocStudents.filter((s) => s.qualifiedExpenses.trim());
  if (filledStudents.length > 0) {
    const totalEdu = sumGuidedDisplayAmounts(filledStudents.map((student) => student.qualifiedExpenses));
    items.push({ label: `Education (${filledStudents.length} student${filledStudents.length > 1 ? "s" : ""})`, value: String(totalEdu) });
  }

  const llcStudents = (data.education.llcStudents ?? []).filter(student => student.qualifiedExpenses.trim());
  if (llcStudents.length) {
    items.push({ label: `Lifetime Learning expenses (${llcStudents.length} student${llcStudents.length === 1 ? "" : "s"})`, value: sumGuidedDisplayAmounts(llcStudents.map(student => student.qualifiedExpenses)).toString() });
  } else if (data.education.llcExpenses.trim()) {
    items.push({ label: "Saved Lifetime Learning total (needs student records)", value: data.education.llcExpenses });
  }

  const adoptionExpenses = (data.adoption?.children ?? []).flatMap(child => child.expensesByYear ?? []).filter(entry => entry.amount.trim());
  if (adoptionExpenses.length) items.push({ label: "Entered adoption expenses (all source years)", value: sumGuidedDisplayAmounts(adoptionExpenses.map(entry => entry.amount)).toString() });
  const adoptionBenefits = (data.adoption?.children ?? []).filter(child => child.employerBenefits?.trim());
  if (adoptionBenefits.length) items.push({ label: "Employer adoption benefits", value: sumGuidedDisplayAmounts(adoptionBenefits.map(child => child.employerBenefits ?? "")).toString() });
  const vehicleReports = (data.vehicles?.entries ?? []).filter(vehicle => vehicle.sellerReportCreditAmount?.trim());
  if (vehicleReports.length) items.push({ label: "Vehicle seller-reported credits (before qualification and reconciliation)", value: sumGuidedDisplayAmounts(vehicleReports.map(vehicle => vehicle.sellerReportCreditAmount ?? "")).toString() });

  const energyRecords = [...(data.energy.qualifiedImprovements ?? []), ...(data.energy.cleanEnergyProperties ?? [])];
  if (energyRecords.length > 0) {
    items.push({ label: "Entered energy property costs (before qualification and limits)", value: sumGuidedDisplayAmounts(energyRecords.map((record) => record.qualifiedCost)).toString() });
  }
  if (data.energy.priorYearCarryforward?.trim()) {
    items.push({ label: "Prior-year residential clean-energy carryforward", value: data.energy.priorYearCarryforward });
  }

  if (items.length === 0) return <p className="guided-review-empty">{data.education.aocStudents.length || data.education.llcStudents?.length || data.adoption?.children.length || data.vehicles?.entries.length ? "Credit source records need more details." : "No credits entered."}</p>;

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

  const filledPayments = data.estimatedPayments.filter((p) => p.amount.trim());
  const extensionPayments = (data.extensionPayments ?? []).filter((p) => p.amount.trim());
  const appliedCredits = (data.priorYearAppliedCredits ?? []).filter((p) => p.amount.trim());
  const hasClassifiedOtherPayments = extensionPayments.length > 0 || appliedCredits.length > 0;
  if (filledPayments.length === 0 && !hasClassifiedOtherPayments && !data.otherPayments.trim()) {
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
      {extensionPayments.length > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">Extension payments ({extensionPayments.length})</span>
          <span className="guided-review-value">{formatCurrency(sumGuidedDisplayAmounts(extensionPayments.map((payment) => payment.amount)))}</span>
        </div>
      )}
      {appliedCredits.length > 0 && (
        <div className="guided-review-row">
          <span className="guided-review-label">Prior-year overpayment applied ({appliedCredits.length})</span>
          <span className="guided-review-value">{formatCurrency(sumGuidedDisplayAmounts(appliedCredits.map((payment) => payment.amount)))}</span>
        </div>
      )}
      {!hasClassifiedOtherPayments && data.otherPayments.trim() && (
        <div className="guided-review-row">
          <span className="guided-review-label">Saved payment total (needs classification)</span>
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
  const entries = socialSecurityEntries(data).filter(isStartedSocialSecurity);
  if (!entries.length) return <p className="guided-review-empty">No Social Security benefits entered.</p>;
  const net = socialSecuritySourceTotal(entries, "netBenefits");
  const withheld = socialSecuritySourceTotal(entries, "federalWithheld");
  return <div className="guided-review-card">
    {entries.map((entry, index) => <div className="guided-review-row" key={index}><span className="guided-review-label">{entry.recipient || `Benefit statement ${index + 1}`}{entry.beneficiaryRole === "other" ? " — belongs to another beneficiary" : ""}</span><span className="guided-review-value">{entry.sourceFactsConfirmed === true ? "Source checked" : "Source facts need review"}</span></div>)}
    <div className="guided-review-row"><span className="guided-review-label">Net benefits belonging to this return</span><span className="guided-review-value">{net === null ? "Unknown" : formatCurrency(net)}</span></div>
    <div className="guided-review-row"><span className="guided-review-label">Federal withholding belonging to this return</span><span className="guided-review-value">{withheld === null ? "Unknown" : formatCurrency(withheld)}</span></div>
  </div>;
}

function UnemploymentSummary({ data }: { data: UnemploymentData | undefined }) {
  const entries = unemploymentEntries(data).filter(isStartedUnemployment);
  if (!entries.length) return <p className="guided-review-empty">No government-payment records entered.</p>;
  const total = governmentSourceTotal(entries, "compensation");
  const withheld = governmentSourceTotal(entries, "federalWithheld");
  return <div className="guided-review-card">
    {entries.map((entry, index) => <div className="guided-review-row" key={index}><span className="guided-review-label">{entry.payer || `Government statement ${index + 1}`}</span><span className="guided-review-value">{entry.sourceFactsConfirmed === true ? "Source checked" : "Source facts need review"}</span></div>)}
    <div className="guided-review-row"><span className="guided-review-label">Original unemployment compensation</span><span className="guided-review-value">{total === null ? "Unknown" : formatCurrency(total)}</span></div>
    <div className="guided-review-row"><span className="guided-review-label">Government federal withholding</span><span className="guided-review-value">{withheld === null ? "Unknown" : formatCurrency(withheld)}</span></div>
  </div>;
}

function RentalIncomeSummary({ entries }: { entries: RentalPropertyEntryData[] | undefined }) {
  if (!entries || entries.length === 0) return <p className="guided-review-empty">No rental properties entered.</p>;

  const filledEntries = entries.filter(isStartedRental);
  if (filledEntries.length === 0) return <p className="guided-review-empty">No rental properties with data entered.</p>;

  return (
    <div className="guided-review-card">
      {filledEntries.map((entry, i) => {
        const totalExpenses = knownRentalExpenses(entry);
        const rents = sumKnownBusinessAmounts([entry.rents]);

        return (
          <div key={i} className="guided-review-row">
            <span className="guided-review-label">
              {entry.description || `Property #${i + 1}`}
            </span>
            <span className="guided-review-value">
              {rents === null ? "Unknown rents" : `${formatCurrency(rents)} rents`}, {totalExpenses === null ? "unknown expenses" : `${formatCurrency(totalExpenses)} entered expenses`} before ownership allocation and tax limits
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
              businessFacts={seData?.businessFacts}
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
            oidEntries={investData?.oidEntries}
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
