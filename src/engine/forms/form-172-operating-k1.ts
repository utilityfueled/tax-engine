/** Actual ordinary operating K1 classification; spec/federal/form-172-operating-k1.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { calculateScheduleE } from '@/engine/schedules/schedule-e.js';
import { validateK1QbiLossSources, type K1QbiLossSourceInput } from './k1-qbi-loss-sources.js';
import { calculateK1OrdinaryPassiveSources } from './k1-ordinary-passive-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

export interface Form172K1SourcesResult {
  sourceDigest: string;
  ordinaryBusinessIncome: Decimal;
  rows: Array<{ sourceId: string; k1Index: number; accountHolder: 'primary' | 'spouse';
    originalOrdinary: Decimal; basisAllowedOrdinary: Decimal; allowedOrdinary: Decimal }>;
  lines: CalculatedLine[];
}
/** Source-only validation and existing basis/risk calculations. No AGI, current
 * NOL or entered loss allowance is needed to establish the original character. */
export function calculateForm172K1Sources(input: K1QbiLossSourceInput & Pick<TaxYearInput, 'form172'>): Form172K1SourcesResult | undefined {
  if (!input.qbiLossSources || input.scheduleK1.length === 0) return undefined;
  const sources = validateK1QbiLossSources(input);
  const classification = input.qbiLossSources.form461Classification;
  if (!classification || classification.sourceTaxYear !== input.taxpayer.taxYear || !classification.sourceReference?.trim()
    || classification.sourceFactsConfirmed !== true || classification.method !== 'ordinary_k1_only'
    || classification.allNonEmployeeBusinessSourcesIncluded !== true || classification.capitalIncomeIsNonbusiness !== true
    || [classification.otherBusinessIncome, classification.otherBusinessDeductions].some(value =>
      typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !d(value).isZero())) {
    throw new Error('Form172 operating K1 requires the complete actual ordinary business classification');
  }
  const facts = input.form172?.businessSources;
  for (const source of sources) {
    const original = input.scheduleK1[source.k1Index], matches = facts?.filter(row => row.sourceId === source.sourceId);
    const actual = matches?.[0];
    if (matches?.length !== 1 || !actual || actual.accountHolder !== source.accountHolder
      || !actual.businessName?.trim() || actual.businessName.trim() !== original.partnershipName.trim()
      || !actual.sourceReference?.trim() || actual.sourceFactsConfirmed !== true) {
      throw new Error('Form172 operating K1 must bind each actual original index entity owner and confirmed activity source');
    }
    if (original.isPassiveActivity !== false || original.qbiMateriallyParticipated !== true
      || actual.materiallyParticipated !== true || typeof actual.allInvestmentAtRisk !== 'boolean' || actual.financialTradingBusiness !== false) {
      throw new Error('Form172 operating K1 requires actual active nontrading at-risk business facts; other current-origin classifications remain separate');
    }
  }
  const scheduleE = calculateScheduleE({ ...input, rentalProperties: [], form1099Misc: [] });
  const ordinary = calculateK1OrdinaryPassiveSources(input, scheduleE);
  const audit = new AuditTrail();
  const rows = sources.map(source => {
    const row = scheduleE.partnerships[source.k1Index];
    const result = { sourceId: source.sourceId, k1Index: source.k1Index, accountHolder: source.accountHolder,
      originalOrdinary: source.ordinaryIncome, basisAllowedOrdinary: row.basisAdjustedNetAmount, allowedOrdinary: row.netAmount };
    audit.record('Current Form172 K1 sources', `${source.sourceId}:ordinary`, `Operating K1 ${source.k1Index + 1} allowed ordinary business income`, result.allowedOrdinary,
      'Actual ordinary statement after original basis and at-risk limits; charity and QBI remain separate', {
        'Original ordinary income': result.originalOrdinary, 'Ordinary income after basis': result.basisAllowedOrdinary,
      });
    return result;
  });
  const ordinaryBusinessIncome = sum(...rows.map(row => row.allowedOrdinary));
  if (!ordinaryBusinessIncome.eq(ordinary.scheduleESupplementalIncome) || !ordinaryBusinessIncome.eq(scheduleE.totalSupplementalIncome)) {
    throw new Error('Form172 operating K1 source amounts must conserve the complete ordinary Schedule E transfer');
  }
  const sourceDigest = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({ taxpayer: input.taxpayer,
    scheduleK1: input.scheduleK1, qbiLossSources: input.qbiLossSources, k1CharitableSources: input.k1CharitableSources,
    priorPassive: input.priorYear?.suspendedPassiveLosses, businesses: input.form172?.businessSources,
  }))));
  return { sourceDigest, ordinaryBusinessIncome, rows, lines: audit.getLines() };
}
