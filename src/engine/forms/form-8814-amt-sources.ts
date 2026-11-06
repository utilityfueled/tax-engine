/** Actual Form8814 line1b preferences; spec/federal/form-8814-amt-sources.yaml. */
import Decimal from 'decimal.js';
import type { Form8814ChildInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, zeroFloor } from '@/utils/decimal.js';

export interface Form8814AmtSourcesResult {
  privateActivityBondInterest: Decimal;
  lines: CalculatedLine[];
}

function amount(value: unknown, name: string): Decimal {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Form8814 requires actual ${name}`);
  const parsed = d(value);
  if (!parsed.isFinite() || parsed.lt(0)) throw new Error(`Form8814 ${name} must be finite and nonnegative`);
  return parsed;
}

export function calculateForm8814AmtSources(children: Form8814ChildInput[], taxYear: number): Form8814AmtSourcesResult {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error('Form8814 AMT source year is unsupported');
  const audit = new AuditTrail();
  const seen = new Set<string>();
  let privateActivityBondInterest = d('0');
  for (const [index, child] of children.entries()) {
    const exempt = amount(child.taxExemptInterest, 'child exempt interest');
    const source = child.amtSources;
    if (!source) {
      if (exempt.gt(0)) throw new Error('Form8814 positive exempt interest requires complete actual AMT sources');
      continue;
    }
    if (source.taxYear !== taxYear || source.allStatementsConfirmed !== true || !Array.isArray(source.statements)) {
      throw new Error('Form8814 requires complete actual AMT sources for the return year');
    }
    let reportedExempt = d('0');
    let reportedPreference = d('0');
    for (const [statementIndex, statement] of source.statements.entries()) {
      const id = statement.sourceId?.trim();
      if (!id || seen.has(id)) throw new Error('Form8814 actual source ID is missing or duplicate');
      seen.add(id);
      if (statement.form !== '1099-INT' && statement.form !== '1099-DIV') throw new Error('Form8814 requires an actual supported interest statement');
      const statementExempt = amount(statement.taxExemptInterest, 'statement exempt interest');
      const preference = amount(statement.specifiedPrivateActivityBondInterest, 'reported specified private activity interest');
      if (preference.gt(statementExempt)) throw new Error('Form8814 preference exceeds its actual exempt-interest source');
      reportedExempt = reportedExempt.plus(statementExempt);
      reportedPreference = reportedPreference.plus(preference);
      audit.record('Form8814 AMT sources', `${index + 1}:${statementIndex + 1}`, 'Actual child private activity interest', preference,
        statement.form === '1099-INT' ? 'Actual Form1099INT box9' : 'Actual Form1099DIV box13, already net of fund expenses');
    }
    if (!reportedExempt.eq(exempt)) throw new Error('Form8814 actual exempt-interest sources must reconcile to child line1b');
    const deduction = amount(source.otherwiseAllowableDeduction, 'otherwise allowable deduction');
    if (deduction.gt(0) && (!source.deductionSourceReference?.trim() || source.deductionAllowanceAndNoDuplicationConfirmed !== true)) {
      throw new Error('Form8814 deduction requires its actual allowance worksheet and no-duplication confirmation');
    }
    const net = zeroFloor(reportedPreference.minus(deduction));
    audit.record('Form8814 AMT sources', `${index + 1}:net`, 'Child preference transferred to parent AMT', net,
      'max(0, actual specified interest minus actual otherwise allowable deduction)', {
        'Actual specified interest': reportedPreference,
        'Otherwise allowable deduction': deduction,
      });
    privateActivityBondInterest = privateActivityBondInterest.plus(net);
  }
  return { privateActivityBondInterest, lines: audit.getLines() };
}
