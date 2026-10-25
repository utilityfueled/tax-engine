/** Actual return identity reconciliation; spec/federal/savings-bond-return-identity.yaml. */
import type { SavingsBondRedemption, TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";

interface PersonIdentity { firstName?: string; lastName?: string; ssn?: string; dateOfBirth?: string }
export interface SavingsBondReturnIdentityInput {
  taxYear: number;
  filingStatus: FilingStatus;
  primary: PersonIdentity;
  spouse?: PersonIdentity;
  dependents?: PersonIdentity[];
  redemptions: SavingsBondRedemption[];
  facts?: TaxYearInput["form8815"];
}
function taxId(value: string | undefined): string {
  if (!value || !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(value.trim())) throw new Error("Form 8815 requires an actual beneficiary or household tax ID.");
  return value.trim().replaceAll("-", "");
}
function personName(person: PersonIdentity): string {
  if (!person.firstName?.trim() || !person.lastName?.trim()) throw new Error("Form 8815 requires actual household identity.");
  return normalizedName(`${person.firstName} ${person.lastName}`);
}
function normalizedName(value: string): string { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }
function actualBirthDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Form 8815 requires the actual registered owner's return birth date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Form 8815 requires a valid actual owner birth date.");
  return value;
}

export function validateSavingsBondReturnIdentity(input: SavingsBondReturnIdentityInput): void {
  const actualSource = input.facts !== undefined || input.redemptions.some(bond => bond.sourceId !== undefined || bond.bondType !== undefined || bond.registeredOwner !== undefined || bond.ownerDateOfBirth !== undefined || bond.ageTestOwner !== undefined);
  if (input.taxYear === 2025 && !actualSource) return;
  if (input.taxYear !== 2025 && input.taxYear !== 2026) throw new Error("Form 8815 identity reconciliation requires a supported actual return year.");
  const married = input.filingStatus === "married_filing_jointly" || input.filingStatus === "married_filing_separately";
  const spouse = (): PersonIdentity => {
    if (!married || !input.spouse) throw new Error("Form 8815 spouse or joint sources require the actual married return household.");
    return input.spouse;
  };
  const checkPerson = (person: PersonIdentity) => { personName(person); taxId(person.ssn); };
  for (const bond of input.redemptions) {
    if (!bond.registeredOwner) throw new Error("Form 8815 requires the actual registered owner source.");
    if (bond.registeredOwner === "other") {
      if (bond.ageTestOwner !== undefined) throw new Error("Form 8815 age-test owner conflicts with actual bond registration.");
      continue;
    }
    let owner: PersonIdentity;
    if (bond.registeredOwner === "taxpayer_and_spouse") {
      if (!bond.ageTestOwner) throw new Error("Form 8815 joint registration requires the actual age-test owner.");
      checkPerson(input.primary); checkPerson(spouse());
      if (taxId(input.primary.ssn) === taxId(spouse().ssn)) throw new Error("Form 8815 joint registration requires two distinct actual household identities.");
      owner = bond.ageTestOwner === "taxpayer" ? input.primary : spouse();
    } else {
      if (bond.ageTestOwner && bond.ageTestOwner !== bond.registeredOwner) throw new Error("Form 8815 age-test owner conflicts with actual bond registration.");
      owner = bond.registeredOwner === "taxpayer" ? input.primary : spouse();
    }
    checkPerson(owner);
    if (actualBirthDate(bond.ownerDateOfBirth) !== actualBirthDate(owner.dateOfBirth)) throw new Error("Form 8815 bond owner birth date does not match the actual return owner.");
  }
  for (const expense of input.facts?.educationExpenses ?? []) {
    if (expense.relationship === "other" || (expense.relationship === "dependent" && expense.dependentClaimed === false)) continue;
    const identity = taxId(expense.beneficiaryTaxId);
    let person: PersonIdentity;
    if (expense.relationship === "taxpayer") person = input.primary;
    else if (expense.relationship === "spouse") person = spouse();
    else {
      if (expense.dependentClaimed !== true) throw new Error("Form 8815 requires actual claimed-dependent eligibility.");
      const matches = (input.dependents ?? []).filter(dependent => taxId(dependent.ssn) === identity);
      if (matches.length !== 1) throw new Error("Form 8815 beneficiary must identify one unique actual claimed dependent.");
      person = matches[0];
    }
    if (taxId(person.ssn) !== identity || personName(person) !== normalizedName(expense.beneficiaryName)) throw new Error("Form 8815 education beneficiary identity does not match the actual return household.");
  }
}
