import type { TaxYearInput } from '@/models/inputs';
import { k1QbiLossSourceInput } from './k1-qbi-loss-sources';
import { jointEblNolSourceFixture } from './net-operating-loss-joint-ebl';

/** Explicit fictional prior filed source. No current allowance or inferred zero. */
export function ordinaryPriorQbiRecord(input: TaxYearInput, amount = '7000') {
  const joint = input.taxpayer.filingStatus === 'married_filing_jointly';
  return { sourceTaxYear: input.taxpayer.taxYear - 1, sourceReference: 'Actual preceding Form8995 and ordinary carry ledger',
    sourceFactsConfirmed: true, returnSourceId: 'ordinary-filed-prior-return', formKind: 'form_8995_line_16' as const,
    primaryName: `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`,
    primaryTaxpayerIdLast4: input.taxpayer.primary.ssn.replaceAll('-', '').slice(-4),
    ...(joint ? { spouseName: `${input.taxpayer.spouse!.firstName} ${input.taxpayer.spouse!.lastName}`,
      spouseTaxpayerIdLast4: input.taxpayer.spouse!.ssn.replaceAll('-', '').slice(-4) } : {}),
    sameFilingUnit: { priorFilingStatus: input.taxpayer.filingStatus, sameTaxpayersConfirmed: true },
    lossCarryforward: amount };
}

export function ordinaryPriorQbiFixture(qbi = '100000', prior = '7000'): TaxYearInput {
  const input = k1QbiLossSourceInput(), joint = jointEblNolSourceFixture('100000');
  input.taxpayer = structuredClone(joint.taxpayer); input.w2s = structuredClone(joint.w2s);
  input.w2s[0]!.federalWithheld = '30000';
  const original = input.scheduleK1[0]!, source = input.qbiLossSources!.activities![0]!;
  Object.assign(original, { entityType: 's_corporation', ordinaryIncome: qbi, section199AQBI: qbi,
    beginningBasis: '100000', selfEmploymentEarnings: '0', selfEmploymentNetEarningsAfterAdjustments: '0' });
  Object.assign(original.form6198!, { ordinaryIncome: qbi, priorYearAmountAtRisk: '100000', currentYearIncreases: '0' });
  Object.assign(source, { entityType: 's_corporation', recipientName: 'Jane Doe', recipientTaxpayerIdLast4: '6789' });
  Object.assign(source.statement!, { ordinaryIncome: qbi, section199AQBI: qbi,
    selfEmploymentEarnings: '0', selfEmploymentNetEarningsAfterAdjustments: '0' });
  source.atRisk!.priorYearAmountAtRisk = '100000';
  input.qbiLossSources!.priorQbiCarry = ordinaryPriorQbiRecord(input, prior);
  input.qbiLossSources!.form461Classification = { sourceTaxYear: 2025, sourceReference: 'Actual complete ordinary source classification',
    sourceFactsConfirmed: true, method: 'ordinary_k1_only', allNonEmployeeBusinessSourcesIncluded: true,
    capitalIncomeIsNonbusiness: true, otherBusinessIncome: '0', otherBusinessDeductions: '0' };
  input.priorYear = { ...input.priorYear, qbiLossCarryforward: prior };
  return input;
}
