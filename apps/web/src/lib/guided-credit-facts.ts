import Decimal from "decimal.js";
import type { DependentCareData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { calculateGuidedCareBenefits, type CareBenefitsContext } from "./guided-dependent-care-benefits";
import { amountError, hasEnteredAmount } from "./guided-required-facts";

export function careFactErrors(data: DependentCareData | undefined, filingStatus?: FilingStatus | null, benefitsContext?: CareBenefitsContext): Record<string, string> {
  if (!data || !Object.values(data).some(value => typeof value === "boolean" || (Array.isArray(value) && value.length > 0) || (typeof value === "string" && value.trim() !== ""))) return {};
  const errors: Record<string, string> = {};
  let benefits: ReturnType<typeof calculateGuidedCareBenefits>;
  if (benefitsContext?.data) {
    try { benefits = calculateGuidedCareBenefits(benefitsContext, filingStatus); }
    catch (error) { errors.careBenefitsRequired = error instanceof Error ? error.message : "Complete the actual care benefit records."; }
  } else if (data.receivedBenefits === true) errors.careBenefitsRequired = "Complete the actual dependent-care benefit sources and Part III worksheets before claiming the care credit.";

  const recordAmount = (key: string, value: string | undefined, label: string, signed = false) => {
    let error = amountError(value, label);
    if (signed && hasEnteredAmount(value)) {
      try { parseGuidedCurrency(value); error = undefined; } catch { /* Keep invalid amount error. */ }
    }
    if (error) errors[key] = error;
  };
  recordAmount("careExpenses", data.expenses, "dependent-care expenses");
  if (filingStatus === "mfs" && benefits?.treatedAsUnmarried !== true) errors.careFilingStatus = "A separate-return care claim needs the Form 2441 separated-spouse exception facts; this guided branch is not yet supported.";
  if (!/^\d+$/.test(data.qualifyingIndividuals) || Number(data.qualifyingIndividuals) < 1 || Number(data.qualifyingIndividuals) > 20) errors.careIndividuals = "Enter the actual number of qualifying individuals who received care.";
  for (const field of ["primaryEarnedIncome", ...(!benefits || hasEnteredAmount(data.excludedDependentCareBenefits) ? ["excludedDependentCareBenefits" as const] : []), "priorYearExpenseCredit", ...(filingStatus === "mfj" ? ["spouseEarnedIncome" as const] : [])] as const) {
    recordAmount(`care-${field}`, data[field], field === "excludedDependentCareBenefits" ? "excluded dependent-care benefits from Form 2441 Part III"
      : field === "priorYearExpenseCredit" ? "completed prior-year expense worksheet credit, including zero when none applies"
      : "earned income from Form 2441 line 4 or 5", field.endsWith("EarnedIncome"));
  }
  if (filingStatus !== "mfj" && hasEnteredAmount(data.spouseEarnedIncome)) recordAmount("careSpouseIncome", data.spouseEarnedIncome, "spouse earned income", true);
  if (typeof data.eligibilityConfirmed !== "boolean") errors.careEligibility = "Confirm the qualifying-person, work-related care and eligible-provider requirements from Form 2441.";
  if (data.sourceFactsConfirmed !== true) errors.careSourceFacts = "Confirm these provider and qualifying-person records against the actual care records.";
  if (typeof data.receivedBenefits !== "boolean") errors.careReceivedBenefits = "Confirm whether you received dependent-care benefits, including employer-provided care.";
  if (typeof data.usesDeemedIncome !== "boolean") errors.careDeemedIncome = "Confirm whether either earned-income amount includes substantiated student or incapacity deemed income.";
  if (benefits && hasEnteredAmount(data.excludedDependentCareBenefits) && !errors["care-excludedDependentCareBenefits"] && !parseGuidedCurrency(data.excludedDependentCareBenefits).eq(benefits.totalBenefitsApplied)) errors.careBenefitReconciliation = "Reconcile the supplied exclusion amount to the actual Part III line 28 amount, or leave the duplicate amount blank.";
  if (benefits && Number(data.qualifyingIndividuals) !== Number(benefitsContext?.data?.qualifyingIndividuals)) errors.carePersonCount = "Reconcile the qualifying-person count with the actual Part III facts.";
  if (benefits && data.receivedBenefits === false && benefits.requiresForm2441) errors.careBenefitConflict = "The no-benefits answer conflicts with the actual benefit sources.";
  if (data.receivedBenefits === false && !errors["care-excludedDependentCareBenefits"] && parseGuidedCurrency(data.excludedDependentCareBenefits).gt(0)) errors.careBenefitConflict = "Excluded benefits conflict with the answer that no care benefits were received.";

  const providers = data.providers ?? [];
  if (benefits && benefitsContext?.data?.providers) {
    const amountKey = (value: string) => { try { return hasEnteredAmount(value) ? parseGuidedCurrency(value).toFixed() : value; } catch { return value; } };
    const providerKey = (provider: typeof providers[number]) => JSON.stringify({ name: provider.name.trim(), address: provider.address.trim(), identifierType: provider.identifierType,
      taxId: provider.taxId?.replace(/-/g, "") ?? "", dueDiligenceStatement: provider.dueDiligenceStatement?.trim() ?? "", householdEmployee: provider.householdEmployee, amountPaid: amountKey(provider.amountPaid) });
    if (JSON.stringify(providers.map(providerKey).sort()) !== JSON.stringify(benefitsContext.data.providers.map(providerKey).sort())) errors.careBenefitProviders = "Reconcile the full actual provider records used by the credit and benefit worksheets before rendering a single Form 2441.";
  }
  const persons = data.qualifyingPersons ?? [];
  if (!providers.length || providers.length > 50) errors.careProviders = "Enter each actual care provider (up to 50).";
  if (!persons.length || persons.length > 20) errors.carePersons = "Enter each qualifying person's actual details (up to 20).";
  if (persons.length && persons.length !== Number(data.qualifyingIndividuals)) errors.carePersonCount = "Reconcile the qualifying-person count with the individual records, including persons with zero expenses.";
  providers.forEach((provider, index) => {
    const key = `care-provider-${index}`;
    if (!provider.name.trim()) errors[`${key}-name`] = "Enter the actual care provider's name.";
    if (!provider.address.trim()) errors[`${key}-address`] = "Enter the actual care provider's address.";
    if (!["tin", "tax_exempt", "foreign_no_us_tin", "employer_furnished", "withheld"].includes(provider.identifierType)) errors[`${key}-identifier`] = "Choose the actual provider identification status.";
    if (provider.identifierType === "tin" && !/^\d{9}$/.test((provider.taxId ?? "").replace(/-/g, ""))) errors[`${key}-taxId`] = "Enter the provider's actual SSN, ITIN or EIN.";
    if (provider.identifierType === "withheld" && !provider.dueDiligenceStatement?.trim()) errors[`${key}-statement`] = "Explain the documented efforts to obtain the provider's information.";
    if (typeof provider.householdEmployee !== "boolean") errors[`${key}-employee`] = "Confirm whether this provider was your household employee.";
    recordAmount(`${key}-amount`, provider.amountPaid, "amount actually paid to this provider");
    if (provider.identifierType === "employer_furnished" && (provider.householdEmployee !== false || data.receivedBenefits !== true
      || (!errors[`${key}-amount`] && !parseGuidedCurrency(provider.amountPaid).isZero()))) errors[`${key}-employer`] = "Employer-furnished care requires benefits received, no household employment and the actual zero payment entry described in Form 2441.";
  });
  const personIds = new Set<string>();
  persons.forEach((person, index) => {
    const key = `care-person-${index}`;
    if (!person.firstName.trim() || !person.lastName.trim()) errors[`${key}-name`] = "Enter the qualifying person's actual name.";
    if (!["tax_id", "died"].includes(person.identifierType)) errors[`${key}-identifier`] = "Choose the person's actual identification status.";
    const identifier = (person.taxId ?? "").replace(/-/g, "");
    if (person.identifierType === "tax_id") {
      if (!/^\d{9}$/.test(identifier)) errors[`${key}-taxId`] = "Enter the qualifying person's actual SSN, ITIN or ATIN.";
      else if (personIds.has(identifier)) errors[`${key}-duplicate`] = "This qualifying person is already listed; reconcile the duplicate.";
      else personIds.add(identifier);
    }
    if (typeof person.over12Disabled !== "boolean") errors[`${key}-disabled`] = "Confirm the over-age-12 and incapable-of-self-care answer at the time care was provided.";
    if (typeof person.qualifyingPersonConfirmed !== "boolean" || (data.eligibilityConfirmed && !person.qualifyingPersonConfirmed)) errors[`${key}-eligibility`] = "Confirm this person's qualifying-child, disabled-person, residence and dependency requirements in Form 2441.";
    recordAmount(`${key}-expenses`, person.qualifiedExpenses, "qualified expenses incurred and paid for this person, after excluded benefits");
  });
  if (!Object.keys(errors).length) {
    const gross = parseGuidedCurrency(data.expenses);
    const excluded = benefits?.totalBenefitsApplied ?? parseGuidedCurrency(data.excludedDependentCareBenefits);
    const netPaid = benefits ? parseGuidedCurrency(benefitsContext?.data?.qualifiedExpensesPaidForCredit) : Decimal.max(0, gross.minus(excluded));
    if (benefits && netPaid.gt(gross)) errors.careBenefitReconciliation = "The actual net credit expenses cannot exceed the gross qualified care expenses.";
    const total = persons.reduce((sum, person) => sum.plus(parseGuidedCurrency(person.qualifiedExpenses)), new Decimal(0));
    if (!total.eq(netPaid)) errors.careExpenseAllocation = "Reconcile per-person qualified expenses to the actual net credit expenses after benefits; do not subtract the benefits a second time or include prior-year or prepaid future care.";
    // Employer-furnished care is reported at zero in provider column (e).
    if (!providers.some(provider => provider.identifierType === "employer_furnished") && providers.reduce((sum, provider) => sum.plus(parseGuidedCurrency(provider.amountPaid)), new Decimal(0)).lt(gross)) errors.careProviderPayments = "The provider payments cannot be less than the current qualified care expenses; reconcile the actual records.";
  }
  return errors;
}
