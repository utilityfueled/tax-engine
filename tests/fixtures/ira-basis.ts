import { Form1099RSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

// Explicit synthetic source records; values are never production defaults.
export const ordinaryIraFacts = {
  currentYearContributionsPresent: false, conversionsPresent: false, rolloversPresent: false,
  qcdPresent: false, hsaFundingPresent: false, contributionReturnsPresent: false,
  specialDistributionsOrRepaymentsPresent: false, inheritedAccountsPresent: false,
  divorceOrOtherBasisTransfersPresent: false, otherBasisEventsPresent: false,
};
export function ordinaryIraBasisFixture() {
  const owner = (accountHolder: 'primary' | 'spouse') => ({ accountHolder,
    identity: { firstName: accountHolder === 'primary' ? 'Jane' : 'John', lastName: 'Doe',
      dateOfBirth: '1960-01-15', ssnLast4: accountHolder === 'primary' ? '6789' : '4321' },
    basisHistory: { method: 'prior_form_8606' as const, taxYear: 2024, line14: accountHolder === 'primary' ? '1000' : '2000',
      line15cWorksheetAdjustment: '0', sourceReference: `${accountHolder} actual prior return`, mostRecentFormConfirmed: true,
      allPriorRecordsReviewed: true, basisChangesSinceThatReturn: false },
    ordinaryFacts: { ...ordinaryIraFacts },
    accounts: [{ accountId: `${accountHolder}-one`, taxYear: 2025, accountType: 'traditional' as const,
      custodian: 'Custodian One', custodianTin: '12-3456789', accountReference: `${accountHolder}-private-account`,
      sourceReference: `${accountHolder} Dec31 statement`, yearEndValue: accountHolder === 'primary' ? '2002.49' : '8000' }],
  });
  const owners = [owner('primary'), owner('spouse')];
  const forms = owners.map((item, index) => Form1099RSchema.parse({ taxYear: 2025, payer: 'Custodian One',
    payerTin: '12-3456789', accountHolder: item.accountHolder, accountReference: item.accounts[0].accountReference,
    grossDistribution: index === 0 ? '1001.49' : '2000', taxableAmountNotDetermined: true, iraSepSimple: true, distributionCode: '7' }));
  const distributions = forms.map((form, index) => ({ sourceId: `form1099R:${index}`, taxYear: 2025,
    sourceReference: `actual statement ${index}`, accountId: owners[index].accounts[0].accountId,
    accountHolder: owners[index].accountHolder, payer: form.payer, payerTin: form.payerTin!, accountReference: form.accountReference!,
    grossDistribution: form.grossDistribution, taxableAmount: null as string | null, taxableAmountNotDetermined: true,
    iraSepSimple: true, distributionCode: '7' }));
  return { ...structuredClone(simpleW2Fixture), taxpayer: { ...structuredClone(simpleW2Fixture.taxpayer),
    filingStatus: 'married_filing_jointly' as const, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: '1960-01-15' },
    spouse: { firstName: 'John', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1960-01-15' } }, form1099R: forms,
    iraBasisSources: { taxYear: 2025, sourceReference: 'complete actual ordinary IRA packet',
      sourceFactsConfirmed: true, allIraOwnersAndAccountsIncluded: true, allDistributionsIncluded: true, owners, distributions } };
}
