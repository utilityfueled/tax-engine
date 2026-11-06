/** Actual recipient preferences. Spec: spec/federal/form-6251-bond-sources.yaml. */
import Decimal from 'decimal.js';
import type { FilingStatus } from '@/models/constants.js';
import type { Form1099Int, Form1099Div } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, zeroFloor } from '@/utils/decimal.js';

export interface Form6251BondSourcesResult {
  privateActivityBondInterest: Decimal;
  lines: CalculatedLine[];
}

function amount(value: unknown, label: string): Decimal {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Form6251 requires actual ${label}`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Form6251 ${label} must be finite and nonnegative`);
  return result;
}

export function calculateForm6251BondSources(
  interest: Form1099Int[], dividends: Form1099Div[], taxYear: number, filingStatus: FilingStatus,
  otherUsedSourceIds: string[] = [],
  reconciledOidPreference = '0',
): Form6251BondSourcesResult {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error('Form6251 parent bond source year is unsupported');
  const audit = new AuditTrail();
  const seen = new Set(otherUsedSourceIds.map(id => id.trim()));
  const oidPreference = amount(reconciledOidPreference, 'reconciled parent OID preference');
  let signedParentPreference = oidPreference;
  const sources = [
    ...interest.map((form, index) => ({ form, preference: form.privateActivityBondInterest, exempt: form.taxExemptInterest, label: `INT:${index + 1}`, box: 'INT box9' })),
    ...dividends.map((form, index) => ({ form, preference: form.specifiedPrivateActivityBondInterest, exempt: form.exemptInterestDividends, label: `DIV:${index + 1}`, box: 'DIV box13, net of fund expenses' })),
  ];
  for (const source of sources) {
    const exempt = amount(source.exempt, 'recipient exempt interest');
    if (source.preference === undefined && exempt.isZero() && !source.form.privateActivityBondFacts) continue;
    const preference = amount(source.preference, `${source.box} preference`);
    if (preference.gt(exempt)) throw new Error('Form6251 preference exceeds its actual exempt-interest source');
    const facts = source.form.privateActivityBondFacts;
    if (!facts) {
      if (preference.gt(0)) throw new Error('Form6251 positive preference requires actual recipient source facts');
      continue;
    }
    if (facts.taxYear !== taxYear || facts.recipientAmountsConfirmed !== true) throw new Error('Form6251 requires actual confirmed recipient sources for the return year');
    if (!source.form.payer?.trim() || !['primary', 'spouse'].includes(source.form.accountHolder ?? '')
      || (source.form.accountHolder === 'spouse' && filingStatus !== 'married_filing_jointly')) throw new Error('Form6251 parent preference requires its actual payer and eligible owner');
    const id = facts.sourceId?.trim();
    if (!id || seen.has(id)) throw new Error('Form6251 parent preference source ID is missing or duplicate');
    seen.add(id);
    const deduction = amount(facts.otherwiseAllowableDeduction, 'otherwise allowable source deduction');
    if (deduction.gt(0) && (!facts.deductionSourceReference?.trim() || facts.deductionAllowanceAndNoDuplicationConfirmed !== true)) {
      throw new Error('Form6251 deduction requires actual allowance and no-duplication source evidence');
    }
    const net = preference.minus(deduction);
    audit.record('Form6251 bond sources', source.label, 'Actual recipient private activity preference', net,
      `Actual ${source.box} minus actual otherwise allowable source deduction; floor only the combined parent preference`, {
        'Reported preference': preference, 'Otherwise allowable source deduction': deduction,
      });
    signedParentPreference = signedParentPreference.plus(net);
  }
  const privateActivityBondInterest = zeroFloor(signedParentPreference);
  if (sources.length || oidPreference.gt(0)) audit.record('Form6251 bond sources', 'total', 'Parent bond preference for AMT', privateActivityBondInterest,
    'max(0, signed INT/DIV preferences plus reconciled OID preference); already included in regular exempt income', {
      'Reconciled OID preference': oidPreference, 'Parent preference before floor': signedParentPreference,
    });
  return { privateActivityBondInterest, lines: audit.getLines() };
}
