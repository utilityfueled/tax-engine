import type { TaxYearInput } from '@/models/inputs';
import { k1CharitableReturnFixture } from './k1-charitable-return';
import { attachReleasedCharitableBasis, releaseFixtureSource as required } from './charitable-k1-basis-release-nol';
import { syntheticPublicCashHistory } from './charitable-carryover';

export function priorPropertySources(input: TaxYearInput) {
  return required(required(input.k1CharitableSources).statements)[0];
}

/** Original source amounts and actual owner capacity; no entered release or carry. */
export function priorPropertyNonitemizedInput(options: {
  method?: 'basis' | 'risk' | 'both'; capacity?: string; sCorp?: boolean;
  election?: 'standard' | 'nonitemized'; cash?: boolean;
} = {}): TaxYearInput {
  const method = options.method ?? 'basis', capacity = options.capacity ?? '40000';
  const input = k1CharitableReturnFixture(2026);
  if (method !== 'risk') attachReleasedCharitableBasis(input, {
    amount: '60000', ownerBasis: method === 'both' ? '40000' : capacity,
    sCorp: options.sCorp, cash: options.cash,
  });
  const k1 = input.scheduleK1[0], source = priorPropertySources(input), basis = required(source.basis), risk = required(source.atRisk);
  input.deductionElection = options.election ?? 'standard';
  if (input.deductionElection === 'nonitemized') {
    input.taxpayer.filingStatus = 'married_filing_separately';
    required(input.standardDeductionFacts).spouseItemizes = true;
  }
  input.donations = [];
  input.charitableCarryoverSources = { ...syntheticPublicCashHistory([]), sourceTaxYear: 2026 };
  k1.taxYear = 2026;
  required(input.k1CharitableSources).sourceTaxYear = 2026;
  Object.assign(basis, { sourceTaxYear: 2026, statementYearStart: '2026-01-01', statementYearEnd: '2026-12-31' });
  risk.sourceTaxYear = 2026;
  required(risk.priorLossHistory).sourceTaxYear = 2025;
  for (const row of required(basis.priorBasisSuspensions)) required(row.basisUseHistory).push({ taxYear: 2025, basisAllowed: '0' });
  if (method === 'risk') {
    Object.assign(k1, { beginningBasis: '0', charitableCash: '0', charitableCapitalGain30: '0', charitableCapitalGain20: '0' });
    basis.currentContributions = []; source.receipts = [];
    if (options.sCorp) {
      k1.entityType = 's_corporation'; basis.entityType = 's_corporation';
      Object.assign(k1, { beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
    }
  }
  if (method !== 'basis') {
    const cash = options.cash === true;
    const receipt = { basisSourceId: 'original-property-2024', originalBox: (options.sCorp ? '12' : '13') as '12' | '13',
      originalCode: cash ? 'A' : 'E', recipientName: 'Fictional Original Qualified Charity', recipientCategory: 'fifty-percent' as const,
      qualifiedOrganization: true, donorAdvisedFund: false, supportingOrganization: false,
      sourceReference: 'Fictional original2024 receipt retained independently', contributionDate: '2024-06-01',
      ...(cash ? {} : { propertyType: 'appreciated_stock' as const, acquisitionDate: '2020-01-01', fairMarketValueShare: '60000' }) };
    risk.priorLossHistory = { sourceTaxYear: 2025, sourceReference: 'Fictional filed2025 Form6198 ledger', sourceFactsConfirmed: true,
      vintages: [{ taxYear: 2024, amount: '60000' }], characterSources: {
        sourceTaxYear: 2025, sourceReference: 'Fictional complete original character ledger', sourceFactsConfirmed: true,
        sameOwnerAndActivityConfirmed: true, recipientName: 'Jane Doe', recipientTaxpayerIdLast4: '6789',
        entityName: k1.partnershipName, entityEIN: k1.partnershipEIN,
        records: [{ sourceId: 'prior-property-risk-2024', taxYear: 2024, character: 'charitable',
          sourceReference: 'Fictional original2024 deduction after basis', basisLimitationAlreadyAppliedConfirmed: true,
          originalPostBasisDeduction: '60000', originalDisallowedAmount: '60000', useHistory: [{ taxYear: 2025, amountAllowed: '0' }],
          gift: { basisSourceId: 'original-property-2024', basisOriginTaxYear: 2024,
            category: cash ? 'cash_60' : 'capital_gain_30', contributionShare: '60000', adjustedBasisShare: '60000', receipt },
        }],
      } };
    risk.priorYearAmountAtRisk = method === 'both' ? '50000' : capacity;
    risk.activityAllocation = { sourceTaxYear: 2026, sourceReference: 'Fictional complete activity source assignment',
      sourceFactsConfirmed: true, allOriginalItemsBelongToActivityConfirmed: true,
      charitableSourceIds: ['original-property-2024'] };
    Object.assign(required(k1.form6198), { otherDeductionsLosses: '60000',
      priorYearAmountAtRisk: risk.priorYearAmountAtRisk });
  }
  return input;
}
