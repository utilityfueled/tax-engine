import { CryptoIncomeInputSchema } from '@/models/inputs.js';
import { singleCategoryCharitableNolInput } from './charitable-single-category-nol.js';
import { k1CharitableReturnFixture, charitableStatement } from './k1-charitable-return.js';

export function originalNolFixtureSource<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Missing fictional original NOL source');
  return value;
}

/** Entirely fictional original receipts and independent loss histories. */
export function cryptoCharitableNolInput(year = 2025, alternativeOnly = false, privateFoundation = false) {
  const input = singleCategoryCharitableNolInput('C', year, alternativeOnly);
  input.donations = [];
  input.cryptoIncome = CryptoIncomeInputSchema.parse({ donations: [{
    asset: 'BTC', quantity: '1.25', dateAcquired: `${year - 2}-04-01`, dateDonated: `${year}-06-01`,
    fairMarketValueAtDonation: '60000', costBasis: '20000', charityName: 'Fictional actual crypto recipient', charityEIN: '12-3456789',
    isQualifiedOrganization: true, recipientCategory: privateFoundation ? 'private-nonoperating' : 'fifty-percent',
    capitalAsset: true, sourceFactsConfirmed: true, fullOwnershipInterestDonated: true, noGoodsOrServicesReceived: true,
    substantiationRequirementsMet: true, appraisalRequired: true, qualifiedAppraisalObtained: true,
  }] });
  return input;
}

export function k1CharitableNolInput(year = 2025, alternativeOnly = false, sCorp = false) {
  const input = singleCategoryCharitableNolInput('C', year, alternativeOnly);
  const gift = k1CharitableReturnFixture(year), source = charitableStatement(gift), original = gift.scheduleK1[0];
  const basis = originalNolFixtureSource(source.basis), receipt = originalNolFixtureSource(source.receipts)[0];
  input.donations = [];
  original.charitableCapitalGain30 = '80000'; original.beginningBasis = '20000';
  originalNolFixtureSource(original.form6198).priorYearAmountAtRisk = '100000'; originalNolFixtureSource(source.atRisk).priorYearAmountAtRisk = '100000';
  Object.assign(originalNolFixtureSource(basis.currentContributions)[0], { contributionShare: '80000', adjustedBasisShare: '40000' });
  receipt.fairMarketValueShare = '80000';
  if (sCorp) {
    original.entityType = 's_corporation'; basis.entityType = 's_corporation'; receipt.originalBox = '12';
    original.beginningDebtBasis = '0'; original.additionalLoansToScorp = '0'; original.priorDebtBasisReduction = '0';
  }
  input.scheduleK1 = gift.scheduleK1; input.k1CharitableSources = gift.k1CharitableSources;
  return input;
}
